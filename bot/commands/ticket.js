const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ChannelType, EmbedBuilder, MessageFlags } = require("discord.js");
const { Modal } = require("./elements/modal.js");
const { Button } = require("./elements/button.js");
const { RoleSelect } = require("./elements/roleSelect.js");
const { ChannelSelect } = require("./elements/channelSelect.js");
const { MakeHTML } = require("../modules/makehtml.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();
const setupCache = new Map();

// create a random numberic id
const internalId = "2210adf889449ecdfd9c";

Number.prototype.pad = function (n) {
    return new Array(n).join('0').slice((n || 2) * -1) + this;
}

function build(guild) {
    const command = new SlashCommandBuilder();
    command.setName("ticket");
    command.setDescription("Start the creation of a role selector");
    command.setDMPermission(false);
    command.addStringOption((option) => {
        option.setName('action')
            .setDescription("Choose the action to perform")
            .setRequired(true)
            .addChoices({ name: "📬 Setup", value: "setuptagrole" })
            .addChoices({ name: '✅ Send in channel', value: 'setupchannel' });
        return option;
    });
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

function execute(interaction, database) {
    const args = interaction.options;
    const channel = interaction.channel;
    const guild = interaction.guild;

    switch (args.getString('action')) {
        case 'setupchannel':
            database.getTicketConfig(guild.id)
                .then((res) => {
                    if (res) {
                        const embed = {
                            title: res.title,
                            description: res.description,
                            color: 0x00FF00,
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: "Made with ❤️ by zThundy__"
                            }
                        };

                        const button = new Button()
                            .setCustomId("ticketcreate;" + internalId)
                            .setLabel("Open ticket")
                            .setEmoji("📨")
                            .setStyle("secondary")
                            .build();

                        interaction.reply({
                            content: "",
                            components: [button],
                            embeds: [embed]
                        }).catch(console.error);
                    } else {
                        interaction.reply({
                            content: 'Please setup the ticketing system first using the **/ticket** command',
                        }).catch(console.error);
                    }
                }).catch(console.error);
            break;
        case "setuptagrole":
            // start a modal to ask for title and description, then proceed with select menus for roles/channel
            database.deleteTicketConfig(guild.id);

            const setupModal = new Modal()
                .addTextComponent({
                    type: "short",
                    label: "Insert the ticket message title",
                    max: 250,
                    min: 5,
                    placeholder: "Ticket title...",
                    required: true,
                    id: "setup_title"
                })
                .addTextComponent({
                    type: "paragraph",
                    label: "Insert the ticket message description",
                    max: 4000,
                    min: 10,
                    placeholder: "Ticket description...",
                    required: true,
                    id: "setup_description"
                })
                .setTitle("Ticket setup - title & description")
                .setCustomId("ticketsetup_modal;" + internalId)
                .build();

            // directly show the modal (do NOT reply before showModal or Discord will throw InteractionAlreadyReplied)
            interaction.showModal(setupModal).catch(console.error);
            break;
    }
}

// interaction command
async function interaction(interaction, database, _, config) {
    console.log("<TICKET> Interaction received:", interaction.customId);
    const userId = interaction.user.id;
    if (timeout.checkTimeout(userId)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    // add timeout to the user
    timeout.addTimeout(userId);

    const guild = interaction.guild;
    const user = interaction.user;

    // get the action to perform
    const action = interaction.customId.split(";")[0];
    switch (action) {
        case "ticketsetup_modal":
            // modal submitted for setup title/description
            try {
                const title = interaction.fields.getTextInputValue('setup_title');
                const description = interaction.fields.getTextInputValue('setup_description');
                // save in cache keyed by guild id
                setupCache.set(guild.id, {
                    title,
                    description,
                    collected: [],
                    transcriptChannel: "0",
                    author: user.id
                });

                // build role select, channel select and finish button
                const roleSelect = new RoleSelect()
                    .setCustomId("ticket_setup_roles;" + internalId + ";" + guild.id)
                    .setPlaceholder("Select staff roles (you can choose multiple)")
                    .setMinValues(0)
                    .setMaxValues(10)
                    .build();

                const channelSelect = new ChannelSelect()
                    .setCustomId("ticket_setup_channel;" + internalId + ";" + guild.id)
                    .setPlaceholder("Select transcript channel (optional)")
                    .setChannelTypes([ChannelType.GuildText])
                    .setMinValues(0)
                    .setMaxValues(1)
                    .build();

                const finishButton = new Button()
                    .setCustomId("ticket_setup_finish;" + internalId + ";" + guild.id)
                    .setLabel("Finish setup")
                    .setStyle("primary")
                    .build();

                const embed = {
                    title: "Ticket setup — review",
                    description: "Review the title and description below, then select staff roles and an optional transcript channel.",
                    color: 0x00FF00,
                    timestamp: new Date().toISOString(),
                    footer: { text: "Finish to save the configuration" },
                    fields: [
                        { name: "Title", value: title || "(no title)" },
                        { name: "Description", value: description || "(no description)" }
                    ]
                };

                await interaction.reply({ embeds: [embed], components: [roleSelect, channelSelect, finishButton], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error processing the setup modal.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticket_setup_roles":
            // interaction.values contains role ids
            try {
                const selected = interaction.values || [];
                const cache = setupCache.get(guild.id) || {};
                cache.collected = selected;
                setupCache.set(guild.id, cache);
                await interaction.reply({ content: `Selected ${selected.length} role(s) for staff.`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "Could not save selected roles.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticket_setup_channel":
            try {
                const selected = interaction.values || [];
                const cache = setupCache.get(guild.id) || {};
                cache.transcriptChannel = (selected.length > 0) ? selected[0] : "0";
                setupCache.set(guild.id, cache);
                const msg = cache.transcriptChannel === "0" ? "No transcript channel selected." : `Transcript channel set to <#${cache.transcriptChannel}>`;
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "Could not save selected channel.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticket_setup_finish":
            try {
                const cache = setupCache.get(guild.id);
                if (!cache) return interaction.reply({ content: "No setup in progress.", flags: MessageFlags.Ephemeral });
                // persist to database
                const roles = cache.collected || [];
                const transcript = cache.transcriptChannel || "0";
                database.createTicketConfig(guild.id, JSON.stringify(roles), cache.title, cache.description, transcript).then(() => {
                    // ensure tickets category
                    if (!guild.channels.cache.find(c => c.name.toLowerCase().trim() === "tickets")) {
                        guild.channels.create({
                            name: 'tickets',
                            type: ChannelType.GuildCategory
                        }).catch(console.error);
                    }
                    setupCache.delete(guild.id);
                    interaction.reply({ content: "Ticketing system configuration completed!", flags: MessageFlags.Ephemeral }).catch(console.error);
                }).catch(e => {
                    console.error(e);
                    interaction.reply({ content: "Error saving configuration to database.", flags: MessageFlags.Ephemeral }).catch(console.error);
                });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "Could not finish setup.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "openticketdata":
            const title = interaction.fields.getTextInputValue('titleofquestion');
            const description = interaction.fields.getTextInputValue('descriptionofquestion');

            interaction.reply({ content: "Opening ticket...", flags: MessageFlags.Ephemeral }).then(() => {
                database.getTicketConfig(guild.id).then((res) => {
                    if (res) {
                        database.getLastTicketsId(guild.id).then(id => {
                            id = (Number(id) + 1).pad(4);
                            const ticketId = uuid();
                            const embed = {
                                title: "Ticket " + id,
                                color: 0x00FF00,
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: "Made with ❤️ by zThundy__"
                                },
                                fields: [
                                    {
                                        name: "Internal ID",
                                        value: "*" + ticketId + "*"
                                    },
                                    {
                                        name: "Title",
                                        value: title,
                                    },
                                    {
                                        name: "Description",
                                        value: description
                                    }
                                ]
                            };

                            const roles = JSON.parse(res.tagRole);
                            const permissions = [
                                {
                                    id: user.id,
                                    allow: [
                                        PermissionsBitField.Flags.ViewChannel,
                                        PermissionsBitField.Flags.SendMessages,
                                        PermissionsBitField.Flags.ReadMessageHistory,
                                        PermissionsBitField.Flags.AttachFiles,
                                        PermissionsBitField.Flags.AddReactions,
                                        PermissionsBitField.Flags.UseExternalEmojis,
                                        PermissionsBitField.Flags.UseExternalStickers,
                                    ],
                                },
                                {
                                    id: guild.roles.cache.find(r => r.name === '@everyone').id,
                                    deny: [PermissionsBitField.Flags.ViewChannel],
                                },
                            ]
                            for (var i in roles) {
                                const role = roles[i];
                                permissions.push({
                                    id: role,
                                    allow: [
                                        PermissionsBitField.Flags.ViewChannel,
                                        PermissionsBitField.Flags.SendMessages,
                                        PermissionsBitField.Flags.ReadMessageHistory,
                                        PermissionsBitField.Flags.AttachFiles,
                                        PermissionsBitField.Flags.AddReactions,
                                        PermissionsBitField.Flags.UseExternalEmojis,
                                        PermissionsBitField.Flags.UseExternalStickers,
                                        PermissionsBitField.Flags.ManageMessages
                                    ],
                                })
                            }
                            // create the channel
                            guild.channels.create({
                                name: 'ticket-' + id,
                                type: ChannelType.GuildText,
                                permissionOverwrites: permissions,
                                topic: ticketId,
                                parent: guild.channels.cache.find(c => c.name.toLowerCase().trim() === "tickets").id
                            }).then(channel => {
                                interaction.editReply({ content: "📨 <#" + channel.id + "> opened!", components: [], flags: MessageFlags.Ephemeral }).catch(console.error);
                                database.createTicket(id, guild.id, channel.id, user.id, ticketId, title, description);

                                const button = new Button()
                                    .setCustomId("ticketclose;" + internalId + ";" + ticketId)
                                    .setLabel("Close")
                                    .setEmoji("🔒")
                                    .setStyle("danger")
                                    .build();

                                var string = "";
                                // check if roles has something inside
                                if (roles.length === 0)
                                    string = "Someone "
                                else
                                    for (var i in roles)
                                        string += "<@&" + roles[i] + "> ";
                                channel.send({
                                    content: "Hello, <@" + user.id + ">, thank you for opening a ticket.\n" + string + " will be with you shortly.\n\n**Please review the informations you give for this ticket**\n",
                                    embeds: [embed],
                                    components: [button]
                                }).catch(console.error);
                            }).catch(console.error);
                        }).catch(console.error);
                    } else {
                        interaction.editReply({
                            content: 'Please setup the ticketing system first using the **/ticket** command',
                        }).catch(console.error);
                    }
                }).catch(console.error);
            }).catch(console.error);
            break;
        case "ticketclose":
            const ticketId = interaction.customId.split(";")[2];
            const channel = interaction.channel;
            // get bot's profile picture
            const avatar = interaction.client.user.avatarURL();
            database.getAllTicketMessages(ticketId).then((messages) => {
                database.getTicket(ticketId).then((ticket) => {
                    database.getTicketConfig(guild.id).then((ticketConfig) => {
                        const embed = {
                            color: 0xFF0000,
                            title: "The ticket will be deleted in 5 seconds...",
                            timestamp: new Date().toISOString(),
                            footer: {
                                text: "Made with ❤️ by zThundy__"
                            },
                        };
                        const file = new MakeHTML(config).writeHtmlFile(messages, {
                            channelName: channel.name,
                            title: ticket.ticketTitle,
                            description: ticket.ticketDescription,
                            ticketId,
                            edited: ticket.edited,
                            avatar
                        });
                        if (ticketConfig && ticketConfig.transcriptChannel !== "0") {
                            guild.channels.cache.get(ticketConfig.transcriptChannel)
                                .send({ files: [config.tickets.folder + "/" + file] });
                        }
                        interaction.reply({ content: "", embeds: [embed] });
                        setTimeout(() => {
                            database.deleteTicket(ticketId);
                            database.deleteTicketMessages(ticketId);
                            if (channel) channel.delete().catch(e => console.error(e));
                        }, 5000);
                    }).catch(e => console.error(e));
                }).catch(e => console.error(e));
            }).catch(e => console.error(e));
            break;
        case "ticketcreate":
            const modal = new Modal()
                .addTextComponent({
                    type: "short",
                    label: "Insert a title",
                    max: 250,
                    min: 10,
                    placeholder: "Title of the question... (max 250)",
                    required: true,
                    id: "titleofquestion"
                })
                .addTextComponent({
                    type: "paragraph",
                    label: "Type a description of the issue",
                    max: 4000,
                    min: 20,
                    placeholder: "Description of the issue... (max 4000)",
                    required: true,
                    id: "descriptionofquestion"
                })
                .setTitle("Explain the issue...")
                .setCustomId("openticketdata;" + internalId)
                .build();

            interaction.showModal(modal).catch(console.error);
            break;
    }
}

function uuid() {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (dt + Math.random() * 16) % 16 | 0;
        dt = Math.floor(dt / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
}

function message(event, message, newMessage, { database, uploader, config }) {
    if (message.channel.name.includes("ticket-") && message.channel.topic) {
        message.guild.members.fetch(message.author.id)
            .then(m => {
                console.log("<TICKET> Logging message in ticket " + message.channel.name);
                const dateFormat = message.createdAt;
                var date = ('0' + dateFormat.getDate()).slice(-2) +
                    "/" + ('0' + (dateFormat.getMonth() + 1)).slice(-2) +
                    "/" + dateFormat.getFullYear() +
                    " " + ('0' + dateFormat.getHours()).slice(-2) +
                    ":" + ('0' + dateFormat.getMinutes()).slice(-2) +
                    ":" + ('0' + dateFormat.getSeconds()).slice(-2)


                var type = "text";
                const attachments = [];

                if (message.attachments.size > 0) {
                    console.log("<TICKET> Found attachments in message");
                    message.attachments.forEach((attachment) => {
                        console.log("<TICKET> Found attachment:", attachment.url, attachment.name, attachment.contentType);

                        // images
                        // test for urls ending with .jpg, .jpeg, .png, .webp, .avif, .gif, .svg or names with image content type
                        if ((/^https?:\/\/.+\jpg|jpeg|png|webp|avif|gif|svg$/i).test(attachment.url) || (attachment.contentType && attachment.contentType.startsWith("image/"))) {
                            type = "image";
                            attachments.push({
                                file: uploader.downloadAttachment(attachment.url),
                                type
                            });
                        }

                        // videos
                        // test for urls ending with .mp4, .mkv or names with video content type
                        if ((/^(http(s)?:\/\/|www\.).*(\.mp4|\.mkv)$/gmi).test(attachment.url) || (attachment.contentType && attachment.contentType.startsWith("video/"))) {
                            type = "video";
                            attachments.push({
                                file: uploader.downloadAttachment(attachment.url),
                                type
                            });
                        }

                        // audio files
                        // test for urls ending with .mp3, .wav, .m4a, .ogg, .aac or names with audio content type
                        else if ((/^(http(s)?:\/\/|www\.).*(\.mp3|\.wav|\.m4a|\.ogg|\.aac)$/gmi).test(attachment.url) || (attachment.contentType && attachment.contentType.startsWith("audio/"))) {
                            type = "audio";
                            attachments.push({
                                file: uploader.downloadAttachment(attachment.url),
                                type
                            });
                        }
                        console.log("<TICKET> Found attachment of type " + type);
                    });
                }

                if (event === "messageUpdate") {
                    database.updateTicketMessage(message.channel.topic, message.content, newMessage.content).catch(e => console.error(e));
                } else {
                    if (attachments.length > 0) {
                        attachments.forEach((attachment) => {
                            database.addTicketMessage(
                                message.channel.topic, // ticketId
                                attachment.file, // content of message
                                message.author.username, // username of user
                                message.author.avatarURL(), // avatar url of user
                                date, // date of message creation
                                m.displayHexColor, // hex color of user
                                message.createdAt, // date of message creation in MS
                                attachment.type, // type of message (text or image)
                                "false" // if message has been edited
                            ).catch(e => console.error(e));
                        });
                    } else {
                        database.addTicketMessage(
                            message.channel.topic, // ticketId
                            message.content, // content of message
                            message.author.username, // username of user
                            message.author.avatarURL(), // avatar url of user
                            date, // date of message creation
                            m.displayHexColor, // hex color of user
                            message.createdAt, // date of message creation in MS
                            type, // type of message (text or image)
                            "false" // if message has been edited
                        ).catch(e => console.error(e));
                    }
                }
            }).catch(e => console.error(e));
    }
}

module.exports = {
    build,
    execute,
    interaction,
    message
}