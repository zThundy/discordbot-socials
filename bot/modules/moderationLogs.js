const { EmbedBuilder, PermissionsBitField } = require("discord.js");

function dateValue(value) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : String(value);
}

function collectionValues(collection) {
    if (!collection) return [];
    if (typeof collection.values === "function") return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    return [];
}

function snapshotUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        globalName: user.globalName || user.global_name || null,
        discriminator: user.discriminator,
        tag: user.tag,
        bot: user.bot,
        system: user.system,
        createdAt: dateValue(user.createdAt || user.createdTimestamp),
        avatar: user.avatar || null,
        banner: user.banner || null,
        accentColor: user.accentColor ?? null,
        avatarUrl: typeof user.displayAvatarURL === "function" ? user.displayAvatarURL() : null
    };
}

function snapshotMember(member) {
    if (!member) return null;
    let permissions = [];
    if (member.permissions && typeof member.permissions.toArray === "function") {
        permissions = member.permissions.toArray();
    } else if (member.permissions) {
        try {
            permissions = new PermissionsBitField(member.permissions).toArray();
        } catch (error) {
            permissions = [];
        }
    }

    let roles = [];
    if (member.roles && member.roles.cache) {
        roles = collectionValues(member.roles.cache).map((role) => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position,
            managed: role.managed
        }));
    } else if (Array.isArray(member.roles)) {
        roles = member.roles.map((roleId) => ({ id: roleId }));
    }

    return {
        user: snapshotUser(member.user),
        nickname: member.nickname || null,
        displayName: member.displayName || null,
        joinedAt: dateValue(member.joinedAt || member.joined_at),
        premiumSince: dateValue(member.premiumSince || member.premium_since),
        pending: member.pending ?? null,
        communicationDisabledUntil: dateValue(member.communicationDisabledUntil || member.communication_disabled_until),
        roles,
        permissions
    };
}

function snapshotGuild(guild) {
    return {
        id: guild.id,
        name: guild.name,
        ownerId: guild.ownerId || null,
        memberCount: guild.memberCount ?? null,
        iconUrl: typeof guild.iconURL === "function" ? guild.iconURL() : null
    };
}

function snapshotChannel(channel) {
    if (!channel) return null;
    return {
        id: channel.id,
        name: channel.name || null,
        type: channel.type ?? null,
        parentId: channel.parentId || null,
        topic: channel.topic || null
    };
}

function serializeInteractionOptions(options = []) {
    return options.map((option) => {
        const serialized = { name: option.name, type: option.type };
        if (option.value !== undefined) {
            const value = option.value;
            serialized.value = value === null || ["string", "number", "boolean"].includes(typeof value)
                ? value
                : {
                    id: value.id || null,
                    name: value.name || null,
                    username: value.username || null,
                    tag: value.tag || null
                };
        }
        if (option.options) serialized.options = serializeInteractionOptions(option.options);
        return serialized;
    });
}

