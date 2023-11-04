const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

class Button {
    constructor() {
        this.button = new ButtonBuilder();
    }

    setStyle(style) {
        // accept only ButtonStyle
        if (style === "danger") {
            this.button.setStyle(ButtonStyle.Danger);
        } else if (style === "link") {
            this.button.setStyle(ButtonStyle.Link);
        } else if (style === "primary") {
            this.button.setStyle(ButtonStyle.Primary);
        } else if (style === "secondary") {
            this.button.setStyle(ButtonStyle.Secondary);
        } else if (style === "success") {
            this.button.setStyle(ButtonStyle.Success);
        } else {
            throw new Error("Invalid button style");
        }
        return this;
    }

    setCustomId(customId) {
        this.button.id = customId;
        this.button.setCustomId(customId);
        return this;
    }

    setLabel(label) {
        this.button.setLabel(label);
        return this;
    }

    setEmoji(emoji) {
        this.button.setEmoji(emoji);
        return this;
    }

    setURL(url) {
        this.button.setURL(url);
        return this;
    }

    setDisabled(disabled) {
        this.button.setDisabled(disabled);
        return this;
    }

    build() {
        const row = new ActionRowBuilder()
            .addComponents(this.button);
        return row;
    }
}

module.exports = {
    Button
}