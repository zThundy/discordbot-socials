const {
    SlashCommandBuilder,
    PermissionsBitField,
    MessageFlags,
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ChannelType
} = require("discord.js");
const { SelectMenu } = require("./elements/dropdown.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "4ac0a630baa11f26ff59";
const channels = {};

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("twitch");
    command.setDescription("Configure twitch notifications");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(false)
            .addChoices({ name: '📜 List', value: 'listtwitch' })
            .addChoices({ name: '✅ Add', value: 'addtwitch' })
            .addChoices({ name: '❌ Remove', value: 'removetwitch' })
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

function buildAddTwitchModal() {
    const channelNameInput = new TextInputBuilder()
        .setCustomId("twitch-channel-name")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(25)
        .setRequired(true);

    const discordChannelSelect = new ChannelSelectMenuBuilder()
        .setCustomId("twitch-discord-channel")
        .setPlaceholder("Select an announcement channel")
        .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
        .setRequired(true)
        .setMaxValues(1);

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId("twitch-notification-role")
        .setPlaceholder("No role (mention everyone)")
        .setRequired(false)
        .setMaxValues(1);

    return new ModalBuilder()
        .setCustomId("addtwitch;" + internalId)
        .setTitle("Configure Twitch notifications")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("Twitch channel name")
                .setTextInputComponent(channelNameInput),
            new LabelBuilder()
                .setLabel("Discord announcement channel")
                .setChannelSelectMenuComponent(discordChannelSelect),
            new LabelBuilder()
                .setLabel("Role to mention (optional)")
                .setDescription("Leave empty to mention everyone.")
                .setRoleSelectMenuComponent(roleSelect)
        );
}

// internal functions
async function _getAllTwitchChannels(interaction, database) {
    const guild = interaction.guild;
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
    console.log(" > Twitch command executed");
    const action = interaction.options.getString('action');
    if (!action || action === 'addtwitch') {
        interaction.showModal(buildAddTwitchModal()).catch(console.error);
        return;
    }

    switch (action) {
        case 'listtwitch':
            listtwich(interaction, database).catch(console.error);
            break;
        case 'removetwitch':
            removetwitch(interaction, database).catch(console.error);
            break;
        default:
            await interaction.reply({ content: "Unknown action", flags: MessageFlags.Ephemeral });
            break;
    }
}

async function listtwich(interaction, database) {
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
        flags: MessageFlags.Ephemeral
    })
}

async function removetwitch(interaction, database) {
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
        flags: MessageFlags.Ephemeral
    });
}

async function interaction(interaction, database) {
    if (interaction.isModalSubmit()) {
        addTwitchChannel(interaction, database).catch(async (error) => {
            console.error("Failed to add Twitch channel", error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: "Failed to add the Twitch channel. Check the bot logs and try again.",
                    flags: MessageFlags.Ephemeral
                });
            }
        });
        return;
    }

    const user = interaction.user;
    const guild = interaction.guild;
    if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(user, { guild: guild });

    console.log(" > Twitch interaction received");
    // const channel = interaction.channel;
    const customId = interaction.customId;
    var values = interaction.values;
    if (values[0].includes(";")) values = values[0].split(";");
    const action = customId.split(';')[0];
    // check if the action contains "none"
    if (values[0] === "none") return interaction.reply({
        content: "No channels added",
        flags: MessageFlags.Ephemeral
    });
    switch (action) {
        case 'listtwich':
            interaction.reply({
                content: `Channel link: <https://twitch.tv/${values[0]}>\nDiscord channel: <#${values[1]}>`,
                flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
            break;
        default:
            await interaction.reply({ content: "Unknown action", flags: MessageFlags.Ephemeral });
            break;
    }
}

async function addTwitchChannel(interaction, database) {
    const guild = interaction.guild;
    const channelName = interaction.fields.getTextInputValue("twitch-channel-name").trim();
    const discordChannel = interaction.fields.getSelectedChannels("twitch-discord-channel", true).first();
    const notificationRole = interaction.fields.getSelectedRoles("twitch-notification-role")?.first() || null;

    if (!/^[a-zA-Z0-9_]{1,25}$/.test(channelName)) {
        await interaction.reply({
            content: "Enter a valid Twitch channel name (letters, numbers, or underscores; up to 25 characters).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await database.createTwitchChannel(
        guild.id,
        discordChannel.id,
        channelName,
        discordChannel.name,
        notificationRole?.id || null
    );
    _addChannel({
        guildId: guild.id,
        channelId: discordChannel.id,
        channelName,
        discordChannel: discordChannel.name,
        notificationRoleId: notificationRole?.id || null
    });

    await interaction.reply({
        content: `Added Twitch channel **${channelName}** for <#${discordChannel.id}>. Announcements will mention the selected role, or everyone if no role was selected.`,
        flags: MessageFlags.Ephemeral
    });
}

// this is bad but i don't give a fuck
var _extra = null;
async function init(database, extra) {
    _extra = extra;
    _extra.database = database;
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
    // var uid = _extra.cron.add(5 * 1000, (uid) => {
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
                            _extra.twitch.getEmbed(stream)
                                .then(data => {
                                    const notificationRoleId = channels[uid].notificationRoleId;
                                    discordChannel.send({
                                        content: `${notificationRoleId ? `<@&${notificationRoleId}>` : "@everyone"} **${channels[uid].channelName}** is now live on Twitch!\n\nhttps://twitch.tv/${channels[uid].channelName}`,
                                        allowedMentions: notificationRoleId
                                            ? { parse: [], roles: [notificationRoleId] }
                                            : { parse: ["everyone"] },
                                        embeds: data.embeds,
                                        files: data.files
                                    });
                                });
                        }
                    }).catch(console.error);
                }).catch(console.error);
                // update the twitch id if it's not the same or if it's not set
                if (!channel.twitchId || channel.twitchId !== stream.user_id) {
                    _extra.database.updateTwitchId(channels[uid].guildId, channels[uid].channelName, stream.user_id);
                    channels[uid].twitchId = stream.user_id;
                }
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