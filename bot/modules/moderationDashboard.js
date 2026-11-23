const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PermissionsBitField } = require("discord.js");

const SESSION_COOKIE = "moderation_dashboard_session";
const STATE_COOKIE = "moderation_dashboard_state";
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;
const GUILD_CACHE_LIFETIME = 30 * 1000;
const DEFAULT_DASHBOARD_URL = "https://dashboard.slushie.live";

function getDashboardUrl(config = {}) {
    const configuredUrl = process.env.DASHBOARD_PUBLIC_URL ||
        (config.dashboard && config.dashboard.publicUrl) ||
        DEFAULT_DASHBOARD_URL;
    const url = new URL(configuredUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("dashboard.publicUrl must be an HTTP(S) origin without a path, query, or fragment.");
    }
    return url.origin;
}

function asyncRoute(handler) {
    return (request, response, next) => {
        Promise.resolve(handler(request, response, next)).catch(next);
    };
}

function parseCookies(header = "") {
    return Object.fromEntries(header.split(";").map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return ["", ""];
        return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
    }).filter(([name]) => name));
}

function serializeCookie(name, value, { maxAge, secure }) {
    return [
        `${name}=${encodeURIComponent(value)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        ...(maxAge === undefined ? [] : [`Max-Age=${maxAge}`]),
        ...(secure ? ["Secure"] : [])
    ].join("; ");
}

function parsePayload(row) {
    try {
        return JSON.parse(row.payloadJson);
    } catch (error) {
        console.error(`Could not parse moderation log ${row.id}:`, error);
        return { error: "The stored log payload is invalid." };
    }
}

class ModerationDashboard {
    constructor(app, client, bots, config) {
        this.app = app;
        this.client = client;
        this.bots = bots;
        this.config = config;
        this.sessions = new Map();
        this.redirectUri = this.getRedirectUri();
        this.secureCookies = this.redirectUri.startsWith("https://");

        app.use((request, response, next) => {
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Frame-Options", "DENY");
            response.setHeader("Referrer-Policy", "no-referrer");
            next();
        });
        app.get("/login", (request, response) => this.login(request, response));
        app.get("/callback", asyncRoute((request, response) => this.callback(request, response)));
        app.get("/logout", (request, response) => this.logout(request, response));
        app.get("/", asyncRoute((request, response) => this.serveDashboard(request, response)));
        app.get("/api/guilds", asyncRoute((request, response) => this.listGuilds(request, response)));
        app.get("/api/logs", asyncRoute((request, response) => this.listLogs(request, response)));
        app.get("/api/tickets", asyncRoute((request, response) => this.listTickets(request, response)));
        app.get("/api/ticket-attachments", asyncRoute((request, response) => this.listTicketAttachments(request, response)));
        app.get("/api/tickets/:ticketId/transcript", asyncRoute((request, response) => this.serveTicketTranscript(request, response)));

        app.use((error, request, response, next) => {
            if (!["/", "/login", "/callback", "/logout", "/api/guilds", "/api/logs", "/api/tickets", "/api/ticket-attachments"]
                .includes(request.path) && !/^\/api\/tickets\/[^/]+\/transcript$/.test(request.path)) {
                return next(error);
            }
            if (response.headersSent) return next(error);
            console.error("Moderator dashboard request failed:", error);
            response.status(500).json({ error: "The dashboard request could not be completed." });
        });
    }

    getRedirectUri() {
        const dashboardConfig = this.config.dashboard || {};
        if (process.env.DISCORD_OAUTH_REDIRECT_URI || dashboardConfig.redirectUri) {
            return process.env.DISCORD_OAUTH_REDIRECT_URI || dashboardConfig.redirectUri;
        }

        return `${getDashboardUrl(this.config)}/callback`;
    }

    getOAuthConfig() {
        const dashboardConfig = this.config.dashboard || {};
        return {
            clientId: process.env.DISCORD_OAUTH_CLIENT_ID || dashboardConfig.clientId,
            clientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET || dashboardConfig.clientSecret
        };
    }

    isConfigured() {
        const { clientId, clientSecret } = this.getOAuthConfig();
        return Boolean(clientId && clientSecret);
    }

    sessionSecret() {
        const { clientSecret } = this.getOAuthConfig();
        return crypto.createHmac("sha256", clientSecret).update("moderation-dashboard-session").digest();
    }

    signSessionId(sessionId) {
        return crypto.createHmac("sha256", this.sessionSecret()).update(sessionId).digest("base64url");
    }

    createSessionCookie(sessionId) {
        return `${sessionId}.${this.signSessionId(sessionId)}`;
    }

    readSession(request) {
        if (!this.isConfigured()) return null;
        const value = parseCookies(request.headers.cookie)[SESSION_COOKIE];
        if (!value) return null;
        const separator = value.lastIndexOf(".");
        if (separator < 0) return null;

        const sessionId = value.slice(0, separator);
        const signature = value.slice(separator + 1);
        const expected = this.signSessionId(sessionId);
        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (actualBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

        const session = this.sessions.get(sessionId);
        if (!session || session.expiresAt <= Date.now()) {
            this.sessions.delete(sessionId);
            return null;
        }

        session.expiresAt = Date.now() + SESSION_LIFETIME;
        return { sessionId, session };
    }

    setSessionCookie(response, sessionId) {
        response.append("Set-Cookie", serializeCookie(
            SESSION_COOKIE,
            this.createSessionCookie(sessionId),
            { maxAge: Math.floor(SESSION_LIFETIME / 1000), secure: this.secureCookies }
        ));
    }

    clearCookie(response, name) {
        response.append("Set-Cookie", serializeCookie(name, "", { maxAge: 0, secure: this.secureCookies }));
    }

    login(request, response) {
        if (!this.isConfigured()) {
            return response.status(503).send(
                "Discord OAuth is not configured. Set dashboard.clientId and dashboard.clientSecret in config.json."
            );
        }

        response.setHeader("Cache-Control", "no-store");
        const { clientId } = this.getOAuthConfig();
        const state = crypto.randomBytes(32).toString("hex");
        response.setHeader("Set-Cookie", serializeCookie(
            STATE_COOKIE,
            state,
            { maxAge: 600, secure: this.secureCookies }
        ));
        const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", this.redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("scope", "identify guilds");
        authorizeUrl.searchParams.set("state", state);
        return response.redirect(authorizeUrl.toString());
    }

    async exchangeToken(parameters) {
        const { clientId, clientSecret } = this.getOAuthConfig();
        const form = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            ...parameters,
            redirect_uri: this.redirectUri
        });
        const result = await fetch("https://discord.com/api/v10/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form
        });
        const data = await result.json();
        if (!result.ok) {
            const error = new Error(`Discord OAuth token request failed with status ${result.status}.`);
            error.status = result.status;
            throw error;
        }
        return data;
    }

    async fetchDiscord(pathname, accessToken) {
        const result = await fetch(`https://discord.com/api/v10${pathname}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!result.ok) {
            const error = new Error(`Discord API request failed with status ${result.status}.`);
            error.status = result.status;
            if (result.status === 429) {
                let body;
                try {
                    body = await result.json();
                } catch (parseError) {
                    body = null;
                }
                const headerRetryAfter = Number(result.headers && result.headers.get("retry-after"));
                const bodyRetryAfter = Number(body && body.retry_after);
                error.retryAfter = Number.isFinite(headerRetryAfter) && headerRetryAfter > 0
                    ? headerRetryAfter
                    : Number.isFinite(bodyRetryAfter) && bodyRetryAfter > 0
                        ? bodyRetryAfter
                        : 5;
            }
            throw error;
        }
        return result.json();
    }

    async callback(request, response) {
        this.clearCookie(response, STATE_COOKIE);
        response.setHeader("Cache-Control", "no-store");
        if (!this.isConfigured()) {
            return response.status(503).send("Discord OAuth is not configured.");
        }

        const cookies = parseCookies(request.headers.cookie);
        const state = request.query.state;
        const code = request.query.code;
        if (!state || !cookies[STATE_COOKIE] || state !== cookies[STATE_COOKIE]) {
            return response.status(400).send("The Discord authorization request is invalid or expired. Please try again.");
        }
        if (request.query.error) return response.status(401).send("Discord authorization was cancelled.");
        if (!code) return response.status(400).send("Discord did not return an authorization code.");

        const token = await this.exchangeToken({ grant_type: "authorization_code", code });
        const user = await this.fetchDiscord("/users/@me", token.access_token);
        const sessionId = crypto.randomBytes(32).toString("hex");
        for (const [existingId, session] of this.sessions) {
            if (session.expiresAt <= Date.now()) this.sessions.delete(existingId);
        }
        this.sessions.set(sessionId, {
            user,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            accessTokenExpiresAt: Date.now() + token.expires_in * 1000,
            expiresAt: Date.now() + SESSION_LIFETIME
        });
        this.setSessionCookie(response, sessionId);
        return response.redirect("/");
    }

    logout(request, response) {
        const current = this.readSession(request);
        if (current) this.sessions.delete(current.sessionId);
        this.clearCookie(response, SESSION_COOKIE);
        return response.redirect("/login");
    }

    async refreshToken(session) {
        if (!session.refreshToken) throw new Error("The Discord session has expired.");
        const token = await this.exchangeToken({
            grant_type: "refresh_token",
            refresh_token: session.refreshToken
        });
        session.accessToken = token.access_token;
        session.refreshToken = token.refresh_token;
        session.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
    }

    async fetchCurrentUserGuilds(session) {
        if (session.accessTokenExpiresAt <= Date.now() + 60_000) {
            await this.refreshToken(session);
        }
        try {
            return await this.fetchDiscord("/users/@me/guilds", session.accessToken);
        } catch (error) {
            if (error.status !== 401) throw error;
            await this.refreshToken(session);
            return this.fetchDiscord("/users/@me/guilds", session.accessToken);
        }
    }

    getCurrentUserGuilds(session) {
        if (session.guilds && session.guildsExpiresAt > Date.now()) {
            return Promise.resolve(session.guilds);
        }
        if (session.guildsRequest) return session.guildsRequest;

        session.guildsRequest = this.fetchCurrentUserGuilds(session)
            .then((guilds) => {
                session.guilds = guilds;
                session.guildsExpiresAt = Date.now() + GUILD_CACHE_LIFETIME;
                return guilds;
            })
            .finally(() => {
                session.guildsRequest = null;
            });
        return session.guildsRequest;
    }

    async authenticate(request, response) {
        response.setHeader("Cache-Control", "no-store");
        if (!this.isConfigured()) {
            response.status(503).json({ error: "Discord OAuth is not configured." });
            return null;
        }
        const current = this.readSession(request);
        if (!current) {
            response.status(401).json({ error: "Please sign in with Discord." });
            return null;
        }

        try {
            const guilds = await this.getCurrentUserGuilds(current.session);
            this.setSessionCookie(response, current.sessionId);
            return { ...current, guilds };
        } catch (error) {
            if (error.status === 429) {
                const retryAfter = Math.max(1, Math.ceil(error.retryAfter || 5));
                console.warn(`Discord rate-limited a dashboard permission check. Retry after ${retryAfter} seconds.`);
                response.setHeader("Retry-After", String(retryAfter));
                response.status(429).json({
                    error: `Discord is rate-limiting dashboard requests. Please retry in ${retryAfter} seconds.`
                });
                return null;
            }
            console.error("Could not verify Discord dashboard permissions:", error);
            if (error.status === 400 || error.status === 401) {
                this.sessions.delete(current.sessionId);
                this.clearCookie(response, SESSION_COOKIE);
                response.status(401).json({ error: "Your Discord session expired. Please sign in again." });
                return null;
            }
            response.status(502).json({ error: "Discord could not verify your permissions. Please retry shortly." });
            return null;
        }
    }

    isAdministrator(guild) {
        try {
            return (BigInt(guild.permissions) & BigInt(PermissionsBitField.Flags.Administrator)) !== 0n;
        } catch (error) {
            return false;
        }
    }

    getAvailableGuilds(guilds) {
        return guilds.filter((guild) => this.isAdministrator(guild) && this.bots[guild.id])
            .map((guild) => {
                const server = this.client.guilds.cache.get(guild.id);
                return server
                    ? { id: server.id, name: server.name, iconUrl: server.iconURL() }
                    : null;
            })
            .filter(Boolean);
    }

    async getAuthorizedGuild(request, response) {
        const current = await this.authenticate(request, response);
        if (!current) return null;

        const guildId = String(request.query.guildId || "");
        const authorized = current.guilds.some((guild) => guild.id === guildId && this.isAdministrator(guild));
        if (!authorized) {
            response.status(403).json({ error: "Administrator access is required for this server." });
            return null;
        }

        const bot = this.bots[guildId];
        if (!bot || !bot.database) {
            response.status(404).json({ error: "The bot is not active in this server." });
            return null;
        }
        return { current, guildId, bot };
    }

    getPage(request) {
        const parsedPage = Number.parseInt(request.query.page, 10);
        return Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 1_000_000) : 1;
    }

    async getClosedTickets(guildId) {
        const folder = path.resolve(this.config.tickets.folder);
        const files = await fs.promises.readdir(folder);
        const metadataFiles = files.filter((file) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i.test(file)
        );
        const results = await Promise.all(metadataFiles.map(async (file) => {
            try {
                const metadata = JSON.parse(await fs.promises.readFile(path.join(folder, file), "utf8"));
                if (metadata.guildId !== guildId || metadata.ticketId !== path.basename(file, ".json")) return null;
                const transcriptPath = path.join(folder, `${metadata.ticketId}.html`);
                const transcriptStats = await fs.promises.stat(transcriptPath);
                if (!transcriptStats.isFile()) return null;
                return metadata;
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.error(`Could not read ticket transcript metadata ${file}:`, error);
                }
                return null;
            }
        }));
        return results.filter(Boolean);
    }

    getStoredAttachmentKey(url) {
        if (typeof url !== "string") return null;
        try {
            const key = new URL(url).searchParams.get("key");
            return key && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]{1,10})?$/i.test(key)
                ? key
                : null;
        } catch (error) {
            return null;
        }
    }

    async listTickets(request, response) {
        const access = await this.getAuthorizedGuild(request, response);
        if (!access) return;

        const page = this.getPage(request);
        const limit = 50;
        const offset = (page - 1) * limit;
        const [openTotal, closedTickets] = await Promise.all([
            access.bot.database.countTicketsByGuild(access.guildId),
            this.getClosedTickets(access.guildId)
        ]);
        const sortedClosedTickets = closedTickets
            .sort((left, right) => String(right.closedAt || "").localeCompare(String(left.closedAt || "")))
            .map((ticket) => ({
                ticketId: ticket.ticketId,
                channelId: ticket.channelId,
                ticketOwner: ticket.ticketOwner,
                ticketTitle: ticket.ticketTitle,
                ticketDescription: ticket.ticketDescription,
                closedAt: ticket.closedAt,
                messageCount: Number(ticket.messageCount) || 0,
                attachmentCount: Array.isArray(ticket.attachments) ? ticket.attachments.length : 0,
                status: "closed",
                transcriptAvailable: true
            }));
        const total = openTotal + sortedClosedTickets.length;
        const tickets = [];
        if (offset < openTotal) {
            const openTickets = await access.bot.database.getTicketsByGuild(access.guildId, {
                limit: Math.min(limit, openTotal - offset),
                offset
            });
            tickets.push(...openTickets.map((ticket) => ({ ...ticket, status: "open", transcriptAvailable: false })));
            if (tickets.length < limit) {
                tickets.push(...sortedClosedTickets.slice(0, limit - tickets.length));
            }
        } else {
            tickets.push(...sortedClosedTickets.slice(offset - openTotal, offset - openTotal + limit));
        }
        response.setHeader("Cache-Control", "no-store");
        return response.json({
            page,
            limit,
            total,
            pages: Math.max(1, Math.ceil(total / limit)),
            tickets
        });
    }

    async listTicketAttachments(request, response) {
        const access = await this.getAuthorizedGuild(request, response);
        if (!access) return;

        const [openAttachments, closedTickets, storedFiles] = await Promise.all([
            access.bot.database.getTicketAttachmentsByGuild(access.guildId),
            this.getClosedTickets(access.guildId),
            fs.promises.readdir(path.resolve(this.config.uploader.folder))
        ]);
        const availableFiles = new Set(storedFiles);
        const records = [];
        for (const row of openAttachments) {
            let attachment;
            try {
                attachment = JSON.parse(row.content);
            } catch (error) {
                console.error(`Could not parse ticket ${row.ticketId} attachment:`, error);
                continue;
            }
            records.push({
                ticketId: row.ticketId,
                channelId: row.channelId,
                ticketTitle: row.ticketTitle,
                username: row.username,
                authorProfile: row.authorProfile,
                currentTime: row.currentTime,
                orderDate: row.orderDate,
                ...this.formatTicketAttachment(attachment, availableFiles)
            });
        }
        for (const ticket of closedTickets) {
            for (const attachment of Array.isArray(ticket.attachments) ? ticket.attachments : []) {
                records.push({
                    ticketId: ticket.ticketId,
                    channelId: ticket.channelId,
                    ticketTitle: ticket.ticketTitle,
                    username: attachment.username,
                    authorProfile: attachment.authorProfile,
                    currentTime: attachment.currentTime,
                    orderDate: attachment.orderDate,
                    ...this.formatTicketAttachment(attachment, availableFiles)
                });
            }
        }

        records.sort((left, right) => {
            const rightDate = Date.parse(right.orderDate || right.currentTime || "") || 0;
            const leftDate = Date.parse(left.orderDate || left.currentTime || "") || 0;
            return rightDate - leftDate;
        });
        const page = this.getPage(request);
        const limit = 50;
        const offset = (page - 1) * limit;
        response.setHeader("Cache-Control", "no-store");
        return response.json({
            page,
            limit,
            total: records.length,
            pages: Math.max(1, Math.ceil(records.length / limit)),
            attachments: records.slice(offset, offset + limit)
        });
    }

    formatTicketAttachment(attachment, availableFiles) {
        const key = this.getStoredAttachmentKey(attachment && attachment.url);
        if (!key) return { name: attachment && attachment.name || "Attachment", fileAvailable: false };
        return {
            name: attachment.name || "Attachment",
            contentType: attachment.contentType || "",
            size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : null,
            fileAvailable: availableFiles.has(key),
            url: `${getDashboardUrl(this.config)}/?key=${encodeURIComponent(key)}`
        };
    }

    async serveTicketTranscript(request, response) {
        const access = await this.getAuthorizedGuild(request, response);
        if (!access) return;

        const ticketId = String(request.params.ticketId || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
            return response.status(404).send("Ticket transcript not found.");
        }

        const folder = path.resolve(this.config.tickets.folder);
        let metadata;
        try {
            metadata = JSON.parse(await fs.promises.readFile(path.join(folder, `${ticketId}.json`), "utf8"));
        } catch (error) {
            if (error.code === "ENOENT") return response.status(404).send("Ticket transcript not found.");
            throw error;
        }
        if (metadata.guildId !== access.guildId || metadata.ticketId !== ticketId) {
            return response.status(404).send("Ticket transcript not found.");
        }

        response.setHeader(
            "Content-Security-Policy",
            "default-src 'none'; img-src 'self' https://cdn.discordapp.com data:; media-src 'self' https://cdn.discordapp.com; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        );
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Content-Disposition", `attachment; filename="ticket-${ticketId}.html"`);
        return response.sendFile(path.join(folder, `${ticketId}.html`));
    }

    async serveDashboard(request, response) {
        if (!this.readSession(request)) return response.redirect("/login");
        const current = await this.authenticate(request, response);
        if (!current) return;
        if (!this.getAvailableGuilds(current.guilds).length) {
            return response.status(403).send("You need Administrator permissions in a server where this bot is active.");
        }
        response.setHeader("Cache-Control", "no-store");
        response.setHeader(
            "Content-Security-Policy",
            "default-src 'none'; connect-src 'self'; img-src 'self' https://cdn.discordapp.com data:; media-src 'self' https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        );
        return response.sendFile(path.join(__dirname, "..", "dashboard", "index.html"));
    }

    async listGuilds(request, response) {
        const current = await this.authenticate(request, response);
        if (!current) return;
        response.setHeader("Cache-Control", "no-store");
        const user = current.session.user;
        let defaultAvatarIndex = 0;
        try {
            defaultAvatarIndex = Number((BigInt(user.id) >> 22n) % 6n);
        } catch (error) {
            if (user.discriminator && user.discriminator !== "0") {
                defaultAvatarIndex = Number(user.discriminator) % 5;
            }
        }
        return response.json({
            user: {
                username: user.global_name || user.username,
                avatarUrl: user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
                    : `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`
            },
            guilds: this.getAvailableGuilds(current.guilds)
        });
    }

    async listLogs(request, response) {
        const access = await this.getAuthorizedGuild(request, response);
        if (!access) return;

        const page = this.getPage(request);
        const eventType = typeof request.query.eventType === "string" && request.query.eventType.length <= 60
            ? request.query.eventType
            : "";
        const limit = 50;
        const offset = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            access.bot.database.getModerationLogs(access.guildId, { limit, offset, eventType }),
            access.bot.database.countModerationLogs(access.guildId, eventType)
        ]);
        response.setHeader("Cache-Control", "no-store");
        return response.json({
            page,
            limit,
            total,
            pages: Math.max(1, Math.ceil(total / limit)),
            logs: rows.map((row) => ({ ...row, payload: parsePayload(row) }))
        });
    }
}

module.exports = { ModerationDashboard, getDashboardUrl };
