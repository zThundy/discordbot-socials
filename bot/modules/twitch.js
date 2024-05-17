const https = require("https");
const path = require("path");
const request = require("request");
const fs = require("fs");
const { AttachmentBuilder } = require("discord.js");

class TwitchApi {
    constructor(config, client) {
        console.log(" > Initializing Twitch API");
        this.config = config;
        this.token = null;
        this.tokenExpires = null;
        this.getToken();
    }

    resetToken() {
        this.token = null;
        this.tokenExpires = null;
    }

    // function to get the oauth token using https module
    getToken() {
        return new Promise((resolve, reject) => {
            try {
                if (this.token && this.tokenExpires > Date.now()) {
                    console.log(" > Using cached token for Twitch");
                    resolve(this.token);
                } else {
                    console.log(" > Getting new token for Twitch");
                    const data = JSON.stringify({
                        client_id: this.config.clientId,
                        client_secret: this.config.clientSecret,
                        grant_type: "client_credentials"
                    });
                    const options = {
                        hostname: "id.twitch.tv",
                        port: 443,
                        path: "/oauth2/token",
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Content-Length": data.length
                        }
                    };
                    const req = https.request(options, res => {
                        res.on("data", d => {
                            const parsed = JSON.parse(d);
                            this.token = parsed.access_token;
                            this.tokenExpires = Date.now() + (parsed.expires_in * 1000);
                            resolve(this.token);
                        });
                    });
                    req.on("error", error => {
                        console.error(error);
                        reject(error);
                    });
                    req.write(data);
                    req.end();
                }
            } catch (e) {
                this.resetToken();
                reject(e);
            }
        });
    }

    checkStream(name) {
        return new Promise((resolve, reject) => {
            this.getToken().then(token => {
                const options = {
                    hostname: "api.twitch.tv",
                    port: 443,
                    path: `/helix/streams?user_login=${name}`,
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Client-Id": this.config.clientId
                    }
                };
                const req = https.request(options, res => {
                    res.on("data", d => {
                        const parsed = JSON.parse(d);
                        if (parsed.data.length > 0) {
                            // console.log(parsed.data)
                            resolve(parsed.data[0]);
                        } else {
                            resolve(null);
                        }
                    });
                });
                req.on("error", error => {
                    console.error(error);
                    reject(error);
                });
                req.end();
            });
        });
    }

    getUserId(name) {
        return new Promise((resolve, reject) => {
            this.getToken().then(token => {
                const options = {
                    hostname: "api.twitch.tv",
                    port: 443,
                    path: `/helix/users?login=${name}`,
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Client-Id": this.config.clientId
                    }
                }
                const req = https.request(options, res => {
                    res.on("data", d => {
                        const parsed = JSON.parse(d);
                        if (parsed.data.length > 0) {
                            resolve(parsed.data[0]);
                        } else {
                            resolve(null);
                        }
                    });
                });
                req.on("error", error => {
                    console.error(error);
                    reject(error);
                });
                req.end();
            });
        });
    }

    // get latest clips
    getClips(userId) {
        return new Promise((resolve, reject) => {
            this.getToken().then(token => {
                const options = {
                    hostname: "api.twitch.tv",
                    port: 443,
                    path: `/helix/clips?broadcaster_id=${userId}`,
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + token,
                        "Client-Id": this.config.clientId
                    }
                };
                const req = https.request(options, res => {
                    var bits = "";
                    res.on("data", d => {
                        // const parsed = JSON.parse(d);
                        bits += d;
                    });

                    res.on("end", () => {
                        const parsed = JSON.parse(bits);
                        resolve(parsed.data);
                    });
                });
                req.on("error", error => {
                    console.error(error);
                    reject(error);
                });
                req.end();
            });
        });
    }

    _downloadPic(url, name) {
        return new Promise((resolve, reject) => {
            const picPath = path.resolve("./", "bot", "images", `${name}.png`);
            request.head(url, (err, res, body) => {
                if (err) return reject(err);
                request(url).pipe(fs.createWriteStream(picPath).on("close", () => resolve(picPath)).on("close", () => resolve(picPath)));
            });
        })
    }

    getEmbed(stream) {
        return new Promise((resolve, reject) => {
            // parse it if is a string
            if (typeof stream === "string") stream = JSON.parse(stream);

            const embed = {
                title: stream.user_name + " is now live on Twitch!",
                url: `https://twitch.tv/${stream.user_name}`,
                color: 0x6441a5,
                timestamp: new Date().toISOString(),
                thumbnail: {
                    url: `attachment://twitch.png`
                }
            };

            if (stream.title) {
                embed.fields = [
                    {
                        name: "Title",
                        value: stream.title || "No title",
                    },
                    {
                        name: "Game",
                        value: stream.game_name || "Unknown"
                    },
                    {
                        name: "Viewers",
                        value: String(stream.viewer_count || 0)
                    }
                ];
            }

            if (stream.user_name) {
                embed.author = {
                    name: stream.user_name,
                    url: `https://twitch.tv/${stream.user_name}`,
                    icon_url: stream.profile_image_url
                };
            }

            if (stream.thumbnail_url) {
                embed.image = {
                    url: `attachment://${stream.user_name}.png`
                };
            }

            if (stream.viewer_count) {
                embed.footer = {
                    text: "Made with ❤️ by zThundy__"
                };
            }

            const twitchLogoPath = path.resolve("./", "bot", "images", "twitch.png");
            const logo = new AttachmentBuilder(twitchLogoPath)
                .setName("twitch.png")

            const streamPic = stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720");
            this._downloadPic(streamPic, stream.user_name)
                .then((picPath) => {
                    console.log(" > Downloaded stream picture", picPath)
                    const pic = new AttachmentBuilder(picPath)
                        .setName(`${stream.user_name}.png`);

                    resolve({ embeds: [embed], files: [logo, pic] });
                })
                .catch((err) => {
                    console.error(err);
                    // resolve cached picture
                    const localPic = path.resolve("./", "bot", "images", `${stream.user_name}.png`)
                    const pic = new AttachmentBuilder(localPic)
                        .setName(`${stream.user_name}.png`);

                    resolve({ embeds: [embed], files: [logo, pic] });
                });
        });
    }
}
module.exports = { TwitchApi };