const path = require("path");
const fs = require("fs");
const util = require('util');

class Logger {
    constructor() {
        this.fileStream = null;
        this.logStream = null;
        this.errLogStream = null;
        this.logFile = path.join("./", "bot", "data", "logs", "stream.log");
        this.errLogFile = path.join("./", "bot", "data", "logs", "error.log");
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
    this.checkFile(this.logFile);
    this.checkFile(this.errLogFile);
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
        this.errLogStream = fs.createWriteStream(this.errLogFile, { flags: "a" });
    }

    checkFolder() {
        // create main data folder (here since this module gets required first)
        if (!fs.existsSync("./bot/data")) fs.mkdirSync("./bot/data");
        // check if folder exists
        if (!fs.existsSync(path.join(this.logFolder))) fs.mkdirSync(path.join(this.logFolder));
    }

    checkFile() {
        // deprecated
        return;
    }

    checkFile(filePath) {
        // check if file exists, create if not
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, "");
        }
    }

    rotate() {
        // generic rotate for both streams
        const date = new Date();
        const stamp = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}_${date.getHours().toString().padStart(2,'0')}-${date.getMinutes().toString().padStart(2,'0')}-${date.getSeconds().toString().padStart(2,'0')}`;
        try {
            // rotate stream.log
            if (this.logStream) {
                const newFile = path.join(this.logFolder, `stream_${stamp}.log`);
                this._origConsole.log(`Renaming log file to ${newFile}`);
                this.logStream.end();
                try { fs.renameSync(this.logFile, newFile); } catch (e) { /* ignore */ }
                this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
            }
            // rotate error.log
            if (this.errLogStream) {
                const newErrFile = path.join(this.logFolder, `error_${stamp}.log`);
                this._origConsole.log(`Renaming error log file to ${newErrFile}`);
                this.errLogStream.end();
                try { fs.renameSync(this.errLogFile, newErrFile); } catch (e) { /* ignore */ }
                this.errLogStream = fs.createWriteStream(this.errLogFile, { flags: 'a' });
            }
        } catch (e) {
            this._origConsole.error('Rotate failed', e);
        }
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

            // write to appropriate std stream
            if (type === 'ERROR') {
                try { process.stderr.write(message); } catch (e) { process.stdout.write(message); }
            } else {
                process.stdout.write(message);
            }

            // write to appropriate log file
            if (type === 'ERROR') {
                if (this.errLogStream && this.errLogStream.writable) this.errLogStream.write(message);
                if (this.errLogStream && this.errLogStream.bytesWritten > 50000000) this.rotate();
            } else {
                if (this.logStream && this.logStream.writable) this.logStream.write(message);
                if (this.logStream && this.logStream.bytesWritten > 50000000) this.rotate();
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