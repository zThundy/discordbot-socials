const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

function build() {
    const command = new SlashCommandBuilder();
    command.setName("help");
    command.setDescription("Shows a help message");
    command.setDMPermission(false);
    command.execute = execute;
    return command;
}

async function execute(interaction, _, _, config) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user);

    const embed = {
        title: "Help",
        description: "This bot is a collection of commands to help you manage your server. You can use the commands by typing `/` and then the command name. For example, to use the `help` command, type `/help`.",
        color: 0x000000,
        fields: [
            {
                name: "Commands",
                value: "Here is a list of all the commands available:",
            },
            {
                name: "📜 Roles (/roles)",
                value: "You can use this command to create and manage a role picker.",
            },
            {
                name: "📜 Multi roles (/multiroles)",
                value: "You can use this command to create and manage a multi role picker."
            },
            {
                name : "📜 Nickname (/nickname)",
                value: "Use this command to change the nickname of the bot in the current guild."
            },
            {
                name: "📜 Verify (/verify)",
                value: "Use this command to setup the verification system for the server."
            },
            {
                name : "📜 Info (/info)",
                value: "Use this command to get information about the bot."
            },
            {
                name: "📜 Help (/help)",
                value: "Use this command to get help about the bot."
            },
        ],
        footer: {
            text: "Made with ❤️ by zThundy__"
        },
    }

    if (config.twitter.enabled) {
        embed.fields.push({
            name: "📜 Twitter (/twitter)",
            value: "You can use this feature to configure in the channel where it's executed, an automatic announcement every time that someone sends a tweet on twitter. You can change the tag that will used to inform the users.",
        });
    }

    if (config.twitch.enabled) {
        embed.fields.push({
            name: "📜 Twitch (/twitch)",
            value: "You can use this feature to configure in the channel where it's executed, an automatic announcement that will be sent every time someone is live on twitch.",
        });
    }
    
    interaction.reply({ embeds: [embed] });
};

module.exports = {
    build,
    execute
};