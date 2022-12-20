const { SlashCommandBuilder } = require("discord.js");

function build() {
    const command = new SlashCommandBuilder();
    command.setName("info");
    command.setDescription("Shows some informations about the bot");
    command.setDMPermission(false);
    command.execute = execute;
    return command;
}

// this funtion is bad, but GUESS WHAT
// I'VE BEEN STUCK HERE FOR MORE THAN 2 HOURS SO FUCK THIS SHIT, I'M DONE
const _getFields = (client) => {
    return new Promise(async (resolve, reject) => {
        var fields = [{
            name: "Discord servers where I'm active",
            value: "You can find me in the following servers:\n",
        }]

        const _sleep = (ms) => { return new Promise(resolve => setTimeout(resolve, ms)); }
        client.guilds.cache.forEach(async guild => {
            var data = {}
            if (!guild.vanityURLCode) {
                var invites = await guild.invites.fetch();
                var invite = invites.find(invite => invite.maxAge === 0 && invite.maxUses === 0);
                if (invite) {
                    data.value = "*Members*: " + guild.memberCount +
                    "\n*Description*: __" + (guild.description || "No description") + "__" +
                    "\n[✅ Join server](" + invite.url + ")";
                } else {
                    data.value = "*Members*: " + guild.memberCount +
                    "\n*Description*: __" + (guild.description || "No description") + "__"
                }
            } else {
                data.value = "*Members*: " + guild.memberCount +
                "\n*Description*: __" + (guild.description || "No description") + "__" +
                "\n[✅ Join server](https://discord.gg/" + guild.vanityURLCode + ")";
            }
    
            data.name = "**" + guild.name + "** (" + guild.id + ")";
            fields.push(data);
        });
        
        await _sleep(1500);
        resolve(fields);
    });
}


async function execute(interaction, database, client) {
    const guild = interaction.guild;
    const channel = interaction.channel;

    var description = "This bot has been completly developed and tested by <@341296805646041100> [zThundy__#2456]\n" +
                      "If you want to check the code please visit the [GitHub repository](https://github.com/zThundy/discordbot-socials)\n" +
                      "If you want to check out other projects of mine, please visit my [GitHub profile](https://github.com/zThundy/)";

    var fields = await _getFields(client);
    // check if all fields have label and value, if not remove the entry
    fields = fields.filter(field => field.name && field.value);

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