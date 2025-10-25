const path = require("path");
const fs = require("fs");
const util = require('util');

class Logger {
    constructor() {
        this.fileStream = null;
        this.logStream = null;
        this.logFile = path.join("./", "bot", "data", "logs", "stream.log");
        this.logFolder = path.join("./", "bot", "data", "logs");

        // keep original console methods if needed
        this._origConsole = {
            log: console.log.bind(console),
            error: console.error ? console.error.bind(console) : console.log.bind(console),
            warn: console.warn ? console.warn.bind(console) : console.log.bind(console),
            info: console.info ? console.info.bind(console) : console.log.bind(console),
            debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
        };

        this.checkFolder();
        this.checkFile();
        this.createStream();

        this.internalId = this.id();

        // bind internal writer
        this._write = this._write.bind(this);

        // override console methods to include log type
        console.log = (...args) => this._write('INFO', ...args);
        console.info = (...args) => this._write('INFO', ...args);
        console.warn = (...args) => this._write('WARN', ...args);
        console.error = (...args) => this._write('ERROR', ...args);
        console.debug = (...args) => this._write('DEBUG', ...args);

        // initial log
        console.log('------------------------- LOG STARTED -------------------------');
    }

    // make id function where A are letters and 0 are numbers
    // 0A00AA0000AAA
    id() {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const numbers = "0123456789";
        let id = "";
        for (let i = 0; i < 12; i++) {
            if (i == 1 || i == 4) {
                id += numbers.charAt(Math.floor(Math.random() * numbers.length));
            } else {
                id += letters.charAt(Math.floor(Math.random() * letters.length));
            }
        }
        return id;
    }

    createStream() {
        this.logStream = fs.createWriteStream(this.logFile, { flags: "a" });
    }

    checkFolder() {
        // create main data folder (here since this module gets required first)
        if (!fs.existsSync("./bot/data")) fs.mkdirSync("./bot/data");
        // check if folder exists
        if (!fs.existsSync(path.join(this.logFolder))) fs.mkdirSync(path.join(this.logFolder));
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
        const newFile = path.join(this.logFolder, `log_${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.txt`);
        // print file rotation
        console.log(`Renaming log file to ${newFile}`);
        // end the stream of the current log file
        this.logStream.end();
        // rename the current log file to the new path
        fs.renameSync(this.logFile, newFile);
    }

    async _write(type, ...args) {
        try {
            // stringify objects; treat Error specially because JSON.stringify(Error) => {}
            args = args.map(arg => {
                if (arg instanceof Error) {
                    // include stack if available
                    return arg.stack || arg.toString();
                }
                if (typeof arg === 'object') {
                    try {
                        // if it looks like an Error (has stack/message) but is not an instanceof Error,
                        // prefer printing the stack to avoid '{}'
                        if (arg && (arg.stack || arg.message)) {
                            return arg.stack || arg.message;
                        }
                        // util.inspect handles non-enumerable props and circular refs nicely
                        return util.inspect(arg, { depth: 4, colors: false });
                    } catch (e) {
                        return String(arg);
                    }
                }
                return arg;
            });

            // add date to log as DD/MM/YYYY HH:MM:SS
            const date = new Date();
            const dateString = `[${date.getDate() < 10 ? '0' + date.getDate() : date.getDate()}/${date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1}/${date.getFullYear()} ${date.getHours() < 10 ? '0' + date.getHours() : date.getHours()}:${date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()}:${date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds()}]`;

            // prefix with id, date and type
            args.unshift(`${this.internalId} | ${dateString} | [${type}] |`);

            const message = Array.from(args).join(' ') + '\r\n';

            // write to appropriate stream
            if (type === 'ERROR') {
                try { process.stderr.write(message); } catch (e) { process.stdout.write(message); }
            } else {
                process.stdout.write(message);
            }

            // write to log file
            if (this.logStream && this.logStream.writable) this.logStream.write(message);

            // check if file size is bigger than 50MB
            if (this.logStream && this.logStream.bytesWritten > 50000000) {
                // rotate log file
                this.rotate();
            }
        } catch (e) {
            // fallback to original console.error if something goes wrong
            try { this._origConsole.error('Logger write failed:', e); } catch (err) { /* swallow */ }
        }
    }

    // backward compatible alias
    log(...args) { return this._write('INFO', ...args); }
}

module.exports = { Logger };