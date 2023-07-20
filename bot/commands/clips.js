const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");

// create a random numberic id
const internalId = "21425885691454";
const channels = {};

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("clips");
    command.setDescription("Configure new twitch clips notifications");
    command.setDMPermission(false);
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    console.log(" > Twitch clips command executed");
    // const guild = interaction.guild;
    // const channel = interaction.channel;
    // const args = interaction.options;
    const selectMenu = new SelectMenu()
        .setCustomId("addtwitchclips;" + internalId)
        .setPlaceholder("List of twitch channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitchChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Here's a list of all the twitch channels where you can enable the clips notifications.\nSelect one from the list to enable the notifications in the current channel.",
        components: [selectMenu],
        ephemeral: true
    });
}

async function interaction(interaction, database) {
    const guild = interaction.guild;
    // const channel = interaction.channel;
    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    // check if the action contains "none"
    if (values[0] === "none") return interaction.reply({
        content: "No channels added",
        ephemeral: true
    });
    values[2] = Number(values[2]);
    interaction.reply({
        content: "Clips notifications are now " + (values[2] === 1 ? "disabled" : "enabled") + " for " + values[0],
        components: [],
        ephemeral: true
    });
    database.updateTwitchClips(guild.id, values[0], values[2] === 0 ? 1 : 0);
}

// this is bad but i don't give a fuck
var _extra = null;
async function init(database, extra) {
    _extra = extra;
    _extra.database = database;
    const guild = extra.guild;
    database.getAllTwitchChannels(guild.id).then((channels) => {
        channels.forEach((channel) => {
            // _addChannel(channel);
        });
    });
    console.log(" > Twitch module initialized");
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
                emoji: "🌐"
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