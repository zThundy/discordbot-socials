class Timeout {
    constructor() {
        this.timeouts = new Map();
        // start interval to check timeouts
        this._cycle();
    }

    _cycle() {
        this.interval = setInterval(() => {
            this.timeouts.forEach((timeout, id) => {
                // check if 5 sconds passed since the timeout was added
                if (Date.now() - timeout.time >= 5000) {
                    if (timeout.callback) timeout.callback();
                    this.timeouts.delete(id);
                }
            });
        }, 1000);
    }

    addTimeout(id, timeout) {
        if (!timeout) timeout = {};
        timeout.time = Date.now();
        this.timeouts.set(id, timeout);
    }

    removeTimeout(id) {
        this.timeouts.delete(id);
    }

    checkTimeout(id) {
        return this.timeouts.has(id);
    }

    getTimeout(id) {
        return this.timeouts.get(id);
    }
}

module.exports = {
    Timeout
}