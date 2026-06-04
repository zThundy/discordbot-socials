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

    addTimeout(user, timeout) {
        const id = user.id
        if (!timeout) timeout = {};
        timeout.time = Date.now();
        timeout.user = user;
        this.timeouts.set(id, timeout);
    }

    removeTimeout(id) {
        this.timeouts.delete(id);
    }

    checkTimeout(user) {
        const id = user.id;
        // check user's permissions, if he is an administrator, he is not affected by the timeout
        const timeout = this.timeouts.get(id);
        if (!timeout) {
            console.log(`<TIMEOUT> No timeout found for user ${user.id}`);
            return false;
        };
        const guild = timeout.guild;
        // search for the member in the guild
        const member = guild.members.cache.get(id);
        if (!member) {
            console.log(`<TIMEOUT> No member found for user ${user.id} in guild ${guild.id}`);
            return false;
        }
        console.log(`<TIMEOUT> Checking timeout for user ${member.id}, User ${(member.permissions.has("Administrator") ? "has" : "doesn't have")} administrator permissions`);
        if (member.permissions.has("Administrator")) return false;
        return this.timeouts.has(id);
    }

    getTimeout(id) {
        return this.timeouts.get(id);
    }
}

module.exports = {
    Timeout
}