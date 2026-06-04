const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { SelectMenu } = require('./elements/dropdown.js');
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();
const { YoutubeAPI } = require('../modules/youtube.js');

const internalId = "youtubecmd_" + Math.random().toString(36).substring(2, 8);

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("youtube");
    command.setDescription("Configure youtube notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '📜 List', value: 'listyoutube' })
            .addChoices({ name: '✅ Add', value: 'addyoutube' })
            .addChoices({ name: '❌ Remove', value: 'removeyoutube' })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function _getAllYoutubeChannels(interaction, database) {
    const guild = interaction.guild;
    var channels = [];
    const res = await database.getAllYoutubeChannels(guild.id);
    if (res) {
        const seen = new Set();
        res.forEach(entry => {
            const key = entry.channelName ? String(entry.channelName).toLowerCase() : String(entry.channelId).toLowerCase();
            if (seen.has(key)) return; // skip duplicates
            seen.add(key);
            channels.push({
                label: entry.channelName,
                value: entry.channelName + ";" + entry.channelId,
                description: `Bound discord channel: ${entry.discordChannel}`,
                emoji: "📺"
            });
        });
    }
    if (channels.length == 0) {
        channels.push({
            label: "No youtube channels added",
            value: "none",
            description: "Add a channel to the list by sending the name or id",
            emoji: "❌",
            default: true
        });
    }
    return channels;
}

async function execute(interaction, database) {
    const args = interaction.options;
    const action = args.getString('action');
    switch (action) {
        case 'listyoutube':
            listyoutube(interaction, database)
            break;
        case 'addyoutube':
            addyoutube(interaction, database);
            break;
        case 'removeyoutube':
            removeyoutube(interaction, database);
            break;
        default:
            await interaction.reply({ content: "Unknown action", flags: MessageFlags.Ephemeral });
            break;
    }
}

async function listyoutube(interaction, database) {
    const guild = interaction.guild;
    const selectMenu = new SelectMenu()
        .setCustomId("listyoutube;" + internalId)
        .setPlaceholder("List of managed youtube channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllYoutubeChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Here's a list of all the managed youtube channels",
        components: [selectMenu],
        flags: MessageFlags.Ephemeral
    })
}

async function removeyoutube(interaction, database) {
    const selectMenu = new SelectMenu()
        .setCustomId("removeyoutube;" + internalId)
        .setPlaceholder("List of managed youtube channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllYoutubeChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Select a youtube channel to remove",
        components: [selectMenu],
        flags: MessageFlags.Ephemeral
    });
}

async function addyoutube(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    interaction.reply({ content: "Send the name or ID of the youtube channel you want to monitor\nor type **cancel** to cancel the operation", flags: MessageFlags.Ephemeral });
    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });
    collector.on('collect', async m => {
        collector.stop();
        if (m.content.toLowerCase() == "cancel") {
            m.reply("Operation cancelled").then(msg => { setTimeout(() => { msg.delete(); m.delete(); }, 5000); });
            return;
        }

        const input = m.content.trim();
        const youtubeApi = new YoutubeAPI();
        // normalize handle: if user provided a plain name without @ and it's not a channel id, prepend @
        let normalizedInput = input;
        if (!/^UC[0-9A-Za-z_-]{22,}$/.test(input) && !input.startsWith('@') && /^[A-Za-z0-9_]{1,50}$/.test(input)) {
            normalizedInput = '@' + input;
        }
        let resolvedId = null;
        // if input is not already a channel id (UC...), try to resolve handles/URLs to channel id
        if (!/^UC[0-9A-Za-z_-]{22,}$/.test(normalizedInput)) {
            resolvedId = await youtubeApi.resolveHandleToChannelId(normalizedInput).catch(() => null);
        }
        const candidateNames = [normalizedInput.toLowerCase()];
        if (resolvedId) candidateNames.unshift(resolvedId.toLowerCase());
        try {
            const existing = await database.getAllYoutubeChannels(guild.id);
            const duplicate = existing && existing.some(e => {
                if (!e) return false;
                const name = e.channelName ? String(e.channelName).toLowerCase() : "";
                // channelId in DB is the discord channel id; compare only channelName (youtube identifier)
                return candidateNames.includes(name);
            });
            if (duplicate) {
                m.reply(`Error: youtube channel **${input}** is already monitored`).then(msg => { setTimeout(() => { msg.delete(); m.delete(); }, 5000); });
                return;
            }
        } catch (e) {
            console.error('Error checking existing youtube channels', e);
        }

        const storeName = resolvedId || normalizedInput;
        channel.send(`Added youtube channel **${normalizedInput}** to the monitor list`).then(msg => { setTimeout(() => { msg.delete(); m.delete(); }, 5000); });
            database.createYoutubeChannel(guild.id, channel.id, normalizedInput, channel.name, resolvedId);
            _addChannel({ guildId: guild.id, channelId: channel.id, channelName: normalizedInput, discordChannel: channel.name, youtubeChannelId: resolvedId });
    });
}

