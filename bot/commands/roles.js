const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
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
                ephemeral: true
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
            ephemeral: true
        });
    }).catch((err) => {
        console.error(err);
    });
}

async function add(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;

    interaction.reply({
        content: "Please wait...",
        ephemeral: true
    });

    // ask the user to type the title and the description of the selector
    channel.send("Please type the title of the selector\n\nIf you want to cancel the operation, send **cancel**");
    const filter = (m) => m.author.id === interaction.user.id;
    const collector = channel.createMessageCollector(filter, { time: 60000 });
    // generate and id for the selector with length 50
    const selectorId = Math.random().toString(36).substring(2, 52);
    var data = {};
    collector.on('collect', (m) => {
        if (m.author.id !== interaction.user.id) return;
        if (m.author.bot) return;
        if (m.content.toLowerCase() === "cancel") {
            m.reply("Operation canceled");
            return collector.stop();
        }

        // collect the title of the selector
        if (!data.title && !data.description) {
            data.title = m.content;
            channel.send("Please type the description of the selector\n\nIf you want to cancel the operation, send **cancel**");
            return;
        }

        // collect the description of the selector
        if (data.title && !data.description) {
            data.description = m.content;
            // create the selector
            database.createSelecor(guild.id, selectorId, JSON.stringify({
                title: data.title,
                description: data.description,
                color: 0x00FF00,
                footer: {
                    text: "Made with ❤️ by zThundy__"
                }
            }));
            channel.send("Please send the tag to the role you want to add to the selector.\n\nIf you want to cancel the operation, send **cancel**\nIf you are done adding roles, send **done**");
            return;
        }
        
        // collect all the roles
        if (data.title && data.description) {
            if (!data.collected) data.collected = [];
            if (m.content.toLowerCase() === "done") {
                // send the selector
                m.reply("Creation of the selector completed");
                return collector.stop();
            }
            const role = m.mentions.roles.first();
            // check if the role in "collected" is already in the selector
            if (data.collected.find((r) => r.id === role.id)) {
                m.reply("You have already added this role to this selector");
                return;
            }
            if (role) {
                // add the role to the selector
                database.addRoleToSelector(guild.id, selectorId, role.id, role.name)
                m.reply("Role added to the selector");
                data.collected.push(role);
            } else {
                m.reply("Please tag a valid role\n\nIf you want to cancel the operation, send **cancel**\nIf you are done adding roles, send **done**");
            }
        }
    });
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
                ephemeral: true
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
            ephemeral: true
        });
    }).catch((err) => {
        console.error(err);
    });
}

// interaction command
async function interaction(interaction, database) {
    const user = interaction.user.id;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", ephemeral: true });
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
    }
}

async function deleteroleselector(interaction, database) {
    const guild = interaction.guild;
    // get the selector id from the interaction value
    const selectorId = interaction.values[0];
    // defer interaction
    interaction.reply({ content: "Deleting selector...", ephemeral: true }).then(() => {
        database.deleteSelector(guild.id, selectorId).then(() => {
            interaction.editReply({ content: "Selector deleted", components: [], ephemeral: true });
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
            interaction.reply({ content: "This selector doesn't exist anymore", ephemeral: true });
            return;
        }

        // fetch the role in the guild
        if (roleId === "none")
            return interaction.reply({ content: "Removing all roles...", ephemeral: true }).then(() => {
                database.getRolesFromSelectorId(guild.id, selectorId).then(async (roles) => {
                    // check if member has already the role
                    for (var i in roles) {
                        if (interaction.member.roles.cache.has(roles[i].roleId)) {
                            // remove all the roles from the selector
                            await interaction.member.roles.remove(roles[i].roleId);
                        }
                    }
                    // for (var i in rows) await interaction.member.roles.remove(rows[i].roleId);
                    interaction.editReply({ content: "All roles removed", ephemeral: true });
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

                interaction.reply({ content: "Adding role...", ephemeral: true }).then(() => {
                    // add the role
                    interaction.member.roles.add(role).catch(console.error);
                    // edit the reply to the interaction
                    interaction.editReply({ content: "Role added", ephemeral: true });
                }).catch(console.error);
            }).catch(console.error);
        }).catch(console.error);
    }).catch(console.error);
}

async function roleselector(interaction, database) {
    const guild = interaction.guild;
    const selectorId = interaction.values[0];

    // get the selector and the roles
    database.getRolesFromSelectorId(guild.id, selectorId).then(async (roles) => {
        if (roles.length == 0)
            return interaction.reply({ content: "There has been an error during the creation of this selector\nPlease delete it and create it again.", ephemeral: true });
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
    
module.exports = {
    build,
    execute,
    interaction
}
