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
                await this._run("CREATE TABLE IF NOT EXISTS twicth (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, twitchId TEXT, enableClips INTEGER)");
                await this._run("CREATE TABLE IF NOT EXISTS twicthClips (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT, clipId TEXT)");
                // twitter tables
                await this._run("CREATE TABLE IF NOT EXISTS twitter (guildId TEXT, channelId TEXT, accountName TEXT, discordChannel TEXT, roleId TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS twitterTweets (guildId TEXT, channelId TEXT, accountName TEXT, tweetId TEXT)");
                // roles selector tables
                await this._run("CREATE TABLE IF NOT EXISTS rolesSelector (guildId TEXT, selectorId TEXT, embed TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS roles (guildId TEXT, selectorId TEXT, roleId TEXT, roleName TEXT)");
                // uploader tables
                await this._run("CREATE TABLE IF NOT EXISTS pictures (guildId TEXT, uuid TEXT, url TEXT)");
                // ticketing system tables
                await this._run("CREATE TABLE IF NOT EXISTS tickets (id INTEGER, guildId TEXT, channelId TEXT, ticketOwner TEXT, ticketId TEXT, ticketTitle TEXT, ticketDescription TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS ticketConfig (guildId TEXT, tagRole TEXT, title TEXT, description TEXT, transcriptChannel TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS ticketMessages (ticketId TEXT, content TEXT, username TEXT, authorProfile TEXT, currentTime TEXT, color TEXT, orderDate TEXT, messageType TEXT, edited TEXT)");
                // other tables
                await this._run("CREATE TABLE IF NOT EXISTS nicknames (guildId TEXT, nickname TEXT)");
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

    createTwitchChannel(guildId, channelId, channelName, discordChannel) {
        console.log("<DATABASE> createTwitchChannel call");
        this.db.run("INSERT INTO twicth VALUES (?, ?, ?, ?, ?, ?)", [guildId, channelId, channelName, discordChannel, 0, 0]);
    }

    updateTwitchId(guildId, channelName, twitchId) {
        console.log("<DATABASE> updateTwitchId call");
        this.db.run("UPDATE twicth SET twitchId = ? WHERE guildId = ? AND channelName = ?", [twitchId, guildId, channelName]);
    }

    deleteTwitchChannel(guildId, channelId, channelName) {
        console.log("<DATABASE> deleteTwitchChannel call");
        this.db.run("DELETE FROM twicth WHERE guildId = ? AND channelId = ? AND channelName = ?", [guildId, channelId, channelName]);
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

    createTicketConfig(guildId, tagRole, title, description, transcriptChannel) {
        console.log("<DATABASE> createTicketConfig call");
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO ticketConfig (guildId, tagRole, title, description, transcriptChannel) VALUES (?, ?, ?, ?, ?)", [guildId, tagRole, title, description, transcriptChannel], (err, row) => {
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

    updateTweetRoleId(guildId, accountName, roleId) {
        console.log("<DATABASE> updateTweetRoleId call");
        this.db.run("UPDATE twitter SET roleId = ? WHERE guildId = ? AND accountName = ?", [roleId, guildId, accountName]);
    }

    /**
     * twitter section
     */

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
        this.db.run("INSERT INTO twitter VALUES (?, ?, ?, ?, ?)", [guildId, channelId, accountName, discordChannel, roleId]);
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