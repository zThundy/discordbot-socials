const { ChannelSelectMenuBuilder, ActionRowBuilder, ChannelType } = require('discord.js');

class ChannelSelect {
    constructor() {
        this.select = new ChannelSelectMenuBuilder();
    }

    setCustomId(customId) {
        this.select.setCustomId(customId);
        return this;
    }

    setPlaceholder(placeholder) {
        this.select.setPlaceholder(placeholder);
        return this;
    }

    // filter channel types (array of ChannelType)
    setChannelTypes(channelTypes) {
        this.select.setChannelTypes(channelTypes);
        return this;
    }

    setMinValues(minValues) {
        this.select.setMinValues(minValues);
        return this;
    }

    setMaxValues(maxValues) {
        this.select.setMaxValues(maxValues);
        return this;
    }

    build() {
        const row = new ActionRowBuilder()
            .addComponents(this.select);
        return row;
    }
}

module.exports = {
    ChannelSelect
}
