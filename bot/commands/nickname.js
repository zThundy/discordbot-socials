const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

const internalId = "3b7edfe540c8ae6fb63e";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("nickname");
    command.setDescription("Change nickname to the bot");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('nickname')
            .setDescription("Type the nickname that i will have on this server or type 'reset' to reset it to default")
            .setRequired(true)
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const guild = interaction.guild;
    const args = interaction.options;
    const nickname = args.getString('nickname');

    // get member from guild members
    const member = guild.members.cache.get(_extra.client.user.id);
    // change nickname of the member
    if (nickname == "reset") {
        member.setNickname(null);
        interaction.reply({
            content: "Nickname reset to default",
            ephemeral: true
        });
        // save it to database
        database.updateNickname(guild.id, null);
    } else {
        member.setNickname(nickname);
        interaction.reply({
            content: "Nickname set to " + nickname,
            ephemeral: true
        });
        // save it to database
        database.updateNickname(guild.id, nickname);
    }
}

var _extra = null;
async function init(database, extra) {
    _extra = extra;
    const guild = extra.guild;
    const member = guild.members.cache.get(_extra.client.user.id);
    database.getNickname(guild.id).then((res) => {
        if (res && res.nickname) {
            member.setNickname(res.nickname);
        } else {
            member.setNickname(null);
        }
    });
}

module.exports = {
    build,
    execute,
    init
}