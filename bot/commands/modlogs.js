const {
    EmbedBuilder,
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder
} = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { MODERATION_LOG_EVENTS } = require("../modules/moderationLogEvents.js");

const internalId = "moderation_logs_v1";

function build() {
    const command = new SlashCommandBuilder()
        .setName("modlogs")
        .setDescription("Configure moderator log events and channels.")
        .setDMPermission(false)
        .addStringOption(option => option
            .setName("action")
            .setDescription("Choose how to configure moderator logs.")
            .setRequired(true)
            .addChoices(
                { name: "Configure this channel", value: "setup" },
                { name: "View configuration", value: "view" },
                { name: "Disable this channel", value: "disable_channel" },
                { name: "Disable all moderator logs", value: "disable" }
            ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

    command.id = internalId;
    command.execute = execute;
    command.interaction = handleEventSelection;
    return command;
}

function buildConfigurationEmbed(configurations) {
    const eventLabels = new Map(MODERATION_LOG_EVENTS.map(event => [event.type, event.label]));
    const fields = configurations.slice(0, 25).map(configuration => {
        const allEvents = configuration.eventTypes.includes("*");
        const labels = allEvents
            ? ["All event types"]
            : configuration.eventTypes.map(eventType => eventLabels.get(eventType) || eventType);
        return {
            name: `<#${configuration.channelId}>`,
            value: labels.length ? labels.join(", ") : "No events selected",
            inline: false
        };
    });

    const description = configurations.length
        ? configurations.length > fields.length
            ? `Configured event types by channel (showing the first ${fields.length} of ${configurations.length} channels).`
            : "Configured event types by channel."
        : "No moderator log channels are configured.";
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("Moderator log configuration")
        .setDescription(description);
    if (fields.length) embed.addFields(fields);
    return embed;
}

function buildEventSelector(channelId, configuredEvents = []) {
    const selected = new Set(configuredEvents.includes("*")
        ? MODERATION_LOG_EVENTS.map(event => event.type)
        : configuredEvents);
    const options = MODERATION_LOG_EVENTS.map(event => ({
        label: event.label,
        value: event.type,
        description: event.description,
        default: selected.has(event.type)
    }));

    return new SelectMenu()
        .setCustomId(`modlogs_events;${internalId};${channelId}`)
        .setPlaceholder("Choose the events to send to this channel")
        .setMinValues(1)
        .setMaxValues(MODERATION_LOG_EVENTS.length)
        .addOptions(options)
        .build();
}

async function getConfigurations(database, guildId) {
    return database.getModerationLogChannels(guildId);
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
                content: "Moderator logs have been disabled in all channels.",
                embeds: [buildConfigurationEmbed([])],
                flags: MessageFlags.Ephemeral
            });
        }

        if (action === "disable_channel") {
            await database.deleteModerationLogChannel(interaction.guildId, interaction.channelId);
            const configurations = await getConfigurations(database, interaction.guildId);
            return interaction.reply({
                content: `Moderator logs have been disabled for <#${interaction.channelId}>.`,
                embeds: [buildConfigurationEmbed(configurations)],
                flags: MessageFlags.Ephemeral
            });
        }

        const configurations = await getConfigurations(database, interaction.guildId);
        if (action === "view") {
            return interaction.reply({
                embeds: [buildConfigurationEmbed(configurations)],
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

        const currentChannel = configurations.find(configuration => configuration.channelId === channel.id);
        return interaction.reply({
            content: `Choose which events to send to <#${channel.id}>. The embed shows the current configuration for every channel.`,
            embeds: [buildConfigurationEmbed(configurations)],
            components: [buildEventSelector(channel.id, currentChannel ? currentChannel.eventTypes : [])],
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error("Could not configure moderator logs:", error);
        const response = {
            content: "An error occurred while configuring moderator logs.",
            flags: MessageFlags.Ephemeral
        };
        if (interaction.replied || interaction.deferred) return interaction.followUp(response);
        return interaction.reply(response);
    }
}

async function handleEventSelection(interaction, database) {
    if (!interaction.customId.startsWith(`modlogs_events;${internalId};`)) return;
    if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return interaction.reply({
            content: "You need the **Manage Server** permission to configure moderator logs.",
            flags: MessageFlags.Ephemeral
        });
    }

    const channelId = interaction.customId.split(";")[2];
    const validEvents = new Set(MODERATION_LOG_EVENTS.map(event => event.type));
    const selectedEvents = interaction.values || [];
    if (!selectedEvents.length || selectedEvents.some(eventType => !validEvents.has(eventType))) {
        return interaction.update({
            content: "Select at least one valid event type.",
            embeds: [],
            components: []
        });
    }

    try {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
            return interaction.update({
                content: "The selected log channel is no longer available.",
                embeds: [],
                components: []
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
            return interaction.update({
                content: "I need **View Channel**, **Send Messages**, and **Embed Links** permissions in the selected channel.",
                embeds: [],
                components: []
            });
        }

        await database.saveModerationLogChannel(interaction.guildId, channelId, selectedEvents);
        const configurations = await getConfigurations(database, interaction.guildId);
        return interaction.update({
            content: `Moderator log events saved for <#${channelId}>.`,
            embeds: [buildConfigurationEmbed(configurations)],
            components: []
        });
    } catch (error) {
        console.error("Could not save moderator log event selection:", error);
        return interaction.update({
            content: "An error occurred while saving the moderator log event selection.",
            embeds: [],
            components: []
        });
    }
}

module.exports = {
    build,
    execute,
    interaction: handleEventSelection
};