async function interaction(interaction, database) {
    const user = interaction.user;
    const guild = interaction.guild;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    timeout.addTimeout(user, { guild: guild });

    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    const action = customId.split(';')[0];
    if (values[0] === "none") return interaction.reply({ content: "No youtube channels added", flags: MessageFlags.Ephemeral });
    switch (action) {
        case 'listyoutube':
            interaction.reply({ content: `Channel link: <https://www.youtube.com/${values[0]}>\nDiscord channel: <#${values[1]}>`, flags: MessageFlags.Ephemeral });
            break;
        case 'removeyoutube':
            database.deleteYoutubeChannel(guild.id, values[1], values[0]);
            interaction.reply({ content: `Removed **${values[0]}** from the list of managed youtube channels`, flags: MessageFlags.Ephemeral });
            // find and remove the channel from the cron monitoring
            for (const uid in channels) {
                const c = channels[uid];
                if (c.guildId === guild.id && c.channelId === values[1] && c.channelName === values[0]) {
                    _extra.cron.remove(c.uid);
                    console.log(`<YOUTUBE> Removed channel ${values[0]} from monitoring and deleted cronjob with uid ${c.uid}`);
                    delete channels[uid];
                    break;
                }
            }
            break;
    }
}

// minimal monitoring: store channels and use cron to periodically check
var _extra = null;
async function init(database, extra) {
    _extra = extra;
    _extra.database = database;
    const guild = extra.guild;
    database.getAllYoutubeChannels(guild.id).then((channels) => {
        channels.forEach((ch) => {
            _addChannel(ch);
        });
    });
    console.log(' > Youtube module initialized');
}

const channels = {};
function _addChannel(channel) {
    var uid = _extra.cron.add(10 * 60 * 1000, async (uid) => { // check every 10 minutes
        if (!channels[uid]) return _extra.cron.remove(uid);
        const c = channels[uid];
        const lookupName = c.youtubeChannelId || c.channelName;
        const displayName = c.channelName;
        console.log(`<YOUTUBE> Checking latest video for channel ${lookupName} (display ${displayName}) in guild ${c.guildId} and discord channel ${c.channelId}`);
        try {
            const video = await _extra.youtube.getLatestVideo(lookupName);
            if (!video) return console.warn(`<YOUTUBE> No videos found for channel ${lookupName}`);
            const videoId = String(video.id);
            const alreadySent = await _extra.database.isYoutubeVideoAlreadySend(c.guildId, c.channelId, lookupName, videoId);
            if (!alreadySent) {
                _extra.client.channels.fetch(c.channelId).then(ch => {
                    const embeds = _extra.youtube.getEmbed(video);
                    ch.send({ content: `@everyone **${displayName}** uploaded a new video!`, embeds }).catch(console.error);
                    _extra.database.insertNewYoutubeVideo(c.guildId, c.channelId, lookupName, videoId);
                }).catch(console.error);
            }
        } catch (e) {
            console.error(e);
        }
    });
    channels[uid] = channel;
    channels[uid].uid = uid;
}

module.exports = {
    build,
    execute,
    init,
    interaction
};
