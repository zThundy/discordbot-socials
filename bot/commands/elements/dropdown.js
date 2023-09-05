const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

class SelectMenu {
    constructor() {
        this.selectMenu = new StringSelectMenuBuilder();
    }

    setCustomId(customId) {
        this.selectMenu.setCustomId(customId);
        return this;
    }

    setPlaceholder(placeholder) {
        this.selectMenu.setPlaceholder(placeholder);
        return this;
    }

    setMinValues(minValues) {
        this.selectMenu.setMinValues(minValues);
        return this;
    }

    setMaxValues(maxValues) {
        this.selectMenu.setMaxValues(maxValues);
        return this;
    }

    addOptions(options) {
        // check if options has label, value and description
        options.forEach(option => {
            if (!option.label || !option.value || !option.description) {
                throw new Error("Invalid option");
            }
        });
        this.selectMenu.addOptions(options);
        return this;
    }

    build() {
        const row = new ActionRowBuilder()
            .addComponents(this.selectMenu);
        return row;
    }
}

module.exports = {
    SelectMenu
}