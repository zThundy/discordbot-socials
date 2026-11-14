const { SlashCommandBuilder, PermissionsBitField, ActionRowBuilder, ChannelType, EmbedBuilder, MessageFlags } = require("discord.js");
const { Modal } = require("./elements/modal.js");
const { Button } = require("./elements/button.js");
const { RoleSelect } = require("./elements/roleSelect.js");
const { ChannelSelect } = require("./elements/channelSelect.js");
const { MakeHTML } = require("../modules/makehtml.js");
const { Timeout } = require("../modules/timeout.js");
const timeout = new Timeout();
const setupCache = new Map();
const DEFAULT_TICKET_TITLE_MIN_LENGTH = 10;
const DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH = 20;

// create a random numberic id
const internalId = "2210adf889449ecdfd9c";
const channelPrefixes = new Map();

Number.prototype.pad = function (n) {
    return new Array(n).join('0').slice((n || 2) * -1) + this;
}

function parseRequirementToggle(value, fallback) {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (["yes", "y", "true", "1", "on"].includes(normalized)) return true;
    if (["no", "n", "false", "0", "off"].includes(normalized)) return false;

    return fallback;
}

function parseRequirementLength(value, fallback) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);

    if (Number.isFinite(parsed) && parsed >= 0) return parsed;

    return fallback;
}

function isRequirementEnabled(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;

    return !["0", "false", "no"].includes(String(value).trim().toLowerCase());
}

function buildSetupReviewEmbed(cache) {
    return {
        title: "Ticket setup — review",
        description: "Review the title and description below, then select staff roles and an optional transcript channel. Use Finish setup to save, or Send in channel to post the ticket message.",
        color: 0x00FF00,
        timestamp: new Date().toISOString(),
        footer: { text: "Finish to save the configuration" },
        fields: [
            { name: "Title", value: cache.title || "(no title)" },
            { name: "Description", value: cache.description || "(no description)" },
            { name: "Title required", value: cache.titleRequired ? "Yes" : "No", inline: true },
            { name: "Title minimum length", value: String(cache.titleMinLength ?? DEFAULT_TICKET_TITLE_MIN_LENGTH), inline: true },
            { name: "Description required", value: cache.descriptionRequired ? "Yes" : "No", inline: true },
            { name: "Description minimum length", value: String(cache.descriptionMinLength ?? DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH), inline: true }
        ]
    };
}

function buildTicketSetupRequirementsReply(guild, setupState) {
    const requirementsButton = new Button()
        .setCustomId("ticket_setup_requirements;" + internalId + ";" + guild.id)
        .setLabel("Configure form requirements")
        .setStyle("primary")
        .build();

    return {
        embeds: [{
            title: "Ticket setup — requirements",
            description: "Title and description saved. Click the button below to choose whether the ticket form title and description are required, and set their minimum lengths.",
            color: 0x00FF00,
            timestamp: new Date().toISOString(),
            footer: { text: "Continue to the next setup step" },
            fields: [
                { name: "Title", value: setupState.title || "(no title)" },
                { name: "Description", value: setupState.description || "(no description)" }
            ]
        }],
        components: [requirementsButton]
    };
}

