const { EmbedBuilder } = require("discord.js");

class TwitterAPI {
    constructor(config, client) {
        console.log(" > Initializing Twitter API");
        this.config = config;
        this.accessToken = null;
    }

    getEmbed(tweet) {
        // parse it if is a string
        if (typeof tweet === "string") tweet = JSON.parse(tweet);

        // convert all ascii codes to ascii characters
        tweet.full_text = tweet.full_text.replace(/\\u[\dA-F]{4}/gi, (match) => {
            return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
        });

        // fuck twitter api and fuck html entities...
        // convert &gt; to > and &lt; to < and &amp; to & and &quot; to " and &#39; to ' and &amp;#39; to ' and &amp;quot; to "
        tweet.full_text = tweet.full_text.replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            .replace(/&amp;#39;/g, "'")
            .replace(/&amp;quot;/g, "\"");

        const embed = {
            title: tweet.user.name + " posted a tweet!",
            url: `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
            color: 0x00acee,
            author: {
                name: tweet.user.name,
                url: `https://twitter.com/${tweet.user.screen_name}`,
                icon_url: tweet.user.profile_image_url_https.replace("_normal", "_bigger")
            },
            image: {
                url: tweet.entities.media ? tweet.entities.media[0].media_url_https : null
            },
            timestamp: new Date().toISOString(),
            description: tweet.full_text ? "**" + tweet.full_text.split("https://t.co/")[0] + "**" : null,
            footer: {
                text: "Made with ❤️ by zThundy__"
            },
            thumbnail: {
                url: "https://upload.wikimedia.org/wikipedia/it/archive/0/09/20160903181541%21Twitter_bird_logo.png"
            }
        };

        const embeds = [];
        if (tweet.extended_entities && (tweet.extended_entities.media && tweet.extended_entities.media.length > 1)) {
            for (let i = 1; i < tweet.extended_entities.media.length; i++) {
                const newEmbed = new EmbedBuilder()
                    .setURL(`https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`)
                    .setImage(tweet.extended_entities.media[i].media_url_https)

                embeds.push(newEmbed);
                if (i == 9) break;
            }
            embeds.unshift(embed);
            return embeds;
        }

        return [embed];
    }
}

module.exports = { TwitterAPI };