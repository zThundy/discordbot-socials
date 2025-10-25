const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { Button } = require("./elements/button.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "255571a6820c7c28bd72";

function build() {
    const command = new SlashCommandBuilder();
    command.setName("verify");
    command.setDescription("Setup the verification system for the server.");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '⏺ Send', value: 'create' })
            .addChoices({ name: '✅ Create verify', value: 'add' })
            .addChoices({ name: '❌ Delete verify', value: 'cancel' });
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

function execute(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user);

    const args = interaction.options;
    switch (args.getString('action')) {
        case 'create':
            create(interaction, database);
            break;
        case 'add':
            add(interaction, database);
            break;
        case "cancel":
            cancel(interaction, database);
            break;
    }
}

function add(interaction, database) {
    const guild = interaction.guild;
    database.getVerify(guild.id).then(async (verify) => {
        if (!verify) {
            const channel = interaction.channel;
            var _messages = [];

            _messages.push(await interaction.reply({
                content: "Please tag the role you want to assing users after verification\n\nIf you want to cancel the operation, send **cancel**"
            }));

            // ask the user to type the title and the description of the selector
            const filter = (m) => m.author.id === interaction.user.id;
            const collector = channel.createMessageCollector(filter, { time: 60000 });

            collector.on("collect", async (m) => {
                if (m.author.id !== interaction.user.id) return;
                if (m.author.bot) return;
                _messages.push(m);
                const role = m.mentions.roles.first();
                if (role) {
                    _messages.push(await channel.send({ content: "Role added to the verification system" }));
                    database.createVerify(guild.id, role.id);
                    collector.stop("done");
                } else if (m.content.toLowerCase() === "cancel") {
                    collector.stop("cancel");
                } else {
                    _messages.push(await channel.send({ content: "You need to tag a role" }));
                }
            });

            collector.on("end", () => {
                // delete the messages
                _messages.forEach(async (msg) => await msg.delete());
            });
        } else {
            interaction.reply({ content: "The verification system is already set up", flags: MessageFlags.Ephemeral });
        }
    });
}

function cancel(interaction, database) {
    const guild = interaction.guild;
    database.getVerify(guild.id).then(async (verify) => {
        if (verify) {
            database.deleteVerify(guild.id);
            interaction.reply({ content: "The verification system has been deleted", flags: MessageFlags.Ephemeral });
        } else {
            interaction.reply({ content: "The verification system is not set up", flags: MessageFlags.Ephemeral });
        }
    });
}

function create(interaction, database) {
    const guild = interaction.guild;
    database.getVerify(guild.id).then(async (verify) => {
        if (verify) {
            // fetch the role
            await guild.roles.fetch();
            const role = guild.roles.cache.get(verify.roleId);
            if (role) {
                const verify = new Button()
                    .setStyle("primary")
                    .setLabel("✔️ Verify")
                    .setCustomId("verify;" + internalId + ";" + guild.id + ";" + role.id)
                    .build();
                
                const embed = {
                    title: "Verification",
                    description: `Please click the button to verify yourself`,
                    color: 0x00ff00,
                    timestamp: new Date(),
                    footer: {
                        text: "Made with ❤️ by zThundy__"
                    }
                };

                interaction.reply({ embeds: [embed], components: [verify] });
            } else {
                interaction.reply({ content: "There has been an error during the creation of the verification system.\nMaybe the role doesn't exist anymore?\nPlease create a new verification system with **/verify**", flags: MessageFlags.Ephemeral });
            }
        } else {
            interaction.reply({ content: "Please create a verification system for this guild first", flags: MessageFlags.Ephemeral });
        }
    });
}

async function interaction(interaction, database) {
    const user = interaction.user.id;
    const guild = interaction.guild;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user);
    // check if user has the role already
    const roleID = interaction.customId.split(";")[3];
    await guild.roles.fetch(roleID);
    const role = interaction.guild.roles.cache.get(roleID);
    if (role) {
        const member = interaction.member;
        if (member.roles.cache.has(roleID)) {
            return interaction.reply({ content: "You already have the role", flags: MessageFlags.Ephemeral });
        } else {
            member.roles.add(role);
            return interaction.reply({ content: "You have been verified", flags: MessageFlags.Ephemeral });
        }
    } else {
        return interaction.reply({ content: "There has been an error during the verification process.\nMaybe the role doesn't exist anymore?\nPlease create a new verification system with **/verify**", flags: MessageFlags.Ephemeral });
    }
}

module.exports = {
    build,
    execute,
    interaction
};