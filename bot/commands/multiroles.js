const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { Button } = require("./elements/button.js");
const { Modal } = require("./elements/modal.js");
const { RoleSelect } = require("./elements/roleSelect.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "036b6a5a395a245f4440";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("multiroles");
    command.setDescription("Start the creation of a multi role selector");
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
        case 'edit':
            edit(interaction, database);
            break;
        case "cancel":
            cancel(interaction, database);
            break;
    }
}

async function edit(interaction, database) {
    const guild = interaction.guild;
    // get all selectors
    database.getAllMultiRolesAndSelectors(guild.id).then((rows) => {
        const options = [];
        for (var i in rows) {
            var description = rows[i].embed.description;
            if (description.length >= 95) description = description.substring(0, 95) + "...";
            options.push({
                label: rows[i].embed.title,
                value: rows[i].selectorId,
                description,
                emoji: "✏️"
            });
        }

        if (options.length == 0) {
            interaction.reply({ content: "There are no selectors in this server", flags: MessageFlags.Ephemeral });
            return;
        }

        const selectMenu = new SelectMenu()
            .setCustomId("editmultiroleselector;" + internalId)
            .setPlaceholder("Pick a multi-role selector to edit")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(options)
            .build();

        interaction.reply({ content: "Select a selector to edit", components: [selectMenu], flags: MessageFlags.Ephemeral });
    }).catch(console.error);
}

