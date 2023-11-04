const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "21425885691454";
const channels = {};

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("clips");
    command.setDescription("Configure new twitch clips notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '🔀 Toggle', value: 'toggletwitchclips' })
            .addChoices({ name: '🔨 Set channel', value: 'setchannelclips' })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", ephemeral: true });
    // add timeout to the user
    timeout.addTimeout(user);

    console.log(" > Twitch clips command executed");
    const args = interaction.options;
    const action = args.getString('action');

    switch (action) {
        case 'toggletwitchclips':
            const selectMenu = new SelectMenu()
                .setCustomId("toggletwitchclips;" + internalId)
                .setPlaceholder("List of twitch channels")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(await _getAllTwitchChannels(interaction, database))
                .build();
        
            interaction.reply({
                content: "Here's a list of all the twitch channels where you can enable or disable the clips notifications.\nSelect one from the list to toggle the notifications in the current channel.",
                components: [selectMenu],
                ephemeral: true
            });
            break;
        case 'setchannelclips':
            setchannelclips(interaction, database);
            break;
        default:
            interaction.reply({ content: "Invalid action", ephemeral: true });
            break;
    }
}

async function setchannelclips(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;

    const selectMenu = new SelectMenu()
        .setCustomId("setchannelclips;" + internalId)
        .setPlaceholder("List of twitch channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitchChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Select a twitch channel to set latest clips notifications",
        components: [selectMenu],
        ephemeral: true
    });
}

async function interaction(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", ephemeral: true });
    // add timeout to the user
    timeout.addTimeout(user);
    
    console.log(" > Twitch clips interaction received");
    const guild = interaction.guild;
    // const channel = interaction.channel;
    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    const action = customId.split(';')[0];
    // check if the action contains "none"
    if (values[0] === "none") return interaction.reply({
        content: "No channels added",
        ephemeral: true
    });
    switch (action) {
        case 'toggletwitchclips':
            values[2] = Number(values[2]);
            interaction.reply({
                content: "Clips notifications are now " + (values[2] === 1 ? "disabled" : "enabled") + " for " + values[0],
                components: [],
                ephemeral: true
            });
            database.updateTwitchClips(guild.id, values[0], values[2] === 0 ? 1 : 0);
            break;
        case 'setchannelclips':
            database.updateTwitchClipsChannel(guild.id, values[0], values[1]);
            interaction.reply({
                content: `Updated latest clips notifications channel for **${values[0]}** to <#${values[1]}>`,
                ephemeral: true
            });
            break;
        default:
            await interaction.reply({ content: "Unknown action", ephemeral: true });
            break;
    }
}

// this is bad but i don't give a fuck
var _extra = null;
async function init(database, extra) {
    _extra = extra;
    _extra.database = database;
    const guild = extra.guild;
    database.getChannelsWithEnabledClips(guild.id).then((channels) => {
        channels.forEach((channel) => {
            _addClips(channel);
        });
    });
    console.log(" > Twitch clips module initialized");
}

function _addClips(channel) {
    var uid = _extra.cron.add(20 * 60 * 1000, (uid) => {
    // var uid = _extra.cron.add(5000, (uid) => {
        if (!channels[uid]) return _extra.cron.remove(uid);
        
        _extra.database.getChannelsWithEnabledClips(channels[uid].guildId).then((_channels) => {
            // filter channels that do not exists anymore in the channels constant
            const c = _channels.filter(channel => { return channel.channelName !== channels[uid].channelName });
            for (var i in c) {
                _extra.cron.remove(c[i].uid);
                delete c[i];
            }
        });

        _extra.database.getChannelClips(channels[uid].guildId, channels[uid].twitchId).then((dbClips) => {
            _extra.twitch.getClips(channels[uid].twitchId)
                .then(apiClips => {
                    console.log(dbClips);
                    apiClips.forEach(clip => {
                        if (dbClips.some(e => e.clipId === clip.id)) return;
                        _extra.database.addClip(channels[uid].guildId, channels[uid].twitchId, channels[uid].channelName, channels[uid].clipsChannelId, clip.id, JSON.stringify(clip));
                    });
                });
        });
    });

    channels[uid] = channel;
    channels[uid].uid = uid;
}

// internal functions
async function _getAllTwitchChannels(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    var channels = [];
    const res = await database.getAllTwitchChannels(guild.id);
    if (res) {
        res.forEach(entry => {
            channels.push({
                label: entry.channelName,
                value: entry.channelName + ";" + entry.channelId + ";" + entry.enableClips,
                description: `Clips announcement is: ` + (entry.enableClips === 0 ? `disabled` : `enabled`),
                emoji: (entry.enableClips === 0 ? `❌` : `✅`)
            });
        });
    }
    if (channels.length == 0) {
        channels.push({
            label: "No channels added",
            value: "none",
            description: "Add a twitch channel to the list using the /twitch command",
            emoji: "❌",
            default: true
        });
    }
    return channels;
}

module.exports = {
    build,
    execute,
    interaction,
    init
}