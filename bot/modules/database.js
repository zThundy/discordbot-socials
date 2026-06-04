const sqlite = require('sqlite3');

class SQL {
    constructor() {
        this.db = null;
        this.init();
        console.log("<DATABASE> Database loaded");
    }

    init() {
        return new Promise(async (resolve, reject) => {
            try {
                this.db = new sqlite.Database(`./bot/data/main.db`);
                // twitch tables
                await this._run("CREATE TABLE IF NOT EXISTS twicth (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, twitchId TEXT, clipsChannelId TEXT, enableClips INTEGER)");
                await this._ensureColumns("twicth", [
                    { name: "guildId", type: "TEXT" },
                    { name: "channelId", type: "TEXT" },
                    { name: "channelName", type: "TEXT" },
                    { name: "discordChannel", type: "TEXT" },
                    { name: "twitchId", type: "TEXT" },
                    { name: "clipsChannelId", type: "TEXT" },
                    { name: "enableClips", type: "INTEGER" }
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
                    { name: "ticketDescription", type: "TEXT" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS ticketConfig (guildId TEXT, tagRole TEXT, title TEXT, description TEXT, transcriptChannel TEXT, questionTitleRequired INTEGER, questionTitleMinLength INTEGER, questionDescriptionRequired INTEGER, questionDescriptionMinLength INTEGER)");
                await this._ensureColumns("ticketConfig", [
                    { name: "guildId", type: "TEXT" },
                    { name: "tagRole", type: "TEXT" },
                    { name: "title", type: "TEXT" },
                    { name: "description", type: "TEXT" },
                    { name: "transcriptChannel", type: "TEXT" },
                    { name: "questionTitleRequired", type: "INTEGER" },
                    { name: "questionTitleMinLength", type: "INTEGER" },
                    { name: "questionDescriptionRequired", type: "INTEGER" },
                    { name: "questionDescriptionMinLength", type: "INTEGER" }
                ]);
                await this._run("CREATE TABLE IF NOT EXISTS ticketMessages (ticketId TEXT, content TEXT, username TEXT, authorProfile TEXT, currentTime TEXT, color TEXT, orderDate TEXT, messageType TEXT, edited TEXT)");
                await this._ensureColumns("ticketMessages", [
                    { name: "ticketId", type: "TEXT" },
                    { name: "content", type: "TEXT" },
                    { name: "username", type: "TEXT" },
                    { name: "authorProfile", type: "TEXT" },
                    { name: "currentTime", type: "TEXT" },
                    { name: "color", type: "TEXT" },
                    { name: "orderDate", type: "TEXT" },
                    { name: "messageType", type: "TEXT" },
                    { name: "edited", type: "TEXT" }
                ]);
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
                resolve();
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }

    _run(stmt) {
        return new Promise((resolve, reject) => {
            this.db.run(stmt, {}, () => { resolve() });
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

    /**
     * Sync role section
     */

    getSyncRoles(guildId) {
        console.log("<DATABASE> getSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM syncrole WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
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
                if (err) reject(err);
                resolve();
            });
        });
    }

    deleteSyncRole(guildId, roleId) {
        console.log("<DATABASE> deleteSyncRole call");
        return new Promise((resolve, reject) => {
            this.db.run("DELETE FROM syncrole WHERE guildId = ? AND roleId = ?", [guildId, roleId], (err) => {
                if (err) reject(err);
                resolve();
            });
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

    createTwitchChannel(guildId, channelId, channelName, discordChannel) {
        console.log("<DATABASE> createTwitchChannel call");
        this.db.run("INSERT INTO twicth VALUES (?, ?, ?, ?, ?, ?, ?)", [guildId, channelId, channelName, discordChannel, 0, 0, 0]);
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

    updateTicketMessage(ticketId, content, newContent) {
        console.log("<DATABASE> updateTicketMessage call");
        return new Promise((resolve, reject) => {
            this.db.run("UPDATE ticketMessages SET content = ?, edited = 'true' WHERE content = ? AND ticketId = ?", [newContent, content, ticketId], (err, row) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    addTicketMessage(ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited) {
        console.log("<DATABASE> addTicketMessage call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO ticketMessages (ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [ticketId, content, username, authorProfile, currentTime, color, orderDate, messageType, edited], (err, row) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    deleteTicketMessages(ticketId) {
        console.log("<DATABASE> deleteTicketMessages call");
        this.db.run("DELETE FROM ticketMessages WHERE ticketId = $id", { $id: ticketId })
    }

    getLastTicketsId(guildId) {
        console.log("<DATABASE> getLastTicketsId call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT id FROM tickets WHERE guildId = ? ORDER BY id DESC", [guildId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(rows[0]["id"]);
                else resolve(0);
            })
        })
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

    deleteTicket(ticketId) {
        console.log("<DATABASE> deleteTicket call");
        this.db.run("DELETE FROM tickets WHERE ticketId = $id", { $id: ticketId })
    }

    createTicket(id, guildId, channelId, ownerId, ticketId, title, description) {
        console.log("<DATABASE> createTicket call");
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO tickets (id, guildId, channelId, ticketOwner, ticketId, ticketTitle, ticketDescription)
                         VALUES ($id, $guildId, $channelId, $ticketOwner, $ticketId, $ticketTitle, $ticketDescription)`,
                {
                    $id: id,
                    $guildId: guildId,
                    $channelId: channelId,
                    $ticketOwner: ownerId,
                    $ticketId: ticketId,
                    $ticketTitle: title,
                    $ticketDescription: description
                }, (err, row) => {
                    if (err) reject(err);
                    resolve();
                });
        });
    }

    createTicketConfig(guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId = '0', questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix = 'ticket-') {
        console.log("<DATABASE> createTicketConfig call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO ticketConfig (guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId, questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [guildId, tagRole, title, description, transcriptChannel, ticketsCategoryId, questionTitleRequired, questionTitleMinLength, questionDescriptionRequired, questionDescriptionMinLength, ticketsPrefix], (err, row) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    getTicketConfig(guildId) {
        console.log("<DATABASE> getTicketConfig call");
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM ticketConfig WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(rows[0]);
                else resolve(null);
            })
        })
    }

    deleteTicketConfig(guildId) {
        console.log("<DATABASE> deleteTicketConfig call");
        this.db.run("DELETE FROM ticketConfig WHERE guildId = $id", { $id: guildId });
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