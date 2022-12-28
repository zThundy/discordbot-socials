// FUNCTION IN BETA
// This module is still in beta and i have to test it more

class Uploader {
    constructor(client, guild, database) {
        // check if the channel exists
        this.database = database;
        this.guild = guild;
        this.pictures = {};
        const channel = guild.channels.cache.find(channel => channel.name === "upload");
        if (!channel) {
            // create a channel in the current guild to upload files
            guild.channels.create("upload", {
                type: "GUILD_TEXT",
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone,
                        deny: ["VIEW_CHANNEL"],
                    },
                    {
                        id: client.user.id,
                        allow: ["VIEW_CHANNEL"],
                    },
                ],
            });
        }
        this._populatePictures();
    }

    // function that creates a unique uuid
    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * this function sends a picture to the upload channel
     * @param {String} url
     */
    sendPicture(url) {
        // send a picture to the upload channel
        const channel = this.guild.channels.cache.find(channel => channel.name === "upload");
        if (!channel) return console.log("<?> Upload channel not found in guild " + this.guild.name);
        const uuid = this.uuidv4();
        channel.send(url).then(msg => {
            // save message url in pictures array
            let attachment = msg.attachments.size > 0 ? msg.attachments.array()[0].url : null
            if (!attachment) return console.log("<?> No attachment found in message " + msg.id);
            this.pictures[uuid] = {uuid, url: attachment};
            this.database.savePicture(this.guild.id, uuid, attachment);
        });
        return uuid;
    }

    /**
     * this function returns a picture from the upload channel
     * @param {String} uuid
     * @returns {String} url of the picture
     */
    getPicture(uuid) {
        if (!uuid) return null;
        if (!this.pictures[uuid]) return null;
        return this.pictures[uuid].attachment;
    }

    _populatePictures() {
        this.database.getAllPictures(this.guild.id).then(pictures => {
            pictures.forEach(picture => {
                this.pictures[picture.uuid] = {
                    uuid: picture.uuid,
                    url: picture.url
                };
            });
        });
    }
}

module.exports = { Uploader };