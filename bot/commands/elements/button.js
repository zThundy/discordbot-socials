const { ButtonBuilder, ButtonStyle } = require('discord.js');

class Button {
    constructor() {
        this.button = new ButtonBuilder();
    }

    setStyle(style) {
        // accept only ButtonStyle
        if (style instanceof ButtonStyle) {
            this.button.setStyle(style);
        } else {
            throw new Error("Invalid button style");
        }
    }

    setCustomId(customId) {
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
        // set customid as a required field
        if (!this.button.customId) {
            throw new Error("CustomId is required");
        }
        return this.button;
    }
}

module.exports = {
    Button
}