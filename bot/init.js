const SQL = require("./modules/database.js");
const fs = require("fs");
const { TwitchApi } = require("./modules/twitch.js");
const { Cronjob } = require("./modules/cron.js");
const { PermissionsBitField } = require('discord.js');

class BOT {
    constructor(client, guild) {
        this.client = client;
        this.guild = guild;
        console.log(`>>> Bot initialized for guild ${guild.name}`);
        this.database = new SQL();
        this.commands = new Map();
        this.cron = new Cronjob();
        this.twitch = new TwitchApi(require("../config.json"));
        this.database.init().then(() => {
            this._init();
        }).catch(err => {
            console.error(err);
        });
    }

    // main event handler for the current bot instance
    event(event, ...args) {
        switch (event) {
            case "command":
                // check if the command exists and execute it
                this.commands.forEach((command, string) => {
                    if (args[0].commandName === string)
                        if (command.module.execute) command.module.execute(args[0], this.database, this.client);
                });
                break;
            case "select":
                // check if the customId is in the this.commands map
                // if it is, execute the command
                this.commands.forEach((command, string) => {
                    const customId = args[0].customId.split(";")[1];
                    if (command.id === customId)
                        if (command.module.interaction) command.module.interaction(args[0], this.database, this.client);
                });
                break;
            case "message":
                break;
        }
    }
    
    _init() {
        // read all the commands js files in the commands folder
        const commandFiles = fs.readdirSync("./bot/commands").filter(file => file.endsWith(".js"));
        // loop through the files
        for (const file of commandFiles) {
            const cmdFile = require(`./commands/${file}`);
            const command = cmdFile.build(this.guild);
            command.module = cmdFile;
            // register the commands in the application
            this.client.application.commands.create(command);
            // add them to the commands map to check if they exist later
            this.commands.set(command.name, command);
            console.log(`<!> Command ${command.name} loaded`);
            if (command.module.init) command.module.init(this.database, { twitch: this.twitch, cron: this.cron, client: this.client, guild: this.guild });
        }
    }
}

module.exports = {
    BOT
}