const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites
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
// create the new log file
var logStream = fs.createWriteStream(logFile, { flags: "a" });
console.log = async function () {
    if (arguments.length === 0) return;
    // check if content is object, then stringify it
    for (var i in arguments)
        if (typeof arguments[i] === "object")
            arguments[i] = JSON.stringify(arguments[i], null, 2);
    // write the stream to file and to stdout out
    logStream.write(new Date().toLocaleString() + " - " + Array.from(arguments).join(" ") + "\r\n");
    // write to standard output
    process.stdout.write(Array.from(arguments).join(" ") + "\r\n");
    // process.stderr.write(Array.from(arguments).join(" ") + "\r\n");
    // check if the current log file is bigger than 10MB and if so, rename it to the current date and time and create a new one
    if (logStream.bytesWritten > 10000000) await _rotateLog();
};

const _rotateLog = () => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(logFile)) {
            const date = new Date();
            // get the new path
            const newFile = path.join(__dirname, "bot/data", `log_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.txt`);
            // print file rotation
            console.log(`Renaming log file to ${newFile}`);
            // end the stream of the current log file
            logStream.end();
            // rename the current log file to the new path
            fs.renameSync(logFile, newFile);
            // create a new log file
            logStream = fs.createWriteStream(logFile, { flags: "a" });
            resolve();
        }
    });
}

client.on(Events.ClientReady, () => {
    // rotate log file on api authentication
    _rotateLog();
    // init bots
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
    console.log(">>> Initializing bot for guild " + guild.name + " (" + guild.id + ")");
    // check if the bot is enabled for this guild
    const cfgBot = config.bots.filter(bot => bot.guild_id === guild.id)[0];
    if (cfgBot) {
        bots[guild.id] = new BOT(client, guild);
    } else {
        // send a message to the guild owner
        // const channel = guild.channels.cache.find(channel => channel.type === 'GUILD_TEXT' && channel.permissionsFor(guild.me).has('SEND_MESSAGES'))
        guild.channels.cache.forEach((channel) => {
            if (channel.type === 2) {
                if (channel.permissionsFor(guild.members.me).has("SEND_MESSAGES")) {
                    return channel.send({
                        content: "Sorry, but this bot is not enabled for this guild. Join the support server for more information: https://discord.zthundy.online/"
                    });
                }
            }
        });
    }
};

// login to discord
client.login(config.token);