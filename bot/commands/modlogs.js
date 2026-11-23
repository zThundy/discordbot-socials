const {
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder
} = require("discord.js");

const internalId = "moderation_logs_v1";

function build() {
    const command = new SlashCommandBuilder()
        .setName("modlogs")
        .setDescription("Configure the moderator log channel for this server.")
        .setDMPermission(false)
        .addStringOption((option) => option
            .setName("action")
            .setDescription("Choose whether to use this channel or disable moderator logs.")
            .setRequired(true)
            .addChoices(
                { name: "Set this channel", value: "setup" },
                { name: "Disable moderator logs", value: "disable" }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({
            content: "You need the **Manage Server** permission to configure moderator logs.",
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const action = interaction.options.getString("action");
        if (action === "disable") {
            await database.deleteModerationLogChannel(interaction.guildId);
            return interaction.reply({
                content: "Moderator logs have been disabled for this server.",
                flags: MessageFlags.Ephemeral
            });
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
            return interaction.reply({
                content: "Run this command in a text channel that can receive messages.",
                flags: MessageFlags.Ephemeral
            });
        }

        const botMember = interaction.guild.members.me;
        const permissions = botMember && channel.permissionsFor(botMember);
        const sendPermission = channel.isThread && channel.isThread()
            ? PermissionsBitField.Flags.SendMessagesInThreads
            : PermissionsBitField.Flags.SendMessages;
        if (!permissions ||
            !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
            !permissions.has(sendPermission) ||
            !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
            return interaction.reply({
                content: "I need **View Channel**, **Send Messages**, and **Embed Links** permissions in this channel.",
                flags: MessageFlags.Ephemeral
            });
        }

        await database.saveModerationLogChannel(interaction.guildId, channel.id);
        return interaction.reply({
            content: `Moderator logs will be sent to <#${channel.id}>.`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error("Could not configure the moderator log channel:", error);
        const response = {
            content: "An error occurred while configuring the moderator log channel.",
            flags: MessageFlags.Ephemeral
        };
        if (interaction.replied || interaction.deferred) return interaction.followUp(response);
        return interaction.reply(response);
    }
}

module.exports = {
    build,
    execute
};