async function sendModerationLog(guild, database, {
    title,
    description,
    color = 0x5865F2,
    fields = [],
    eventType = title,
    channelId: explicitChannelId,
    details = {}
}) {
    if (!guild || !database) return false;

    const createdAt = Date.now();
    const payload = {
        schemaVersion: 1,
        occurredAt: new Date(createdAt).toISOString(),
        guild: snapshotGuild(guild),
        operation: { eventType, title, description, color, fields, details }
    };
    const userId = details.target && (details.target.id || (details.target.user && details.target.user.id)) ||
        details.user && details.user.id ||
        details.member && details.member.user && details.member.user.id ||
        null;
    const channelId = explicitChannelId || details.channel && details.channel.id || details.channelId || null;

    try {
        await database.addModerationLog(guild.id, createdAt, eventType, userId, channelId, payload);
    } catch (error) {
        console.error(`Could not save moderation log "${eventType}" for guild ${guild.id}:`, error);
    }

    try {
        const destinations = await database.getModerationLogChannelsForEvent(guild.id, eventType);
        if (!destinations.length) return false;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();
        if (fields.length) embed.addFields(...fields);

        let sent = false;
        for (const destination of destinations) {
            try {
                const channel = await guild.channels.fetch(destination.channelId);
                if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
                    console.warn(`Moderation log channel ${destination.channelId} is unavailable in guild ${guild.id}.`);
                    continue;
                }

                const botMember = guild.members.me;
                const permissions = botMember && channel.permissionsFor(botMember);
                const sendPermission = channel.isThread && channel.isThread()
                    ? PermissionsBitField.Flags.SendMessagesInThreads
                    : PermissionsBitField.Flags.SendMessages;
                if (!permissions ||
                    !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
                    !permissions.has(sendPermission) ||
                    !permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
                    console.warn(`The bot cannot send moderation logs to channel ${destination.channelId} in guild ${guild.id}.`);
                    continue;
                }

                await channel.send({ embeds: [embed] });
                sent = true;
            } catch (error) {
                console.error(`Could not send moderation log "${eventType}" to channel ${destination.channelId}:`, error);
            }
        }
        return sent;
    } catch (error) {
        console.error(`Could not send a moderation log for guild ${guild.id}:`, error);
        return false;
    }
}

