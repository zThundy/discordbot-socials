const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { SelectMenu } = require('./elements/dropdown.js');
const { TwitterAPI } = require('../modules/twitter.js');
const twitter = new TwitterAPI();

var internalId = "";

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("twitter");
    command.setDescription("Configure twitter monitoring");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '📜 List', value: 'listtwitter' })
            .addChoices({ name: '✅ Add', value: 'addtwitter' })
            .addChoices({ name: '❌ Remove', value: 'removetwitter' })
            .addChoices({ name: "🔄 Change tag", value: "changetagtwitter" })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

// internal functions
async function _getAllTwitterAccounts(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    var channels = [];
    const res = await database.getAllTwitterAccounts(guild.id);
    if (res) {
        res.forEach(entry => {
            channels.push({
                label: entry.accountName,
                value: entry.accountName + ";" + entry.channelId,
                description: `Bound discord channel: ${entry.discordChannel}`,
                emoji: "🌐"
            });
        });
    }
    if (channels.length == 0) {
        channels.push({
            label: "No twitter accounts added",
            value: "none",
            description: "Add an account to the list by sending the @",
            emoji: "❌",
            default: true
        });
    }
    return channels;
}

async function execute(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    const args = interaction.options;
    const action = args.getString('action');
    switch (action) {
        case 'listtwitter':
            listtwitter(interaction, database)
            break;
        case 'addtwitter':
            addtwitter(interaction, database);
            break;
        case 'removetwitter':
            removetwitter(interaction, database);
            break;
        case "changetagtwitter":
            changetagtwitter(interaction, database);
            break;
        default:
            await interaction.reply({ content: "Unknown action", ephemeral: true });
            break;
    }
}

async function listtwitter(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    console.log(" > Twitter command executed");
    const selectMenu = new SelectMenu()
        .setCustomId("listtwitter;" + internalId)
        .setPlaceholder("List of managed twitter accounts")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitterAccounts(interaction, database))
        .build();

    interaction.reply({
        content: "Here's a list of all the managed twitter accounts",
        components: [selectMenu],
        ephemeral: true
    })
}

async function removetwitter(interaction, database) {
    console.log(" > Twitter command executed");
    const selectMenu = new SelectMenu()
        .setCustomId("removetwitter;" + internalId)
        .setPlaceholder("List of managed twitter accounts")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitterAccounts(interaction, database))
        .build();

    interaction.reply({
        content: "Select a twitter account to remove",
        components: [selectMenu],
        ephemeral: true
    });
}

async function addtwitter(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    interaction.reply({
        content: "Send the name of the twitter account you want to monitor\nor type **cancel** to cancel the operation",
        ephemeral: true
    });
    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });
    collector.on('collect', m => {
        collector.stop();
        if (m.content.toLowerCase() == "cancel") {
            m.reply("Operation cancelled").then(msg => {
                setTimeout(() => {
                    msg.delete();
                    m.delete();
                }, 5000);
            });
            return;
        } else {
            channel.send(`Added twitter account **${m.content}** to the monitor list`).then(msg => {
                setTimeout(() => {
                    msg.delete();
                    m.delete();
                }, 5000);
            });
        }
        database.createTwitterAccount(guild.id, channel.id, m.content, channel.name, null, null);
        _addAccount({ guildId: guild.id, channelId: channel.id, accountName: m.content, channelName: channel.name, lastTweetId: null, roleId: null });
    });
}

async function changetagtwitter(interaction, database) {
    console.log(" > Twitter command executed");
    const selectMenu = new SelectMenu()
        .setCustomId("changetagtwitter;" + internalId)
        .setPlaceholder("List of managed twitter accounts")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitterAccounts(interaction, database))
        .build();

    interaction.reply({
        content: "Select the twitter account you want to edit",
        components: [selectMenu],
        ephemeral: true
    });
}

