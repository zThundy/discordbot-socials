const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags,
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require("discord.js");

const internalId = "d18ace6d61530a704a55";
const pageSize = 25;
const rolePickerSessions = new Map();

function build() {
    const command = new SlashCommandBuilder();
    command.setName("syncserver");
    command.setDescription("Synchronize roles between two Discord servers");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName("action")
            .setDescription("Choose an action")
            .setRequired(false)
            .addChoices(
                { name: "Add role sync", value: "add" },
                { name: "List synced roles", value: "list" },
                { name: "Remove role sync", value: "remove" }
            );
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

function buildServerIdsModal() {
    const firstGuildId = new TextInputBuilder()
        .setCustomId("sync-guild-one")
        .setStyle(TextInputStyle.Short)
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true);
    const secondGuildId = new TextInputBuilder()
        .setCustomId("sync-guild-two")
        .setStyle(TextInputStyle.Short)
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true);

    return new ModalBuilder()
        .setCustomId(`serverids;${internalId}`)
        .setTitle("Choose the Discord servers")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("First Discord server ID")
                .setTextInputComponent(firstGuildId),
            new LabelBuilder()
                .setLabel("Second Discord server ID")
                .setTextInputComponent(secondGuildId)
        );
}

async function execute(interaction, database, client) {
    const action = interaction.options.getString("action");
    if (!action || action === "add") {
        interaction.showModal(buildServerIdsModal())
            .catch((error) => reportError(interaction, error, "open server setup"));
        return;
    }

    if (action === "list" || action === "remove") {
        showSyncMappings(interaction, database, client, action)
            .catch((error) => reportError(interaction, error, action));
    }
}

async function showSyncMappings(interaction, database, client, action) {
    const mappings = await database.getSyncRoleMappingsForGuild(interaction.guild.id);
    if (mappings.length === 0) {
        await interaction.reply({
            content: "There are no synchronized roles involving this server.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.reply({
        content: mappingPrompt(action, 0, mappings.length),
        components: buildMappingComponents(action, mappings, 0, interaction.user.id, client),
        flags: MessageFlags.Ephemeral
    });
}

function mappingPrompt(action, page, total) {
    const actionLabel = action === "list" ? "view" : "remove";
    return `Select a role pair to ${actionLabel} (page ${page + 1} of ${Math.ceil(total / pageSize)}).`;
}

function buildMappingComponents(action, mappings, page, userId, client) {
    const start = page * pageSize;
    const options = mappings.slice(start, start + pageSize).map((mapping) => ({
        label: truncate(mappingLabel(mapping, client), 100),
        value: mappingValue(mapping),
        description: truncate(`${mapping.guildId} ↔ ${mapping.otherGuildId}`, 100)
    }));
    const select = new StringSelectMenuBuilder()
        .setCustomId(`${action === "list" ? "listsync" : "removesync"};${internalId};${userId}`)
        .setPlaceholder(action === "list" ? "Select a role pair to view" : "Select a role pair to remove")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options);
    const rows = [new ActionRowBuilder().addComponents(select)];
    const pageCount = Math.ceil(mappings.length / pageSize);

    if (pageCount > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`syncpage;${internalId};${action};${page - 1};${userId}`)
                .setLabel("Previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`syncpage;${internalId};${action};${page + 1};${userId}`)
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= pageCount - 1)
        ));
    }

    return rows;
}

function mappingValue(mapping) {
    return [mapping.guildId, mapping.roleId, mapping.otherGuildId, mapping.otherRoleId].join(":");
}

function parseMappingValue(value) {
    const [guildId, roleId, otherGuildId, otherRoleId] = value.split(":");
    if (!guildId || !roleId || !otherGuildId || !otherRoleId) return null;
    return { guildId, roleId, otherGuildId, otherRoleId };
}

function mappingLabel(mapping, client) {
    const firstGuild = client.guilds.cache.get(mapping.guildId);
    const secondGuild = client.guilds.cache.get(mapping.otherGuildId);
    const firstRole = firstGuild?.roles.cache.get(mapping.roleId);
    const secondRole = secondGuild?.roles.cache.get(mapping.otherRoleId);
    return `${firstGuild?.name || mapping.guildId}: ${firstRole?.name || mapping.roleId} ↔ ${secondGuild?.name || mapping.otherGuildId}: ${secondRole?.name || mapping.otherRoleId}`;
}