function logInteraction(interaction, database) {
    if (!interaction.guild) return;

    const type = interaction.isChatInputCommand()
        ? "Slash command"
        : interaction.isContextMenuCommand()
            ? "Context menu"
            : interaction.isButton()
                ? "Button"
                : interaction.isAnySelectMenu()
                    ? "Select menu"
                    : interaction.isModalSubmit()
                        ? "Modal"
                        : "Interaction";
    const action = interaction.commandName || interaction.customId || type;
    const fields = [
        { name: "User", value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
        { name: "Channel", value: interaction.channelId ? `<#${interaction.channelId}>` : "Unavailable", inline: true },
        { name: "Type", value: type, inline: true }
    ];

    return sendModerationLog(interaction.guild, database, {
        title: "Server interaction",
        description: `**${type}:** \`${action.slice(0, 200)}\``,
        fields,
        eventType: "interaction",
        details: {
            user: snapshotUser(interaction.user),
            member: snapshotMember(interaction.member),
            channel: snapshotChannel(interaction.channel),
            interaction: {
                type: interaction.type,
                commandName: interaction.commandName || null,
                commandId: interaction.commandId || null,
                customId: interaction.customId || null,
                locale: interaction.locale || null,
                guildLocale: interaction.guildLocale || null,
                options: serializeInteractionOptions(interaction.options && interaction.options.data)
            }
        }
    });
}

function logMemberJoin(member, database) {
    return sendModerationLog(member.guild, database, {
        title: "Member joined",
        description: `<@${member.id}> joined the server.`,
        fields: [{ name: "Account created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` }],
        eventType: "member.join",
        details: { target: snapshotMember(member) }
    });
}

function logMemberLeave(member, database) {
    return sendModerationLog(member.guild, database, {
        title: "Member left",
        description: `<@${member.id}> left the server.`,
        fields: [{ name: "User", value: `${member.user.tag} (${member.id})` }],
        eventType: "member.leave",
        details: { target: snapshotMember(member) }
    });
}

function logMemberUpdate(oldMember, newMember, database) {
    const fields = [];
    if (oldMember.nickname !== newMember.nickname) {
        fields.push({
            name: "Nickname",
            value: `${oldMember.nickname || oldMember.user.username} → ${newMember.nickname || newMember.user.username}`
        });
    }

    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    if (addedRoles.size) {
        fields.push({ name: "Roles added", value: collectionValues(addedRoles).map((role) => `<@&${role.id}>`).join(", ").slice(0, 1024) });
    }
    if (removedRoles.size) {
        fields.push({ name: "Roles removed", value: collectionValues(removedRoles).map((role) => `<@&${role.id}>`).join(", ").slice(0, 1024) });
    }
    if (!fields.length) return;

    return sendModerationLog(newMember.guild, database, {
        title: "Member updated",
        description: `Changes for <@${newMember.id}>.`,
        fields: [{ name: "User", value: `${newMember.user.tag} (${newMember.id})` }, ...fields],
        eventType: "member.update",
        details: {
            target: snapshotMember(newMember),
            previous: snapshotMember(oldMember),
            changes: {
                nickname: oldMember.nickname !== newMember.nickname
                    ? { before: oldMember.nickname, after: newMember.nickname }
                    : null,
                rolesAdded: addedRoles.map((role) => ({ id: role.id, name: role.name })),
                rolesRemoved: removedRoles.map((role) => ({ id: role.id, name: role.name }))
            }
        }
    });
}

function getMessageGuild(message, fallbackMessage) {
    const guild = message.guild || (fallbackMessage && fallbackMessage.guild);
    if (guild) return guild;

    const guildId = message.guildId || (fallbackMessage && fallbackMessage.guildId);
    const client = message.client || (fallbackMessage && fallbackMessage.client);
    if (guildId && client && client.guilds) return client.guilds.cache.get(guildId);
    return null;
}

function getMessageContent(message) {
    if (!message || message.partial || typeof message.content !== "string") {
        return "Unavailable (message was not cached).";
    }

    if (!message.content) return "(empty or attachment-only message)";
    return message.content.length > 1000
        ? `${message.content.slice(0, 1000)}… [truncated]`
        : message.content;
}

function getMessageAuthor(message) {
    if (!message || !message.author) return "Unavailable (message was not cached).";
    return `${message.author.tag} (<@${message.author.id}>)`;
}

function snapshotMessage(message) {
    if (!message) return null;
    return {
        id: message.id || null,
        partial: Boolean(message.partial),
        content: typeof message.content === "string" ? message.content : null,
        createdAt: dateValue(message.createdAt || message.createdTimestamp),
        editedAt: dateValue(message.editedAt || message.editedTimestamp),
        type: message.type ?? null,
        flags: message.flags && typeof message.flags.toArray === "function" ? message.flags.toArray() : [],
        author: snapshotUser(message.author),
        member: snapshotMember(message.member),
        channel: snapshotChannel(message.channel),
        mentions: message.mentions ? {
            users: collectionValues(message.mentions.users).map((user) => snapshotUser(user)),
            roles: collectionValues(message.mentions.roles).map((role) => ({ id: role.id, name: role.name })),
            channels: collectionValues(message.mentions.channels).map((channel) => snapshotChannel(channel)),
            everyone: message.mentions.everyone
        } : null,
        attachments: message.attachments
            ? collectionValues(message.attachments).map((attachment) => ({
                id: attachment.id,
                name: attachment.name,
                contentType: attachment.contentType || null,
                size: attachment.size,
                url: attachment.url,
                proxyUrl: attachment.proxyURL || null,
                width: attachment.width || null,
                height: attachment.height || null
            }))
            : [],
        embeds: collectionValues(message.embeds).map((embed) => embed.toJSON()),
        reference: message.reference ? {
            messageId: message.reference.messageId || null,
            channelId: message.reference.channelId || null,
            guildId: message.reference.guildId || null
        } : null
    };
}

function logMessageDelete(message, database) {
    const guild = getMessageGuild(message);
    if (!guild || (message.author && message.author.bot)) return;

    return sendModerationLog(guild, database, {
        title: "Message deleted",
        description: "A message was deleted.",
        color: 0xE74C3C,
        fields: [
            { name: "Author", value: getMessageAuthor(message), inline: true },
            { name: "Channel", value: message.channelId ? `<#${message.channelId}>` : "Unavailable", inline: true },
            { name: "Message ID", value: message.id, inline: true },
            { name: "Content", value: getMessageContent(message) }
        ],
        eventType: "message.delete",
        channelId: message.channelId,
        details: { target: snapshotUser(message.author), channel: snapshotChannel(message.channel), message: snapshotMessage(message) }
    });
}

async function logMessageUpdate(oldMessage, newMessage, database) {
    if (newMessage.partial) {
        try {
            newMessage = await newMessage.fetch();
        } catch (error) {
            console.warn(`Could not fetch updated message ${newMessage.id} for moderator logging:`, error);
        }
    }

    const guild = getMessageGuild(newMessage, oldMessage);
    const author = newMessage.author || oldMessage.author;
    if (!guild || (author && author.bot)) return;

    return sendModerationLog(guild, database, {
        title: "Message updated",
        description: "A message was edited.",
        color: 0xF1C40F,
        fields: [
            { name: "Author", value: getMessageAuthor(newMessage.author ? newMessage : oldMessage), inline: true },
            { name: "Channel", value: newMessage.channelId ? `<#${newMessage.channelId}>` : "Unavailable", inline: true },
            { name: "Message ID", value: newMessage.id, inline: true },
            { name: "Before", value: getMessageContent(oldMessage) },
            { name: "After", value: getMessageContent(newMessage) }
        ],
        eventType: "message.update",
        channelId: newMessage.channelId,
        details: {
            target: snapshotUser(author),
            channel: snapshotChannel(newMessage.channel || oldMessage.channel),
            before: snapshotMessage(oldMessage),
            after: snapshotMessage(newMessage)
        }
    });
}

function logVoiceStateUpdate(oldState, newState, database) {
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    if (oldChannelId === newChannelId) return;

    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!guild || !member || !member.user) return;

    const user = `<@${member.id}> (${member.user.tag})`;
    let title;
    let description;
    let color;
    const fields = [{ name: "User", value: user, inline: true }];

    if (!oldChannelId) {
        title = "Joined voice channel";
        description = `${user} joined <#${newChannelId}>.`;
        color = 0x2ECC71;
        fields.push({ name: "Channel", value: `<#${newChannelId}>`, inline: true });
    } else if (!newChannelId) {
        title = "Left voice channel";
        description = `${user} left <#${oldChannelId}>.`;
        color = 0xE74C3C;
        fields.push({ name: "Channel", value: `<#${oldChannelId}>`, inline: true });
    } else {
        title = "Changed voice channel";
        description = `${user} moved to a different voice channel.`;
        color = 0xF1C40F;
        fields.push(
            { name: "From", value: `<#${oldChannelId}>`, inline: true },
            { name: "To", value: `<#${newChannelId}>`, inline: true }
        );
    }

    return sendModerationLog(guild, database, {
        title,
        description,
        color,
        fields,
        eventType: !oldChannelId ? "voice.join" : !newChannelId ? "voice.leave" : "voice.move",
        channelId: newChannelId || oldChannelId,
        details: {
            target: snapshotMember(member),
            from: oldChannelId ? { id: oldChannelId, name: oldState.channel && oldState.channel.name } : null,
            to: newChannelId ? { id: newChannelId, name: newState.channel && newState.channel.name } : null,
            voiceState: {
                serverMute: newState.serverMute,
                serverDeaf: newState.serverDeaf,
                selfMute: newState.selfMute,
                selfDeaf: newState.selfDeaf,
                streaming: newState.streaming,
                selfVideo: newState.selfVideo,
                suppress: newState.suppress,
                sessionId: newState.sessionId || null
            }
        }
    });
}

module.exports = {
    sendModerationLog,
    logInteraction,
    logMemberJoin,
    logMemberLeave,
    logMemberUpdate,
    logMessageDelete,
    logMessageUpdate,
    logVoiceStateUpdate,
    snapshotUser,
    snapshotMember,
    snapshotChannel,
    snapshotMessage
};
