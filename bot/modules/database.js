const sqlite = require('sqlite3');
const { randomUUID } = require("crypto");

function addColumnFilters(query, params, filters, columns) {
    for (const [field, rawValue] of Object.entries(filters || {})) {
        const expression = columns[field];
        if (!expression || typeof rawValue !== "string") continue;

        const include = [];
        const exclude = [];
        for (const value of rawValue.split(",")) {
            const term = value.trim();
            if (!term) continue;
            if (term.startsWith("!")) {
                if (term.length > 1) exclude.push(term.slice(1).trim());
            } else {
                include.push(term);
            }

        }

        const pattern = (term) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;
        const searchExpression = `lower(COALESCE(CAST(${expression} AS TEXT), ''))`;
        if (include.length) {
            query += ` AND (${include.map(() => `${searchExpression} LIKE ? ESCAPE '\\'`).join(" OR ")})`;
            params.push(...include.map(term => pattern(term.toLowerCase())));
        }
        for (const term of exclude) {
            query += ` AND ${searchExpression} NOT LIKE ? ESCAPE '\\'`;
            params.push(pattern(term.toLowerCase()));
        }
    }
    return query;
}

class SQL {
    constructor() {
        this.db = null;
        this.ready = this.init();
        console.log("<DATABASE> Database loaded");
    }

