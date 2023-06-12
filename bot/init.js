const SQL = require("./modules/database.js");
const fs = require("fs");
const { TwitchApi } = require("./modules/twitch.js");
const { Cronjob } = require("./modules/cron.js");
const { Uploader } = require("./modules/uploader.js");
const { TwitterAPI } = require("./modules/twitter.js");

class BOT {
    constructor(client, guild) {
        // init data folders
        this._initDataFolders();
        // require logger module
        require("./modules/logger.js");
        // init the bot for current guild
        this.config = require("../config.json");
        this.client = client;
        this.guild = guild;
        console.log(`>>> Bot initialized for guild ${guild.name}`);
        this.database = new SQL();
        this.commands = new Map();
        this.cron = new Cronjob();
        if (this.config.twitch.enabled) this.twitch = new TwitchApi(this.config.twitch);
        if (this.config.twitter.enabled) this.twitter = new TwitterAPI(this.config.twitter);
        this.uploader = new Uploader(this.cron).addListeners();
        // init database and commands
        this.database.init().then(() => this._buildCommands()).catch(err => console.error(err));
    }

    // main event handler for the current bot instance
    event(event, ...args) {
        if (event === "command") {
            // check if the command exists and execute it
            this.commands.forEach((command, string) => {
                if (args[0].commandName === string)
                    if (command.module.execute) command.module.execute(args[0], this.database, this.client, this.config);
            });
        } else if (event === "select" || event === "modal" || event === "button") {
            // check if the customId is in the this.commands map
            // if it is, execute the command
            this.commands.forEach((command, string) => {
                const customId = args[0].customId.split(";")[1];
                if (command.id === customId)
                    if (command.module.interaction) command.module.interaction(args[0], this.database, this.client, this.config);
            });
        } else if (event === "message" || event === "messageUpdate") {
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

                        
                        var type = "text";
                        // check if the message includes a URL with jpg, png or gif
                        if ((/^https?:\/\/.+\jpg|jpeg|png|webp|avif|gif|svg$/i).test(message.content)) {
                            type = "image";
                            message.content = this.uploader.downloadPicture(message.content);
                        }
                        // check if the message has attachments, if so download them
                        if (message.attachments.size > 0) {
                            type = "image";
                            message.attachments.forEach((attachment) => {
                                message.content = this.uploader.downloadPicture(attachment.url);
                            });
                        }

                        if (event === "messageUpdate") {
                            this.database.updateTicketMessage(message.channel.topic, args[0].content, args[1].content).catch(e => console.error(e));
                        } else {
                            this.database.addTicketMessage(
                                message.channel.topic, // ticketId
                                message.content, // content of message
                                message.author.username, // username of user
                                message.author.avatarURL(), // avatar url of user
                                date, // date of message creation
                                m.displayHexColor, // hex color of user
                                message.createdAt, // date of message creation in MS
                                type, // type of message (text or image)
                                "false" // if message has been edited
                            ).catch(e => console.error(e));
                        }
                    }).catch(e => console.error(e));
            }
        }
    }

    _initDataFolders() {
        // create data folder if doesn't exist
        if (!fs.existsSync("./bot/data")) fs.mkdirSync("./bot/data");
        // create al data subfolders if they don't exist
        if (!fs.existsSync("./bot/data/images")) fs.mkdirSync("./bot/data/images");
        if (!fs.existsSync("./bot/data/tickets")) fs.mkdirSync("./bot/data/tickets");
    }
    
    _buildCommands() {
        // read all the commands js files in the commands folder
        const commandFiles = fs.readdirSync("./bot/commands").filter(file => file.endsWith(".js"));
        // loop through the files
        for (const file of commandFiles) {
            if (file === "twitter.js" && this.config.twitter.enabled === false) continue;
            if (file === "twitch.js" && this.config.twitch.enabled === false) continue;
            // require the command file
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
                guild: this.guild
            });
        }
    }
}

module.exports = {
    BOT
}