function buildTicketMessagePayload(res) {
    return {
        embeds: [{
            title: res.title,
            description: res.description,
            color: 0x00FF00,
            timestamp: new Date().toISOString(),
            footer: {
                text: "Made with ❤️ by zThundy__"
            }
        }],
        components: [new Button()
            .setCustomId("ticketcreate;" + internalId)
            .setLabel("Open ticket")
            .setEmoji("📨")
            .setStyle("secondary")
            .build()]
    };
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
            try {
                // start a message-based flow to ask for title and description, then proceed with select menus for roles/channel
                database.deleteTicketConfig(guild.id);
                const setupState = {
                    title: "",
                    description: "",
                    titleRequired: true,
                    titleMinLength: DEFAULT_TICKET_TITLE_MIN_LENGTH,
                    descriptionRequired: true,
                    descriptionMinLength: DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH,
                    collected: [],
                    transcriptChannel: "0",
                    author: interaction.user.id,
                    channelId: interaction.channel.id,
                    setupInteraction: interaction,
                    titlePending: true,
                    descriptionPending: false
                };

                interaction.reply({ content: "Send the **ticket title** as a message in this channel. You can use formatting like bold, mentions, or emojis.", flags: MessageFlags.Ephemeral }).catch(console.error);

                const filter = (m) => m.author.id === interaction.user.id && m.channel.id === interaction.channel.id;
                const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 2 });

                let collectedTitle = "";

                console.log("<TICKET> Starting message collector for ticket setup with filter:", filter);
                collector.on("collect", async (message) => {
                    console.log("<TICKET> Collected message during setup:", message.content);
                    if (!collectedTitle) {
                        collectedTitle = message.content;
                        setupState.title = message.content;
                        setupState.titlePending = false;
                        setupState.descriptionPending = true;
                        setupCache.set(guild.id, setupState);

                        await interaction.followUp({ content: "Now send the **ticket description** as a message in this channel.", flags: MessageFlags.Ephemeral }).catch(console.error);
                        return;
                    }

                    setupState.description = message.content;
                    setupState.descriptionPending = false;
                    setupCache.set(guild.id, setupState);
                    collector.stop("done");

                    const requirementsButton = new Button()
                        .setCustomId("ticket_setup_requirements;" + internalId + ";" + guild.id)
                        .setLabel("Configure form requirements")
                        .setStyle("primary")
                        .build();

                    const embed = {
                        title: "Ticket setup — requirements",
                        description: "Title and description saved. Click the button below to choose whether the ticket form title and description are required, and set their minimum lengths.",
                        color: 0x00FF00,
                        timestamp: new Date().toISOString(),
                        footer: { text: "Continue to the next setup step" },
                        fields: [
                            { name: "Title", value: setupState.title || "(no title)" },
                            { name: "Description", value: setupState.description || "(no description)" }
                        ]
                    };

                    await interaction.followUp({ embeds: [embed], components: [requirementsButton], flags: MessageFlags.Ephemeral }).catch(console.error);
                });

                collector.on("end", async (_, reason) => {
                    if (reason === "done") return;
                    if (setupCache.get(guild.id) && setupState.descriptionPending) {
                        setupCache.delete(guild.id);
                        await interaction.followUp({ content: "Ticket setup timed out while waiting for your messages.", flags: MessageFlags.Ephemeral }).catch(console.error);
                    }
                });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error starting the setup message flow.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }

            break;
    }
}

