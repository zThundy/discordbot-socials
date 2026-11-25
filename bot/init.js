const SQL = require("./modules/database.js");
const fs = require("fs");
const path = require("path");
const { TwitchApi } = require("./modules/twitch.js");
const { TwitterAPI } = require("./modules/twitter.js");
const { YoutubeAPI } = require("./modules/youtube.js");
const { Timeout } = require("./modules/timeout.js");
const {
    logInteraction,
    logMemberJoin,
    logMemberLeave,
    logMemberUpdate,
    logMessageDelete,
    logMessageUpdate,
    logVoiceStateUpdate
} = require("./modules/moderationLogs.js");

const DEFAULT_MESSAGE_RETENTION_DAYS = 730;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getMessageRetentionDays(config) {
    const configuredDays = config.messageArchive && config.messageArchive.retentionDays;
    if (configuredDays === undefined) return DEFAULT_MESSAGE_RETENTION_DAYS;
    const maxDays = Math.floor(Number.MAX_SAFE_INTEGER / DAY_IN_MS);
    if (!Number.isSafeInteger(configuredDays) || configuredDays < 1 || configuredDays > maxDays) {
        throw new RangeError(`messageArchive.retentionDays must be an integer between 1 and ${maxDays}.`);
    }
    return configuredDays;
}

class BOT {
    constructor(client, guild, uploader, cron) {
        this.config = require("../config.json");
        this.messageRetentionDays = getMessageRetentionDays(this.config);
        // init data folders
        this._initDataFolders();
        // require logger module
        require("./modules/logger.js");
        // init the bot for current guild
        this.client = client;
        this.guild = guild;
        console.log(`>>> Bot initialized for guild ${guild.name}`);
        this.database = new SQL();
        this.commands = new Map();
        this.timeout = new Timeout();
        this.cron = cron;
        this.uploader = uploader;
        if (this.config.twitch.enabled) this.twitch = new TwitchApi(this.config.twitch);
        if (this.config.twitter.enabled) this.twitter = new TwitterAPI(this.config.twitter, this.database);
        if (this.config.youtube.enabled) this.youtube = new YoutubeAPI(this.config.youtube);
        this.databaseReady = this.database.ready.then(() => {
            this._buildCommands();
            this._startMessageRetention();
            return true;
        }).catch(error => {
            console.error("Could not initialize the bot database:", error);
            return false;
        });
    }

    _startMessageRetention() {
        if (this.cron.messageArchiveRetentionJob) return;
        const database = this.database;
        const retentionDays = this.messageRetentionDays;
        this.cron.messageArchiveRetentionJob = this.cron.add(DAY_IN_MS, () => {
            const cutoff = Date.now() - retentionDays * DAY_IN_MS;
            database.deleteExpiredCapturedMessages(cutoff).catch(error => {
                console.error("Could not remove expired archived messages:", error);
            });
        }, true);
    }

    _archiveMessage(message) {
        if (!message || message.partial || !message.guildId || !message.author) return;
        const record = {
            messageId: message.id,
            guildId: message.guildId,
            channelId: message.channelId,
            channelName: message.channel && message.channel.name || null,
            userId: message.author.id,
            authorName: message.member && message.member.displayName ||
                message.author.globalName || message.author.username || message.author.tag || message.author.id,
            content: message.content || "",
            attachments: Array.from(message.attachments.values(), attachment => ({
                name: attachment.name,
                url: attachment.url,
                contentType: attachment.contentType,
                size: attachment.size
            })),
            embeds: message.embeds.map(embed => embed.toJSON()),
            createdAt: message.createdTimestamp,
            editedAt: message.editedTimestamp || null,
            isBot: message.author.bot
        };
        this.databaseReady.then(ready => {
            if (!ready) return;
            return this.database.saveCapturedMessage(record);
        }).catch(error => {
            console.error("Could not archive Discord message:", error);
        });
    }

