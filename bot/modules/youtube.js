const https = require('https');
const { URL } = require('url');

class YoutubeAPI {
    constructor(config) {
        console.log(' > Initializing Youtube API');
        this.config = config || {};
    }

    // Get latest video info for a channel name or id.
    // Supports channel id (starts with UC...) using channel_id param or username via user param.
    async getLatestVideo(name) {
        return new Promise((resolve, reject) => {
            try {
                if (!name) return resolve(null);
                const isChannelId = /^UC[0-9A-Za-z_-]{22,}$/.test(name);
                const base = 'https://www.youtube.com/feeds/videos.xml';
                const feedUrl = isChannelId ? `${base}?channel_id=${encodeURIComponent(name)}` : `${base}?user=${encodeURIComponent(name)}`;
                const url = new URL(feedUrl);
                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: { 'User-Agent': 'discordbot-socials/1.0' }
                };

                const req = https.request(options, res => {
                    let bits = '';
                    res.on('data', d => bits += d);
                    res.on('end', () => {
                        try {
                            const xml = bits.toString();
                            // find first <entry> ... </entry>
                            const entryMatch = xml.match(/<entry[\s\S]*?<\/entry>/i);
                            if (!entryMatch) return resolve(null);
                            const entry = entryMatch[0];
                            // extract videoId
                            const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
                            const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
                            const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/i);
                            const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i);
                            const thumbMatch = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
                            const authorMatch = xml.match(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/i);

                            const videoId = idMatch ? idMatch[1] : null;
                            const title = titleMatch ? titleMatch[1] : null;
                            const link = linkMatch ? linkMatch[1] : (videoId ? `https://youtu.be/${videoId}` : null);
                            const published = publishedMatch ? publishedMatch[1] : null;
                            const thumbnail = thumbMatch ? thumbMatch[1] : null;
                            const author = authorMatch ? authorMatch[1] : null;

                            if (!videoId) return resolve(null);
                            resolve({ id: videoId, title, link, published, thumbnail, author });
                        } catch (e) {
                            return resolve(null);
                        }
                    });
                });
                req.on('error', err => resolve(null));
                req.end();
            } catch (e) {
                return resolve(null);
            }
        });
    }

    // Build a simple embed from video info
    getEmbed(video) {
        if (!video) return null;
        const embed = {
            title: video.title || 'New YouTube video',
            url: video.link || (video.id ? `https://youtu.be/${video.id}` : null),
            color: 0xff0000,
            timestamp: video.published || new Date().toISOString(),
            description: video.title || null,
            footer: { text: 'Made with ❤️ by zThundy__' },
            thumbnail: { url: video.thumbnail || null }
        };
        return [embed];
    }
}

module.exports = { YoutubeAPI };