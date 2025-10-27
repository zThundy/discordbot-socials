const { RoleSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

class RoleSelect {
    constructor() {
        this.select = new RoleSelectMenuBuilder();
    }

    setCustomId(customId) {
        this.select.setCustomId(customId);
        return this;
    }

    setPlaceholder(placeholder) {
        this.select.setPlaceholder(placeholder);
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
    RoleSelect
}
