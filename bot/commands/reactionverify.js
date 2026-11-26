const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { randomBytes } = require("crypto");
const { RoleSelect } = require("./elements/roleselect.js");

const internalId = "d1f6c093e1ab4a019cd8";
const setupSessions = new Map();
const MESSAGE_ID_PATTERN = /^\d{17,20}$/;
const CUSTOM_EMOJI_PATTERN = /^<a?:[a-zA-Z0-9_]+:(\d+)>$/;

function build() {
    const command = new SlashCommandBuilder();
    command.setName("reactionverify");
    command.setDescription("Configure role verification with a reaction on a message");
    command.setDMPermission(false);
    command.addStringOption(option => option
        .setName("message_id")
        .setDescription("ID of a message in the current channel")
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true));
    command.addStringOption(option => option
        .setName("emoji")
        .setDescription("Emoji users must add to receive the role")
        .setMaxLength(100)
        .setRequired(true));
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    command.interaction = handleRoleSelection;
    command.reactionAdd = handleReactionAdd;
    return command;
}

async function execute(interaction) {
    const guild = interaction.guild;
    const messageId = interaction.options.getString("message_id", true).trim();
    const rawEmoji = interaction.options.getString("emoji", true).trim();

    if (!MESSAGE_ID_PATTERN.test(messageId)) {
        return interaction.reply({ content: "Enter a valid Discord message ID.", flags: MessageFlags.Ephemeral });
    }
    if (!rawEmoji) {
        return interaction.reply({ content: "Enter an emoji to use for verification.", flags: MessageFlags.Ephemeral });
    }

    let message;
    try {
        message = await interaction.channel.messages.fetch(messageId);
    } catch (error) {
        console.error("Could not fetch the reaction verification message:", error);
        return interaction.reply({
            content: "I couldn't find that message in this channel, or I don't have permission to read it.",
            flags: MessageFlags.Ephemeral
        });
    }

    if (!message.guildId || message.guildId !== guild.id) {
        return interaction.reply({ content: "The message must belong to this server.", flags: MessageFlags.Ephemeral });
    }

    const customEmoji = CUSTOM_EMOJI_PATTERN.exec(rawEmoji);
    const emojiIdentifier = customEmoji ? customEmoji[1] : rawEmoji;
    const emojiToReact = customEmoji ? customEmoji[1] : rawEmoji;
    const token = randomBytes(8).toString("hex");
    const now = Date.now();
    for (const [sessionToken, session] of setupSessions) {
        if (session.expiresAt <= now) setupSessions.delete(sessionToken);
    }

    setupSessions.set(token, {
        creatorId: interaction.user.id,
        guildId: guild.id,
        channelId: interaction.channelId,
        messageId,
        emojiIdentifier,
        emojiToReact,
        expiresAt: now + 10 * 60 * 1000
    });

    const roleSelect = new RoleSelect()
        .setCustomId(`reactionverify_role;${internalId};${token}`)
        .setPlaceholder("Select the role to grant")
        .setMinValues(1)
        .setMaxValues(1)
        .build();

    return interaction.reply({
        content: `Select the role to grant when a user reacts with ${rawEmoji} to message \`${messageId}\`.`,
        components: [roleSelect],
        flags: MessageFlags.Ephemeral
    });
}

async function handleRoleSelection(interaction, database) {
    if (!interaction.customId.startsWith("reactionverify_role;")) return;

    const token = interaction.customId.split(";")[2];
    const session = setupSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        setupSessions.delete(token);
        return interaction.update({ content: "This setup expired. Run `/reactionverify` again.", components: [] });
    }
    if (session.creatorId !== interaction.user.id || session.guildId !== interaction.guildId) {
        return interaction.reply({ content: "Only the administrator who started this setup can finish it.", flags: MessageFlags.Ephemeral });
    }
    setupSessions.delete(token);

    const role = interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role || role.id === interaction.guild.id || role.managed) {
        return interaction.update({ content: "Choose a valid, assignable server role.", components: [] });
    }
    const botMember = interaction.guild.members.me;
    if (botMember && !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.update({
            content: "I need the **Manage Roles** permission to grant verification roles.",
            components: []
        });
    }
    if (botMember && botMember.roles.highest.comparePositionTo(role) <= 0) {
        return interaction.update({
            content: "I can't assign that role. Move my highest role above it, then run `/reactionverify` again.",
            components: []
        });
    }

    const { guildId, channelId, messageId, emojiIdentifier, emojiToReact } = session;
    let message;
    try {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || !channel.messages) {
            return interaction.update({ content: "The target channel is no longer available.", components: [] });
        }
        message = await channel.messages.fetch(messageId);
    } catch (error) {
        console.error("Could not refetch the reaction verification message:", error);
        return interaction.update({
            content: "I couldn't access the target message. Check my channel permissions and try again.",
            components: []
        });
    }

    try {
        const existing = await database.getReactionVerification(guildId, messageId, emojiIdentifier);
        if (existing) {
            return interaction.update({
                content: "This message and emoji already have a verification role configured.",
                components: []
            });
        }

        await database.createReactionVerification({
            guildId,
            channelId,
            messageId,
            emojiIdentifier,
            roleId: role.id,
            createdBy: interaction.user.id
        });
    } catch (error) {
        console.error("Could not save reaction verification:", error);
        return interaction.update({ content: "I couldn't save this verification configuration.", components: [] });
    }

    try {
        await message.react(emojiToReact);
    } catch (error) {
        console.error("Could not add the verification reaction:", error);
        try {
            await database.deleteReactionVerification(guildId, messageId, emojiIdentifier);
        } catch (deleteError) {
            console.error("Could not roll back reaction verification configuration:", deleteError);
        }
        return interaction.update({
            content: "I couldn't add that emoji to the message. Check that the emoji is valid and that I have permission to add reactions.",
            components: []
        });
    }

    return interaction.update({
        content: `Reaction verification configured. I added ${emojiToReact} to message \`${messageId}\`; reacting with it grants <@&${role.id}>.`,
        components: []
    });
}

async function handleReactionAdd(reaction, user, { database }) {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();
        const message = reaction.message;
        if (message.partial) await message.fetch();
        if (!message.guildId) return;

        const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;
        const verification = await database.getReactionVerification(
            message.guildId,
            message.id,
            emojiIdentifier
        );
        if (!verification) return;

        const member = await message.guild.members.fetch(user.id);
        const role = message.guild.roles.cache.get(verification.roleId)
            || await message.guild.roles.fetch(verification.roleId);
        if (!role || role.managed) {
            console.error(`Reaction verification role ${verification.roleId} is unavailable or managed.`);
            return;
        }
        if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, "Reaction verification");
        }
    } catch (error) {
        console.error("Could not assign a role for reaction verification:", error);
    }
}

module.exports = { build, execute, interaction: handleRoleSelection, reactionAdd: handleReactionAdd };
