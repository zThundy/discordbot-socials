const { SlashCommandBuilder } = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");

// create a random numberic id
const internalId = "451258854652154";
const channels = {};

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("twitch");
    command.setDescription("Configure twitch notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: '📜 List', value: 'listtwitch' })
            .addChoices({ name: '✅ Add', value: 'addtwitch' })
            .addChoices({ name: '❌ Remove', value: 'removetwitch' })
        return option;
    });
    command.id = internalId;
    command.execute = execute;
    return command;
}

// internal functions
async function _getAllTwitchChannels(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    var channels = [];
    const res = await database.getAllTwitchChannels(guild.id);
    if (res) {
        res.forEach(entry => {
            channels.push({
                label: entry.channelName,
                value: entry.channelName + ";" + entry.channelId,
                description: `Bound discord channel: ${entry.discordChannel}`,
                emoji: "🌐"
            });
        });
    }
    if (channels.length == 0) {
        channels.push({
            label: "No channels added",
            value: "none",
            description: "Add a channel to the list",
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
        case 'listtwitch':
            listtwich(interaction, database);
            break;
        case 'addtwitch':
            interaction.reply({
                content: "Send the name of the channel you want to add to the list",
                ephemeral: true
            });
            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });
            collector.on('collect', m => {
                collector.stop();
                channel.send(`Added channel **${m.content}** to the twitch list`)
                    .then(msg => {
                        setTimeout(() => {
                            msg.delete();
                            m.delete();
                        }, 5000);
                    });
                database.createTwitchChannel(guild.id, channel.id, m.content, channel.name);
                _addChannel({ guildId: guild.id, channelId: channel.id, channelName: m.content, discordChannel: channel.name });
            });
            break;
        case 'removetwitch':
            removetwitch(interaction, database);
            break;
        default:
            await interaction.reply({ content: "Unknown action", ephemeral: true });
            break;
    }
}

async function listtwich(interaction, database) {
    const guild = interaction.guild;
    const channel = interaction.channel;
    console.log(" > Twitch command executed");
    const selectMenu = new SelectMenu()
        .setCustomId("listtwich;" + internalId)
        .setPlaceholder("List of twitch channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitchChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Here's a list of all the twitch channels",
        components: [selectMenu],
        ephemeral: true
    })
}

async function removetwitch(interaction, database) {
    console.log(" > Twitch command executed");
    const selectMenu = new SelectMenu()
        .setCustomId("removetwitch;" + internalId)
        .setPlaceholder("List of twitch channels")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(await _getAllTwitchChannels(interaction, database))
        .build();

    interaction.reply({
        content: "Select a channel to remove",
        components: [selectMenu],
        ephemeral: true
    });
}

async function interaction(interaction, database) {
    console.log(" > Twitch interaction received");
    const guild = interaction.guild;
    // const channel = interaction.channel;
    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    const action = customId.split(';')[0];
    // check if the action contains "none"
    if (values[0] === "none") return interaction.reply({
        content: "No channels added",
        ephemeral: true
    });
    switch (action) {
        case 'listtwich':
            interaction.reply({
                content: `Channel link: <https://twitch.tv/${values[0]}>\nDiscord channel: <#${values[1]}>`,
                ephemeral: true
            });
            break;
        case 'removetwitch':
            database.deleteTwitchChannel(guild.id, values[1], values[0]);
            for (var i in channels) {
                if (channels[i].channelId === values[1] && channels[i].channelName === values[0]) {
                    _extra.cron.remove(channels[i].uid);
                    delete channels[i];
                    break;
                }
            }
            interaction.reply({
                content: `Removed **${values[0]}** from the list of twitch channels`,
                ephemeral: true
            });
            break;
    }
}

// this is bad but i don't give a fuck
var _extra = null;
async function init(database, extra) {
    _extra = extra;
    const guild = extra.guild;
    database.getAllTwitchChannels(guild.id).then((channels) => {
        channels.forEach((channel) => {
            _addChannel(channel);
        });
    });
    console.log(" > Twitch module initialized");
}

function _addChannel(channel) {
    var uid = _extra.cron.add(5 * 60 * 1000, (uid) => {
        if (!channels[uid]) return _extra.cron.remove(uid);
        
        _extra.twitch.checkStream(channels[uid].channelName).then((stream) => {
            if (stream) {
                _extra.client.guilds.fetch(channels[uid].guildId).then(guild => {
                    guild.channels.fetch(channels[uid].channelId).then(discordChannel => {
                        // if the channel is not live, send the message
                        if (!channels[uid].isLive) {
                            // update the isLive status
                            channels[uid].isLive = true;
                            // send the message
                            discordChannel.send({
                                content: `@everyone **${channels[uid].channelName}** is now live on Twitch!\n\nhttps://twitch.tv/${channels[uid].channelName}`,
                                embeds: _extra.twitch.getEmbed(stream)
                            });
                        }
                    }).catch(console.error);
                }).catch(console.error);
            } else {
                channels[uid].isLive = false;
            }
        }).catch((err) => {
            console.error(err);
            _extra.twitch.resetToken();
        });
    });

    channels[uid] = channel;
    channels[uid].isLive = false;
    channels[uid].uid = uid;
}

// export the command
module.exports = {
    build,
    execute,
    interaction,
    init
}