function truncate(value, maxLength) {
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
}

function reportError(interaction, error, operation) {
    console.error(`Syncserver ${operation} failed`, error);
    const response = {
        content: "An error occurred while processing the syncserver request. Check the bot logs and try again.",
        flags: MessageFlags.Ephemeral
    };
    const reply = interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    reply.catch((replyError) => console.error("Failed to report syncserver error", replyError));
}

function interaction(interaction, database, client) {
    const [action, commandId, ...args] = interaction.customId.split(";");
    if (commandId !== internalId) return;

    let task;
    switch (action) {
        case "serverids":
            task = submitServerIds(interaction, client);
            break;
        case "openroles":
            task = openRoleSelection(interaction, client, args[0], args[1], args[2]);
            break;
        case "syncrolepick":
            task = selectPagedRole(interaction, args[0], args[1]);
            break;
        case "syncrolepage":
            task = changeRolePage(interaction, args[0], args[1], args[2]);
            break;
        case "syncroleconfirm":
            task = confirmPagedRoles(interaction, database, client, args[0]);
            break;
        case "roles":
            task = submitRoleSelection(interaction, database, client, args[0], args[1], args[2]);
            break;
        case "syncpage":
            task = changeMappingPage(interaction, database, client, args[0], Number(args[1]), args[2]);
            break;
        case "listsync":
        case "removesync":
            task = selectSyncMapping(interaction, database, client, action, args[0]);
            break;
        default:
            return;
    }

    task.catch((error) => reportError(interaction, error, action));
}

