const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    PermissionsBitField,
    SlashCommandBuilder
} = require("discord.js");

const internalId = "kickchannel_v1";
const pageSize = 20;

function build() {
    const command = new SlashCommandBuilder();
    command.setName("kickchannel");
    command.setDescription("Configure the channel that automatically kicks message authors.");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName("action")
            .setDescription("Choose whether to enable or disable this channel")
            .setRequired(true)
            .addChoices(
                { name: "Enable in this channel", value: "setup" },
                { name: "Disable", value: "disable" }
            );
        return option;
    });
    command.addStringOption((option) => {
        option.setName("message")
            .setDescription("Text shown in the kick-channel embed (required when enabling)")
            .setMaxLength(4000)
            .setRequired(false);
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    try {
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.KickMembers)) {
            return interaction.reply({
                content: "You need the **Kick Members** permission to configure the kick channel.",
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.options.getString("action");
        if (action === "disable") {
            await database.deleteKickChannel(interaction.guildId);
            return interaction.reply({
                content: "The kick channel has been disabled.",
                flags: MessageFlags.Ephemeral
            });
        }

        const description = interaction.options.getString("message");
        if (!description || !description.trim()) {
            return interaction.reply({
                content: "Enter the text to display in the embed using the **message** option.",
                flags: MessageFlags.Ephemeral
            });
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return interaction.reply({
                content: "I can't kick users because I don't have the **Kick Members** permission.",
                flags: MessageFlags.Ephemeral
            });
        }

        const channelPermissions = interaction.channel.permissionsFor(botMember);
        if (!channelPermissions ||
            !channelPermissions.has(PermissionsBitField.Flags.ViewChannel) ||
            !channelPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({
                content: "I need **View Channel** and **Manage Messages** permissions in this channel to delete messages.",
                flags: MessageFlags.Ephemeral
            });
        }

        const kickCount = await database.getKickChannelKickCount(interaction.guildId);
        const panel = await interaction.channel.send({
            embeds: [buildPanelEmbed(description.trim())],
            components: [buildPanelButton(interaction.guildId, kickCount)]
        });

        try {
            await database.saveKickChannel(interaction.guildId, interaction.channelId, panel.id, description.trim());
        } catch (error) {
            await panel.delete().catch((deleteError) => console.error("Could not remove an unsaved kick-channel panel:", deleteError));
            throw error;
        }

        return interaction.reply({
            content: `Kick channel enabled in <#${interaction.channelId}>. To delete the user's messages server-wide, I also need **View Channel** and **Manage Messages** permissions in every text channel.`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error("Could not configure the kick channel:", error);
        if (interaction.replied || interaction.deferred) {
            return interaction.followUp({
                content: "An error occurred while configuring the kick channel.",
                flags: MessageFlags.Ephemeral
            });
        }
        return interaction.reply({
            content: "An error occurred while configuring the kick channel.",
            flags: MessageFlags.Ephemeral
        });
    }
}

function buildPanelEmbed(description) {
    return new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle("🚫 DO NOT SEND MESSAGES IN THIS CHANNEL")
        .setDescription(description)
        .setFooter({ text: "Any message sent here will result in an automatic kick." });
}

function buildPanelButton(guildId, count) {
    const button = new ButtonBuilder()
        .setCustomId(`kickchannel;${internalId};list;${guildId};0`)
        .setLabel(`Kicks: ${count}`)
        .setEmoji("👢")
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder().addComponents(button);
}

function buildKickList(guildId, kicks, count, page) {
    const pageCount = Math.max(1, Math.ceil(count / pageSize));
    const lines = kicks.map((kick) => {
        const timestamp = Math.floor(kick.kickedAt / 1000);
        return `• <@${kick.userId}> — <t:${timestamp}:R>`;
    });

    const embed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle(`Kicked users (${count})`)
        .setDescription(lines.length ? lines.join("\n") : "No users have been kicked yet.")
        .setFooter({ text: `Page ${page + 1}/${pageCount}` });

    if (pageCount === 1) return { embeds: [embed], components: [] };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`kickchannel;${internalId};list;${guildId};${page - 1}`)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`kickchannel;${internalId};list;${guildId};${page + 1}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= pageCount - 1)
    );

    return { embeds: [embed], components: [row] };
}

async function interaction(interaction, database) {
    try {
        const [, , action, guildId, requestedPage] = interaction.customId.split(";");
        if (action !== "list" || guildId !== interaction.guildId) {
            return interaction.reply({
                content: "This button is not valid for this server.",
                flags: MessageFlags.Ephemeral
            });
        }

        const count = await database.getKickChannelKickCount(guildId);
        const pageCount = Math.max(1, Math.ceil(count / pageSize));
        const page = Math.max(0, Math.min(Number(requestedPage) || 0, pageCount - 1));
        const kicks = await database.getKickChannelKicks(guildId, pageSize, page * pageSize);
        const response = buildKickList(guildId, kicks, count, page);

        if (interaction.isButton() && interaction.message.flags.has(MessageFlags.Ephemeral)) {
            return interaction.update(response);
        }
        return interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("Could not display the kick-channel history:", error);
        if (interaction.replied || interaction.deferred) {
            return interaction.followUp({
                content: "Could not load the list of kicked users.",
                flags: MessageFlags.Ephemeral
            });
        }
        return interaction.reply({
            content: "Could not load the list of kicked users.",
            flags: MessageFlags.Ephemeral
        });
    }
}

async function message(event, message, _newMessage, { database }) {
    if (event !== "message" || !message.guild || !message.member) return;

    try {
        const config = await database.getKickChannel(message.guild.id);
        if (!config || config.channelId !== message.channel.id) return;

        let kicked = false;
        if (message.member.kickable) {
            try {
                await message.member.kick("Message sent in the configured kick channel");
                kicked = true;
            } catch (error) {
                console.error(`Could not kick ${message.author.id} from kick channel ${message.channel.id}:`, error);
            }
        } else {
            console.warn(`Could not kick ${message.author.id} from kick channel ${message.channel.id}: member is not kickable.`);
        }

        if (kicked) {
            try {
                await database.addKickChannelKick(message.guild.id, message.author.id, Date.now());
            } catch (error) {
                console.error(`Could not record the kick of ${message.author.id}:`, error);
            }
        }

        const deletion = await deleteUserMessages(message.guild, message.author.id, message);
        if (deletion.failed || deletion.skipped) {
            console.warn(
                `Could not delete all messages from ${message.author.id}: ` +
                `${deletion.failed} deletion failures, ${deletion.skipped} inaccessible channels.`
            );
        }

        if (kicked) {
            try {
                const panel = await message.channel.messages.fetch(config.messageId);
                const count = await database.getKickChannelKickCount(message.guild.id);
                await panel.edit({ components: [buildPanelButton(message.guild.id, count)] });
            } catch (error) {
                console.error("Could not update the kick-channel count button:", error);
            }
        }
    } catch (error) {
        console.error(`Could not process a message in kick channel ${message.channel.id}:`, error);
    }
}

async function deleteUserMessages(guild, userId, triggeringMessage) {
    const result = { deleted: 0, failed: 0, skipped: 0 };

    try {
        await triggeringMessage.delete();
        result.deleted++;
    } catch (error) {
        result.failed++;
        console.error(`Could not delete the triggering message from ${userId}:`, error);
    }

    const botMember = guild.members.me;
    if (!botMember) {
        result.skipped++;
        console.warn(`Could not scan channels for messages from ${userId}: bot member is unavailable.`);
        return result;
    }

    let channels;
    try {
        channels = await guild.channels.fetch();
    } catch (error) {
        result.failed++;
        console.error(`Could not fetch channels while deleting messages from ${userId}:`, error);
        return result;
    }

    for (const channel of channels.values()) {
        if (!channel || !channel.isTextBased() || !channel.messages) continue;

        const permissions = channel.permissionsFor(botMember);
        if (!permissions ||
            !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
            !permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            result.skipped++;
            continue;
        }

        try {
            let before;
            while (true) {
                const messages = await channel.messages.fetch({
                    limit: 100,
                    ...(before ? { before } : {})
                });
                if (!messages.size) break;

                for (const oldMessage of messages.values()) {
                    if (oldMessage.author.id !== userId) continue;
                    try {
                        await oldMessage.delete();
                        result.deleted++;
                    } catch (error) {
                        result.failed++;
                        console.error(`Could not delete message ${oldMessage.id} from ${userId}:`, error);
                    }
                }

                if (messages.size < 100) break;
                before = messages.last().id;
            }
        } catch (error) {
            result.failed++;
            console.error(`Could not scan channel ${channel.id} for messages from ${userId}:`, error);
        }
    }

    return result;
}

module.exports = {
    build,
    execute,
    interaction,
    message
};
