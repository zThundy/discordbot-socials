const { SlashCommandBuilder } = require("discord.js");

const internalId = "472513600254789";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("nickname");
    command.setDescription("Configure twitch clips notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('nickname')
            .setDescription("Type the nickname that i will have on this server or type 'reset' to reset it to default")
            .setRequired(true)
        return option;
    });
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
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