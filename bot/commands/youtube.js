const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const { SelectMenu } = require('./elements/dropdown.js');
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

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
        res.forEach(entry => {
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
    collector.on('collect', m => {
        collector.stop();
        if (m.content.toLowerCase() == "cancel") {
            m.reply("Operation cancelled").then(msg => { setTimeout(() => { msg.delete(); m.delete(); }, 5000); });
            return;
        } else {
            channel.send(`Added youtube channel **${m.content}** to the monitor list`).then(msg => { setTimeout(() => { msg.delete(); m.delete(); }, 5000); });
        }
        database.createYoutubeChannel(guild.id, channel.id, m.content, channel.name);
        _addChannel({ guildId: guild.id, channelId: channel.id, channelName: m.content, discordChannel: channel.name });
    });
}

async function interaction(interaction, database) {
    const userId = interaction.user.id;
    if (timeout.checkTimeout(userId)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    timeout.addTimeout(userId);

    const guild = interaction.guild;
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
        try {
            const video = await _extra.youtube.getLatestVideo(c.channelName);
            if (!video) return;
            const videoId = String(video.id);
            const alreadySent = await _extra.database.isYoutubeVideoAlreadySend(c.guildId, c.channelId, c.channelName, videoId);
            if (!alreadySent) {
                _extra.client.channels.fetch(c.channelId).then(ch => {
                    const embeds = _extra.youtube.getEmbed(video);
                    ch.send({ content: `@everyone **${c.channelName}** uploaded a new video!\n\n<${video.link}>`, embeds }).catch(console.error);
                    _extra.database.insertNewYoutubeVideo(c.guildId, c.channelId, c.channelName, videoId);
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
