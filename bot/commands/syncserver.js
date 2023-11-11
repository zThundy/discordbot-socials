const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

const internalId = "114169568744501";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("syncserver");
    command.setDescription("Sync a role between two discord servers");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('role')
            .setDescription("Type the ID of the role you want to sync (from this server)")
            .setRequired(true)
        return option;
    });
    command.addStringOption((option) => {
        option.setName('other_role')
            .setDescription("Type the ID of the role you want to sync (from the other server)")
            .setRequired(true)
        return option;
    });
    command.addStringOption((option) => {
        option.setName('server')
            .setDescription("Type the ID of the server you want to sync the role to")
            .setRequired(true)
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction, database) {
    const role = interaction.options.getString("role");
    const otherRole = interaction.options.getString("other_role");
    const server = interaction.options.getString("server");

    const guild = interaction.guild;
    const guildRole = guild.roles.cache.get(role);
    if (!guildRole) {
        interaction.reply({ content: "Invalid ID provided.", ephemeral: true });
        return;
    }

    const otherGuild = interaction.client.guilds.cache.get(server);
    if (!otherGuild) {
        interaction.reply({ content: "The server you provided is not valid.", ephemeral: true });
        return;
    }

    const otherGuildRole = otherGuild.roles.cache.get(otherRole);
    if (!guildRole || !otherGuildRole) {
        interaction.reply({ content: "The role(s) you provided are not valid.", ephemeral: true });
        return;
    }

    const syncRole = await database.getSyncRole(guild.id, role, server);
    if (syncRole.length > 0) {
        interaction.reply({ content: "The role you provided is already synced.", ephemeral: true });
        return;
    }

    // add role to database
    database.addSyncRole(guild.id, role, server, otherRole).then(() => {
        interaction.reply({ content: "The role has been synced.", ephemeral: true });
    }).catch(err => {
        console.error(err);
        interaction.reply({ content: "An error occurred while syncing the role.", ephemeral: true });
    });
}

async function userUpdate(oldUser, newUser, extra) {
    // console.log(oldUser.roles.cache.map(role => role.name).join(", "));
    // console.log(newUser.roles.cache.map(role => role.name).join(", "));

    extra.database.getSyncRoles(oldUser.guild.id).then(async (results) => {
        results.forEach(async (result) => {
            const roleId = result.roleId;
            const guildToSync = result.otherGuildId;
            const roleToSync = result.otherRoleId;

            const currentGuildRole = oldUser.guild.roles.cache.get(roleId);
            const otherGuildRole = extra.client.guilds.cache.get(guildToSync).roles.cache.get(roleToSync);
            if (!currentGuildRole || !otherGuildRole) return;

            // asign role to user in other guild
            if (oldUser.roles.cache.has(roleId) && !newUser.roles.cache.has(roleId)) {
                // remove role from user in other guild
                if (otherGuildRole) {
                    const otherGuildMember = await extra.client.guilds.cache.get(guildToSync).members.fetch(newUser.id);
                    if (otherGuildMember.roles.cache.has(roleToSync)) {
                        otherGuildMember.roles.remove(roleToSync);
                    }
                }
            } else if (!oldUser.roles.cache.has(roleId) && newUser.roles.cache.has(roleId)) {
                // add role to user in other guild
                if (otherGuildRole) {
                    const otherGuildMember = await extra.client.guilds.cache.get(guildToSync).members.fetch(newUser.id);
                    if (!otherGuildMember.roles.cache.has(roleToSync)) {
                        otherGuildMember.roles.add(roleToSync);
                    }
                }
            }
        });
    }).catch(err => console.error(err));
}

// async function init(database, extra) {
//     const client = extra.client;
//     const guild = extra.guild;

//     // check what roles are synced
//     database.getSyncRoles(guild.id).then(async (results) => {
//         results.forEach(async (result) => {
//             const roleId = result.roleId;
//             const guildToSync = result.otherGuildId;
//             const roleToSync = result.otherRoleId;

//             const currentGuildRole = guild.roles.cache.get(roleId);
//             const otherGuildRole = client.guilds.cache.get(guildToSync).roles.cache.get(roleToSync);
//             if (!currentGuildRole || !otherGuildRole) return;

//             // check what users have the role
//             const members = currentGuildRole.members;
//             members.forEach(async (member) => {
//                 // asign role to user in other guild
//                 if (member.roles.cache.has(roleId)) {
//                     const otherGuildMember = await client.guilds.cache.get(guildToSync).members.fetch(member.id);
//                     if (!otherGuildMember.roles.cache.has(roleToSync)) {
//                         otherGuildMember.roles.add(roleToSync);
//                     }
//                 } else {
//                     const otherGuildMember = await client.guilds.cache.get(guildToSync).members.fetch(member.id);
//                     if (otherGuildMember.roles.cache.has(roleToSync)) {
//                         otherGuildMember.roles.remove(roleToSync);
//                     }
//                 }
//             });
//         });
//     }).catch(err => console.error(err));
// }

module.exports = {
    build,
    userUpdate,
    execute,
    // init
}