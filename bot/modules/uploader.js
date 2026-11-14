const fs = require("fs");
const path = require("path");
const { downloadFile } = require("./httpDownload");

class Uploader {
    constructor(cron, config) {
        this.homePath = config.uploader.folder;
        this.ip = config.uploader.httpIp;
        this.port = config.uploader.httpPort;
        const retentionDays = Number(config.uploader.deleteFilesAfterDays ?? 1);
        if (config.uploader.deleteFiles && (!Number.isFinite(retentionDays) || retentionDays <= 0)) {
            throw new Error("uploader.deleteFilesAfterDays must be a positive number");
        }

        this.express = require("express");
        this.app = this.express();

        this.app.listen(this.port, () => {
            console.log("<EXPRESS> Listening for web request on port " + this.port);
        });

        // check if home folder exists, if not create it
        if (!fs.existsSync(this.homePath)) {
            fs.mkdirSync(this.homePath, { recursive: true });
            console.log("<UPLOADER> Created home folder: " + this.homePath);
        }

        if (config.uploader.deleteFiles) {
            cron.add(60 * 60 * 1000, () => this._deleteExpiredFiles(retentionDays), true);
        }
    }

    addListeners() {
        // listen for get request for files in folder
        this.app.get("/", (req, res) => {
            // log ip address
            const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress).replace("::ffff:", "");
            console.log("<EXPRESS> Request from " + ip);
            // if no key is provided, return 500
            if (!req.query.key) return res.status(500).send().end();
            const key = String(req.query.key);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]{1,10})?$/i.test(key)) {
                return res.status(400).send().end();
            }
            const filePath = path.join(this.homePath, key);
            console.log("<UPLOADER> Trying downloading of file with key " + req.query.key + " Path: " + filePath);
            if (fs.existsSync(filePath)) {
                console.log('<UPLOADER> Found file! Sending to client');
                res.type(path.extname(filePath) || "application/octet-stream");
                res.sendFile(path.resolve(filePath), error => {
                    if (error) {
                        console.error(error);
                        if (!res.headersSent) res.status(error.statusCode || 500).end();
                    }
                });
            } else {
                console.error('<UPLOADER> No file exists, sending 404');
                res.status(404).send().end();
            }
        })

        return this;
    }

    async downloadAttachment(url, filename, contentType) {
        const uuid = this.uuidv4();
        const extension = this.getFileExtension(filename, url, contentType);
        const key = uuid + extension;
        await downloadFile(url, path.join(this.homePath, key));
        return "http://" + this.ip + ":" + this.port + "/?key=" + encodeURIComponent(key);
    }

    getFileExtension(filename, url, contentType) {
        const candidates = [filename, new URL(url).pathname];
        for (const candidate of candidates) {
            if (!candidate) continue;
            const extension = path.extname(candidate).toLowerCase();
            if (/^\.[a-z0-9]{1,10}$/.test(extension)) return extension;
        }

        const mimeExtensions = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/avif": ".avif",
            "image/svg+xml": ".svg",
            "video/mp4": ".mp4",
            "video/webm": ".webm",
            "video/quicktime": ".mov",
            "audio/mpeg": ".mp3",
            "audio/wav": ".wav",
            "audio/ogg": ".ogg",
            "audio/aac": ".aac",
            "audio/flac": ".flac",
            "audio/opus": ".opus",
            "application/pdf": ".pdf"
        };
        return mimeExtensions[(contentType || "").split(";")[0].toLowerCase()] || "";
    }

    async _deleteExpiredFiles(retentionDays) {
        let files;
        try {
            files = await fs.promises.readdir(this.homePath);
        } catch (error) {
            console.error("<UPLOADER> Failed to read attachment folder during cleanup", error);
            return;
        }

        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        await Promise.all(files.map(async file => {
            const filePath = path.join(this.homePath, file);
            let stats;
            try {
                stats = await fs.promises.stat(filePath);
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.error("<UPLOADER> Failed to inspect attachment during cleanup", filePath, error);
                }
                return;
            }

            if (!stats.isFile() || stats.mtimeMs > cutoff) return;
            try {
                await fs.promises.unlink(filePath);
                console.log("<UPLOADER> Expired attachment deleted:", file);
            } catch (error) {
                if (error.code !== "ENOENT") {
                    console.error("<UPLOADER> Failed to delete expired attachment", filePath, error);
                }
            }
        }));
    }

    uuidv4() {
        var dt = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (dt + Math.random()*16)%16 | 0;
            dt = Math.floor(dt/16);
            return (c=='x' ? r :(r&0x3|0x8)).toString(16);
        });
        return uuid;
    }
}

module.exports = { Uploader };