// interaction command
async function interaction(interaction, database, _, config) {
    console.log("<TICKET> Interaction received:", interaction.customId);
    const userId = interaction.user.id;
    const guild = interaction.guild;
    const user = interaction.user;

    // get the action to perform
    const action = interaction.customId.split(";")[0];
    const setupActions = new Set([
        "ticket_setup_requirements",
        "ticket_setup_send_channel",
        "ticketsetup_send_channel_modal",
        "ticket_setup_roles",
        "ticket_setup_channel",
        "ticket_setup_finish"
    ]);

    // if (!setupActions.has(action)) {
    //     if (timeout.checkTimeout(userId)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
    //     // add timeout to the user
    //     timeout.addTimeout(userId);
    // }

    console.log("<TICKET> Processing action:", action, "for user:", userId);
    switch (action) {
        case "ticketsetup_modal":
            break;
        case "ticket_setup_requirements":
            try {
                const cache = setupCache.get(guild.id);
                if (!cache) return interaction.reply({ content: "No setup in progress.", flags: MessageFlags.Ephemeral });

                const requirementsModal = new Modal()
                    .addTextComponent({
                        type: "short",
                        label: "Is the ticket title required? (yes/no)",
                        max: 5,
                        min: 1,
                        placeholder: "yes/y/1/true",
                        required: true,
                        id: "setup_title_required"
                    })
                    .addTextComponent({
                        type: "short",
                        label: "Minimum title length when required",
                        max: 3,
                        min: 1,
                        placeholder: String(DEFAULT_TICKET_TITLE_MIN_LENGTH),
                        required: true,
                        id: "setup_title_min_length"
                    })
                    .addTextComponent({
                        type: "short",
                        label: "Is the ticket description required? (yes/no)",
                        max: 5,
                        min: 1,
                        placeholder: "yes/y/1/true",
                        required: true,
                        id: "setup_description_required"
                    })
                    .addTextComponent({
                        type: "short",
                        label: "Minimum description length when required",
                        max: 3,
                        min: 1,
                        placeholder: String(DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH),
                        required: true,
                        id: "setup_description_min_length"
                    })
                    .addTextComponent({
                        type: "short",
                        label: "Ticket channel prefix",
                        max: 50,
                        min: 1,
                        placeholder: "ticket-",
                        required: true,
                        id: "setup_tickets_prefix"
                    })
                    .setTitle("Ticket setup - form requirements")
                    .setCustomId("ticketsetup_requirements_modal;" + internalId + ";" + guild.id)
                    .build();

                interaction.showModal(requirementsModal).catch(console.error);
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error opening the requirements step.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticketsetup_requirements_modal":
            try {
                const cache = setupCache.get(guild.id);
                if (!cache) return interaction.reply({ content: "No setup in progress.", flags: MessageFlags.Ephemeral });

                const titleRequired = parseRequirementToggle(interaction.fields.getTextInputValue('setup_title_required'), true);
                const titleMinLength = parseRequirementLength(interaction.fields.getTextInputValue('setup_title_min_length'), DEFAULT_TICKET_TITLE_MIN_LENGTH);
                const descriptionRequired = parseRequirementToggle(interaction.fields.getTextInputValue('setup_description_required'), true);
                const descriptionMinLength = parseRequirementLength(interaction.fields.getTextInputValue('setup_description_min_length'), DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH);
                const ticketsPrefix = String(interaction.fields.getTextInputValue('setup_tickets_prefix') || 'ticket-').trim();

                cache.titleRequired = titleRequired;
                cache.titleMinLength = titleMinLength;
                cache.descriptionRequired = descriptionRequired;
                cache.descriptionMinLength = descriptionMinLength;
                cache.ticketsPrefix = ticketsPrefix || 'ticket-';
                setupCache.set(guild.id, cache);

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
                    .setStyle("primary");

                const sendButton = new Button()
                    .setCustomId("ticket_setup_send_channel;" + internalId + ";" + guild.id)
                    .setLabel("Send in channel")
                    .setStyle("secondary");

                const actionButtons = new ActionRowBuilder()
                    .addComponents(finishButton.buildNoRow(), sendButton.buildNoRow());

                const embed = buildSetupReviewEmbed(cache);

                await interaction.reply({ embeds: [embed], components: [roleSelect, channelSelect, actionButtons], flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error processing the requirements step.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticket_setup_send_channel":
            try {
                const cache = setupCache.get(guild.id);
                if (!cache) return interaction.reply({ content: "No setup in progress.", flags: MessageFlags.Ephemeral });

                const sendModal = new Modal()
                    .addTextComponent({
                        type: "short",
                        label: "Channel ID or mention to send the message",
                        max: 50,
                        min: 2,
                        placeholder: "#ticket-channel or channel ID",
                        required: true,
                        id: "setup_send_channel"
                    })
                    .setTitle("Send ticket message")
                    .setCustomId("ticketsetup_send_channel_modal;" + internalId + ";" + guild.id)
                    .build();

                interaction.showModal(sendModal).catch(console.error);
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error opening the send modal.", flags: MessageFlags.Ephemeral }).catch(console.error);
            }
            break;
        case "ticketsetup_send_channel_modal":
            try {
                const cache = setupCache.get(guild.id);
                if (!cache) return interaction.reply({ content: "No setup in progress.", flags: MessageFlags.Ephemeral });

                const rawChannelValue = interaction.fields.getTextInputValue('setup_send_channel').trim();
                const channelId = rawChannelValue.replace(/[<#>]/g, "").trim();
                const targetChannel = guild.channels.cache.get(channelId);

                if (!targetChannel || !targetChannel.isTextBased()) {
                    return interaction.reply({ content: "I couldn't find a valid text channel with that value.", flags: MessageFlags.Ephemeral });
                }

                const roles = cache.collected || [];
                const transcript = cache.transcriptChannel || "0";
                const questionTitleRequired = cache.titleRequired ? 1 : 0;
                const questionTitleMinLength = cache.titleMinLength ?? DEFAULT_TICKET_TITLE_MIN_LENGTH;
                const questionDescriptionRequired = cache.descriptionRequired ? 1 : 0;
                const questionDescriptionMinLength = cache.descriptionMinLength ?? DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH;

                // ensure tickets category exists and get its id
                let categoryId = '0';
                let existingCategory = guild.channels.cache.find(c => c.name.toLowerCase().trim() === "tickets" && c.type === ChannelType.GuildCategory);
                if (existingCategory) categoryId = existingCategory.id;
                else {
                    try {
                        const created = await guild.channels.create({ name: 'tickets', type: ChannelType.GuildCategory });
                        categoryId = created.id;
                    } catch (e) {
                        console.error(e);
                    }
                }

                await database.createTicketConfig(
                    guild.id,
                    JSON.stringify(roles),
                    cache.title,
                    cache.description,
                    transcript,
                    categoryId,
                    questionTitleRequired,
                    questionTitleMinLength,
                    questionDescriptionRequired,
                    questionDescriptionMinLength,
                    cache.ticketsPrefix || 'ticket-'
                );

                try {
                    await targetChannel.send(buildTicketMessagePayload(cache));
                } catch (sendError) {
                    console.error(sendError);
                    await database.deleteTicketConfig(guild.id);
                    return interaction.reply({ content: "The configuration was not saved because I couldn't send the message to that channel.", flags: MessageFlags.Ephemeral }).catch(console.error);
                }

                setupCache.delete(guild.id);
                await interaction.reply({ content: `Ticket message sent in <#${targetChannel.id}> and configuration saved.`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                console.error(e);
                interaction.reply({ content: "There was an error sending the ticket message.", flags: MessageFlags.Ephemeral }).catch(console.error);
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
                database.createTicketConfig(
                    guild.id,
                    JSON.stringify(roles),
                    cache.title,
                    cache.description,
                    transcript,
                    '0',
                    cache.titleRequired ? 1 : 0,
                    cache.titleMinLength ?? DEFAULT_TICKET_TITLE_MIN_LENGTH,
                    cache.descriptionRequired ? 1 : 0,
                    cache.descriptionMinLength ?? DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH,
                    cache.ticketsPrefix || 'ticket-'
                ).then(() => {
                    // ensure tickets category exists (if it wasn't set above)
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
                        database.getNextTicketId(guild.id).then(async id => {
                            id = Number(id).pad(4);
                            const ticketId = uuid();
                            const retentionDays = Number(config.uploader.deleteFilesAfterDays ?? 1);
                            const disclaimer = config.uploader.deleteFiles
                                ? `Uploaded files are automatically deleted after ${retentionDays} day${retentionDays === 1 ? "" : "s"}.`
                                : "Automatic deletion of uploaded files is disabled.";
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
                                    },
                                    {
                                        name: "Disclaimer",
                                        value: disclaimer
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
                            // determine parent category: prefer configured category id, fallback to category named 'tickets'
                            let parentId;
                            if (res.ticketsCategoryId && guild.channels.cache.get(res.ticketsCategoryId)) {
                                parentId = res.ticketsCategoryId;
                            } else {
                                const found = guild.channels.cache.find(c => c.name.toLowerCase().trim() === "tickets" && c.type === ChannelType.GuildCategory);
                                if (found) {
                                    parentId = found.id;
                                } else {
                                    // create the tickets category and persist it to DB
                                    try {
                                        const createdCategory = await guild.channels.create({ name: 'tickets', type: ChannelType.GuildCategory });
                                        parentId = createdCategory.id;
                                        // update stored ticket config with new category id
                                        try {
                                            // remove old config row and recreate with same values plus new category id
                                            await database.deleteTicketConfig(guild.id);
                                            await database.createTicketConfig(
                                                guild.id,
                                                res.tagRole,
                                                res.title,
                                                res.description,
                                                res.transcriptChannel || '0',
                                                parentId,
                                                res.questionTitleRequired,
                                                res.questionTitleMinLength,
                                                res.questionDescriptionRequired,
                                                res.questionDescriptionMinLength,
                                                res.ticketsPrefix || 'ticket-'
                                            );
                                        } catch (dbErr) {
                                            console.error("Failed to persist ticketsCategoryId to DB:", dbErr);
                                        }
                                    } catch (e) {
                                        console.error("Failed to create tickets category:", e);
                                    }
                                }
                            }

                            // create the channel
                            const prefix = (res && res.ticketsPrefix) ? res.ticketsPrefix : 'ticket-';
                            channelPrefixes.set(guild.id, prefix);
                            guild.channels.create({
                                name: prefix + id,
                                type: ChannelType.GuildText,
                                permissionOverwrites: permissions,
                                topic: ticketId,
                                parent: parentId
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
                                    content: "Hello, <@" + user.id + ">, thank you for opening a ticket.\n" + string + " will be with you shortly.\n",
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
            if (timeout.checkTimeout(user)) return interaction.reply({ content: "You're doing that too fast", flags: MessageFlags.Ephemeral });
            // add timeout to the user
            timeout.addTimeout(user, { guild: guild });

            database.getTicketConfig(guild.id).then((res) => {
                if (!res) {
                    interaction.reply({ content: 'Please setup the ticketing system first using the **/ticket** command', flags: MessageFlags.Ephemeral }).catch(console.error);
                    return;
                }

                const titleRequired = isRequirementEnabled(res.questionTitleRequired, true);
                const descriptionRequired = isRequirementEnabled(res.questionDescriptionRequired, true);
                const titleMinLength = titleRequired ? parseRequirementLength(res.questionTitleMinLength, DEFAULT_TICKET_TITLE_MIN_LENGTH) : undefined;
                const descriptionMinLength = descriptionRequired ? parseRequirementLength(res.questionDescriptionMinLength, DEFAULT_TICKET_DESCRIPTION_MIN_LENGTH) : undefined;

                const modal = new Modal()
                    .addTextComponent({
                        type: "short",
                        label: `Insert a title${titleRequired ? " (required)" : " (optional)"}`,
                        max: 250,
                        min: titleMinLength,
                        placeholder: titleRequired ? `Title of the question... (min ${titleMinLength})` : "Title of the question...",
                        required: titleRequired,
                        id: "titleofquestion"
                    })
                    .addTextComponent({
                        type: "paragraph",
                        label: `Type a description of the issue${descriptionRequired ? " (required)" : " (optional)"}`,
                        max: 4000,
                        min: descriptionMinLength,
                        placeholder: descriptionRequired ? `Description of the issue... (min ${descriptionMinLength})` : "Description of the issue...",
                        required: descriptionRequired,
                        id: "descriptionofquestion"
                    })
                    .setTitle("Explain the issue...")
                    .setCustomId("openticketdata;" + internalId)
                    .build();

                interaction.showModal(modal).catch(console.error);
            }).catch(console.error);
            break;
    }
}

function message(event, message, newMessage, { database, uploader }) {
    const channelPrefix = channelPrefixes.get(message.guild.id) || "ticket-";
    if (!message.channel.name.includes(channelPrefix) || !message.channel.topic) return;

    return message.guild.members.fetch(message.author.id).then(async member => {
        const currentMessage = event === "messageUpdate" && newMessage ? newMessage : message;
        const createdAt = currentMessage.createdAt;
        const date = ('0' + createdAt.getDate()).slice(-2) +
            "/" + ('0' + (createdAt.getMonth() + 1)).slice(-2) +
            "/" + createdAt.getFullYear() +
            " " + ('0' + createdAt.getHours()).slice(-2) +
            ":" + ('0' + createdAt.getMinutes()).slice(-2) +
            ":" + ('0' + createdAt.getSeconds()).slice(-2);
        if (event === "messageUpdate") {
            const content = await transformMessageContent(currentMessage, uploader);
            const updated = await database.updateTicketMessage(
                message.channel.topic, currentMessage.id, message.content, content
            );
            if (!updated && content) {
                await database.addTicketMessage(
                    message.channel.topic, content, currentMessage.author.username, currentMessage.author.avatarURL(),
                    date, member.displayHexColor, createdAt, "text", "true", currentMessage.id
                );
            }
            return;
        }

        try {
            const content = await transformMessageContent(currentMessage, uploader);
            if (content) {
                await database.addTicketMessage(
                    message.channel.topic, content, currentMessage.author.username, currentMessage.author.avatarURL(),
                    date, member.displayHexColor, createdAt, "text", "false", currentMessage.id
                );
            }

            for (const attachment of currentMessage.attachments.values()) {
                try {
                    const url = await uploader.downloadAttachment(
                        attachment.url, attachment.name, attachment.contentType
                    );
                    await database.addTicketMessage(
                        message.channel.topic,
                        JSON.stringify({
                            url,
                            name: attachment.name,
                            contentType: attachment.contentType,
                            size: attachment.size
                        }),
                        currentMessage.author.username,
                        currentMessage.author.avatarURL(),
                        date,
                        member.displayHexColor,
                        createdAt,
                        "attachment",
                        "false",
                        currentMessage.id
                    );
                } catch (error) {
                    console.error("Failed to download ticket attachment", attachment.url, error);
                }
            }
        } catch (error) {
            console.error(error);
        }
    }).catch(error => console.error(error));
}

async function transformMessageContent(message, uploader) {
    let content = message.content || "";
    const downloadedImagePaths = new Set();
    if (content) {
        content = await replaceCustomEmojis(content, uploader);
        content = await replaceImageLinks(content, uploader, downloadedImagePaths);
        content = await replaceUnicodeEmojis(content, uploader);
    }

    const embeddedMedia = await downloadEmbeddedMedia(message.embeds, uploader, downloadedImagePaths);
    if (embeddedMedia) {
        content = content ? `${content}<br/>${embeddedMedia}` : embeddedMedia;
    }
    return content;
}

async function downloadEmbeddedMedia(embeds, uploader, downloadedImagePaths) {
    const rendered = [];
    const renderedUrls = new Set();
    for (const embed of embeds || []) {
        const assets = [embed.image, embed.video, embed.thumbnail].filter(asset => asset && asset.url);
        const asset = assets.find(candidate => getEmbedAssetType(candidate) === "image" && /\.gif$/i.test(getUrlPath(candidate.url)))
            || assets.find(candidate => getEmbedAssetType(candidate) === "video")
            || assets.find(candidate => getEmbedAssetType(candidate) === "image");
        if (!asset) continue;

        const assetType = getEmbedAssetType(asset);
        const assetPath = getUrlPath(asset.url);
        if (assetType === "image" && downloadedImagePaths.has(assetPath)) continue;
        if (renderedUrls.has(asset.url)) continue;

        const candidates = Array.from(new Set([asset.url, asset.proxyURL].filter(Boolean)));
        let lastError;
        let renderedAsset = false;
        for (const url of candidates) {
            try {
                const local = await uploader.downloadAttachment(
                    url,
                    undefined,
                    getEmbedAssetMimeType(asset)
                );
                const safeUrl = escapeHtml(local);
                if (assetType === "video") {
                    rendered.push(`<video style="width:300px;max-width:100%;" controls preload="metadata"><source src="${safeUrl}"></video>`);
                } else {
                    rendered.push(`<img src="${safeUrl}" style="width:300px;max-width:100%;"/>`);
                    downloadedImagePaths.add(getUrlPath(url));
                }
                renderedUrls.add(asset.url);
                renderedAsset = true;
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!renderedAsset && lastError) {
            console.warn("Failed to download media from Discord embed", asset.url, lastError);
        }
    }
    return rendered.join("<br/>");
}

function getEmbedAssetType(asset) {
    const contentType = (asset.contentType || "").split(";")[0].toLowerCase();
    if (contentType.startsWith("image/")) return "image";
    if (contentType.startsWith("video/")) return "video";

    const pathname = getUrlPath(asset.url);
    if (/\.(?:png|jpe?g|webp|avif|gif|svg|bmp)$/i.test(pathname)) return "image";
    if (/\.(?:mp4|webm|mov|mkv|ogv)$/i.test(pathname)) return "video";
    return null;
}

function getEmbedAssetMimeType(asset) {
    const contentType = (asset.contentType || "").split(";")[0].toLowerCase();
    if (contentType) return contentType;

    const extension = /\.([a-z0-9]+)$/i.exec(getUrlPath(asset.url));
    if (!extension) return "";
    const mimeTypes = {
        avif: "image/avif",
        bmp: "image/bmp",
        gif: "image/gif",
        jpeg: "image/jpeg",
        jpg: "image/jpeg",
        mkv: "video/x-matroska",
        mp4: "video/mp4",
        mov: "video/quicktime",
        ogv: "video/ogg",
        png: "image/png",
        svg: "image/svg+xml",
        webm: "video/webm",
        webp: "image/webp"
    };
    return mimeTypes[extension[1].toLowerCase()] || "";
}

function getUrlPath(url) {
    try {
        return new URL(url).pathname;
    } catch (error) {
        return "";
    }
}

function init(database, extra) {
    console.log(" > Initializing ticket module...");
    const client = extra.client;
    for (const guild of client.guilds.cache.values()) {
        database.getTicketConfig(guild.id).then((res) => {
            if (res && res.ticketsPrefix) {
                console.log(`<TICKET> Loaded ticket prefix for guild ${guild.id}: ${res.ticketsPrefix}`);
                channelPrefixes.set(guild.id, res.ticketsPrefix);
            }
        }).catch(console.error);
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

async function replaceCustomEmojis(content, uploader) {
    return replaceAsync(content, /<(a?):([^:>]+):(\d+)>/g, async (match, animatedFlag, name, id) => {
        try {
            const isAnimated = animatedFlag === 'a';
            const ext = isAnimated ? 'gif' : 'png';
            const url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
            const local = await uploader.downloadAttachment(url, `emoji.${ext}`);
            return `<img src="${local}" alt=":${name}:" style="width:20px;height:20px;vertical-align:middle;"/>`;
        } catch (e) {
            console.error("Failed to replace custom emoji", e);
            return match;
        }
    });
}

async function replaceImageLinks(content, uploader, downloadedImagePaths = new Set()) {
    return replaceAsync(content, /https?:\/\/[^\s<>"']+/gi, async match => {
        const { url, suffix } = splitTrailingUrlPunctuation(match);
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch (e) {
            return match;
        }

        if (!/\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(parsedUrl.pathname)) {
            return match;
        }

        try {
            const local = await uploader.downloadAttachment(url);
            downloadedImagePaths.add(parsedUrl.pathname);
            return `<img src="${local}" style="width:300px;"/>${suffix}`;
        } catch (e) {
            const notFound = e.message && e.message.includes("HTTP status 404");
            if (notFound) {
                console.warn("Linked image is unavailable (HTTP 404); preserving it as a transcript link", url);
            } else {
                console.error("Failed to download image link", url, e);
            }
            const label = notFound ? "Image unavailable (404)" : url;
            return `<a class="image-link-fallback" href="${escapeHtml(url)}">${escapeHtml(label)}</a>${suffix}`;
        }
    });
}

function splitTrailingUrlPunctuation(value) {
    let end = value.length;
    while (end > 0 && /[.,!?;:]/.test(value[end - 1])) end--;

    const openingParentheses = (value.slice(0, end).match(/\(/g) || []).length;
    let closingParentheses = (value.slice(0, end).match(/\)/g) || []).length;
    while (end > 0 && value[end - 1] === ")" && closingParentheses > openingParentheses) {
        end--;
        closingParentheses--;
    }

    return { url: value.slice(0, end), suffix: value.slice(end) };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

async function replaceUnicodeEmojis(content, uploader) {
    // replace each Extended Pictographic character (emoji) with twemoji pngs
    return replaceAsync(content, /\p{Extended_Pictographic}/gu, async (match) => {
        try {
            // build codepoint sequence for the matched grapheme
            const codepoints = Array.from(match).map(c => c.codePointAt(0).toString(16)).join('-');
            const url = `https://twemoji.maxcdn.com/v/latest/72x72/${codepoints}.png`;
            const local = await uploader.downloadAttachment(url, "emoji.png");
            return `<img src="${local}" alt="${match}" style="width:20px;height:20px;vertical-align:middle;"/>`;
        } catch (e) {
            console.error("Failed to replace unicode emoji", e);
            return match;
        }
    });
}

async function replaceAsync(content, regex, replacer) {
    const matches = Array.from(content.matchAll(regex));
    const replacements = await Promise.all(matches.map(match => replacer(...match)));
    let result = content;
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        result = result.slice(0, match.index) + replacements[i] + result.slice(match.index + match[0].length);
    }
    return result;
}

module.exports = {
    init,
    build,
    execute,
    interaction,
    message
}