async function submitServerIds(interaction, client) {
    const firstGuildId = interaction.fields.getTextInputValue("sync-guild-one").trim();
    const secondGuildId = interaction.fields.getTextInputValue("sync-guild-two").trim();
    if (!/^\d{17,20}$/.test(firstGuildId) || !/^\d{17,20}$/.test(secondGuildId)) {
        await interaction.reply({
            content: "Enter valid Discord server IDs (17 to 20 digits).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (firstGuildId === secondGuildId) {
        await interaction.reply({
            content: "The two server IDs must be different.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const firstGuild = client.guilds.cache.get(firstGuildId);
    const secondGuild = client.guilds.cache.get(secondGuildId);
    if (!firstGuild || !secondGuild) {
        await interaction.reply({
            content: "The bot must be a member of both servers. Check the IDs and try again.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const [firstAdmin, secondAdmin] = await Promise.all([
        fetchGuildMember(firstGuild, interaction.user.id),
        fetchGuildMember(secondGuild, interaction.user.id)
    ]);
    const administrator = PermissionsBitField.Flags.Administrator;
    if (!firstAdmin?.permissions.has(administrator) || !secondAdmin?.permissions.has(administrator)) {
        await interaction.reply({
            content: "You must be a member and administrator in both servers to configure role synchronization.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const button = new ButtonBuilder()
        .setCustomId(`openroles;${internalId};${firstGuild.id};${secondGuild.id};${interaction.user.id}`)
        .setLabel("Choose roles")
        .setStyle(ButtonStyle.Primary);
    await interaction.reply({
        content: `Verified both servers: **${firstGuild.name}** and **${secondGuild.name}**. Click below to choose the roles.`,
        components: [new ActionRowBuilder().addComponents(button)],
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral
    });
}

async function openRoleSelection(interaction, client, firstGuildId, secondGuildId, ownerId) {
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: "Only the administrator who started this setup can continue.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const firstGuild = client.guilds.cache.get(firstGuildId);
    const secondGuild = client.guilds.cache.get(secondGuildId);
    if (!firstGuild || !secondGuild || firstGuild.id === secondGuild.id) {
        await interaction.reply({
            content: "The bot is no longer in both servers. Run /syncserver again with valid, different server IDs.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const [firstRoles, secondRoles, firstBotMember, secondBotMember] = await Promise.all([
        firstGuild.roles.fetch(),
        secondGuild.roles.fetch(),
        firstGuild.members.fetchMe(),
        secondGuild.members.fetchMe()
    ]);
    const manageRoles = PermissionsBitField.Flags.ManageRoles;
    if (!firstBotMember.permissions.has(manageRoles) || !secondBotMember.permissions.has(manageRoles)) {
        await interaction.reply({
            content: "The bot needs the Manage Roles permission in both servers.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const firstAssignableRoles = getAssignableRoles(firstGuild, firstRoles, firstBotMember);
    const secondAssignableRoles = getAssignableRoles(secondGuild, secondRoles, secondBotMember);
    if (firstAssignableRoles.length === 0 || secondAssignableRoles.length === 0) {
        await interaction.reply({
            content: "The bot must have at least one assignable role in each server. Move its highest role above the roles you want to synchronize.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (firstAssignableRoles.length > pageSize || secondAssignableRoles.length > pageSize) {
        const sessionId = createRolePickerSession(
            interaction.user.id,
            firstGuild,
            secondGuild,
            firstAssignableRoles,
            secondAssignableRoles
        );
        await interaction.reply({
            content: `Discord limits each modal selector to ${pageSize} options, so this setup uses paged selectors to include all assignable roles in **${firstGuild.name}** and **${secondGuild.name}**.`,
            components: buildPagedRoleComponents(sessionId, rolePickerSessions.get(sessionId)),
            allowedMentions: { parse: [] },
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`roles;${internalId};${firstGuild.id};${secondGuild.id};${ownerId}`)
        .setTitle("Choose the roles to synchronize")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel(truncate(`Role in ${firstGuild.name}`, 45))
                .setStringSelectMenuComponent(buildRoleSelect("sync-role-one", firstAssignableRoles)),
            new LabelBuilder()
                .setLabel(truncate(`Role in ${secondGuild.name}`, 45))
                .setStringSelectMenuComponent(buildRoleSelect("sync-role-two", secondAssignableRoles))
        );
    await interaction.showModal(modal);
}

function getAssignableRoles(guild, roles, botMember) {
    return [...roles.values()]
        .filter((role) =>
            role.id !== guild.id &&
            !role.managed &&
            botMember.roles.highest.comparePositionTo(role) > 0
        )
        .sort((first, second) => second.position - first.position);
}

function buildRoleSelect(customId, roles) {
    return new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder("Select one role")
        .setRequired(true)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(roles.map((role) => ({
            label: truncate(role.name, 100),
            value: role.id,
            description: `Role ID: ${role.id}`
        })));
}

function createRolePickerSession(ownerId, firstGuild, secondGuild, firstRoles, secondRoles) {
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const session = {
        ownerId,
        firstGuildId: firstGuild.id,
        secondGuildId: secondGuild.id,
        firstGuildName: firstGuild.name,
        secondGuildName: secondGuild.name,
        firstRoles,
        secondRoles,
        firstPage: 0,
        secondPage: 0,
        firstRoleId: null,
        secondRoleId: null
    };
    rolePickerSessions.set(sessionId, session);
    const timeout = setTimeout(() => rolePickerSessions.delete(sessionId), 15 * 60 * 1000);
    timeout.unref();
    return sessionId;
}

function buildPagedRoleComponents(sessionId, session) {
    const firstPageCount = Math.ceil(session.firstRoles.length / pageSize);
    const secondPageCount = Math.ceil(session.secondRoles.length / pageSize);
    const firstOptions = session.firstRoles
        .slice(session.firstPage * pageSize, (session.firstPage + 1) * pageSize)
        .map((role) => ({
            label: truncate(role.name, 100),
            value: role.id,
            description: `Role ID: ${role.id}`,
            default: role.id === session.firstRoleId
        }));
    const secondOptions = session.secondRoles
        .slice(session.secondPage * pageSize, (session.secondPage + 1) * pageSize)
        .map((role) => ({
            label: truncate(role.name, 100),
            value: role.id,
            description: `Role ID: ${role.id}`,
            default: role.id === session.secondRoleId
        }));
    const rows = [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`syncrolepick;${internalId};${sessionId};first`)
                .setPlaceholder(`Role in ${truncate(session.firstGuildName, 70)} (${session.firstPage + 1}/${firstPageCount})`)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(firstOptions)
        ),
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`syncrolepick;${internalId};${sessionId};second`)
                .setPlaceholder(`Role in ${truncate(session.secondGuildName, 70)} (${session.secondPage + 1}/${secondPageCount})`)
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(secondOptions)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`syncrolepage;${internalId};${sessionId};first;previous`)
                .setLabel("Server 1 previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(session.firstPage === 0),
            new ButtonBuilder()
                .setCustomId(`syncrolepage;${internalId};${sessionId};first;next`)
                .setLabel("Server 1 next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(session.firstPage >= firstPageCount - 1),
            new ButtonBuilder()
                .setCustomId(`syncrolepage;${internalId};${sessionId};second;previous`)
                .setLabel("Server 2 previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(session.secondPage === 0),
            new ButtonBuilder()
                .setCustomId(`syncrolepage;${internalId};${sessionId};second;next`)
                .setLabel("Server 2 next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(session.secondPage >= secondPageCount - 1)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`syncroleconfirm;${internalId};${sessionId}`)
                .setLabel("Save role pair")
                .setStyle(ButtonStyle.Success)
                .setDisabled(!session.firstRoleId || !session.secondRoleId)
        )
    ];
    return rows;
}

async function getRolePickerSession(interaction, sessionId) {
    const session = rolePickerSessions.get(sessionId);
    if (!session) {
        await interaction.reply({
            content: "This role selection has expired. Run /syncserver again.",
            flags: MessageFlags.Ephemeral
        });
        return null;
    }
    if (interaction.user.id !== session.ownerId) {
        await interaction.reply({
            content: "Only the administrator who started this setup can continue.",
            flags: MessageFlags.Ephemeral
        });
        return null;
    }
    return session;
}

async function selectPagedRole(interaction, sessionId, side) {
    const session = await getRolePickerSession(interaction, sessionId);
    if (!session) return;
    if (side === "first") {
        if (!session.firstRoles.some((role) => role.id === interaction.values[0])) {
            await interaction.reply({ content: "Invalid role selection.", flags: MessageFlags.Ephemeral });
            return;
        }
        session.firstRoleId = interaction.values[0];
    } else if (side === "second") {
        if (!session.secondRoles.some((role) => role.id === interaction.values[0])) {
            await interaction.reply({ content: "Invalid role selection.", flags: MessageFlags.Ephemeral });
            return;
        }
        session.secondRoleId = interaction.values[0];
    } else {
        await interaction.reply({ content: "Invalid role selection.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.update({
        content: "Choose one role from each server, then save the pair.",
        components: buildPagedRoleComponents(sessionId, session)
    });
}

async function changeRolePage(interaction, sessionId, side, direction) {
    const session = await getRolePickerSession(interaction, sessionId);
    if (!session) return;
    const pageKey = side === "first" ? "firstPage" : side === "second" ? "secondPage" : null;
    const roles = side === "first" ? session.firstRoles : side === "second" ? session.secondRoles : null;
    if (!pageKey || !roles) {
        await interaction.reply({ content: "Invalid role page.", flags: MessageFlags.Ephemeral });
        return;
    }

    const lastPage = Math.ceil(roles.length / pageSize) - 1;
    const offset = direction === "previous" ? -1 : direction === "next" ? 1 : 0;
    session[pageKey] = Math.min(Math.max(session[pageKey] + offset, 0), lastPage);
    await interaction.update({
        content: "Choose one role from each server, then save the pair.",
        components: buildPagedRoleComponents(sessionId, session)
    });
}

async function confirmPagedRoles(interaction, database, client, sessionId) {
    const session = await getRolePickerSession(interaction, sessionId);
    if (!session) return;
    if (!session.firstRoleId || !session.secondRoleId) {
        await interaction.reply({
            content: "Choose one role from each server before saving.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const result = await saveRoleMapping(
        database,
        client,
        session.firstGuildId,
        session.firstRoleId,
        session.secondGuildId,
        session.secondRoleId,
        session.ownerId
    );
    if (result.ok) rolePickerSessions.delete(sessionId);
    await interaction.update({
        content: result.message,
        allowedMentions: { parse: [] },
        components: result.ok ? [] : buildPagedRoleComponents(sessionId, session)
    });
}

async function saveRoleMapping(database, client, firstGuildId, firstRoleId, secondGuildId, secondRoleId, ownerId) {
    const firstGuild = client.guilds.cache.get(firstGuildId);
    const secondGuild = client.guilds.cache.get(secondGuildId);
    const firstRole = firstGuild?.roles.cache.get(firstRoleId);
    const secondRole = secondGuild?.roles.cache.get(secondRoleId);
    if (!firstGuild || !secondGuild || firstGuild.id === secondGuild.id || !firstRole || !secondRole) {
        return { ok: false, message: "One of the selected servers or roles is no longer available. Run /syncserver again." };
    }

    const [firstAdmin, secondAdmin, firstBotMember, secondBotMember] = await Promise.all([
        fetchGuildMember(firstGuild, ownerId),
        fetchGuildMember(secondGuild, ownerId),
        firstGuild.members.fetchMe(),
        secondGuild.members.fetchMe()
    ]);
    const administrator = PermissionsBitField.Flags.Administrator;
    if (!firstAdmin?.permissions.has(administrator) || !secondAdmin?.permissions.has(administrator)) {
        return { ok: false, message: "You must be an administrator in both servers to configure role synchronization." };
    }
    const manageRoles = PermissionsBitField.Flags.ManageRoles;
    const canManageFirst = firstBotMember.permissions.has(manageRoles) &&
        !firstRole.managed &&
        firstBotMember.roles.highest.comparePositionTo(firstRole) > 0;
    const canManageSecond = secondBotMember.permissions.has(manageRoles) &&
        !secondRole.managed &&
        secondBotMember.roles.highest.comparePositionTo(secondRole) > 0;
    if (!canManageFirst || !canManageSecond) {
        return { ok: false, message: "The bot must have Manage Roles permission and a higher role than both selected roles." };
    }

    const mappings = await database.getSyncRoleMappingsForGuild(firstGuild.id);
    const roleAlreadyMapped = mappings.some((mapping) => {
        if (mapping.guildId === firstGuild.id && mapping.otherGuildId === secondGuild.id) {
            return mapping.roleId === firstRole.id || mapping.otherRoleId === secondRole.id;
        }
        if (mapping.guildId === secondGuild.id && mapping.otherGuildId === firstGuild.id) {
            return mapping.otherRoleId === firstRole.id || mapping.roleId === secondRole.id;
        }
        return false;
    });
    if (roleAlreadyMapped) {
        return { ok: false, message: "One of these roles is already synchronized with another role between these servers." };
    }

    await database.addSyncRole(firstGuild.id, firstRole.id, secondGuild.id, secondRole.id);
    return {
        ok: true,
        message: `Added bidirectional synchronization: **${firstGuild.name} / ${firstRole.name}** ↔ **${secondGuild.name} / ${secondRole.name}**.`
    };
}

async function submitRoleSelection(interaction, database, client, firstGuildId, secondGuildId, ownerId) {
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: "Only the administrator who started this setup can continue.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const firstRoleId = interaction.fields.getStringSelectValues("sync-role-one")[0];
    const secondRoleId = interaction.fields.getStringSelectValues("sync-role-two")[0];
    const result = await saveRoleMapping(
        database,
        client,
        firstGuildId,
        firstRoleId,
        secondGuildId,
        secondRoleId,
        ownerId
    );
    await interaction.reply({
        content: result.message,
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral
    });
}

async function changeMappingPage(interaction, database, client, action, page, ownerId) {
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: "Only the administrator who opened this list can use it.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const mappings = await database.getSyncRoleMappingsForGuild(interaction.guild.id);
    if (mappings.length === 0) {
        await interaction.update({
            content: "There are no synchronized roles involving this server.",
            components: []
        });
        return;
    }

    const lastPage = Math.ceil(mappings.length / pageSize) - 1;
    const requestedPage = Number.isInteger(page) ? page : 0;
    const currentPage = Math.min(Math.max(requestedPage, 0), lastPage);
    await interaction.update({
        content: mappingPrompt(action, currentPage, mappings.length),
        components: buildMappingComponents(action, mappings, currentPage, ownerId, client)
    });
}

async function selectSyncMapping(interaction, database, client, action, ownerId) {
    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: "Only the administrator who opened this list can use it.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const selected = parseMappingValue(interaction.values[0]);
    if (!selected) {
        await interaction.reply({ content: "Invalid role pair selection.", flags: MessageFlags.Ephemeral });
        return;
    }
    const mappings = await database.getSyncRoleMappingsForGuild(interaction.guild.id);
    const mapping = mappings.find((entry) => mappingValue(entry) === mappingValue(selected));
    if (!mapping) {
        await interaction.reply({
            content: "This role pair is no longer synchronized.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const details = mappingLabel(mapping, client);
    if (action === "listsync") {
        await interaction.reply({
            content: `Synchronized roles: ${details}`,
            allowedMentions: { parse: [] },
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await database.deleteSyncRole(mapping.guildId, mapping.roleId, mapping.otherGuildId, mapping.otherRoleId);
    await interaction.update({
        content: `Removed synchronization: ${details}`,
        allowedMentions: { parse: [] },
        components: []
    });
}

function roleMappingSides(mapping, currentGuildId) {
    if (mapping.guildId === currentGuildId) {
        return {
            currentRoleId: mapping.roleId,
            otherGuildId: mapping.otherGuildId,
            otherRoleId: mapping.otherRoleId
        };
    }
    return {
        currentRoleId: mapping.otherRoleId,
        otherGuildId: mapping.guildId,
        otherRoleId: mapping.roleId
    };
}

async function fetchOtherMember(guild, userId) {
    try {
        return await guild.members.fetch(userId);
    } catch (error) {
        if (error.code === 10007) return null;
        throw error;
    }
}

async function fetchGuildMember(guild, userId) {
    try {
        return await guild.members.fetch(userId);
    } catch (error) {
        if (error.code === 10007) return null;
        throw error;
    }
}

async function userUpdate(oldUser, newUser, extra) {
    let mappings;
    try {
        mappings = await extra.database.getSyncRoleMappingsForGuild(newUser.guild.id);
    } catch (error) {
        console.error("Failed to load synchronized roles", error);
        return;
    }

    for (const mapping of mappings) {
        const sides = roleMappingSides(mapping, newUser.guild.id);
        const hadRole = oldUser.roles.cache.has(sides.currentRoleId);
        const hasRole = newUser.roles.cache.has(sides.currentRoleId);
        if (hadRole === hasRole) continue;

        try {
            const otherGuild = extra.client.guilds.cache.get(sides.otherGuildId);
            if (!otherGuild || !otherGuild.roles.cache.has(sides.otherRoleId)) {
                console.error(`Synchronized role ${sides.otherRoleId} is unavailable in server ${sides.otherGuildId}`);
                continue;
            }
            const otherMember = await fetchOtherMember(otherGuild, newUser.id);
            if (!otherMember) continue;

            const otherHasRole = otherMember.roles.cache.has(sides.otherRoleId);
            if (hasRole && !otherHasRole) {
                await otherMember.roles.add(sides.otherRoleId, "Synchronized role pair");
            } else if (!hasRole && otherHasRole) {
                await otherMember.roles.remove(sides.otherRoleId, "Synchronized role pair");
            }
        } catch (error) {
            console.error("Failed to synchronize role update", error);
        }
    }
}

async function userJoin(member, extra) {
    let mappings;
    try {
        mappings = await extra.database.getSyncRoleMappingsForGuild(member.guild.id);
    } catch (error) {
        console.error("Failed to load synchronized roles for joining member", error);
        return;
    }

    for (const mapping of mappings) {
        const sides = roleMappingSides(mapping, member.guild.id);
        try {
            const otherGuild = extra.client.guilds.cache.get(sides.otherGuildId);
            if (!otherGuild || !otherGuild.roles.cache.has(sides.otherRoleId)) continue;
            const otherMember = await fetchOtherMember(otherGuild, member.id);
            if (!otherMember) continue;

            const memberHasRole = member.roles.cache.has(sides.currentRoleId);
            const otherHasRole = otherMember.roles.cache.has(sides.otherRoleId);
            if (memberHasRole && !otherHasRole) {
                await otherMember.roles.add(sides.otherRoleId, "Synchronized role pair");
            } else if (!memberHasRole && otherHasRole) {
                await member.roles.add(sides.currentRoleId, "Synchronized role pair");
            }
        } catch (error) {
            console.error("Failed to synchronize role for joining member", error);
        }
    }
}

module.exports = {
    build,
    userUpdate,
    userJoin,
    execute,
    interaction
};
