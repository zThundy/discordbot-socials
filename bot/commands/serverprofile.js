const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");

const internalId = "e86b25a7f11c4f6b9d21";

function build() {
    const command = new SlashCommandBuilder();
    command.setName("serverprofile");
    command.setDescription("Set this bot's avatar and banner for this server");
    command.setDMPermission(false);
    command.addStringOption(option => option
        .setName("action")
        .setDescription("Choose which server profile change to make")
        .setRequired(true)
        .addChoices(
            { name: "Set avatar and/or banner", value: "set" },
            { name: "Reset avatar and banner", value: "reset" }
        ));
    command.addAttachmentOption(option => option
        .setName("avatar")
        .setDescription("Image to use as the bot's avatar in this server")
        .setRequired(false));
    command.addAttachmentOption(option => option
        .setName("banner")
        .setDescription("Image to use as the bot's banner in this server")
        .setRequired(false));
    command.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);
    command.id = internalId;
    command.execute = execute;
    return command;
}

async function execute(interaction) {
    const action = interaction.options.getString("action", true);
    const avatar = interaction.options.getAttachment("avatar");
    const banner = interaction.options.getAttachment("banner");

    if (action === "set" && !avatar && !banner) {
        return interaction.reply({
            content: "Attach at least one image using the `avatar` or `banner` option.",
            flags: MessageFlags.Ephemeral
        });
    }
    if (action === "reset" && (avatar || banner)) {
        return interaction.reply({
            content: "Remove the image attachments when using the reset action.",
            flags: MessageFlags.Ephemeral
        });
    }

    for (const [label, attachment] of [["avatar", avatar], ["banner", banner]]) {
        if (attachment && (!attachment.contentType || !attachment.contentType.startsWith("image/"))) {
            return interaction.reply({
                content: `The ${label} attachment must be an image.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    const profile = action === "reset"
        ? { avatar: null, banner: null }
        : {
            ...(avatar ? { avatar: avatar.url } : {}),
            ...(banner ? { banner: banner.url } : {})
        };

    try {
        await interaction.guild.members.editMe(profile);
        const updated = action === "reset"
            ? "The bot's server avatar and banner have been reset."
            : `Updated the bot's server ${[
                avatar && "avatar",
                banner && "banner"
            ].filter(Boolean).join(" and ")}.`;
        return interaction.reply({ content: updated, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error(`Could not update the bot's server profile in guild ${interaction.guildId}:`, error);
        return interaction.reply({
            content: "I couldn't update the server profile. Discord may have rejected the image or the bot may not be able to customize its profile in this server.",
            flags: MessageFlags.Ephemeral
        });
    }
}

module.exports = { build, execute };
