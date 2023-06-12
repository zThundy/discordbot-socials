const fs = require("fs");
const request = require("request");

class Uploader {
    constructor(cron, config) {
        this.homePath = config.uploader.folder;

        this.express = require("express");
        this.app = this.express();

        this.app.listen(config.uploader.httpPort, () => {
            console.log("<EXPRESS> Listening for web request on port " + config.uploader.httpPort);
        });

        // every 30 minutes, check creation date, if older than 20 days
        // delete the file
        cron.add(30 * 60 * 1000, (uid) => {
            fs.readdir(this.homePath, (err, files) => {
                files.forEach(file => {
                    fs.stat(this.homePath + "/" + file, (error, stats) => {
                        // in case of any error
                        if (error) return console.log(error);
                        
                        // we will keep the files only for 1 month
                        const date = new Date();
                        date.setMonth(date.getMonth() - 1);
                        const filedate = new Date(stats.atime);
                        // if the date is expired, delete the file
                        if (date > filedate) {
                            console.log("<UPLOADER> File deleted: ", file);
                            fs.unlinkSync(this.homePath + "/" + file);
                        }
                    });
                });
            });
        }, true);
    }

    addListeners() {
        // listen for get request for files in folder
        this.app.get("/", (req, res) => {
            if (!req.query.key) return res.status(500).send().end();
            var filePath = this.homePath + "/" + req.query.key;
            console.log("<UPLOADER> Trying downloading of file with key " + req.query.key + " Path: " + filePath);
            if (fs.existsSync(filePath)) {
                fs.readFile(filePath, (err, data) => {
                    if (err) return console.error(err);
                    console.log('<UPLOADER> Found file! Sending to client');
                    res.send(data).end();
                })
            } else {
                console.error('<UPLOADER> No file exists, sending 404');
                res.status(404).send().end();
            }
        })

        return this;
    }

    downloadAttachment(url) {
        const uuid = this.uuidv4();
        request.get(url)
            .on('error', console.error)
            .pipe(fs.createWriteStream(this.homePath + "/" + uuid));
        return "http://localhost:52320/?key=" + uuid;
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