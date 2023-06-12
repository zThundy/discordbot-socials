const https = require("https");

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
            } catch(e) {
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

    // get latest clip
    getClip(name) {
        return new Promise((resolve, reject) => {
            this.getToken().then(token => {
                const options = {
                    hostname: "api.twitch.tv",
                    port: 443,
                    path: `/helix/clips?broadcaster_id=${name}`,
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

    getEmbed(stream) {
        // parse it if is a string
        if (typeof stream === "string") stream = JSON.parse(stream);

        const embed = {
            title: stream.user_name + " is now live on Twitch!",
            url: `https://twitch.tv/${stream.user_name}`,
            color: 0x6441a5,
            timestamp: new Date().toISOString(),
            thumbnail: {
                url: "https://cdn.discordapp.com/attachments/996069380423164024/1052532333313540096/twitch-logo-4931D91F85-seeklogo.com.png"
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
                url: stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")
            };
        }
        if (stream.viewer_count) {
            embed.footer = {
                text: "Made with ❤️ by zThundy__"
            };
        }

        return [embed];
    }
}
module.exports = { TwitchApi };