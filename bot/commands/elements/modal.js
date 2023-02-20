const { ActionRowBuilder, Events, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

class Modal {
    constructor() {
        this.modal = new ModalBuilder();
        this.rows = [];
    }

    setCustomId(id) {
        this.modal.id = id;
        this.modal.setCustomId(id);
        return this;
    }

    setTitle(title) {
        this.modal.setTitle(title);
        return this;
    }

    /**
     * 
     * @param {Array} options 
     * @param {String} options.type could be "short" or "paragraph"
     * @param {String} options.label will be the label of the current text field
     * @param {Number} options.max will be the max number of characters you can put in the field
     * @param {Number} options.min will be the min amount of character you need to put in the field
     * @param {String} options.placeholder will the placeholder value in the text field; Default: "Type something here..."
     * @param {Boolean} options.required will set the field as required input or not; Default: true 
     * @param {String} options.id will be the ID of the current modal text input field; Default: Random generated ID
     * @returns 
     */
    addTextComponent(options) {
        const field = new TextInputBuilder();

        if (options.type === "short") {
            field.setStyle(TextInputStyle.Short);
        } else if (options.type === "paragraph") {
            field.setStyle(TextInputStyle.Paragraph);
        }

        if (options.label) {
            field.setLabel(options.label);
        }

        if (options.max) {
            field.setMaxLength(Number(options.max));
        }

        if (options.min) {
            field.setMinLength(Number(options.min));
        }

        field.setPlaceholder(String(options.placeholder) || "Type something here...");
        field.setRequired(Boolean(options.required) || false);

        if (!options.id) field.setCustomId((Math.random() + 1).toString(36).substring(7))
        field.setCustomId(String(options.id))

        const row = new ActionRowBuilder().addComponents(field);
        this.modal.addComponents(row);
        return this;
    }

    build() {
        if (!this.modal.id) {
            throw new Error("CustomId is required");
        }
        return this.modal;
    }
}

module.exports = {
    Modal
}