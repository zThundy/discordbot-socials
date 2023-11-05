const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ChannelType, EmbedBuilder } = require("discord.js");
const { Modal } = require("./elements/modal.js");
const { Button } = require("./elements/button.js");
const { MakeHTML } = require("../modules/makehtml.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();

// create a random numberic id
const internalId = "145269985412354";

Number.prototype.pad = function(n) {
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
            var data = {};
            
            database.deleteTicketConfig(guild.id);

            // ask the user to type the title and the description of the selector
            interaction.reply("Please type the title of the ticket message\n\nIf you want to cancel the operation, send **cancel**");
            const filter = (m) => m.author.id === interaction.user.id;
            const collector = channel.createMessageCollector(filter, { time: 60000 });
            // generate and id for the selector with length 50
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
                    channel.send("Please type the description of the ticket message\n\nIf you want to cancel the operation, send **cancel**");
                    return;
                }
        
                // collect the description of the selector
                if (data.title && !data.description) {
                    data.description = m.content;
                    channel.send("Please tag the channel where the trascript will be sent to.\n\nIf you want to cancel the operation, send **cancel**\nIf you don't want one, type **done**");
                    return;
                }

                if (data.title && data.description && !data.transcriptChannel) {
                    if (m.content.toLowerCase() === "done") {
                        data.transcriptChannel = "0";
                    } else {
                        const channel = m.mentions.channels.first();
                        data.transcriptChannel = channel.id;
                    }

                    channel.send("Please send the tag to the role of your staff members.\n\nIf you want to cancel the operation, send **cancel**\nIf you are done adding roles, send **done**");
                    return;
                }
                
                // collect all the roles
                if (data.title && data.description && data.transcriptChannel) {
                    if (!data.collected) data.collected = [];
                    if (m.content.toLowerCase() === "done") {
                        // send the selector
                        m.reply("Ticketing system configuration completed!");
                        database.createTicketConfig(guild.id, JSON.stringify(data.collected), data.title, data.description, data.transcriptChannel);
                        return collector.stop();
                    }
                    const role = m.mentions.roles.first();
                    // check if the role in "collected" is already in the selector
                    if (data.collected.find((id) => id === role.id)) {
                        m.reply("This role is already part of the staff for the tickets");
                        return;
                    }
                    if (role) {
                        m.reply("Role added to staff list for the tickets");
                        data.collected.push(role.id);
                    } else {
                        m.reply("Please tag a valid role\n\nIf you want to cancel the operation, send **cancel**\nIf you are done adding roles, send **done**");
                    }
                }
            });
            break;
    }
}

// interaction command
async function interaction(interaction, database, _, config) {
    const userId = interaction.user.id;
    if (timeout.checkTimeout(userId)) return interaction.reply({ content: "You're doing that too fast", ephemeral: true });
    // add timeout to the user
    timeout.addTimeout(userId);

    const guild = interaction.guild;
    const user = interaction.user;

    // get the action to perform
    const action = interaction.customId.split(";")[0];
    switch (action) {
        case "ticketcreate":
            const modal = new Modal()
                .addTextComponent({
                    type: "short",
                    label: "Insert a title",
                    max: 250,
                    min: 20,
                    placeholder: "Title of the question... (max 250)",
                    required: true,
                    id: "titleofquestion"
                })
                .addTextComponent({
                    type: "paragraph",
                    label: "Type a description of the issue",
                    max: 4000,
                    min: 50,
                    placeholder: "Description of the issue... (max 4000)",
                    required: true,
                    id: "descriptionofquestion"
                })
                .setTitle("Explain the issue...")
                .setCustomId("openticketdata;" + internalId)
                .build();
        
            interaction.showModal(modal).catch(console.error);
            break;
        case "openticketdata":
            const title = interaction.fields.getTextInputValue('titleofquestion');
            const description = interaction.fields.getTextInputValue('descriptionofquestion');
            
            interaction.reply({ content: "Opening ticket...", ephemeral: true }).then(() => {
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
                            guild.channels.create({
                                name: 'ticket-' + id,
                                type: ChannelType.GuildText,
                                permissionOverwrites: permissions,
                                topic: ticketId
                            }).then(channel => {
                                interaction.editReply({ content: "📨 <#" + channel.id + "> opened!", components: [], ephemeral: true }).catch(console.error);
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
                            edited: ticket.edited
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
    }
}

function uuid() {
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c=='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

function message(event, message, database, uploader) {
    if (message.channel.name.includes("ticket-") && message.channel.topic) {
        message.guild.members.fetch(message.author.id)
            .then(m => {
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
                    message.attachments.forEach((attachment) => {
                        if ((/^https?:\/\/.+\jpg|jpeg|png|webp|avif|gif|svg$/i).test(attachment.url)) {
                            type = "image";
                            attachments.push({
                                file: uploader.downloadAttachment(attachment.url),
                                type
                            });
                        }

                        if ((/^(http(s)?:\/\/|www\.).*(\.mp4|\.mkv)$/gmi).test(attachment.url)) {
                            type = "video";
                            attachments.push({
                                file: uploader.downloadAttachment(attachment.url),
                                type
                            });
                        }
                    });
                }

                if (event === "messageUpdate") {
                    database.updateTicketMessage(message.channel.topic, args[0].content, args[1].content).catch(e => console.error(e));
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