const https = require('https');
const { URL } = require('url');

class YoutubeAPI {
    constructor(config) {
        console.log(' > Initializing Youtube API');
        this.config = config || {};
    }

    // Resolve a YouTube handle or channel URL to the canonical channel id (UC...)
    async resolveHandleToChannelId(handle) {
        return new Promise((resolve) => {
            if (!handle) return resolve(null);
            let path = handle.trim();
            try {
                if (path.startsWith('http')) {
                    const u = new URL(path);
                    path = u.pathname.replace(/\/+$/, '');
                }
            } catch (e) { }
            if (!path.startsWith('@') && !path.startsWith('/@')) {
                if (/^[A-Za-z0-9_]{1,50}$/.test(path)) path = '@' + path;
            }
            if (path.startsWith('/')) path = path.substring(1);
            let current = `https://www.youtube.com/${path}`;
            const maxRedirects = 5;
            let redirects = 0;

            const fetchHtml = (urlToFetch) => new Promise((res) => {
                try {
                    const u = new URL(urlToFetch);
                    const options = {
                        hostname: u.hostname,
                        port: 443,
                        path: u.pathname + u.search,
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
                            'Accept': 'text/html'
                        },
                        timeout: 10000
                    };
                    const req = https.request(options, resp => {
                        // follow redirects
                        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location && redirects < maxRedirects) {
                            redirects++;
                            const next = new URL(resp.headers.location, urlToFetch).toString();
                            resp.resume();
                            return res(fetchHtml(next));
                        }
                        let bits = '';
                        resp.on('data', d => bits += d);
                        resp.on('end', () => res(bits.toString()));
                    });
                    req.on('error', () => res(null));
                    req.on('timeout', () => { req.destroy(); res(null); });
                    req.end();
                } catch (e) {
                    return res(null);
                }
            });

            fetchHtml(current).then((body) => {
                if (!body) return resolve(null);
                // try several patterns where the channel id can appear
                const patterns = [ /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/, /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/, /(UC[A-Za-z0-9_-]{22})/ ];
                for (const p of patterns) {
                    const m = body.match(p);
                    if (m && m[1]) return resolve(m[1]);
                    if (m && m[0] && p === patterns[2]) return resolve(m[0]);
                }
                return resolve(null);
            }).catch(() => resolve(null));
        });
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
                            // fetch views/likes from the video's page (best-effort)
                            this._fetchVideoStats(videoId).then(stats => {
                                resolve({ id: videoId, title, link, published, thumbnail, author, views: stats.views, likes: stats.likes });
                            }).catch(() => resolve({ id: videoId, title, link, published, thumbnail, author, views: null, likes: null }));
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

    // Best-effort scraping of the video page to extract views and likes.
    _fetchVideoStats(videoId) {
        return new Promise((resolve) => {
            if (!videoId) return resolve({ views: null, likes: null });
            const target = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
            try {
                const u = new URL(target);
                const options = {
                    hostname: u.hostname,
                    port: 443,
                    path: u.pathname + u.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36',
                        'Accept': 'text/html'
                    },
                    timeout: 10000
                };
                const req = https.request(options, res => {
                    let bits = '';
                    res.on('data', d => bits += d);
                    res.on('end', () => {
                        try {
                            const body = bits.toString();
                            let views = null;
                            let likes = null;
                            // try several patterns for views
                            const viewPatterns = [
                                /"viewCount"\s*:\s*"(\d+)"/,
                                /"viewCount"\s*:\s*\{\s*"simpleText"\s*:\s*"([\d\.,\s]+) views"/i,
                                /([0-9][0-9\.,\s]+) views/i
                            ];
                            for (const p of viewPatterns) {
                                const m = body.match(p);
                                if (m && m[1]) { views = m[1].trim(); break; }
                            }
                            // try several patterns for likes
                            const likePatterns = [
                                /"likeButtonRenderer"[\s\S]{0,300}?"accessibility"[\s\S]*?"label"\s*:\s*"([0-9][0-9\.,\sKMkmb]+)"/i,
                                /"likeButtonRenderer"[\s\S]{0,300}?"label"\s*:\s*"([0-9][0-9\.,\sKMkmb]+)"/i,
                                /aria-label="([0-9][0-9\.,\sKMkmb]+) likes"/i
                            ];
                            for (const p of likePatterns) {
                                const m = body.match(p);
                                if (m && m[1]) { likes = m[1].trim(); break; }
                            }
                            if (!likes) {
                                const fallback = body.match(/"label"\s*:\s*"([0-9][0-9\.,\sKMkmb]+)"[\s\S]{0,100}?"tooltip"\s*:\s*"like"/i);
                                if (fallback && fallback[1]) likes = fallback[1].trim();
                            }
                            resolve({ views: views || null, likes: likes || null });
                        } catch (e) {
                            resolve({ views: null, likes: null });
                        }
                    });
                });
                req.on('error', () => resolve({ views: null, likes: null }));
                req.on('timeout', () => { req.destroy(); resolve({ views: null, likes: null }); });
                req.end();
            } catch (e) {
                resolve({ views: null, likes: null });
            }
        });
    }

    // Build a simple embed from video info
    getEmbed(video) {
        if (!video) return null;
        const fields = [];
        if (video.published) fields.push({ name: 'Published', value: String(video.published), inline: true });
        const views = video.views || 'N/A';
        const likes = video.likes || 'N/A';
        fields.push({ name: 'Views & Likes', value: `${views} • ${likes}`, inline: true });

        const embed = {
            title: video.title || 'New YouTube video',
            url: video.link || (video.id ? `https://youtu.be/${video.id}` : null),
            color: 0xff0000,
            description: video.title || null,
            fields,
            footer: { text: 'Made with ❤️ by zThundy__' },
            thumbnail: { url: video.thumbnail || null }
        };
        return [embed];
    }
}

module.exports = { YoutubeAPI };