    _recordDiscordUserActivity(source, activityType, channelId) {
        if (!source) return;
        const user = source.author || source.user || source.member && source.member.user ||
            (source.id && source.username ? source : null);
        if (!user || !user.id || user.bot) return;
        const member = source.member && source.member.user
            ? source.member
            : source.user && source.roles
                ? source
                : this.guild.members.cache.get(user.id);
        const occurredAt = Date.now();
        const accountCreatedAt = Number.isFinite(user.createdTimestamp)
            ? user.createdTimestamp
            : user.createdAt instanceof Date ? user.createdAt.getTime() : null;
        const roles = member && member.roles
            ? member.roles.cache
                ? Array.from(member.roles.cache.values(), role => ({
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    position: role.position
                }))
                : Array.isArray(member.roles) ? member.roles.map(roleId => ({ id: roleId })) : []
            : [];
        const displayName = member && (member.displayName || member.nickname) ||
            user.globalName || user.global_name || user.username || user.id;
        const avatarUrl = member && typeof member.displayAvatarURL === "function"
            ? member.displayAvatarURL({ size: 64 })
            : typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 64 }) : null;
        const dateValue = value => value instanceof Date
            ? value.toISOString()
            : typeof value === "string" ? value : null;
        const userSnapshot = typeof user.toJSON === "function" ? user.toJSON() : {};
        const memberSnapshot = member && typeof member.toJSON === "function" ? member.toJSON() : {};
        const profile = {
            guildId: this.guild.id,
            userId: user.id,
            username: user.username || user.tag || user.id,
            globalName: user.globalName || user.global_name || null,
            displayName,
            avatarUrl,
            accountCreatedAt,
            joinedAt: member ? dateValue(member.joinedAt) : null,
            bot: Boolean(user.bot),
            profileJson: JSON.stringify({
                user: {
                    ...userSnapshot,
                    id: user.id,
                    username: user.username || null,
                    globalName: user.globalName || user.global_name || null,
                    discriminator: user.discriminator || null,
                    tag: user.tag || null,
                    bot: Boolean(user.bot),
                    system: Boolean(user.system),
                    createdAt: accountCreatedAt === null ? null : new Date(accountCreatedAt).toISOString(),
                    avatar: user.avatar || null,
                    banner: user.banner || null,
                    accentColor: user.accentColor ?? null,
                    avatarUrl: typeof user.displayAvatarURL === "function"
                        ? user.displayAvatarURL({ size: 128 })
                        : null
                },
                member: member ? {
                    ...memberSnapshot,
                    id: member.id || user.id,
                    nickname: member.nickname || null,
                    displayName,
                    joinedAt: dateValue(member.joinedAt),
                    premiumSince: dateValue(member.premiumSince),
                    pending: member.pending ?? null,
                    roles,
                    permissions: member.permissions && typeof member.permissions.toArray === "function"
                        ? member.permissions.toArray()
                        : []
                } : null,
                guild: { id: this.guild.id, name: this.guild.name },
                lastActivity: {
                    type: activityType,
                    occurredAt: new Date(occurredAt).toISOString(),
                    channelId: channelId || null
                }
            })
        };
        this.databaseReady.then(ready => {
            if (!ready) return;
            return this.database.recordDiscordUserActivity(profile, activityType, occurredAt, channelId || null);
        }).catch(error => {
            console.error(`Could not update Discord user activity for ${user.id}:`, error);
        });
    }

    // main event handler for the current bot instance
    event(event, ...args) {
        if (event === "command" || event === "button" || event === "select" ||
            event === "modal" || event === "roleSelect" || event === "channelSelect" ||
            event === "context") {
            const interaction = args[0];
            this._recordDiscordUserActivity(interaction, "interaction", interaction.channelId);
        } else if (event === "message" || event === "messageUpdate") {
            const message = event === "messageUpdate"
                ? args[1].author ? args[1] : args[0]
                : args[0];
            this._recordDiscordUserActivity(message, event === "message" ? "message" : "update", message.channelId);
        } else if (event === "voiceStateUpdate") {
            const oldState = args[0];
            const newState = args[1];
            const member = newState.member || oldState.member ||
                this.guild.members.cache.get(newState.id || oldState.id);
            const user = member && member.user ||
                this.client.users.cache.get(newState.id || oldState.id);
            if (user) {
                this._recordDiscordUserActivity({
                    user,
                    member: member && member.user ? member : null
                }, "voice", newState.channelId || null);
            }
        }

        if (event === "command" || event === "button" || event === "select" ||
            event === "modal" || event === "roleSelect" || event === "channelSelect" ||
            event === "context") {
            logInteraction(args[0], this.database);
        } else if (event === "userJoin") {
            logMemberJoin(args[0], this.database);
        } else if (event === "userLeave") {
            logMemberLeave(args[0], this.database);
        } else if (event === "userUpdate") {
            logMemberUpdate(args[0], args[1], this.database);
        } else if (event === "messageDelete") {
            logMessageDelete(args[0], this.database);
        } else if (event === "messageUpdate") {
            logMessageUpdate(args[0], args[1], this.database);
        } else if (event === "voiceStateUpdate") {
            logVoiceStateUpdate(args[0], args[1], this.database);
        }

        if (event === "command") {
            // check if the command exists and execute it
            this.commands.forEach((command, string) => {
                if (args[0].commandName === string)
                    if (command.module.execute) command.module.execute(args[0], this.database, this.client, this.config);
            });
        } else if (event === "select" || event === "modal" || event === "button" || event === "roleSelect" || event === "channelSelect") {
            // check if the customId is in the this.commands map
            // if it is, execute the command
            this.commands.forEach((command, string) => {
                // some interactions might not follow the expected customId pattern; guard parsing
                try {
                    const customId = args[0].customId.split(";")[1];
                    if (command.id === customId)
                        if (command.module.interaction) command.module.interaction(args[0], this.database, this.client, this.config);
                } catch (e) {
                    // ignore interactions without customId or unexpected format
                }
            });
        } else if (event === "message" || event === "messageUpdate") {
            const message = event === "messageUpdate" ? args[1] : args[0];
            const newMessage = args[1];
            this._archiveMessage(message);
            const commandMessage = args[0];
            if (!commandMessage.author || commandMessage.author.bot) return;
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.message)
                    command.module.message(event, commandMessage, newMessage, { database: this.database, uploader: this.uploader, config: this.config });
            });
        } else if (event === "userUpdate") {
            const oldUser = args[0];
            const newUser = args[1];
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.userUpdate)
                    command.module.userUpdate(oldUser, newUser, { database: this.database, uploader: this.uploader, config: this.config, client: this.client });
            });
        } else if (event === "userJoin") {
            const member = args[0];
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.userJoin)
                    command.module.userJoin(member, { database: this.database, uploader: this.uploader, config: this.config, client: this.client });
            });
        } else if (event === "userLeave") {
            const member = args[0];
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.userLeave)
                    command.module.userLeave(member, { database: this.database, uploader: this.uploader, config: this.config, client: this.client });
            });
        }
    }

    _initDataFolders() {
        // create data folder if doesn't exist
        if (!fs.existsSync("./bot/data")) fs.mkdirSync("./bot/data");
        // create al data subfolders if they don't exist
        if (!fs.existsSync(this.config.uploader.folder)) fs.mkdirSync(this.config.uploader.folder);
        if (!fs.existsSync(this.config.tickets.folder)) fs.mkdirSync(this.config.tickets.folder);
        // hard coded cause i'm not bothered enough to make it configurable
        if (!fs.existsSync(path.resolve("./", "bot", "images"))) fs.mkdirSync(path.resolve("./", "bot", "images"));
        // bot generated images path
        if (!fs.existsSync(path.resolve("./", "bot", "data", "images"))) fs.mkdirSync(path.resolve("./", "bot", "data", "images"));
    }

    _buildCommands() {
        // read all the commands js files in the commands folder
        const commandFiles = fs.readdirSync("./bot/commands").filter(file => file.endsWith(".js"));
        // loop through the files
        for (const file of commandFiles) {
            if (file === "twitter.js" && !this.config.twitter.enabled) continue;
            if (file === "twitch.js" && !this.config.twitch.enabled) continue;
            if (file === "clips.js" && !this.config.twitch.enabled) continue;
            if (file === "youtube.js" && !this.config.youtube.enabled) continue;
            // require the command file
            console.log(`<!> Loading command file: ${file}`);
            const cmdFile = require(`./commands/${file}`);
            if (!cmdFile.build) {
                console.warn(`<!> Command file ${file} is missing the build() function. Skipping loading this command.`);
                continue;
            }
            const command = cmdFile.build(this.guild);
            // register the commands in the application
            this.client.application.commands.create(command);
            // add the command file as a module
            command.module = cmdFile;
            // add them to the commands map to check if they exist later
            this.commands.set(command.name, command);
            console.log(`<!> Command ${command.name} loaded`);
            if (command.module.init) command.module.init(this.database, {
                twitter: this.twitter || null,
                twitch: this.twitch || null,
                youtube: this.youtube || null,
                cron: this.cron,
                client: this.client,
                guild: this.guild
            });
        }
    }
}

module.exports = {
    BOT
}