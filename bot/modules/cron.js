class Cronjob {
    constructor() {
        this.cronjobs = {}
    }

    // function that creates a uuid
    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * @param {number} ms - time in milliseconds
     * @param {function} fn - function to execute
     * @param {boolean} firstFire - if true, the function will be executed immediately
     */
    // function that creates and start a cronjob
    add(ms, fn, firstFire = false) {
        console.log(`<CRON> Adding CronJob with ms ${ms} (seconds: ${ms / 1000}, minutes: ${ms / 60000}) and firstFire ${firstFire}`);
        const uid = this._uuid();
        const cb = () => {
            clearTimeout(timeout);
            timeout = setTimeout(cb, ms);
            this.cronjobs[uid] = { timeout, ms, fn, firstFire };
            fn(uid);
        }
        let timeout = setTimeout(cb, ms)
        this.cronjobs[uid] = { timeout, ms, fn, firstFire };
        if (firstFire) fn(uid);
        return uid;
    }

    /**
     * @param {string} uid - uuid of the old cronjob
     */
    start(uid) {
        const newuid = this.add(this.cronjobs[uid].ms, this.cronjobs[uid].fn, this.cronjobs[uid].firstFire);
        this.cronjobs[uid] = this.cronjobs[newuid];
        this.remove(uid);
        return newuid;
    }

    stopAll() {
        for (const uid in this.cronjobs) {
            console.log(`<CRON> Stopping CronJob with uid ${uid}`);
            clearTimeout(this.cronjobs[uid]);
        }
    }

    /**
     * @param {string} uid - uuid of the cronjob
     */
    stop(uid) {
        console.log(`<CRON> Stopping CronJob with uid ${uid}`);
        if (!this.cronjobs[uid]) return console.error(`<CRON> Can't stop CronJob with uid ${uid}: Cronjob not found`);
        clearTimeout(this.cronjobs[uid]);
    }

    /**
     * @param {string} uid - uuid of the cronjob
     */
    remove(uid) {
        console.log(`<CRON> Removing CronJob with uid ${uid}`);
        if (!this.cronjobs[uid]) return console.error(`<CRON> Can't remove CronJob with uid ${uid}: Cronjob not found`);
        clearTimeout(this.cronjobs[uid]);
        delete this.cronjobs[uid];
        console.log(`<CRON> CronJob with uid ${uid} removed`);
    }

    removeAllCronjobs() {
        for (const uid in this.cronjobs) {
            clearTimeout(this.cronjobs[uid]);
            delete this.cronjobs[uid];
        }
    }
}

module.exports = { Cronjob };