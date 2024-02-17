const { EmbedBuilder } = require("discord.js");
const https = require("https");

class YoutubeAPI {
    constructor(config, client) {
        console.log(" > Initializing Youtube API");
        this.config = config;
        this.token = null;
        this.tokenExpires = null;
        this.getToken();
    }

    getToken() {
        return new Promise((resolve, reject) => {
            
        });
    }
}