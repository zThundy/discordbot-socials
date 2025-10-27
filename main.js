const { Client, Events, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const { Logger } = require("./bot/modules/logger.js");
new Logger();

// ensure config exists before doing anything else
const { ensureConfig } = require("./bot/modules/configChecker.js");
ensureConfig();

// init uploader and cronjob
const { Uploader } = require("./bot/modules/uploader.js");
const { Cronjob } = require("./bot/modules/cron.js");
const cron = new Cronjob();
const uploader = new Uploader(cron, require("./config.json")).addListeners();

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

client.on(Events.ClientReady, () => {
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
        const bot = bots[message.guild.id];
        if (bot) bot.event("message", message);
    } catch (err) {
        console.error(err);
    }
});

client.on(Events.GuildMemberUpdate, (oldU, newU) => {
    try {
        const bot = bots[newU.guild.id];
        if (bot) bot.event("userUpdate", oldU, newU);
    } catch (err) {
        console.error(err);
    }
});

client.on(Events.GuildMemberAdd, (member) => {
    try {
        const bot = bots[member.guild.id];
        if (bot) bot.event("userJoin", member);
    } catch (err) {
        console.error(err);
    }
});

client.on(Events.MessageUpdate, (oldM, newM) => {
    try {
        const bot = bots[oldM.guild.id];
        if (bot) bot.event("messageUpdate", oldM, newM);
    } catch (err) {
        console.error(err);
    }
});

client.on(Events.InteractionCreate, (interaction) => {
    try {
        console.log(">>> Interaction received:", interaction);
        const guild = interaction.guild;
        const bot = bots[guild.id];
        if (!bot) return;
        if (interaction.isCommand()) {
            bot.event("command", interaction);
        } else if (interaction.isButton()) {
            bot.event("button", interaction);
        } else if (interaction.isStringSelectMenu()) {
            // generic string select
            bot.event("select", interaction);
        } else if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
            // role select menus
            bot.event("roleSelect", interaction);
        } else if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
            // channel select menus
            bot.event("channelSelect", interaction);
        } else if (interaction.isModalSubmit()) {
            bot.event("modal", interaction);
        } else if (interaction.isContextMenuCommand()) {
            bot.event("context", interaction);
        } else {
            console.log("Unknown interaction type:", interaction.type);
        }
    } catch (err) {
        console.error(err);
    interaction.reply({ content: "An error occurred while processing your request.", flags: MessageFlags.Ephemeral });
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
        bots[guild.id] = new BOT(client, guild, uploader, cron);
    } else {
        console.log(">>> Not initializing for guild " + guild.name + " (" + guild.id + ")");
        // send a message to the guild owner
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

client.login(config.token)
    .then(() => {
        console.log(">>> Discord login successful");
    })
    .catch(err => {
        console.error("Discord login error:", err.message || err);
        process.exit(1);
    });