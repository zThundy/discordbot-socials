const SQL = require("./modules/database.js");
const fs = require("fs");
const { TwitchApi } = require("./modules/twitch.js");
const { Cronjob } = require("./modules/cron.js");
const { Uploader } = require("./modules/uploader.js");
const { TwitterAPI } = require("./modules/twitter.js");

class BOT {
    constructor(client, guild) {
        const config = require("../config.json");
        this.client = client;
        this.guild = guild;
        console.log(`>>> Bot initialized for guild ${guild.name}`);
        this.database = new SQL();
        this.commands = new Map();
        this.cron = new Cronjob();
        this.twitch = new TwitchApi(config);
        this.twitter = new TwitterAPI();
        // this.uploader = new Uploader(this.client, this.guild, this.database);
        this.database.init().then(() => {
            this._init();
        }).catch(err => {
            console.error(err);
        });
    }

    // main event handler for the current bot instance
    event(event, ...args) {
        if (event === "command") {
            // check if the command exists and execute it
            this.commands.forEach((command, string) => {
                if (args[0].commandName === string)
                    if (command.module.execute) command.module.execute(args[0], this.database, this.client);
            });
        } else if (event === "select" || event === "modal" || event === "button") {
            // check if the customId is in the this.commands map
            // if it is, execute the command
            this.commands.forEach((command, string) => {
                const customId = args[0].customId.split(";")[1];
                if (command.id === customId)
                    if (command.module.interaction) command.module.interaction(args[0], this.database, this.client);
            });
        } else if (event === "message") {
            const message = args[0];
            if (message.author.bot) return;
            if (message.channel.name.includes("ticket-") && message.channel.topic) {
                message.guild.members.fetch(message.author.id)
                    .then(m => {
                        const dateFormat = message.createdAt;
                        var date = ('0' + dateFormat.getDate()).slice(-2) +
                            "/" + ('0' + (dateFormat.getMonth() + 1)).slice(-2) +
                            "/" + dateFormat.getFullYear() +
                            " " + ('0' + dateFormat.getHours()).slice(-2) +
                            ":" + ('0' + dateFormat.getMinutes()).slice(-2) +
                            ":" + ('0' + dateFormat.getSeconds()).slice(-2)

                        if (message.attachments.size > 0) {
                            message.attachments.forEach((attachment) => {
                                message.content = attachment.url;
                                this.database.addTicketMessage(
                                    message.channel.topic,
                                    message.content,
                                    message.author.username,
                                    message.author.avatarURL(),
                                    date,
                                    m.displayHexColor,
                                    message.createdAt,
                                    "image"
                                ).catch(e => console.error(e));
                            });
                        } else {
                            this.database.addTicketMessage(
                                message.channel.topic,
                                message.content,
                                message.author.username,
                                message.author.avatarURL(),
                                date,
                                m.displayHexColor,
                                message.createdAt,
                                "text"
                            ).catch(e => console.error(e));
                        }
                    }).catch(e => console.error(e));
            }
        }
    }
    
    _init() {
        // read all the commands js files in the commands folder
        const commandFiles = fs.readdirSync("./bot/commands").filter(file => file.endsWith(".js"));
        // loop through the files
        for (const file of commandFiles) {
            const cmdFile = require(`./commands/${file}`);
            const command = cmdFile.build(this.guild);
            // register the commands in the application
            this.client.application.commands.create(command);
            // add the command file as a module
            command.module = cmdFile;
            // add them to the commands map to check if they exist later
            this.commands.set(command.name, command);
            console.log(`<!> Command ${command.name} loaded`);
            if (command.module.init) command.module.init(this.database, {
                twitter: this.twitter || null,
                twitch: this.twitch || null,
                cron: this.cron,
                client: this.client,
                guild: this.guild,
                uploader: this.uploader
            });
        }
    }
}

module.exports = {
    BOT
}