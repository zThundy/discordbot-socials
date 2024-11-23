const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

const internalId = "je894modm34lkjd98em3n";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("age");
    command.setDescription("Start the creation of a button panel to manage age roles.");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '⏺ Send', value: 'create' })
            .addChoices({ name: '✅ Create', value: 'add' })
            .addChoices({ name: '❌ Delete', value: 'cancel' });
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

function execute(interaction, database) {
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