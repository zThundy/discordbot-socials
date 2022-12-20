const { SlashCommandBuilder } = require("discord.js");

function build() {
    const command = new SlashCommandBuilder();
    command.setName("help");
    command.setDescription("Shows a help message");
    command.setDMPermission(false);
    command.execute = execute;
    return command;
}

async function execute(interaction, database, client) {
    const guild = interaction.guild;
    const channel = interaction.channel;

    var description = "This bot has been completly developed and tested by <@341296805646041100> [zThundy__#2456]\n" +
                      "If you want to check the code please visit the [GitHub repository](https://github.com/zThundy/discordbot-socials)\n" +
                      "If you want to check out other projects of mine, please visit my [GitHub profile](https://github.com/zThundy/)";
    
    var fields = [{
        name: "Discord servers where I'm active",
        value: "You can find me in the following servers:\n",
    }]

    client.guilds.cache.forEach(guild => {
        var data = {}
        data.name = "**" + guild.name + "** (" + guild.id + ")";
        data.value = "Members: " + guild.memberCount + "\n[Join server](https://discord.gg/" + guild.vanityURLCode + ")";
        fields.push(data);
    });

    const embed = {
        title: "Info",
        description,
        color: 0x000000,
        fields,
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