async function cancel(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const user = interaction.user;

    // get all selectors
    database.getAllMultiRolesAndSelectors(guild.id).then((rows) => {
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
            .setCustomId("deletemultiroleselector;" + internalId)
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

    // open a modal to collect title, description and maxChoices
    const setupModal = new Modal()
        .addTextComponent({
            type: 'short',
            label: 'Selector title',
            max: 250,
            min: 1,
            placeholder: 'Enter the selector title',
            required: true,
            id: 'multiroles_setup_title'
        })
        .addTextComponent({
            type: 'paragraph',
            label: 'Selector description',
            max: 1000,
            min: 1,
            placeholder: 'Enter the selector description',
            required: true,
            id: 'multiroles_setup_description'
        })
        .addTextComponent({
            type: 'short',
            label: 'Max choices per user',
            max: 3,
            min: 1,
            placeholder: 'Enter a number (e.g. 2)',
            required: true,
            id: 'multiroles_setup_max'
        })
        .setTitle('Create multi-role selector')
        .setCustomId('multiroles_setup_modal;' + internalId)
        .build();

    interaction.showModal(setupModal).catch(console.error);
}

async function create(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const user = interaction.user;

    // get all selectors
    database.getAllMultiRolesAndSelectors(guild.id).then((rows) => {
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
            .setCustomId("multiroleselector;" + internalId)
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

// interaction command
async function interaction(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user);

    // get the action to perform
    const action = interaction.customId.split(";")[0];
    switch (action) {
        case "multiroleselector":
            multiroleselector(interaction, database);
            break;
        case "multiroles":
            multiroles(interaction, database);
            break;
        case "deletemultiroleselector":
            deletemultiroleselector(interaction, database);
            break;
        case "multirolesbutton":
            multirolesbutton(interaction, database);
            break;
        case "editmultiroleselector":
            // user selected which selector to edit -> open prefilled modal
            try {
                const selectorId = interaction.values[0];
                const guild = interaction.guild;
                const embed = await database.getEmbedFromMultiSelectorId(guild.id, selectorId);
                // fetch current maxChoices as well
                const multi = await database.getMultiRolesFromSelectorId(guild.id, selectorId);

                const editModal = new Modal()
                    .addTextComponent({ type: 'short', label: 'Selector title', max: 250, min: 1, placeholder: 'Enter the selector title', required: true, id: 'multiroles_edit_title', value: embed.title })
                    .addTextComponent({ type: 'paragraph', label: 'Selector description', max: 1000, min: 1, placeholder: 'Enter the selector description', required: true, id: 'multiroles_edit_description', value: embed.description })
                    .addTextComponent({ type: 'short', label: 'Max choices per user', max: 3, min: 1, placeholder: 'Enter a number (e.g. 2)', required: true, id: 'multiroles_edit_max', value: multi.maxChoices })
                    .setTitle('Edit multi-role selector')
                    .setCustomId('multiroles_edit_modal;' + internalId + ';' + selectorId)
                    .build();

                await interaction.showModal(editModal);
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Could not open edit modal', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'multiroles_edit_modal':
            // handled by modal submit handler below
            try {
                const parts = interaction.customId.split(';');
                const selectorId = parts[2];
                const guild = interaction.guild;
                const title = interaction.fields.getTextInputValue('multiroles_edit_title');
                const description = interaction.fields.getTextInputValue('multiroles_edit_description');
                const maxRaw = interaction.fields.getTextInputValue('multiroles_edit_max');
                let maxChoices = parseInt(maxRaw);
                if (isNaN(maxChoices) || maxChoices < 1) maxChoices = 1;
                maxChoices = Math.min(maxChoices, 25);

                const embedObj = { title, description, color: 0x00FF00, footer: { text: 'Made with ❤️ by zThundy__' } };
                await database.updateMultiSelector(guild.id, selectorId, JSON.stringify(embedObj), maxChoices);

                // now present role select to edit roles
                let availableRolesCount = guild.roles.cache.filter(r => r.name !== '@everyone').size;
                const maxSelectable = Math.min(Math.max(1, availableRolesCount), 25);
                const roleSelect = new RoleSelect()
                    .setCustomId('multiroles_edit_roles;' + internalId + ';' + selectorId)
                    .setPlaceholder('Select role(s) to set for this selector (this will replace existing roles)')
                    .setMinValues(1)
                    .setMaxValues(maxSelectable)
                    .build();

                const embed = await database.getEmbedFromMultiSelectorId(guild.id, selectorId);
                await interaction.reply({ embeds: [embed], components: [roleSelect], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Error processing edit modal', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'multiroles_edit_roles':
            try {
                const parts = interaction.customId.split(';');
                const selectorId = parts[2];
                const guild = interaction.guild;
                const selected = interaction.values || [];
                // replace existing roles
                await database.deleteMultiRolesForSelector(guild.id, selectorId);
                const added = [];
                for (const roleId of selected) {
                    const role = await guild.roles.fetch(roleId);
                    if (!role) continue;
                    await database.addMultiRoleToSelector(guild.id, selectorId, role.id, role.name);
                    added.push(role.name);
                }
                await interaction.reply({ content: `Updated roles for selector. Added: ${added.join(', ')}`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Could not update roles for selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "multiroles_setup_modal":
            try {
                const guild = interaction.guild;
                const title = interaction.fields.getTextInputValue('multiroles_setup_title');
                const description = interaction.fields.getTextInputValue('multiroles_setup_description');
                const maxRaw = interaction.fields.getTextInputValue('multiroles_setup_max');
                let maxChoices = parseInt(maxRaw);
                if (isNaN(maxChoices) || maxChoices < 1) maxChoices = 1;
                // cap at 25
                maxChoices = Math.min(maxChoices, 25);

                const selectorId = Math.random().toString(36).substring(2, 52);
                const embedObj = {
                    title: title,
                    description: description,
                    color: 0x00FF00,
                    footer: { text: "Made with ❤️ by zThundy__" }
                };

                // persist selector with maxChoices
                database.createMultiSelecor(guild.id, selectorId, JSON.stringify(embedObj), maxChoices);

                // build role select allowing multiple selection up to available roles in guild
                let availableRolesCount = guild.roles.cache.filter(r => r.name !== '@everyone').size;
                const maxSelectable = Math.min(Math.max(1, availableRolesCount), 25);

                const roleSelect = new RoleSelect()
                    .setCustomId('multiroles_add_roles;' + internalId + ';' + selectorId)
                    .setPlaceholder('Select role(s) to add to the selector')
                    .setMinValues(1)
                    .setMaxValues(maxSelectable)
                    .build();

                const embed = await database.getEmbedFromMultiSelectorId(guild.id, selectorId);
                await interaction.reply({ embeds: [embed], components: [roleSelect], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Error while creating multi-role selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case 'multiroles_add_roles':
            try {
                const guild = interaction.guild;
                const selectorId = interaction.customId.split(';')[2];
                const selected = interaction.values || [];
                const added = [];
                for (const roleId of selected) {
                    try {
                        const role = await guild.roles.fetch(roleId);
                        if (!role) continue;
                        await database.addMultiRoleToSelector(guild.id, selectorId, role.id, role.name);
                        added.push(role.name);
                    } catch (e) {
                        console.error('Error adding role', roleId, e);
                    }
                }
                await interaction.reply({ content: `Added ${added.length} role(s): ${added.join(', ')}`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: 'Could not add roles to selector', flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
    }
}

async function deletemultiroleselector(interaction, database) {
    const guild = interaction.guild;
    // get the selector id from the interaction value
    const selectorId = interaction.values[0];
    // defer interaction
    interaction.reply({ content: "Deleting selector...", flags: MessageFlags.Ephemeral }).then(() => {
        database.deleteMultiSelector(guild.id, selectorId).then(() => {
            interaction.editReply({ content: "Selector deleted", components: [], flags: MessageFlags.Ephemeral });
        }).catch(console.error);
    }).catch(console.error);
}

async function multirolesbutton(interaction, database) {
    const guild = interaction.guild;
    // get the selector id from the interaction value
    const selectorId = interaction.customId.split(";")[2]
    // defer interaction
    console.log(` > Removing all multiroles from ${interaction.user.username} (${interaction.user.id})`);
    interaction.reply({ content: "Removing all multiroles...", flags: MessageFlags.Ephemeral }).then(() => {
        database.getMultiRolesFromSelectorId(guild.id, selectorId).then(async (result) => {
            // check if member has already the role
            for (var i in result.roles) {
                if (interaction.member.roles.cache.has(result.roles[i].roleId)) {
                    // remove all the roles from the selector
                    await interaction.member.roles.remove(result.roles[i].roleId);
                }
            }
            // for (var i in result.roles) await interaction.member.roles.remove(result.roles[i].roleId);
            interaction.editReply({ content: "All multiroles removed", flags: MessageFlags.Ephemeral });
        }).catch(console.error);
    }).catch(console.error);
}

async function multiroles(interaction, database) {
    const guild = interaction.guild;
    const user = interaction.user;
    console.log(` > Adding role to ${user.username} (${user.id})`);
    // get the role id from the interaction value

    const selectorId = interaction.values[0].split(";")[1];

    database.checkIfMultiSelectorExists(guild.id, selectorId).then((exists) => {
        if (!exists) {
            interaction.reply({ content: "This selector doesn't exist anymore", flags: MessageFlags.Ephemeral });
            return;
        }

        database.getMultiRolesFromSelectorId(guild.id, selectorId).then(async (result) => {
            // check if member has already the role
            for (var i in result.roles) {
                if (interaction.member.roles.cache.has(result.roles[i].roleId)) {
                    // remove all the roles from the selector
                    await interaction.member.roles.remove(result.roles[i].roleId);
                }
            }

            interaction.reply({ content: "Adding selected roles, please wait...", flags: MessageFlags.Ephemeral }).then(() => {
                interaction.values.forEach((value) => {
                    const roleId = value.split(";")[0];
                    guild.roles.fetch(roleId).then((role) => {
                        // add the role
                        interaction.member.roles.add(role).catch(console.error);
                    }).catch(console.error);
                });
            }).catch(console.error);
        }).catch(console.error);
    }).catch(console.error);
}

async function multiroleselector(interaction, database) {
    const guild = interaction.guild;
    const selectorId = interaction.values[0];

    // get the selector and the roles
    database.getMultiRolesFromSelectorId(guild.id, selectorId).then(async (result) => {
        if (result.roles.length == 0)
            return interaction.reply({ content: "There has been an error during the creation of this selector\nPlease delete it and create it again.", flags: MessageFlags.Ephemeral });
        const selectors = [];
        for (var i in result.roles) {
            selectors.push({
                label: result.roles[i].roleName,
                value: result.roles[i].roleId + ";" + selectorId,
                description: `Select this to get the role ${result.roles[i].roleName}`,
                emoji: "⏺"
            });
        }

        // create the select menu
        const selectMenu = new SelectMenu()
            .setCustomId("multiroles;" + internalId)
            .setPlaceholder("Select a role...")
            .setMinValues(1)
            .setMaxValues(result.maxChoices)
            .addOptions(selectors)
            .build();

        const button = new Button()
            .setStyle("danger")
            .setCustomId("multirolesbutton;" + internalId + ";" + selectorId)
            .setLabel("Remove all")
            .setEmoji("❎")
            .build();

        // send the message
        interaction.reply({
            embeds: [await database.getEmbedFromMultiSelectorId(guild.id, selectorId)],
            components: [selectMenu, button]
        }).catch((err) => {
            console.error(err);
        });
    }).catch((err) => {
        console.error(err);
    });
}

module.exports = {
    build,
    execute,
    interaction
}