async function interaction(interaction, database) {
    console.log(" > Twitter interaction received");
    const guild = interaction.guild;
    const channel = interaction.channel;
    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    const action = customId.split(';')[0];
    // check if the action contains "none"
    if (values[0] === "none") return interaction.reply({
        content: "No twitter accounts added",
        ephemeral: true
    });
    switch (action) {
        case 'listtwitter':
            interaction.reply({
                content: `Account link: <https://twitter.com//${values[0]}>\nDiscord channel: <#${values[1]}>`,
                ephemeral: true
            });
            break;
        case 'removetwitter':
            database.deleteTwitterAccount(guild.id, values[1], values[0]);
            for (var i in accounts) {
                if (accounts[i].channelId === values[1] && accounts[i].accountName === values[0]) {
                    _extra.cron.remove(accounts[i].uid);
                    delete accounts[i];
                    break;
                }
            }
            interaction.reply({
                content: `Removed **${values[0]}** from the list of managed twitter accounts`,
                ephemeral: true
            });
            break;
        case "changetagtwitter":
            interaction.reply({
                content: "Please send the role that you want to use when a new post is published\nOr type **cancel** to cancel the operation\nOr type **delete** to remove the role",
                ephemeral: true
            });
            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });
            collector.on('collect', m => {
                collector.stop();
                switch (m.content.toLowerCase()) {
                    case "cancel":
                        m.reply("Operation cancelled").then(msg => {
                            setTimeout(() => { msg.delete(); m.delete(); }, 5000);
                        });
                        break;
                    case "delete":
                        m.reply("Role tag removed. Now everyone will be tagged.").then(msg => {
                            setTimeout(() => { msg.delete(); m.delete(); }, 5000);
                        });
                        database.updateTweetRoleId(guild.id, values[0], null);
                        for (var i in accounts) {
                            if (accounts[i].channelId === values[1] && accounts[i].accountName === values[0]) {
                                accounts[i].roleId = null;
                                break;
                            }
                        }
                        break;
                    default:
                        if (m.mentions.roles.size == 0) {
                            return channel.send("No role mentioned").then(msg => {
                                setTimeout(() => { msg.delete(); m.delete(); }, 5000);
                            });
                        }
                        const role = m.mentions.roles.first();
                        channel.send(`Changed the role to **${role.name}**, to twitter account **${values[0]}**`).then(msg => {
                            setTimeout(() => { msg.delete(); m.delete(); }, 5000);
                            database.updateTweetRoleId(guild.id, values[0], role.id);
                            for (var i in accounts) {
                                if (accounts[i].channelId === values[1] && accounts[i].accountName === values[0]) {
                                    accounts[i].roleId = role.id;
                                    break;
                                }
                            }
                        });
                        break;
                }
            });
            break;
    }
}

// this is bad but i don't give a fuck
var _extra = null;
async function init(database, extra) {
    console.log(" > Twitter module initialized");
    _extra = extra;
    _extra.database = database;
    const guild = extra.guild;
    database.getAllTwitterAccounts(guild.id).then((accounts) => {
        accounts.forEach((account) => {
            _addAccount(account);
        });
    });
}

const accounts = {};
function _addAccount(account) {
    var uid = _extra.cron.add(60 * 1000, (uid) => {
        // debug and testing, remove when done
        // account.lastTweetId = null;
        // end of debug and testing
        if (!accounts[uid]) return _extra.cron.remove(uid);

        var _account = accounts[uid];
        twitter.getLastTweet(_account.accountName).then((tweets) => {
            if (tweets.length > 0) {
                var lastTweet = tweets[0];
                if (lastTweet.id != _account.lastTweetId) {
                    _extra.client.channels.fetch(_account.channelId).then((channel) => {
                        const embeds = twitter.getEmbed(lastTweet);
                        if (_account.roleId) {
                            channel.send({
                                content: `<@&${_account.roleId}> **${_account.accountName}** posted a new tweet!\n\n<${embeds[0].url}>`,
                                embeds
                            })
                        } else {
                            channel.send({
                                content: `@everyone **${_account.accountName}** posted a new tweet!\n\n<${embeds[0].url}>`,
                                embeds
                            });
                        }
                    });
                    _account.lastTweetId = lastTweet.id;
                    _extra.database.updateTweetLastId(_account.guildId, _account.accountName, String(lastTweet.id));
                }
            }
        });
        accounts[uid] = _account;
    });

    accounts[uid] = account;
}

module.exports = {
    build,
    execute,
    init,
    interaction
}