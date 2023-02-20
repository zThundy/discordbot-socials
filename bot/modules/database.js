const sqlite = require('sqlite3');

class SQL {
    constructor() {
        this.db = null;
        this.init();
        console.log(">>> Database loaded");
    }

    init() {
        return new Promise(async (resolve, reject) => {
            try {
                this.db = new sqlite.Database(`./bot/data/main.db`);
                await this._run("CREATE TABLE IF NOT EXISTS twicth (guildId TEXT, channelId TEXT, channelName TEXT, discordChannel TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS twitter (guildId TEXT, channelId TEXT, accountName TEXT, discordChannel TEXT, lastTweetId TEXT, roleId TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS nicknames (guildId TEXT, nickname TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS rolesSelector (guildId TEXT, selectorId TEXT, embed TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS roles (guildId TEXT, selectorId TEXT, roleId TEXT, roleName TEXT)");
                await this._run("CREATE TABLE IF NOT EXISTS pictures (guildId TEXT, uuid TEXT, url TEXT)");
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

    addRoleToSelector(guildId, selectorId, roleId, roleName) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO roles (guildId, selectorId, roleId, roleName) VALUES (?, ?, ?, ?)", [guildId, selectorId, roleId, roleName], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    checkIfSelectorExists(guildId, selectorId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM rolesSelector WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                if (rows[0]) resolve(true);
                else resolve(false);
            });
        });
    }

    createSelecor(guildId, selectorId, embed) {
        return new Promise((resolve, reject) => {
            this.db.run("INSERT INTO rolesSelector (guildId, selectorId, embed) VALUES (?, ?, ?)", [guildId, selectorId, embed], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    getAllRoles(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM roles WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }
    
    // create a function that return roles and rolesSelector merged in one single array using selectorId as key
    getAllRolesAndSelectors(guildId) {
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
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM roles WHERE guildId = ? AND selectorId = ?", [guildId, selectorId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    deleteSelector(guildId, selectorId) {
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

    getAllTwitchChannels(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicth WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getTwitchChannels(guildId, channelId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twicth WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getAllTwitterAccounts(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twitter WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    getTwitterAccounts(guildId, channelId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM twitter WHERE guildId = ? AND channelId = ?", [guildId, channelId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }


    getNickname(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT nickname FROM nicknames WHERE guildId = ?", [guildId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    getAllPictures(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM pictures WHERE guildId = ?", [guildId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    createTwitchChannel(guildId, channelId, channelName, discordChannel) {
        this.db.run("INSERT INTO twicth VALUES (?, ?, ?, ?)", [guildId, channelId, channelName, discordChannel]);
    }

    deleteTwitchChannel(guildId, channelId, channelName) {
        this.db.run("DELETE FROM twicth WHERE guildId = ? AND channelId = ? AND channelName = ?", [guildId, channelId, channelName]);
    }

    createTwitterAccount(guildId, channelId, accountName, discordChannel, lastTweetId, roleId) {
        this.db.run("INSERT INTO twitter VALUES (?, ?, ?, ?, ?, ?)", [guildId, channelId, accountName, discordChannel, lastTweetId, roleId]);
    }

    deleteTwitterAccount(guildId, channelId, accountName) {
        this.db.run("DELETE FROM twitter WHERE guildId = ? AND channelId = ? AND accountName = ?", [guildId, channelId, accountName]);
    }

    updateTweetLastId(guildId, accountName, lastTweetId) {
        this.db.run("UPDATE twitter SET lastTweetId = ? WHERE guildId = ? AND accountName = ?", [lastTweetId, guildId, accountName]);
    }

    updateTweetRoleId(guildId, accountName, roleId) {
        this.db.run("UPDATE twitter SET roleId = ? WHERE guildId = ? AND accountName = ?", [roleId, guildId, accountName]);
    }

    updateNickname(guildId, nickname) {
        this.getNickname(guildId).then(res => {
            if (res) {
                this.db.run("UPDATE nicknames SET nickname = ? WHERE guildId = ?", [nickname, guildId]);
            } else {
                this.db.run("INSERT INTO nicknames VALUES (?, ?)", [guildId, nickname]);
            }
        });
    }

    savePicture(guildId, uuid, url) {
        this.db.run("INSERT INTO pictures VALUES (?, ?, ?)", [guildId, uuid, url]);
    }

}

module.exports = SQL;