const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");

var internalId = "";
const clips = {};

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("clips");
    command.setDescription("Configure twitch clips notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '📜 List', value: 'listclips' })
            .addChoices({ name: '✅ Add', value: 'addclips' })
            .addChoices({ name: '❌ Remove', value: 'removeclips' })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const args = interaction.options;
    const action = args.getString('action');
    switch (action) {
        case 'listclips':
            await listClips(interaction, database);
            break;
        case 'addclips':
            await addClips(interaction, database);
            break;
        case 'removeclips':
            await removeClips(interaction, database);
            break;
        default:
            await interaction.reply({ content: "Unknown action", ephemeral: true });
            break;
    }
}

async function interaction(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const args = interaction.options;
    const action = args.getString('action');
    switch (action) {
        case 'addclips':
            await addClips(interaction, database);
            break;
        case 'removeclips':
            await removeClips(interaction, database);
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
    const guild = extra.guild;
    database.getAllClips(guild.id).then((channels) => {
        channels.forEach((channel) => {
            _addClips(channel);
        });
    });
    console.log(" > Twitch clips module initialized");
}

function _addClips(channel) {
    var uid = _extra.cron.add(5 * 60 * 1000, (uid) => {
        if (!clips[uid]) return _extra.cron.remove(uid);
        
        _extra.twitch.getClip(clips[uid].channelName).then((latestClip) => {
            const _clip = clips[uid];
            if (latestClip.id === _clip.lastClip) return;
            _clip.lastClip = latestClip.id;
            _extra.database.updateClipLastId(_clip.guildId, _clip.channelName, latestClip.id);
            _extra.guild.channels.fetch(_clip.channelId).then((channel) => {
                channel.send(`New clip from ${_clip.channelName}:\n\n${latestClip.url}`);
            });
            clips[uid] = _clip;
        }).catch((err) => {
            console.error(err);
            _extra.twitch.resetToken();
        });
    });

    clips[uid] = channel;
}

module.exports = {
    build,
    init,
    interaction
};