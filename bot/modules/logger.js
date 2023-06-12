const path = require("path");
const fs = require("fs");

class Logger {
    constructor() {
        this.fileStream = null;
        this.logStream = null;
        this.logFile = path.join("./bot/data/logs", "log.txt");

        this.log = this.log.bind(this);
        console.log = this.log;
        this.checkFolder();
        this.checkFile();
        this.createStream();

        console.log("------------------------- LOG STARTED -------------------------");
    }

    createStream() {
        this.logStream = fs.createWriteStream(this.logFile, { flags: "a" });
    }

    checkFolder() {
        // check if folder exists
        if (!fs.existsSync(path.join("./bot/data/logs"))) {
            // create folder
            fs.mkdirSync(path.join("./bot/data/logs"));
        }
    }

    checkFile() {
        // check if file exists
        if (!fs.existsSync(this.logFile)) {
            // create file
            fs.writeFileSync(this.logFile, "");
        }
    }

    rotate() {
        this.checkFile();
        // rename file
        const date = new Date();
        // create new log file and rename adding date as DD/MM/YYYY HH:MM:SS
        const newFile = path.join("./bot/data/logs", `log_${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.txt`);
        // print file rotation
        console.log(`Renaming log file to ${newFile}`);
        // end the stream of the current log file
        logStream.end();
        // rename the current log file to the new path
        fs.renameSync(this.logFile, newFile);
    }
    
    async log(...args) {
        // check if args have array or object, if so, stringify it
        args = args.map(arg => {
            if (typeof arg === "object") {
                return JSON.stringify(arg);
            } else {
                return arg;
            }
        });
        // add date to log as DD/MM/YYYY HH:MM:SS
        const date = new Date();
        args.unshift(`[${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}]`);
        // create message
        const message = Array.from(args).join(" ") + "\r\n"
        // write to stdout
        process.stdout.write(message);
        // write to log file
        this.logStream.write(message);
        // check if file size is bigger than 50MB
        if (this.logStream.bytesWritten > 50000000) {
            // rotate log file
            this.rotate();
        }
    }
}

module.exports = { Logger };