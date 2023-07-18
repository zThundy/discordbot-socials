const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");

// create a random numberic id
const internalId = "21425885691454";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("clips");
    command.setDescription("Configure new twitch clips notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '📜 List', value: 'listtwitchclips' })
            .addChoices({ name: '✅ Add', value: 'addtwitchclips' })
            .addChoices({ name: '❌ Remove', value: 'removetwitchclips' })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    console.log(" > Twitch clips command executed");
    const guild = interaction.guild;
    const channel = interaction.channel;
    const args = interaction.options;
    const action = args.getString('action');
    switch (action) {
        case 'listtwitchclips':
            break;
        case 'addtwitchclips':
            const selectMenu = new SelectMenu()
                .setCustomId("listtwich;" + internalId)
                .setPlaceholder("List of twitch channels")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(await _getAllTwitchChannels(interaction, database))
                .build();
        
            interaction.reply({
                content: "Here's a list of all the twitch channels",
                components: [selectMenu],
                ephemeral: true
            })
            break;
        case 'removetwitchclips':
            break;
        default:
            await interaction.reply({ content: "Unknown action", ephemeral: true });
            break;
    }
}

async function interaction(interaction, database) {
}

async function init(database, extra) {
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
                value: entry.channelName + ";" + entry.channelId,
                description: `Bound discord channel: ${entry.discordChannel}`,
                emoji: "🌐"
            });
        });
    }
    if (channels.length == 0) {
        channels.push({
            label: "No channels added",
            value: "none",
            description: "Add a channel to the list",
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