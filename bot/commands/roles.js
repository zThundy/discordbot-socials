const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { Modal } = require("./elements/modal.js");
const { RoleSelect } = require("./elements/roleSelect.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "28e80869b6a9a1777fdf";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("roles");
    command.setDescription("Start the creation of a role selector");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '⏺ Send', value: 'create' })
            .addChoices({ name: '✅ Create selector', value: 'add' })
            .addChoices({ name: '✏️ Edit selector', value: 'edit' })
            .addChoices({ name: '❌ Delete selector', value: 'cancel' });
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
        case "edit":
            edit(interaction, database);
            break;
    }
}

async function cancel(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const user = interaction.user;

    // get all selectors
    database.getAllRolesAndSelectors(guild.id).then((rows) => {
        const options = [];
        for (var i in rows) {
            var description = rows[i].embed.description;
            if (description.length >= 95) description = description.substring(0, 95) + "...";
            options.push({
                label: rows[i].embed.title,
                value: rows[i].selectorId,
                description,
                emoji: "📌"
            });
        }

        if (options.length == 0) {
            interaction.reply({
                content: "There are no selectors in this server",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const selectMenu = new SelectMenu()
            .setCustomId("deleteroleselector;" + internalId)
            .setPlaceholder("Pick a role selector to delete it")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options)
            .build();

        interaction.reply({
            content: "Select a role selector to delete it",
            components: [selectMenu],
            flags: MessageFlags.Ephemeral
        });
    }).catch((err) => {
        console.error(err);
    });
}

async function add(interaction, database) {
    const guild = interaction.guild;
    // open a modal to collect title and description
    const setupModal = new Modal()
        .addTextComponent({
            type: 'short',
            label: 'Selector title',
            max: 250,
            min: 1,
            placeholder: 'Enter the selector title',
            required: true,
            id: 'roles_setup_title'
        })
        .addTextComponent({
            type: 'paragraph',
            label: 'Selector description',
            max: 1000,
            min: 1,
            placeholder: 'Enter the selector description',
            required: true,
            id: 'roles_setup_description'
        })
        .setTitle('Create role selector')
        .setCustomId('roles_setup_modal;' + internalId)
        .build();

    // show modal directly
    interaction.showModal(setupModal).catch(console.error);
}

async function create(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const user = interaction.user;

    // get all selectors
    database.getAllRolesAndSelectors(guild.id).then((rows) => {
        const options = [];
        for (var i in rows) {
            var description = rows[i].embed.description;
            if (description.length >= 95) description = description.substring(0, 95) + "...";
            options.push({
                label: rows[i].embed.title,
                value: rows[i].selectorId,
                description,
                emoji: "📌"
            });
        }

        if (options.length == 0) {
            interaction.reply({
                content: "There are no selectors in this server",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const selectMenu = new SelectMenu()
            .setCustomId("roleselector;" + internalId)
            .setPlaceholder("Pick a role selector to send in the current channel")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options)
            .build();

        interaction.reply({
            content: "Select a role selector to send in the current channel",
            components: [selectMenu],
            flags: MessageFlags.Ephemeral
        });
    }).catch((err) => {
        console.error(err);
    });
}

async function edit(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const user = interaction.user;

    // get all selectors
    database.getAllRolesAndSelectors(guild.id).then((rows) => {
        const options = [];
        for (var i in rows) {
            var description = rows[i].embed.description;
            if (description.length >= 95) description = description.substring(0, 95) + "...";
            options.push({
                label: rows[i].embed.title,
                value: rows[i].selectorId,
                description,
                emoji: "📌"
            });
        }

        if (options.length == 0) {
            interaction.reply({
                content: "There are no selectors in this server",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const selectMenu = new SelectMenu()
            .setCustomId("editroleselector;" + internalId)
            .setPlaceholder("Pick a role selector to edit")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options)
            .build();

        interaction.reply({
            content: "Select a role selector to edit",
            components: [selectMenu],
            flags: MessageFlags.Ephemeral
        });
    }).catch((err) => {
        console.error(err);
    });
}

// interaction command
async function interaction(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user);

    // get the action to perform
    const action = interaction.customId.split(";")[0];
    switch (action) {
        case "roleselector":
            roleselector(interaction, database);
            break;
        case "roles":
            roles(interaction, database);
            break;
        case "deleteroleselector":
            deleteroleselector(interaction, database);
            break;
        case "editroleselector":
            editroleselector(interaction, database);
            break;
        case 'editroleselector_submit':
            // handled in editroleselector function flow; not used
            break;
        case "roles_setup_modal":
            // modal submitted after asking title/description
            try {
                const guild = interaction.guild;
                const title = interaction.fields.getTextInputValue('roles_setup_title');
                const description = interaction.fields.getTextInputValue('roles_setup_description');
                // create selector id
                const selectorId = Math.random().toString(36).substring(2, 52);
                // build embed object
                const embedObj = {
                    title: title,
                    description: description,
                    color: 0x00FF00,
                    footer: { text: "Made with ❤️ by zThundy__" }
                };
                // persist selector (same function name used previously)
                database.createSelecor(guild.id, selectorId, JSON.stringify(embedObj));

                // present a role select to pick one or more roles to add
                // calculate number of selectable roles in the guild (exclude @everyone)
                let availableRolesCount = guild.roles.cache.filter(r => r.name !== '@everyone').size;
                // Discord select menus cap maxValues at 25
                const maxSelectable = Math.min(Math.max(1, availableRolesCount), 25);

                const roleSelect = new RoleSelect()
                    .setCustomId('roles_add_role;' + internalId + ';' + selectorId)
                    .setPlaceholder('Select role(s) to add to the selector')
                    .setMinValues(1)
                    .setMaxValues(maxSelectable)
                    .build();

                const embed = await database.getEmbedFromSelectorId(guild.id, selectorId);
                await interaction.reply({ embeds: [embed], components: [roleSelect], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Error while creating selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'roles_add_role':
            try {
                const guild = interaction.guild;
                // customId format: roles_add_role;internalId;selectorId
                const selectorId = interaction.customId.split(';')[2];
                const roleIds = interaction.values;
                let interactionMessage = "";
                for (var r in roleIds) {
                    const roleId = roleIds[r];
                    // fetch role to get name
                    const role = await guild.roles.fetch(roleId);
                    if (!role) {
                        interactionMessage += `Role with ID ${roleId} not found in guild.\n`;
                        continue;
                    }
                    // add role to selector in DB
                    await database.addRoleToSelector(guild.id, selectorId, role.id, role.name);
                    interactionMessage += `Role **${role.name}** added to selector.\n`;
                }
                if (interactionMessage) {
                    await interaction.reply({ content: interactionMessage, flags: MessageFlags.Ephemeral });
                }
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Could not add role to selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'roles_edit_modal':
            try {
                const parts = interaction.customId.split(';');
                // customId: roles_edit_modal;internalId;selectorId
                const selectorId = parts[2];
                const guild = interaction.guild;
                const title = interaction.fields.getTextInputValue('roles_edit_title');
                const description = interaction.fields.getTextInputValue('roles_edit_description');

                const embedObj = { title: title, description: description, color: 0x00FF00, footer: { text: 'Made with ❤️ by zThundy__' } };
                await database.updateSelector(guild.id, selectorId, JSON.stringify(embedObj));

                // present role select to pick roles (replace existing)
                let availableRolesCount = guild.roles.cache.filter(r => r.name !== '@everyone').size;
                const maxSelectable = Math.min(Math.max(1, availableRolesCount), 25);

                const roleSelect = new RoleSelect()
                    .setCustomId('roles_edit_roles;' + internalId + ';' + selectorId)
                    .setPlaceholder('Select role(s) to set for this selector (this will replace existing roles)')
                    .setMinValues(1)
                    .setMaxValues(maxSelectable)
                    .build();

                const embed = await database.getEmbedFromSelectorId(guild.id, selectorId);
                await interaction.reply({ embeds: [embed], components: [roleSelect], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Error processing edit modal', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'roles_edit_roles':
            try {
                const parts = interaction.customId.split(';');
                const selectorId = parts[2];
                const guild = interaction.guild;
                const selected = interaction.values || [];
                // replace existing roles
                await database.deleteRolesForSelector(guild.id, selectorId);
                const added = [];
                for (const roleId of selected) {
                    const role = await guild.roles.fetch(roleId);
                    if (!role) continue;
                    await database.addRoleToSelector(guild.id, selectorId, role.id, role.name);
                    added.push(role.name);
                }
                await interaction.reply({ content: `Updated roles for selector. Added: ${added.join(', ')}`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Could not update roles for selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
    }
}

async function roleselector(interaction, database) {
    const guild = interaction.guild;
    const selectorId = interaction.values[0];

    // get the selector and the roles
    database.getRolesFromSelectorId(guild.id, selectorId).then(async (roles) => {
        if (roles.length == 0)
            return interaction.reply({ content: "There has been an error during the creation of this selector\nPlease delete it and create it again.", flags: MessageFlags.Ephemeral });
        const selectors = [{
            label: "No role selected",
            value: "none;" + selectorId,
            description: "Select this to remove all the roles",
            emoji: "❌",
            default: true
        }];
        for (var i in roles) {
            selectors.push({
                label: roles[i].roleName,
                value: roles[i].roleId + ";" + selectorId,
                description: `Select this to get the role ${roles[i].roleName}`,
                emoji: "⏺"
            });
        }

        // create the select menu
        const selectMenu = new SelectMenu()
            .setCustomId("roles;" + internalId)
            .setPlaceholder("Select a role...")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(selectors)
            .build();

        // send the message
        interaction.reply({
            embeds: [await database.getEmbedFromSelectorId(guild.id, selectorId)],
            components: [selectMenu]
        }).catch((err) => {
            console.error(err);
        });
    }).catch((err) => {
        console.error(err);
    });
}

async function editroleselector(interaction, database) {
    const guild = interaction.guild;
    const selectorId = interaction.values[0];
    try {
        const embed = await database.getEmbedFromSelectorId(guild.id, selectorId);

        const editModal = new Modal()
            .addTextComponent({ type: 'short', label: 'Selector title', max: 250, min: 1, placeholder: 'Enter the selector title', required: true, id: 'roles_edit_title', value: embed.title })
            .addTextComponent({ type: 'paragraph', label: 'Selector description', max: 1000, min: 1, placeholder: 'Enter the selector description', required: true, id: 'roles_edit_description', value: embed.description })
            .setTitle('Edit role selector')
            .setCustomId('roles_edit_modal;' + internalId + ';' + selectorId)
            .build();

        await interaction.showModal(editModal);
    } catch (e) {
        console.error(e);
        interaction.reply({ content: 'Could not open edit modal', flags: MessageFlags.Ephemeral }).catch(console.error);
    }
}

async function deleteroleselector(interaction, database) {
    const guild = interaction.guild;
    // get the selector id from the interaction value
    const selectorId = interaction.values[0];
    // defer interaction
    interaction.reply({ content: "Deleting selector...", flags: MessageFlags.Ephemeral }).then(() => {
        database.deleteSelector(guild.id, selectorId).then(() => {
            interaction.editReply({ content: "Selector deleted", components: [], flags: MessageFlags.Ephemeral });
        }).catch(console.error);
    }).catch(console.error);
}

async function roles(interaction, database) {
    const guild = interaction.guild;
    const user = interaction.user;
    console.log(` > Adding role to ${user.username} (${user.id})`);
    // get the role id from the interaction value
    const roleId = interaction.values[0].split(";")[0];
    const selectorId = interaction.values[0].split(";")[1];
    database.checkIfSelectorExists(guild.id, selectorId).then((exists) => {
        if (!exists) {
            interaction.reply({ content: "This selector doesn't exist anymore", flags: MessageFlags.Ephemeral });
            return;
        }

        // fetch the role in the guild
        if (roleId === "none")
            return interaction.reply({ content: "Removing all roles...", flags: MessageFlags.Ephemeral }).then(() => {
                database.getRolesFromSelectorId(guild.id, selectorId).then(async (roles) => {
                    // check if member has already the role
                    for (var i in roles) {
                        if (interaction.member.roles.cache.has(roles[i].roleId)) {
                            // remove all the roles from the selector
                            await interaction.member.roles.remove(roles[i].roleId);
                        }
                    }
                    // for (var i in rows) await interaction.member.roles.remove(rows[i].roleId);
                    interaction.editReply({ content: "All roles removed", flags: MessageFlags.Ephemeral });
                }).catch(console.error);
            }).catch(console.error);

        guild.roles.fetch(roleId).then((role) => {
            database.getRolesFromSelectorId(guild.id, selectorId).then(async (roles) => {
                // check if member has already the role
                for (var i in roles) {
                    if (interaction.member.roles.cache.has(roles[i].roleId)) {
                        // remove all the roles from the selector
                        await interaction.member.roles.remove(roles[i].roleId);
                    }
                }

                interaction.reply({ content: "Adding role...", flags: MessageFlags.Ephemeral }).then(() => {
                    // add the role
                    interaction.member.roles.add(role).catch(console.error);
                    // edit the reply to the interaction
                    interaction.editReply({ content: "Role added", flags: MessageFlags.Ephemeral });
                }).catch(console.error);
            }).catch(console.error);
        }).catch(console.error);
    }).catch(console.error);
}

module.exports = {
    build,
    execute,
    interaction
}