    init() {
        return new Promise(async (resolve, reject) => {
            try {
                this.db = new sqlite.Database(`./bot/data/main.db`);
                // twitch tables
                await this._run("CREATE TABLE IF NOT EXISTS twicth (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, twitchId TEXT, clipsChannelId TEXT, enableClips INTEGER, notificationRoleId TEXT)");
                await this._ensureColumns("twicth", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "discordChannel", type: "TEXT" },
                    { name: "twitchId", type: "TEXT" },
                    { name: "clipsChannelId", type: "TEXT" },
                    { name: "enableClips", type: "INTEGER" },
                    { name: "notificationRoleId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS twicthClips (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, clipId TEXT, data TEXT)");
                await this._ensureColumns("twicthClips", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "discordChannel", type: "TEXT" },
                    { name: "clipId", type: "TEXT" },
                    { name: "data", type: "TEXT" }
                ]);
                // youtube tables
                await this._run("CREATE TABLE IF NOT EXISTS youtube (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, youtubeChannelId TEXT)");
                await this._ensureColumns("youtube", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "discordChannel", type: "TEXT" },
                    { name: "youtubeChannelId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS youtubeVideos (guildId TEXT, channelId TEXT, channelName TEXT, videoId TEXT)");
                await this._ensureColumns("youtubeVideos", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "videoId", type: "TEXT" }
                ]);
                // twitter tables
                await this._run("CREATE TABLE IF NOT EXISTS twitter (guildId TEXT, channelId TEXT, accountName TEXT, discordChannel TEXT, roleId TEXT)");
                await this._ensureColumns("twitter", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "accountName", type: "TEXT" },
                    { name: "discordChannel", type: "TEXT" },
                    { name: "roleId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS twitterTweets (guildId TEXT, channelId TEXT, accountName TEXT, tweetId TEXT)");
                await this._ensureColumns("twitterTweets", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "accountName", type: "TEXT" },
                    { name: "tweetId", type: "TEXT" }
                ]);
                // store full tweet JSON data (one row per tweetId). fetchedAt is ms since epoch
                await this._run("CREATE TABLE IF NOT EXISTS twitterData (guildId TEXT, channelId TEXT, accountName TEXT, tweetId TEXT PRIMARY KEY, data TEXT, fetchedAt INTEGER)");
                await this._ensureColumns("twitterData", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "accountName", type: "TEXT" },
                    { name: "tweetId", type: "TEXT" },
                    { name: "data", type: "TEXT" },
                    { name: "fetchedAt", type: "INTEGER" }
                ]);
                // cache for twitter users: username -> json data, cachedAt timestamp (ms since epoch)
                await this._run("CREATE TABLE IF NOT EXISTS twitterUsers (username TEXT PRIMARY KEY, data TEXT, cachedAt INTEGER)");
                await this._ensureColumns("twitterUsers", [
                    { name: "username", type: "TEXT" },
                    { name: "data", type: "TEXT" },
                    { name: "cachedAt", type: "INTEGER" }
                ]);
                // roles selector tables
                await this._run("CREATE TABLE IF NOT EXISTS rolesSelector (guildId TEXT, selectorId TEXT, embed TEXT)");
                await this._ensureColumns("rolesSelector", [
                    { name: "guildId", type: "TEXT" },
                    { name: "selectorId", type: "TEXT" },
                    { name: "embed", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS roles (guildId TEXT, selectorId TEXT, roleId TEXT, roleName TEXT)");
                await this._ensureColumns("roles", [
                    { name: "guildId", type: "TEXT" },
                    { name: "selectorId", type: "TEXT" },
                    { name: "roleId", type: "TEXT" },
                    { name: "roleName", type: "TEXT" }
                ]);
                // multi roles selector tables
                await this._run("CREATE TABLE IF NOT EXISTS multiRolesSelector (guildId TEXT, selectorId TEXT, embed TEXT, maxChoices INTEGER)");
                await this._ensureColumns("multiRolesSelector", [
                    { name: "guildId", type: "TEXT" },
                    { name: "selectorId", type: "TEXT" },
                    { name: "embed", type: "TEXT" },
                    { name: "maxChoices", type: "INTEGER" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS multiRoles (guildId TEXT, selectorId TEXT, roleId TEXT, roleName TEXT)");
                await this._ensureColumns("multiRoles", [
                    { name: "guildId", type: "TEXT" },
                    { name: "selectorId", type: "TEXT" },
                    { name: "roleId", type: "TEXT" },
                    { name: "roleName", type: "TEXT" }
                ]);
                // uploader tables
                await this._run("CREATE TABLE IF NOT EXISTS pictures (guildId TEXT, uuid TEXT, url TEXT)");
                await this._ensureColumns("pictures", [
                    { name: "guildId", type: "TEXT" },
                    { name: "uuid", type: "TEXT" },
                    { name: "url", type: "TEXT" }
                ]);
                // ticketing system tables
                await this._run("CREATE TABLE IF NOT EXISTS tickets (id INTEGER, guildId TEXT, channelId TEXT, ticketOwner TEXT, ticketId TEXT, ticketTitle TEXT, ticketDescription TEXT)");
                await this._ensureColumns("tickets", [
                    { name: "id", type: "INTEGER" },
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "ticketOwner", type: "TEXT" },
                    { name: "ticketId", type: "TEXT" },
                    { name: "ticketTitle", type: "TEXT" },
                    { name: "ticketDescription", type: "TEXT" },
                    { name: "ticketConfigId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS ticketCounters (guildId TEXT PRIMARY KEY, lastId INTEGER NOT NULL)");
                await this._ensureColumns("ticketCounters", [
                    { name: "guildId", type: "TEXT" },
                    { name: "lastId", type: "INTEGER" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS ticketConfig (configId TEXT, guildId TEXT, tagRole TEXT, title TEXT, description TEXT, transcriptChannel TEXT, questionTitleRequired INTEGER, questionTitleMinLength INTEGER, questionDescriptionRequired INTEGER, questionDescriptionMinLength INTEGER)");
                await this._ensureColumns("ticketConfig", [
                    { name: "configId", type: "TEXT" },
                    { name: "guildId", type: "TEXT" },
                    { name: "tagRole", type: "TEXT" },
                    { name: "title", type: "TEXT" },
                    { name: "description", type: "TEXT" },
                    { name: "transcriptChannel", type: "TEXT" },
                    { name: "questionTitleRequired", type: "INTEGER" },
                    { name: "questionTitleMinLength", type: "INTEGER" },
                    { name: "questionDescriptionRequired", type: "INTEGER" },
                    { name: "questionDescriptionMinLength", type: "INTEGER" },
                    { name: "ticketsCategoryId", type: "TEXT" },
                    { name: "ticketsPrefix", type: "TEXT" }
                ]);
                await this._backfillTicketConfigIds();
                await this._run("CREATE UNIQUE INDEX IF NOT EXISTS idx_ticketConfig_configId ON ticketConfig (configId)");
                await this._run("CREATE TABLE IF NOT EXISTS ticketMessages (ticketId TEXT, content TEXT, username TEXT, authorProfile TEXT, currentTime TEXT, color TEXT, orderDate TEXT, messageType TEXT, edited TEXT, messageId TEXT)");
                await this._ensureColumns("ticketMessages", [
                    { name: "ticketId", type: "TEXT" },
                    { name: "content", type: "TEXT" },
                    { name: "username", type: "TEXT" },
                    { name: "authorProfile", type: "TEXT" },
                    { name: "currentTime", type: "TEXT" },
                    { name: "color", type: "TEXT" },
                    { name: "orderDate", type: "TEXT" },
                    { name: "messageType", type: "TEXT" },
                    { name: "edited", type: "TEXT" },
                    { name: "messageId", type: "TEXT" }
                ]);
                await this._run("CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets (guildId)");
                await this._run("CREATE INDEX IF NOT EXISTS idx_ticketMessages_ticket_type ON ticketMessages (ticketId, messageType)");
                // other tables
                await this._run("CREATE TABLE IF NOT EXISTS nicknames (guildId TEXT, nickname TEXT)");
                await this._ensureColumns("nicknames", [
                    { name: "guildId", type: "TEXT" },
                    { name: "nickname", type: "TEXT" }
                ]);
                // role sync
                await this._run("CREATE TABLE IF NOT EXISTS syncrole (guildId TEXT, roleId TEXT, otherGuildId TEXT, otherRoleId TEXT)");
                await this._ensureColumns("syncrole", [
                    { name: "guildId", type: "TEXT" },
                    { name: "roleId", type: "TEXT" },
                    { name: "otherGuildId", type: "TEXT" },
                    { name: "otherRoleId", type: "TEXT" }
                ]);
                // verify system
                await this._run("CREATE TABLE IF NOT EXISTS verify (guildId TEXT, roleId TEXT)");
                await this._ensureColumns("verify", [
                    { name: "guildId", type: "TEXT" },
                    { name: "roleId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS kickChannelConfig (guildId TEXT PRIMARY KEY, channelId TEXT NOT NULL, messageId TEXT NOT NULL, description TEXT NOT NULL)");
                await this._ensureColumns("kickChannelConfig", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "messageId", type: "TEXT" },
                    { name: "description", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS kickChannelKicks (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT NOT NULL, userId TEXT NOT NULL, kickedAt INTEGER NOT NULL)");
                await this._ensureColumns("kickChannelKicks", [
                    { name: "id", type: "INTEGER" },
                    { name: "guildId", type: "TEXT" },
                    { name: "userId", type: "TEXT" },
                    { name: "kickedAt", type: "INTEGER" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS moderationLogConfig (guildId TEXT PRIMARY KEY, channelId TEXT NOT NULL)");
                await this._ensureColumns("moderationLogConfig", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS moderationLogs (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT NOT NULL, createdAt INTEGER NOT NULL, eventType TEXT NOT NULL, userId TEXT, channelId TEXT, payloadJson TEXT NOT NULL)");
                await this._ensureColumns("moderationLogs", [
                    { name: "id", type: "INTEGER" },
                    { name: "guildId", type: "TEXT" },
                    { name: "createdAt", type: "INTEGER" },
                    { name: "eventType", type: "TEXT" },
                    { name: "userId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "payloadJson", type: "TEXT" }
                ]);
                await this._run("CREATE INDEX IF NOT EXISTS idx_moderationLogs_guild_created ON moderationLogs (guildId, createdAt DESC, id DESC)");
                await this._run("CREATE TABLE IF NOT EXISTS dashboardLogs (id INTEGER PRIMARY KEY AUTOINCREMENT, createdAt INTEGER NOT NULL, guildId TEXT, userId TEXT, username TEXT, ipAddress TEXT, action TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER, detailsJson TEXT NOT NULL)");
                await this._ensureColumns("dashboardLogs", [
                    { name: "id", type: "INTEGER" },
                    { name: "createdAt", type: "INTEGER" },
                    { name: "guildId", type: "TEXT" },
                    { name: "userId", type: "TEXT" },
                    { name: "username", type: "TEXT" },
                    { name: "ipAddress", type: "TEXT" },
                    { name: "action", type: "TEXT" },
                    { name: "method", type: "TEXT" },
                    { name: "path", type: "TEXT" },
                    { name: "status", type: "INTEGER" },
                    { name: "detailsJson", type: "TEXT" }
                ]);
                await this._run("CREATE INDEX IF NOT EXISTS idx_dashboardLogs_guild_created ON dashboardLogs (guildId, createdAt DESC, id DESC)");
                await this._run("CREATE TABLE IF NOT EXISTS capturedMessages (messageId TEXT PRIMARY KEY, guildId TEXT NOT NULL, channelId TEXT NOT NULL, channelName TEXT, userId TEXT NOT NULL, authorName TEXT NOT NULL, content TEXT NOT NULL, attachmentsJson TEXT NOT NULL, embedsJson TEXT NOT NULL, createdAt INTEGER NOT NULL, editedAt INTEGER, isBot INTEGER NOT NULL DEFAULT 0)");
                await this._ensureColumns("capturedMessages", [
                    { name: "messageId", type: "TEXT" },
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "userId", type: "TEXT" },
                    { name: "authorName", type: "TEXT" },
                    { name: "content", type: "TEXT" },
                    { name: "attachmentsJson", type: "TEXT" },
                    { name: "embedsJson", type: "TEXT" },
                    { name: "createdAt", type: "INTEGER" },
                    { name: "editedAt", type: "INTEGER" },
                    { name: "isBot", type: "INTEGER" }
                ]);
                await this._run("CREATE INDEX IF NOT EXISTS idx_capturedMessages_guild_created ON capturedMessages (guildId, createdAt DESC, messageId DESC)");
                await this._run("CREATE TABLE IF NOT EXISTS discordUsers (guildId TEXT NOT NULL, userId TEXT NOT NULL, username TEXT NOT NULL, globalName TEXT, displayName TEXT, avatarUrl TEXT, accountCreatedAt INTEGER, joinedAt TEXT, bot INTEGER NOT NULL DEFAULT 0, messagesSent INTEGER NOT NULL DEFAULT 0, interactionsSent INTEGER NOT NULL DEFAULT 0, voiceTimeMs INTEGER NOT NULL DEFAULT 0, voiceStartedAt INTEGER, voiceChannelId TEXT, lastActivityAt INTEGER NOT NULL, profileJson TEXT NOT NULL, PRIMARY KEY (guildId, userId))");
                await this._ensureColumns("discordUsers", [
                    { name: "guildId", type: "TEXT" },
                    { name: "userId", type: "TEXT" },
                    { name: "username", type: "TEXT" },
                    { name: "globalName", type: "TEXT" },
                    { name: "displayName", type: "TEXT" },
                    { name: "avatarUrl", type: "TEXT" },
                    { name: "accountCreatedAt", type: "INTEGER" },
                    { name: "joinedAt", type: "TEXT" },
                    { name: "bot", type: "INTEGER" },
                    { name: "messagesSent", type: "INTEGER" },
                    { name: "interactionsSent", type: "INTEGER" },
                    { name: "voiceTimeMs", type: "INTEGER" },
                    { name: "voiceStartedAt", type: "INTEGER" },
                    { name: "voiceChannelId", type: "TEXT" },
                    { name: "lastActivityAt", type: "INTEGER" },
                    { name: "profileJson", type: "TEXT" }
                ]);
                await this._run("CREATE INDEX IF NOT EXISTS idx_discordUsers_guild_activity ON discordUsers (guildId, lastActivityAt DESC)");
                await this._backfillDiscordUsers();
                resolve();
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }

    _run(stmt, params = {}) {
        return new Promise((resolve, reject) => {
            this.db.run(stmt, params, (error) => {
                if (error) return reject(error);
                resolve();
            });
        })
    }

    _all(stmt, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(stmt, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    /**
     * This function checks if the columns in the comlumns array exist in the table, and if not, it adds them.
     * @param {string} tableName 
     * @param {Array} comlumns 
     * @returns 
     */
    _ensureColumns(tableName, comlumns) {
        return new Promise((resolve, reject) => {
            this.db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
                if (err) reject(err);
                const existingColumns = new Set(rows.map((row) => row.name));
                const missingColumns = comlumns.filter((col) => !existingColumns.has(col.name));
                if (missingColumns.length === 0) return resolve();
                const alterPromises = missingColumns.map((col) => {
                    return new Promise((res, rej) => {
                        this.db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default || 'NULL'}`, (err) => {
                            if (err) rej(err);
                            res();
                        });
                    });
                });
                Promise.all(alterPromises).then(() => resolve()).catch((err) => reject(err));
            });
        });
    }

    async _ensureTicketConfigColumns() {
        const rows = await this._all("PRAGMA table_info(ticketConfig)");
        const columns = new Set(rows.map((row) => row.name));

        if (!columns.has("questionTitleRequired")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN questionTitleRequired INTEGER DEFAULT 1");
        }

        if (!columns.has("questionTitleMinLength")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN questionTitleMinLength INTEGER DEFAULT 10");
        }

        if (!columns.has("questionDescriptionRequired")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN questionDescriptionRequired INTEGER DEFAULT 1");
        }

        if (!columns.has("questionDescriptionMinLength")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN questionDescriptionMinLength INTEGER DEFAULT 20");
        }

        if (!columns.has("ticketsCategoryId")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN ticketsCategoryId TEXT DEFAULT '0'");
        }
        if (!columns.has("ticketsPrefix")) {
            await this._run("ALTER TABLE ticketConfig ADD COLUMN ticketsPrefix TEXT DEFAULT 'ticket-'");
        }
    }

    async _backfillTicketConfigIds() {
        const rows = await this._all("SELECT rowid FROM ticketConfig WHERE configId IS NULL OR configId = ''");
        for (const row of rows) {
            await this._run("UPDATE ticketConfig SET configId = ? WHERE rowid = ?", [randomUUID(), row.rowid]);
        }
    }

    async _backfillDiscordUsers() {
        const users = new Map();
        const getUser = (guildId, userId) => {
            const key = `${guildId}:${userId}`;
            if (!users.has(key)) {
                users.set(key, {
                    guildId,
                    userId,
                    username: userId,
                    globalName: null,
                    displayName: userId,
                    avatarUrl: null,
                    accountCreatedAt: null,
                    joinedAt: null,
                    bot: false,
                    messagesSent: 0,
                    interactionsSent: 0,
                    voiceTimeMs: 0,
                    voiceStartedAt: null,
                    voiceChannelId: null,
                    lastActivityAt: 0,
                    profile: null,
                    lastActivityType: null,
                    profileUpdatedAt: 0
                });
            }
            return users.get(key);
        };
        const applyProfile = (record, payload, occurredAt, activityType) => {
            const details = payload && payload.operation && payload.operation.details || {};
            const target = details.target || {};
            const user = details.user || target.user || target;
            const member = details.member || (target.user ? target : null);
            if (user.bot || (!user.id && !user.username)) return;
            if (occurredAt < record.profileUpdatedAt) return;
            const createdAt = user.createdAt || user.createdTimestamp;
            const parsedCreatedAt = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
            record.username = user.username || user.tag || record.username;
            record.globalName = user.globalName || null;
            record.displayName = member && (member.displayName || member.nickname) || record.globalName || record.username;
            record.avatarUrl = user.avatarUrl || null;
            record.accountCreatedAt = Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : null;
            record.joinedAt = member && member.joinedAt || null;
            const latestActivity = occurredAt >= record.lastActivityAt
                ? {
                    type: activityType,
                    occurredAt: new Date(occurredAt).toISOString(),
                    channelId: details.channel && details.channel.id || null
                }
                : record.profile && record.profile.lastActivity || null;
            record.profile = {
                user,
                member: member || null,
                guild: payload.guild || { id: record.guildId },
                lastActivity: latestActivity
            };
            record.profileUpdatedAt = occurredAt;
            if (occurredAt >= record.lastActivityAt) {
                record.lastActivityAt = occurredAt;
                record.lastActivityType = activityType;
            }
        };

        const messageGroups = await this._all(
            `SELECT guildId, userId, authorName, COUNT(*) AS messagesSent, MAX(createdAt) AS lastActivityAt
             FROM capturedMessages WHERE isBot = 0 GROUP BY guildId, userId`
        );
        for (const row of messageGroups) {
            const record = getUser(row.guildId, row.userId);
            record.username = row.authorName || record.username;
            record.displayName = row.authorName || record.displayName;
            record.messagesSent = row.messagesSent;
            record.lastActivityAt = row.lastActivityAt;
            record.lastActivityType = "message";
            record.profile = {
                user: { id: row.userId, username: record.username },
                member: null,
                guild: { id: row.guildId },
                lastActivity: {
                    type: "message",
                    occurredAt: new Date(row.lastActivityAt).toISOString(),
                    channelId: null
                }
            };
        }

        const interactions = await this._all(
            `SELECT latest.guildId, latest.userId, latest.createdAt, latest.payloadJson, totals.interactionsSent
             FROM moderationLogs latest
             JOIN (
                 SELECT guildId, userId, COUNT(*) AS interactionsSent, MAX(createdAt) AS latestAt
                 FROM moderationLogs
                 WHERE eventType = 'interaction' AND userId IS NOT NULL
                 GROUP BY guildId, userId
             ) totals ON totals.guildId = latest.guildId AND totals.userId = latest.userId
                 AND totals.latestAt = latest.createdAt
             WHERE latest.eventType = 'interaction'
                 AND latest.id = (
                     SELECT MAX(newest.id) FROM moderationLogs newest
                     WHERE newest.guildId = latest.guildId AND newest.userId = latest.userId
                         AND newest.eventType = 'interaction' AND newest.createdAt = latest.createdAt
                 )`
        );
        for (const row of interactions) {
            let payload;
            try {
                payload = JSON.parse(row.payloadJson);
            } catch (error) {
                console.error(`Could not backfill interaction profile ${row.userId}:`, error);
                continue;
            }
            const record = getUser(row.guildId, row.userId);
            record.interactionsSent = row.interactionsSent;
            applyProfile(record, payload, row.createdAt, "interaction");
        }

        const voiceLogs = await this._all(
            `SELECT guildId, userId, createdAt, eventType, channelId, payloadJson
             FROM moderationLogs
             WHERE eventType IN ('voice.join', 'voice.leave', 'voice.move') AND userId IS NOT NULL
             ORDER BY guildId, userId, createdAt, id`
        );
        for (const row of voiceLogs) {
            const record = getUser(row.guildId, row.userId);
            let payload;
            try {
                payload = JSON.parse(row.payloadJson);
            } catch (error) {
                console.error(`Could not backfill voice activity ${row.userId}:`, error);
                continue;
            }
            const details = payload.operation && payload.operation.details || {};
            const fromChannel = details.from && details.from.id || null;
            const toChannel = details.to && details.to.id || null;
            if (record.voiceStartedAt !== null && record.voiceChannelId !== toChannel) {
                record.voiceTimeMs += Math.max(0, row.createdAt - record.voiceStartedAt);
            }
            if (row.eventType === "voice.leave") {
                record.voiceStartedAt = null;
                record.voiceChannelId = null;
            } else {
                record.voiceStartedAt = row.createdAt;
                record.voiceChannelId = toChannel || row.channelId || fromChannel;
            }
            applyProfile(record, payload, row.createdAt, row.eventType);
        }

        for (const record of users.values()) {
            if (record.lastActivityAt <= 0 || !record.profile) continue;
            record.profile.lastActivity = {
                type: record.lastActivityType,
                occurredAt: new Date(record.lastActivityAt).toISOString(),
                channelId: record.lastActivityType && record.lastActivityType.startsWith("voice.")
                    ? record.voiceChannelId
                    : record.profile.lastActivity.channelId || null
            };
            await this._run(
                `INSERT OR IGNORE INTO discordUsers
                    (guildId, userId, username, globalName, displayName, avatarUrl, accountCreatedAt, joinedAt, bot,
                     messagesSent, interactionsSent, voiceTimeMs, voiceStartedAt, voiceChannelId, lastActivityAt, profileJson)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    record.guildId,
                    record.userId,
                    record.username,
                    record.globalName,
                    record.displayName,
                    record.avatarUrl,
                    record.accountCreatedAt,
                    record.joinedAt,
                    record.messagesSent,
                    record.interactionsSent,
                    record.voiceTimeMs,
                    record.voiceStartedAt,
                    record.voiceChannelId,
                    record.lastActivityAt,
                    JSON.stringify(record.profile)
                ]
            );
        }
    }

    /**
     * Sync role section
     */

    getSyncRoles(guildId) {
        console.log("<DATABASE> getSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM syncrole WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    getSyncRoleMappingsForGuild(guildId) {
        console.log("<DATABASE> getSyncRoleMappingsForGuild call");
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM syncrole WHERE guildId = ? OR otherGuildId = ?",
                [guildId, guildId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
    }

    getSyncRole(guildId, roleId, otherGuildId) {
        console.log("<DATABASE> getSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM syncrole WHERE guildId = ? AND roleId = ? AND otherGuildId = ?", [guildId, roleId, otherGuildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getSyncRoleByOtherGuildId(otherGuildId) {
        console.log("<DATABASE> getSyncRoleByOtherGuildId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM syncrole WHERE otherGuildId = ?", [otherGuildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    addSyncRole(guildId, roleId, otherGuildId, otherRoleId) {
        console.log("<DATABASE> addSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO syncrole VALUES (?, ?, ?, ?)", [guildId, roleId, otherGuildId, otherRoleId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    deleteSyncRole(guildId, roleId, otherGuildId, otherRoleId) {
        console.log("<DATABASE> deleteSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.run(
                "DELETE FROM syncrole WHERE guildId = ? AND roleId = ? AND otherGuildId = ? AND otherRoleId = ?",
                [guildId, roleId, otherGuildId, otherRoleId],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }

    /**
     * Twitch section 
     */

    getAllTwitchChannels(guildId) {
        console.log("<DATABASE> getAllTwitchChannels call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicth WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getTwitchChannels(guildId, channelId) {
        console.log("<DATABASE> getTwitchChannels call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicth WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getChannelsWithEnabledClips(guildId) {
        console.log("<DATABASE> getChannelsWithEnabledClips call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicth WHERE guildId = ? AND enableClips = 1", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getChannelClips(guildId, channelId) {
        console.log("<DATABASE> getChannelClips call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicthClips WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    setClipsChannelId(guildId, channelName, clipsChannelId) {
        console.log("<DATABASE> setClipsChannelId call");
        this.db.run("UPDATE twicth SET clipsChannelId = ? WHERE guildId = ? AND channelName = ?", [clipsChannelId, guildId, channelName]);
    }

    createTwitchChannel(guildId, channelId, channelName, discordChannel, notificationRoleId) {
        console.log("<DATABASE> createTwitchChannel call");
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO twicth (guildId, channelId, channelName, discordChannel, twitchId, clipsChannelId, enableClips, notificationRoleId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [guildId, channelId, channelName, discordChannel, 0, 0, 0, notificationRoleId],
                (error) => {
                    if (error) return reject(error);
                    resolve();
                }
            );
        });
    }

    updateTwitchId(guildId, channelName, twitchId) {
        console.log("<DATABASE> updateTwitchId call");
        this.db.run("UPDATE twicth SET twitchId = ? WHERE guildId = ? AND channelName = ?", [twitchId, guildId, channelName]);
    }

    updateTwitchClips(guildId, channelName, enableClips) {
        console.log("<DATABASE> updateTwitchClips call");
        this.db.run("UPDATE twicth SET enableClips = ? WHERE guildId = ? AND channelName = ?", [enableClips, guildId, channelName]);
    }

    updateTwitchClipsChannel(guildId, channelName, clipsChannelId) {
        console.log("<DATABASE> updateTwitchClipsChannel call");
        this.db.run("UPDATE twicth SET clipsChannelId = ? WHERE guildId = ? AND channelName = ?", [clipsChannelId, guildId, channelName]);
    }

    deleteTwitchChannel(guildId, channelId, channelName) {
        console.log("<DATABASE> deleteTwitchChannel call");
        // remove any stored clips for that channel first
        this.db.run("DELETE FROM twicthClips WHERE guildId = ? AND channelId = ? AND channelName = ?", [guildId, channelId, channelName]);
        // then remove the channel entry
        this.db.run("DELETE FROM twicth WHERE guildId = ? AND channelId = ? AND channelName = ?", [guildId, channelId, channelName]);
    }

    addClip(guildId, channelId, channelName, discordChannel, clipId, data) {
        console.log("<DATABASE> addClip call");
        this.db.run("INSERT INTO twicthClips VALUES (?, ?, ?, ?, ?, ?)", [guildId, channelId, channelName, discordChannel, clipId, data]);
    }

    /**
     * ticketing system section
     */

    getAllTicketMessages(ticketId) {
        console.log("<DATABASE> getAllTicketMessages call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM ticketMessages WHERE ticketId = ? ORDER BY orderDate DESC", [ticketId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            })
        })
    }

    updateTicketMessage(ticketId, messageId, oldContent, newContent) {
        console.log("<DATABASE> updateTicketMessage call");
        const db = this.db;
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE ticketMessages SET content = ?, edited = 'true' WHERE ticketId = ? AND messageId = ? AND messageType = 'text'",
                [newContent, ticketId, messageId],
                function (err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (this.changes > 0 || !oldContent) {
                        resolve(this.changes > 0);
                        return;
                    }

                    db.run(
                        "UPDATE ticketMessages SET content = ?, edited = 'true' WHERE ticketId = ? AND content = ? AND messageType = 'text' AND (messageId IS NULL OR messageId = '')",
                        [newContent, ticketId, oldContent],
                        function (fallbackError) {
                            if (fallbackError) {
                                reject(fallbackError);
                                return;
                            }
                            resolve(this.changes > 0);
                        }
                    );
                }
            );
        });
    }

    addTicketMessage(ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited, messageId = null) {
        console.log("<DATABASE> addTicketMessage call");
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO ticketMessages (ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited, messageId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited, messageId],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                }
            );
        });
    }

    deleteTicketMessages(ticketId) {
        console.log("<DATABASE> deleteTicketMessages call");
        this.db.run("DELETE FROM ticketMessages WHERE ticketId = $id", { $id: ticketId })
    }

    getNextTicketId(guildId) {
        console.log("<DATABASE> getNextTicketId call");
        return new Promise((resolve, reject) => {
            this.db.get(
                `INSERT INTO ticketCounters (guildId, lastId)
                 VALUES (?, (SELECT COALESCE(MAX(id), 0) + 1 FROM tickets WHERE guildId = ?))
                 ON CONFLICT(guildId) DO UPDATE SET lastId = ticketCounters.lastId + 1
                 RETURNING lastId`,
                [guildId, guildId],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (!row) {
                        reject(new Error("Failed to allocate a ticket ID."));
                        return;
                    }
                    resolve(row.lastId);
                }
            );
        });
    }

    getTicket(ticketId) {
        console.log("<DATABASE> getTicket call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM tickets WHERE ticketId = ?", [ticketId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(rows[0]);
                else resolve(0);
            })
        })
    }

    getTicketsByGuild(guildId, { limit, offset }) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT t.id, t.guildId, t.channelId, t.ticketOwner, t.ticketId, t.ticketTitle, t.ticketDescription,
                    (SELECT COUNT(*) FROM ticketMessages m WHERE m.ticketId = t.ticketId) AS messageCount,
                    (SELECT COUNT(*) FROM ticketMessages m WHERE m.ticketId = t.ticketId AND m.messageType = 'attachment') AS attachmentCount
                 FROM tickets t
                 WHERE t.guildId = ?
                 ORDER BY t.id DESC
                 LIMIT ? OFFSET ?`,
                [guildId, limit, offset],
                (error, rows) => {
                    if (error) return reject(error);
                    resolve(rows);
                }
            );
        });
    }

    countTicketsByGuild(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT COUNT(*) AS count FROM tickets WHERE guildId = ?", [guildId], (error, row) => {
                if (error) return reject(error);
                resolve(row.count);
            });
        });
    }

    getTicketAttachmentsByGuild(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT m.rowid AS id, m.ticketId, t.channelId, t.ticketOwner, t.ticketTitle,
                    m.content, m.username, m.authorProfile, m.currentTime, m.orderDate
                 FROM ticketMessages m
                 JOIN tickets t ON t.ticketId = m.ticketId
                 WHERE t.guildId = ? AND m.messageType = 'attachment'
                 ORDER BY m.rowid DESC`,
                [guildId],
                (error, rows) => {
                    if (error) return reject(error);
                    resolve(rows);
                }
            );
        });
    }

    deleteTicket(ticketId) {
        console.log("<DATABASE> deleteTicket call");
        this.db.run("DELETE FROM tickets WHERE ticketId = $id", { $id: ticketId })
    }

    createTicket(id, guildId, channelId, ownerId, ticketId, title, description, ticketConfigId) {
        console.log("<DATABASE> createTicket call");
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO tickets (id, guildId, channelId, ticketOwner, ticketId, ticketTitle, ticketDescription, ticketConfigId)
                         VALUES ($id, $guildId, $channelId, $ticketOwner, $ticketId, $ticketTitle, $ticketDescription, $ticketConfigId)`,
                {
                    $id: id,
                    $guildId: guildId,
                    $channelId: channelId,
                    $ticketOwner: ownerId,
                    $ticketId: ticketId,
                    $ticketTitle: title,
                    $ticketDescription: description,
                    $ticketConfigId: ticketConfigId
                }, (err, row) => {
                    if (err) reject(err);
                    resolve();
                });
        });
    }

    createTicketConfig(guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId = '0', questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix = 'ticket-') {
        console.log("<DATABASE> createTicketConfig call");
        const configId = randomUUID();
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO ticketConfig (configId, guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId, questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [configId, guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId, questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix], (err) => {
                if (err) return reject(err);
                resolve(configId);
            });
        });
    }

    getTicketConfigs(guildId) {
        return this._all("SELECT * FROM ticketConfig WHERE guildId = ? ORDER BY rowid ASC", [guildId]);
    }

    getTicketConfig(guildId, configId) {
        console.log("<DATABASE> getTicketConfig call");
        return new Promise((resolve, reject) => {
            const query = configId
                ? "SELECT * FROM ticketConfig WHERE guildId = ? AND configId = ?"
                : "SELECT * FROM ticketConfig WHERE guildId = ? ORDER BY rowid ASC";
            const params = configId ? [guildId, configId] : [guildId];
            this.db.all(query, params, (err, rows) => {
                if (err) return reject(err);
                if (rows[0]) resolve(rows[0]);
                else resolve(null);
            })
        })
    }

    deleteTicketConfig(guildId, configId) {
        console.log("<DATABASE> deleteTicketConfig call");
        return this._run("DELETE FROM ticketConfig WHERE guildId = ? AND configId = ?", [guildId, configId]);
    }

    updateTicketConfigCategory(configId, categoryId) {
        return this._run("UPDATE ticketConfig SET ticketsCategoryId = ? WHERE configId = ?", [categoryId, configId]);
    }

    /**
     * role selector section
     */

    addRoleToSelector(guildId, selectorId, roleId, roleName) {
        console.log("<DATABASE> addRoleToSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO roles (guildId, selectorId, roleId, roleName) VALUES (?, ?, ?, ?)", [guildId, selectorId, roleId, roleName], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    checkIfSelectorExists(guildId, selectorId) {
        console.log("<DATABASE> checkIfSelectorExists call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM rolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(true);
                else resolve(false);
            });
        });
    }

    createSelecor(guildId, selectorId, embed) {
        console.log("<DATABASE> createSelecor call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO rolesSelector (guildId, selectorId, embed) VALUES (?, ?, ?)", [guildId, selectorId, embed], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    getAllRoles(guildId) {
        console.log("<DATABASE> getAllRoles call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM roles WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    // create a function that return roles and rolesSelector merged in one single array using selectorId as key
    getAllRolesAndSelectors(guildId) {
        console.log("<DATABASE> getAllRolesAndSelectors call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM rolesSelector WHERE guildId = ?", [guildId], async (err, rows) => {
                if (err) reject(err);
                if (!rows) return resolve([]);
                if (rows.length == 0) return resolve([]);
                for (var i in rows) if (rows[i].embed) rows[i].embed = JSON.parse(rows[i].embed);
                const roles = await this.getAllRoles(guildId);
                if (!rows[0].roles) rows[0].roles = [];
                for (var i in roles) rows[0].roles.push({ id: roles[i].roleId, name: roles[i].roleName });
                resolve(rows);
            });
        });
    }

    getEmbedFromSelectorId(guildId, selectorId) {
        console.log("<DATABASE> getEmbedFromSelectorId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT embed FROM rolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                if (!rows && !rows[0]) reject("No embed found", guildId, selectorId);
                if (!rows[0].embed) reject("No embed found", guildId, selectorId);
                // parse and then return it
                if (rows[0].embed) rows[0].embed = JSON.parse(rows[0].embed);
                resolve(rows[0].embed);
            });
        });
    }

    getRolesFromSelectorId(guildId, selectorId) {
        console.log("<DATABASE> getRolesFromSelectorId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM roles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    deleteSelector(guildId, selectorId) {
        console.log("<DATABASE> deleteSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM rolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                if (err) reject(err);
                this.db.run("DELETE FROM roles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
        });
    }

    /**
     * multi role selector section
     */

    addMultiRoleToSelector(guildId, selectorId, roleId, roleName) {
        console.log("<DATABASE> addMultiRoleToSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO multiRoles (guildId, selectorId, roleId, roleName) VALUES (?, ?, ?, ?)", [guildId, selectorId, roleId, roleName], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    checkIfMultiSelectorExists(guildId, selectorId) {
        console.log("<DATABASE> checkIfMultiSelectorExists call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM multiRolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(true);
                else resolve(false);
            });
        });
    }

    createMultiSelecor(guildId, selectorId, embed, maxChoices) {
        console.log("<DATABASE> createMultiSelecor call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO multiRolesSelector (guildId, selectorId, embed, maxChoices) VALUES (?, ?, ?, ?)", [guildId, selectorId, embed, maxChoices], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    getAllMultiRoles(guildId) {
        console.log("<DATABASE> getAllMultiRoles call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM multiRoles WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    // create a function that return roles and rolesSelector merged in one single array using selectorId as key
    getAllMultiRolesAndSelectors(guildId) {
        console.log("<DATABASE> getAllMultiRolesAndSelectors call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM multiRolesSelector WHERE guildId = ?", [guildId], async (err, rows) => {
                if (err) reject(err);
                if (!rows) return resolve([]);
                if (rows.length == 0) return resolve([]);
                for (var i in rows) if (rows[i].embed) rows[i].embed = JSON.parse(rows[i].embed);
                const roles = await this.getAllMultiRoles(guildId);
                if (!rows[0].roles) rows[0].roles = [];
                for (var i in roles) rows[0].roles.push({ id: roles[i].roleId, name: roles[i].roleName });
                resolve(rows);
            });
        });
    }

    getEmbedFromMultiSelectorId(guildId, selectorId) {
        console.log("<DATABASE> getEmbedFromMultiSelectorId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT embed FROM multiRolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                if (!rows && !rows[0]) reject("No embed found", guildId, selectorId);
                if (!rows[0].embed) reject("No embed found", guildId, selectorId);
                // parse and then return it
                if (rows[0].embed) rows[0].embed = JSON.parse(rows[0].embed);
                resolve(rows[0].embed);
            });
        });
    }

    getMultiRolesFromSelectorId(guildId, selectorId) {
        console.log("<DATABASE> getMultiRolesFromSelectorId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM multiRoles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                const result = { roles: rows, maxChoices: 0 };
                this.db.all("SELECT * FROM multiRolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                    if (err) reject(err);
                    if (!rows && !rows[0]) reject("No selector found");
                    if (!rows[0].maxChoices) reject("No maxChoices found");
                    result.maxChoices = rows[0].maxChoices;
                    resolve(result);
                });
            });
        });
    }

    deleteMultiSelector(guildId, selectorId) {
        console.log("<DATABASE> deleteMultiSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM multiRolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                if (err) reject(err);
                this.db.run("DELETE FROM multiRoles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
        });
    }

    updateMultiSelector(guildId, selectorId, embed, maxChoices) {
        console.log("<DATABASE> updateMultiSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("UPDATE multiRolesSelector SET embed = ?, maxChoices = ? WHERE guildId = ? AND selectorId = ?", [embed, maxChoices, guildId, selectorId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    deleteMultiRolesForSelector(guildId, selectorId) {
        console.log("<DATABASE> deleteMultiRolesForSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM multiRoles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    updateSelector(guildId, selectorId, embed) {
        console.log("<DATABASE> updateSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("UPDATE rolesSelector SET embed = ? WHERE guildId = ? AND selectorId = ?", [embed, guildId, selectorId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    deleteRolesForSelector(guildId, selectorId) {
        console.log("<DATABASE> deleteRolesForSelector call");
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM roles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    /**
     * twitter section
     */

    updateTweetRoleId(guildId, accountName, roleId) {
        console.log("<DATABASE> updateTweetRoleId call");
        this.db.run("UPDATE twitter SET roleId = ? WHERE guildId = ? AND accountName = ?", [roleId, guildId, accountName]);
    }

    getAllTwitterAccounts(guildId) {
        console.log("<DATABASE> getAllTwitterAccounts call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twitter WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getTwitterAccounts(guildId, channelId) {
        console.log("<DATABASE> getTwitterAccounts call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twitter WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    createTwitterAccount(guildId, channelId, accountName, discordChannel, roleId) {
        console.log("<DATABASE> createTwitterAccount call");
        this.db.run("INSERT INTO twitter VALUES (?, ?, ?, ?, ?, ?)", [guildId, channelId, accountName, discordChannel, null, roleId]);
    }

    deleteTwitterAccount(guildId, channelId, accountName) {
        console.log("<DATABASE> deleteTwitterAccount call");
        this.db.run("DELETE FROM twitter WHERE guildId = ? AND channelId = ? AND accountName = ?", [guildId, channelId, accountName]);
    }

    insertNewTweet(guildId, channelId, accountName, tweetId) {
        console.log("<DATABASE> insertNewTweet call");
        this.db.run("INSERT INTO twitterTweets VALUES (?, ?, ?, ?)", [guildId, channelId, accountName, tweetId]);
    }

    isTweetAlreadySend(guildId, channelId, accountName, tweetId) {
        console.log("<DATABASE> isTweetAlreadySend call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM twitterTweets WHERE guildId = ? AND channelId = ? AND accountName = ? AND tweetId = ?", [guildId, channelId, accountName, tweetId], (err, row) => {
                if (err) reject(err);
                if (row) resolve(true);
                else resolve(false);
            });
        });
    }

    // Persist full tweet JSON for later use / inspection
    saveTweetData(guildId, channelId, accountName, tweetId, data) {
        console.log("<DATABASE> saveTweetData call");
        try {
            const str = JSON.stringify(data);
            const ts = Date.now();
            this.db.run("INSERT OR REPLACE INTO twitterData (guildId, channelId, accountName, tweetId, data, fetchedAt) VALUES (?, ?, ?, ?, ?, ?)", [guildId, channelId, accountName, tweetId, str, ts]);
        } catch (e) {
            console.error(e);
        }
    }

    // Retrieve latest stored tweet for an account (or null)
    getLatestStoredTweet(guildId, channelId, accountName) {
        console.log("<DATABASE> getLatestStoredTweet call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM twitterData WHERE guildId = ? AND channelId = ? AND accountName = ? ORDER BY fetchedAt DESC LIMIT 1", [guildId, channelId, accountName], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                try {
                    row.data = JSON.parse(row.data);
                } catch (e) { /* ignore parse errors */ }
                resolve(row);
            });
        });
    }

    // Retrieve stored tweet by tweetId
    getStoredTweetById(tweetId) {
        console.log("<DATABASE> getStoredTweetById call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM twitterData WHERE tweetId = ?", [tweetId], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                try { row.data = JSON.parse(row.data); } catch (e) { }
                resolve(row);
            });
        });
    }

    // Twitter user cache
    getTwitterUser(username) {
        console.log("<DATABASE> getTwitterUser call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT data, cachedAt FROM twitterUsers WHERE username = ?", [username], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                try {
                    const parsed = JSON.parse(row.data);
                    resolve({ data: parsed, cachedAt: row.cachedAt });
                } catch (e) {
                    // if parsing fails, still return raw data
                    resolve({ data: row.data, cachedAt: row.cachedAt });
                }
            });
        });
    }

    saveTwitterUser(username, data) {
        console.log("<DATABASE> saveTwitterUser call");
        try {
            const str = JSON.stringify(data);
            const ts = Date.now();
            this.db.run("INSERT OR REPLACE INTO twitterUsers (username, data, cachedAt) VALUES (?, ?, ?)", [username, str, ts]);
        } catch (e) {
            console.error(e);
        }
    }

    /* YouTube section */
    getAllYoutubeChannels(guildId) {
        console.log("<DATABASE> getAllYoutubeChannels call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM youtube WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getYoutubeChannels(guildId, channelId) {
        console.log("<DATABASE> getYoutubeChannels call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM youtube WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    createYoutubeChannel(guildId, channelId, channelName, discordChannel, youtubeChannelId = null) {
        console.log("<DATABASE> createYoutubeChannel call");
        this.db.run("INSERT INTO youtube VALUES (?, ?, ?, ?, ?)", [guildId, channelId, channelName, discordChannel, youtubeChannelId]);
    }

    deleteYoutubeChannel(guildId, channelId, channelName) {
        console.log("<DATABASE> deleteYoutubeChannel call");
        this.db.run("DELETE FROM youtube WHERE guildId = ? AND channelId = ? AND channelName = ?", [guildId, channelId, channelName]);
    }

    insertNewYoutubeVideo(guildId, channelId, channelName, videoId) {
        console.log("<DATABASE> insertNewYoutubeVideo call");
        this.db.run("INSERT INTO youtubeVideos VALUES (?, ?, ?, ?)", [guildId, channelId, channelName, videoId]);
    }

    isYoutubeVideoAlreadySend(guildId, channelId, channelName, videoId) {
        console.log("<DATABASE> isYoutubeVideoAlreadySend call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM youtubeVideos WHERE guildId = ? AND channelId = ? AND channelName = ? AND videoId = ?", [guildId, channelId, channelName, videoId], (err, row) => {
                if (err) reject(err);
                if (row) resolve(true);
                else resolve(false);
            });
        });
    }

    /**
     * verify section
     */

    getVerify(guildId) {
        console.log("<DATABASE> getVerify call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM verify WHERE guildId = ?", [guildId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    createVerify(guildId, roleId) {
        console.log("<DATABASE> createVerify call");
        this.db.run("INSERT INTO verify VALUES (?, ?)", [guildId, roleId]);
    }

    deleteVerify(guildId) {
        console.log("<DATABASE> deleteVerify call");
        this.db.run("DELETE FROM verify WHERE guildId = ?", [guildId]);
    }

    getKickChannel(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM kickChannelConfig WHERE guildId = ?", [guildId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }

    getModerationLogChannel(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT channelId FROM moderationLogConfig WHERE guildId = ?", [guildId], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }

    saveModerationLogChannel(guildId, channelId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT OR REPLACE INTO moderationLogConfig (guildId, channelId) VALUES (?, ?)",
                [guildId, channelId],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }

    deleteModerationLogChannel(guildId) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM moderationLogConfig WHERE guildId = ?", [guildId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    addModerationLog(guildId, createdAt, eventType, userId, channelId, payload) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO moderationLogs (guildId, createdAt, eventType, userId, channelId, payloadJson) VALUES (?, ?, ?, ?, ?, ?)",
                [guildId, createdAt, eventType, userId || null, channelId || null, JSON.stringify(payload)],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
    }

    getModerationLogs(guildId, { limit, offset, eventType, filters = {} }) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT id, createdAt, eventType, userId, channelId, payloadJson FROM moderationLogs WHERE guildId = ?";
            if (eventType) {
                query += " AND eventType = ?";
                params.push(eventType);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                operation: "eventType || ' ' || payloadJson",
                user: "userId || ' ' || payloadJson",
                channel: "channelId || ' ' || payloadJson",
                details: "payloadJson"
            });
            query += " ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            this.db.all(query, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    countModerationLogs(guildId, eventType, filters = {}) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT COUNT(*) AS count FROM moderationLogs WHERE guildId = ?";
            if (eventType) {
                query += " AND eventType = ?";
                params.push(eventType);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                operation: "eventType || ' ' || payloadJson",
                user: "userId || ' ' || payloadJson",
                channel: "channelId || ' ' || payloadJson",
                details: "payloadJson"
            });
            this.db.get(query, params, (err, row) => {
                if (err) return reject(err);
                resolve(row.count);
            });
        });
    }

    addDashboardLog({ createdAt, guildId, userId, username, ipAddress, action, method, path, status, details }) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO dashboardLogs
                    (createdAt, guildId, userId, username, ipAddress, action, method, path, status, detailsJson)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    createdAt,
                    guildId || null,
                    userId || null,
                    username || null,
                    ipAddress || null,
                    action,
                    method,
                    path,
                    status === undefined ? null : status,
                    JSON.stringify(details || {})
                ],
                function (error) {
                    if (error) return reject(error);
                    resolve(this.lastID);
                }
            );
        });
    }

    getDashboardLogs(guildId, { limit, offset, search, filters = {} }) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT id, createdAt, guildId, userId, username, ipAddress, action, method, path, status, detailsJson FROM dashboardLogs WHERE (guildId = ? OR guildId IS NULL) AND method != 'CLIENT' AND path LIKE '/api/%'";
            if (search) {
                query += " AND (action LIKE ? OR username LIKE ? OR userId LIKE ? OR ipAddress LIKE ? OR path LIKE ? OR detailsJson LIKE ?)";
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                user: "username || ' ' || userId",
                ip: "ipAddress",
                action: "action",
                request: "method || ' ' || path",
                status: "status",
                details: "detailsJson"
            });
            query += " ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            this.db.all(query, params, (error, rows) => {
                if (error) return reject(error);
                resolve(rows);
            });
        });
    }

    countDashboardLogs(guildId, search, filters = {}) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT COUNT(*) AS count FROM dashboardLogs WHERE (guildId = ? OR guildId IS NULL) AND method != 'CLIENT' AND path LIKE '/api/%'";
            if (search) {
                query += " AND (action LIKE ? OR username LIKE ? OR userId LIKE ? OR ipAddress LIKE ? OR path LIKE ? OR detailsJson LIKE ?)";
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                user: "username || ' ' || userId",
                ip: "ipAddress",
                action: "action",
                request: "method || ' ' || path",
                status: "status",
                details: "detailsJson"
            });
            this.db.get(query, params, (error, row) => {
                if (error) return reject(error);
                resolve(row.count);
            });
        });
    }

    saveCapturedMessage(message) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO capturedMessages
                    (messageId, guildId, channelId, channelName, userId, authorName, content, attachmentsJson, embedsJson, createdAt, editedAt, isBot)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(messageId) DO UPDATE SET
                    channelId = excluded.channelId,
                    channelName = excluded.channelName,
                    userId = excluded.userId,
                    authorName = excluded.authorName,
                    content = excluded.content,
                    attachmentsJson = excluded.attachmentsJson,
                    embedsJson = excluded.embedsJson,
                    editedAt = COALESCE(excluded.editedAt, capturedMessages.editedAt)`,
                [
                    message.messageId,
                    message.guildId,
                    message.channelId,
                    message.channelName,
                    message.userId,
                    message.authorName,
                    message.content,
                    JSON.stringify(message.attachments),
                    JSON.stringify(message.embeds),
                    message.createdAt,
                    message.editedAt,
                    message.isBot ? 1 : 0
                ],
                (error) => {
                    if (error) return reject(error);
                    resolve();
                }
            );
        });
    }

    getCapturedMessages(guildId, { limit, offset, search, filters = {} }) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT messageId, channelId, channelName, userId, authorName, content, attachmentsJson, embedsJson, createdAt, editedAt, isBot FROM capturedMessages WHERE guildId = ?";
            if (search) {
                query += " AND (content LIKE ? OR authorName LIKE ? OR channelName LIKE ?)";
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                author: "authorName || ' ' || userId",
                channel: "channelName || ' ' || channelId",
                message: "content || ' ' || attachmentsJson || ' ' || embedsJson"
            });
            query += " ORDER BY createdAt DESC, messageId DESC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            this.db.all(query, params, (error, rows) => {
                if (error) return reject(error);
                resolve(rows);
            });
        });
    }

    countCapturedMessages(guildId, search, filters = {}) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT COUNT(*) AS count FROM capturedMessages WHERE guildId = ?";
            if (search) {
                query += " AND (content LIKE ? OR authorName LIKE ? OR channelName LIKE ?)";
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }
            query = addColumnFilters(query, params, filters, {
                date: "strftime('%Y-%m-%d %H:%M', createdAt / 1000, 'unixepoch')",
                author: "authorName || ' ' || userId",
                channel: "channelName || ' ' || channelId",
                message: "content || ' ' || attachmentsJson || ' ' || embedsJson"
            });
            this.db.get(query, params, (error, row) => {
                if (error) return reject(error);
                resolve(row.count);
            });
        });
    }

    deleteExpiredCapturedMessages(cutoff) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM capturedMessages WHERE createdAt < ?", [cutoff], function (error) {
                if (error) return reject(error);
                resolve(this.changes);
            });
        });
    }

    recordDiscordUserActivity(profile, activityType, occurredAt, voiceChannelId = null) {
        const isMessage = activityType === "message";
        const isInteraction = activityType === "interaction";
        const isVoice = activityType === "voice";
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO discordUsers
                    (guildId, userId, username, globalName, displayName, avatarUrl, accountCreatedAt, joinedAt, bot,
                     messagesSent, interactionsSent, voiceTimeMs, voiceStartedAt, voiceChannelId, lastActivityAt, profileJson)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                 ON CONFLICT(guildId, userId) DO UPDATE SET
                    username = excluded.username,
                    globalName = excluded.globalName,
                    displayName = excluded.displayName,
                    avatarUrl = COALESCE(excluded.avatarUrl, discordUsers.avatarUrl),
                    accountCreatedAt = COALESCE(excluded.accountCreatedAt, discordUsers.accountCreatedAt),
                    joinedAt = COALESCE(excluded.joinedAt, discordUsers.joinedAt),
                    bot = excluded.bot,
                    messagesSent = discordUsers.messagesSent + excluded.messagesSent,
                    interactionsSent = discordUsers.interactionsSent + excluded.interactionsSent,
                    voiceTimeMs = discordUsers.voiceTimeMs + CASE
                        WHEN ? = 1 AND discordUsers.voiceStartedAt IS NOT NULL
                            AND discordUsers.voiceChannelId IS NOT excluded.voiceChannelId
                        THEN MAX(0, excluded.lastActivityAt - discordUsers.voiceStartedAt)
                        ELSE 0
                    END,
                    voiceStartedAt = CASE
                        WHEN ? = 0 THEN discordUsers.voiceStartedAt
                        WHEN excluded.voiceChannelId IS NULL THEN NULL
                        WHEN discordUsers.voiceStartedAt IS NULL
                            OR discordUsers.voiceChannelId IS NOT excluded.voiceChannelId
                        THEN excluded.lastActivityAt
                        ELSE discordUsers.voiceStartedAt
                    END,
                    voiceChannelId = CASE
                        WHEN ? = 1 THEN excluded.voiceChannelId
                        ELSE discordUsers.voiceChannelId
                    END,
                    lastActivityAt = MAX(discordUsers.lastActivityAt, excluded.lastActivityAt),
                    profileJson = excluded.profileJson`,
                [
                    profile.guildId,
                    profile.userId,
                    profile.username,
                    profile.globalName,
                    profile.displayName,
                    profile.avatarUrl,
                    profile.accountCreatedAt,
                    profile.joinedAt,
                    profile.bot ? 1 : 0,
                    isMessage ? 1 : 0,
                    isInteraction ? 1 : 0,
                    isVoice && voiceChannelId ? occurredAt : null,
                    isVoice ? voiceChannelId : null,
                    occurredAt,
                    profile.profileJson,
                    isVoice ? 1 : 0,
                    isVoice ? 1 : 0,
                    isVoice ? 1 : 0
                ],
                (error) => {
                    if (error) return reject(error);
                    resolve();
                }
            );
        });
    }

    getDiscordUsers(guildId, { limit, offset, filters = {} }) {
        return new Promise((resolve, reject) => {
            const params = [Date.now(), guildId];
            let query = `SELECT userId, username, globalName, displayName, avatarUrl, accountCreatedAt, joinedAt,
                    messagesSent, interactionsSent,
                    voiceTimeMs + CASE WHEN voiceStartedAt IS NOT NULL
                        THEN MAX(0, ? - voiceStartedAt) ELSE 0 END AS voiceTimeMs,
                    voiceStartedAt, voiceChannelId, lastActivityAt, profileJson
                FROM discordUsers WHERE guildId = ? AND bot = 0`;
            query = addColumnFilters(query, params, filters, {
                avatar: "avatarUrl",
                username: "username || ' ' || COALESCE(globalName, '') || ' ' || COALESCE(displayName, '')",
                id: "userId",
                accountAge: "strftime('%Y-%m-%d', accountCreatedAt / 1000, 'unixepoch')",
                interactions: "CAST(messagesSent AS TEXT) || ' ' || CAST(interactionsSent AS TEXT) || ' ' || CAST(voiceTimeMs AS TEXT)",
                json: "profileJson"
            });
            query += " ORDER BY lastActivityAt DESC, userId ASC LIMIT ? OFFSET ?";
            params.push(limit, offset);
            this.db.all(query, params, (error, rows) => {
                if (error) return reject(error);
                resolve(rows);
            });
        });
    }

    countDiscordUsers(guildId, filters = {}) {
        return new Promise((resolve, reject) => {
            const params = [guildId];
            let query = "SELECT COUNT(*) AS count FROM discordUsers WHERE guildId = ? AND bot = 0";
            query = addColumnFilters(query, params, filters, {
                avatar: "avatarUrl",
                username: "username || ' ' || COALESCE(globalName, '') || ' ' || COALESCE(displayName, '')",
                id: "userId",
                accountAge: "strftime('%Y-%m-%d', accountCreatedAt / 1000, 'unixepoch')",
                interactions: "CAST(messagesSent AS TEXT) || ' ' || CAST(interactionsSent AS TEXT) || ' ' || CAST(voiceTimeMs AS TEXT)",
                json: "profileJson"
            });
            this.db.get(query, params, (error, row) => {
                if (error) return reject(error);
                resolve(row.count);
            });
        });
    }

    saveKickChannel(guildId, channelId, messageId, description) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT OR REPLACE INTO kickChannelConfig (guildId, channelId, messageId, description) VALUES (?, ?, ?, ?)",
                [guildId, channelId, messageId, description],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }

    deleteKickChannel(guildId) {
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM kickChannelConfig WHERE guildId = ?", [guildId], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    addKickChannelKick(guildId, userId, kickedAt) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO kickChannelKicks (guildId, userId, kickedAt) VALUES (?, ?, ?)",
                [guildId, userId, kickedAt],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }

    getKickChannelKickCount(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT COUNT(*) AS count FROM kickChannelKicks WHERE guildId = ?", [guildId], (err, row) => {
                if (err) return reject(err);
                resolve(row.count);
            });
        });
    }

    getKickChannelKicks(guildId, limit, offset) {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT userId, kickedAt FROM kickChannelKicks WHERE guildId = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                [guildId, limit, offset],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });
    }

    /**
     * other queryes
     */

    getNickname(guildId) {
        console.log("<DATABASE> getNickname call");
        return new Promise((resolve, reject) => {
            this.db.get("SELECT nickname FROM nicknames WHERE guildId = ?", [guildId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    getAllPictures(guildId) {
        console.log("<DATABASE> getAllPictures call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM pictures WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    updateNickname(guildId, nickname) {
        console.log("<DATABASE> updateNickname call");
        this.getNickname(guildId).then(res => {
            if (res) {
                this.db.run("UPDATE nicknames SET nickname = ? WHERE guildId = ?", [nickname, guildId]);
            } else {
                this.db.run("INSERT INTO nicknames VALUES (?, ?)", [guildId, nickname]);
            }
        });
    }

    savePicture(guildId, uuid, url) {
        console.log("<DATABASE> savePicture call");
        this.db.run("INSERT INTO pictures VALUES (?, ?, ?)", [guildId, uuid, url]);
    }

}

module.exports = SQL;