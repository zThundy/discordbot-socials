const { SlashCommandBuilder } = require("discord.js");

function build() {
    const command = new SlashCommandBuilder();
    command.setName("help");
    command.setDescription("Shows a help message");
    command.setDMPermission(false);
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;

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
                name: "📜 Twicth (/twitch)",
                value: "You can use this feature to configure in the channel where it's executed, an automatic announcement that will be sent every time someone is live on twitch.",
            },
            {
                name: "📜 Twitter (/twitter)",
                value: "You can use this feature to configure in the channel where it's executed, an automatic announcement every time that someone sends a tweet on twitter. You can change the tag that will used to inform the users.",
            },
            {
                name : "📜 Nickname (/nickname)",
                value: "Use this command to change the nickname of the bot in the current guild."
            }
        ],
        footer: {
            text: "Made with ❤️ by zThundy__"
        },
    }
    
    interaction.reply({ embeds: [embed] });
};

module.exports = {
    build,
    execute
};