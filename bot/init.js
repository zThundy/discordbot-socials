const SQL = require("./modules/database.js");
const fs = require("fs");
const { TwitchApi } = require("./modules/twitch.js");
const { TwitterAPI } = require("./modules/twitter.js");
const { Timeout } = require("./modules/timeout.js");

class BOT {
    constructor(client, guild, uploader, cron) {
        this.config = require("../config.json");
        // init data folders
        this._initDataFolders();
        // require logger module
        require("./modules/logger.js");
        // init the bot for current guild
        this.client = client;
        this.guild = guild;
        console.log(`>>> Bot initialized for guild ${guild.name}`);
        this.database = new SQL();
        this.commands = new Map();
        this.timeout = new Timeout();
        this.cron = cron;
        this.uploader = uploader;
        if (this.config.twitch.enabled) this.twitch = new TwitchApi(this.config.twitch);
        if (this.config.twitter.enabled) this.twitter = new TwitterAPI(this.config.twitter);
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
            const newMessage = args[1];
            if (message.author.bot) return;
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.message)
                    command.module.message(event, message, newMessage, { database: this.database, uploader: this.uploader, config: this.config });
            });
        } else if (event === "userUpdate") {
            const oldUser = args[0];
            const newUser = args[1];
            // send a message event to all the commands
            this.commands.forEach((command, string) => {
                if (command.module.userUpdate)
                    command.module.userUpdate(oldUser, newUser, { database: this.database, uploader: this.uploader, config: this.config, client: this.client });
            });
        }
    }

    _initDataFolders() {
        // create data folder if doesn't exist
        if (!fs.existsSync("./bot/data")) fs.mkdirSync("./bot/data");
        // create al data subfolders if they don't exist
        if (!fs.existsSync(this.config.uploader.folder)) fs.mkdirSync(this.config.uploader.folder);
        if (!fs.existsSync(this.config.tickets.folder)) fs.mkdirSync(this.config.tickets.folder);
    }
    
    _buildCommands() {
        // read all the commands js files in the commands folder
        const commandFiles = fs.readdirSync("./bot/commands").filter(file => file.endsWith(".js"));
        // loop through the files
        for (const file of commandFiles) {
            if (file === "twitter.js" && !this.config.twitter.enabled) continue;
            if (file === "twitch.js" && !this.config.twitch.enabled) continue;
            if (file === "clips.js" && !this.config.twitch.enabled) continue;
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