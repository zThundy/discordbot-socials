const https = require("https");
const { URL } = require("url");

class TwitterAPI {
    constructor(config, database) {
        console.log(" > Initializing Twitter API");
        this.config = config || {};
        // Bearer token expected in config.twitter.bearerToken or config.bearerToken
        this.bearer = this.config.bearerToken || this.config.bearer_token || this.config.bearer || null;
        this.userCache = {}; // in-memory cache: username -> user object from /2/users
        this.db = database || null; // optional database instance for persistent cache
        // cache TTL: 7 days
        this.CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    }

    // Internal helper to perform GET requests to api.twitter.com (v2)
    _get(path) {
        return new Promise((resolve, reject) => {
            if (!this.bearer) return reject(new Error("Twitter bearer token not configured (config.twitter.bearerToken)"));
            const url = new URL(`https://api.twitter.com${path}`);
            const options = {
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.bearer}`,
                    'User-Agent': 'discordbot-socials/1.0'
                }
            };
            const req = https.request(options, (res) => {
                let bits = '';
                res.on('data', (d) => bits += d);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(bits || '{}');
                        if (res.statusCode >= 400) return reject(new Error(`Twitter API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
                        resolve(parsed);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => reject(err));
            req.end();
        });
    }

    // Get user object by username (cached)
    async getUserByUsername(username) {
        if (!username) return null;
        // remove leading @ if present
        username = username.replace(/^@/, "");
        // check in-memory cache first
        if (this.userCache[username]) return this.userCache[username];

        // check persistent DB cache if available
        try {
            if (this.db && typeof this.db.getTwitterUser === 'function') {
                const cached = await this.db.getTwitterUser(username);
                if (cached && cached.data) {
                    const age = Date.now() - Number(cached.cachedAt || 0);
                    if (age < this.CACHE_TTL) {
                        this.userCache[username] = cached.data;
                        // console.log(" > Using cached twitter user for", username);
                        return cached.data;
                    }
                }
            }

            // fetch fresh from API
            const res = await this._get(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url,username,name`);
            if (res && res.data) {
                this.userCache[username] = res.data;
                // save to DB cache if available
                try {
                    if (this.db && typeof this.db.saveTwitterUser === 'function') {
                        this.db.saveTwitterUser(username, res.data);
                    }
                } catch (e) {
                    console.error('Twitter: failed to save user to DB cache', e && e.message ? e.message : e);
                }
                return res.data;
            }
            return null;
        } catch (e) {
            console.error("Twitter getUserByUsername error:", e.message || e);
            return null;
        }
    }

    // Get recent tweets for a username (normalized to legacy-like shape used by getEmbed)
    async getLastTweet(username) {
        try {
            console.log(`> Fetching tweets for user: ${username}`);
            const user = await this.getUserByUsername(username);
            console.log("> Fetched user:", user);
            if (!user || !user.id) return [];
            // request tweets from user id
            // exclude replies and retweets to match typical feed
            const params = new URLSearchParams({
                'max_results': '5',
                // exclude replies and retweets so we only get original tweets
                'exclude': 'replies,retweets',
                'tweet.fields': 'created_at,entities,attachments,author_id',
                'expansions': 'attachments.media_keys,author_id',
                'media.fields': 'url,preview_image_url,type'
            });
            const path = `/2/users/${user.id}/tweets?${params.toString()}`;
            console.log("> Fetching tweets from API:", path);
            const res = await this._get(path);
            if (!res || !res.data || res.data.length === 0) {
                console.warn("> No tweets found");
                return [];
            }

            console.log("> Fetched tweets:", res.data);
            // Map includes for easy lookup
            const includes = res.includes || {};
            const mediaByKey = {};
            if (includes.media) includes.media.forEach(m => mediaByKey[m.media_key] = m);
            const usersById = {};
            if (includes.users) includes.users.forEach(u => usersById[u.id] = u);

            // Normalize tweets into the old shape expected by getEmbed
            const normalized = res.data.map(t => {
                const media = [];
                if (t.attachments && t.attachments.media_keys) {
                    t.attachments.media_keys.forEach(k => {
                        const m = mediaByKey[k];
                        if (m) {
                            // pick largest available url field
                            const url = m.url || m.preview_image_url || null;
                            media.push({ media_url_https: url });
                        }
                    });
                }

                const author = usersById[t.author_id] || user;

                return {
                    id: t.id,
                    id_str: String(t.id),
                    full_text: t.text || '',
                    created_at: t.created_at,
                    user: {
                        name: author.name || user.name,
                        screen_name: author.username || username,
                        profile_image_url_https: (author.profile_image_url || user.profile_image_url || '').replace('_normal', '_bigger')
                    },
                    entities: {
                        media: media.length > 0 ? media : null
                    },
                    extended_entities: media.length > 0 ? { media } : null
                };
            });

            return normalized;
        } catch (e) {
            console.error("Twitter getLastTweet error:", e.message || e);
            return [];
        }
    }

    // Build embed(s) from a normalized tweet object (compatible with previous format)
    getEmbed(tweet) {
        // parse it if is a string
        if (typeof tweet === 'string') tweet = JSON.parse(tweet);
        // convert unicode escapes if any
        if (tweet.full_text) tweet.full_text = tweet.full_text.replace(/\\u[\dA-F]{4}/gi, (match) => {
            return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
        });

        // simple HTML entities unescape
        tweet.full_text = (tweet.full_text || '').replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;#39;/g, "'")
            .replace(/&amp;quot;/g, '"');

        const url = `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str || tweet.id}`;
        const embed = {
            title: `${tweet.user.name} posted a tweet!`,
            url,
            color: 0x00acee,
            author: {
                name: tweet.user.name,
                url: `https://twitter.com/${tweet.user.screen_name}`,
                icon_url: (tweet.user.profile_image_url_https || '').replace('_normal', '_bigger')
            },
            image: {
                url: tweet.entities && tweet.entities.media ? tweet.entities.media[0].media_url_https : null
            },
            timestamp: new Date().toISOString(),
            description: tweet.full_text ? `**${(tweet.full_text.split(/https:\/\/t.co\//)[0] || tweet.full_text).trim()}**` : null,
            footer: { text: 'Made with ❤️ by zThundy__' },
            thumbnail: { url: 'https://upload.wikimedia.org/wikipedia/it/archive/0/09/20160903181541%21Twitter_bird_logo.png' }
        };

        const embeds = [];
        if (tweet.extended_entities && tweet.extended_entities.media && tweet.extended_entities.media.length > 1) {
            // first put main embed
            embeds.push(embed);
            for (let i = 1; i < tweet.extended_entities.media.length && i < 10; i++) {
                embeds.push({ url, image: { url: tweet.extended_entities.media[i].media_url_https } });
            }
            return embeds;
        }

        return [embed];
    }
}

module.exports = { TwitterAPI };