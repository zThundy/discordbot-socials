const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});
const config = require('./config.json');

const bots = new Collection();
const { BOT } = require("./bot/init.js");

// replace console.log function with a custom one that logs to a file
// and also send the log to the console
const fs = require("fs");
const path = require("path");
const logFile = path.join(__dirname, "bot/data", "log.txt");
const logStream = fs.createWriteStream(logFile, { flags: "a" });
// check if log file exists, if so, rename it to the current date and create a new one
if (fs.existsSync(logFile)) {
    const date = new Date();
    const newFile = path.join(__dirname, "bot/data", `log_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}.txt`);
    fs.renameSync(logFile, newFile);
}
console.log = function () {
    if (arguments.length === 0) return;
    // check if content is object, then stringify it
    for (var i in arguments)
        if (typeof arguments[i] === "object")
            arguments[i] = JSON.stringify(arguments[i], null, 2);
    // write the stream to file and to stdout out
    logStream.write(new Date().toLocaleString() + " - " + Array.from(arguments).join(" ") + "\r\n");
    process.stdout.write(Array.from(arguments).join(" ") + "\r\n");
};

// const errFile = path.join(__dirname, "bot/data", "error.txt");
// const errStream = fs.createWriteStream(errFile, { flags: "a" });
// console.error = function () {
//     if (arguments.length === 0) return;
//     // check if content is object, then stringify it
//     for (var i in arguments) {
//         if (typeof arguments[i] === "object") {
//             arguments[i] = JSON.stringify(arguments[i], null, 2);
//         }
//     }
//     // write the stream to file and to stderr out
//     errStream.write(new Date().toLocaleString() + " - " + Array.from(arguments).join(" ") + "\r\n");
//     process.stderr.write(Array.from(arguments).join(" ") + "\r\n");
// };

client.on(Events.ClientReady, () => {
    client.guilds.cache.forEach(guild => {
        initBot(guild);
    });
});

client.on(Events.GuildCreate, guild => {
    initBot(guild);
});

client.on(Events.MessageCreate, message => {
    try {
        const guild = message.guild;
        const bot = bots[guild.id];
        if (bot) bot.event("message", message);
    } catch (err) {
        console.error(err);
    }
});

client.on(Events.InteractionCreate, (interaction) => {
    try {
        if (interaction.isCommand()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("command", interaction);
        } else if (interaction.isButton()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("button", interaction);
        } else if (interaction.isSelectMenu()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("select", interaction);
        } else if (interaction.isContextMenu()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("context", interaction);
        } else if (interaction.isMessageComponent()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("component", interaction);
        } else if (interaction.isAutocomplete()) {
            const guild = interaction.guild;
            const bot = bots[guild.id];
            if (bot) bot.event("autocomplete", interaction);
        }
    } catch (err) {
        console.error(err);
        interaction.reply({ content: "An error occurred while processing your request.", ephemeral: true });
    }
});

client.on(Events.Error, (err) => {
    console.error(err);
});

const initBot = (guild) => {
    const cfgBot = config.bots.filter(bot => bot.guild_id === guild.id)[0];
    if (cfgBot) {
        bots[guild.id] = new BOT(client, guild);
    }
};

client.login(config.token);