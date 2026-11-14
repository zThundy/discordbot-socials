const fs = require("fs");

class MakeHTML {
    constructor(config) {
        this.config = config;
        this.html = "";
    }

    _prepareHtml(ticket) {
        const data = fs.readFileSync("./ticketTemplate.html", 'utf-8')
        this.html = data;

        this.html = this.html.replace("{channelName}", ticket.channelName);
        this.html = this.html.replace("{ticketTitle}", ticket.title);
        this.html = this.html.replace("{ticketDescription}", ticket.description);
        this.html = this.html.replace("{botProfilePicture}", ticket.avatar);
    }

    _addMessage(message) {
        var messageTemplate = "";
        if (message.messageType === "text") {
            messageTemplate = `
            <div class="messages">
                <div class="message-container">
                    <div class="message-author-icon"><img src="{authorProfilePicture}" /></div>
                    <div class="message-content-container">
                        <div class="message-author"><span class="message-author-name" style="color: {roleColor}">{messageAuthor}</span> <span class="message-author-date">{messageDate}</span></div>
                        <div class="message-content">{messageContent}</div>
                    </div>
                </div>
            `
        } else if (message.messageType === "image") {
            messageTemplate = `
            <div class="messages">
                <div class="message-container">
                    <div class="message-author-icon"><img src="{authorProfilePicture}" /></div>
                    <div class="message-content-container">
                        <div class="message-author"><span class="message-author-name" style="color: {roleColor}">{messageAuthor}</span> <span class="message-author-date">{messageDate}</span></div>
                        <div class="message-content"><img style="width: 300px;" src="{messageContent}" /></div>
                    </div>
                </div>
            `
        } else if (message.messageType === "video") {
            messageTemplate = `
            <div class="messages">
                <div class="message-container">
                    <div class="message-author-icon"><img src="{authorProfilePicture}" /></div>
                    <div class="message-content-container">
                        <div class="message-author"><span class="message-author-name" style="color: {roleColor}">{messageAuthor}</span> <span class="message-author-date">{messageDate}</span></div>
                        <div class="message-content"><video style="width: 300px;" controls><source src="{messageContent}" type="video/mp4"></video></div>
                    </div>
                </div>
            `
        } else if (message.messageType === "audio") {
            messageTemplate = `
            <div class="messages">
                <div class="message-container">
                    <div class="message-author-icon"><img src="{authorProfilePicture}" /></div>
                    <div class="message-content-container">
                        <div class="message-author"><span class="message-author-name" style="color: {roleColor}">{messageAuthor}</span> <span class="message-author-date">{messageDate}</span></div>
                        <div class="message-content"><audio controls><source src="{messageContent}" type="audio/mpeg"></audio></div>
                    </div>
                </div>
            `
        } else if (message.messageType === "attachment") {
            messageTemplate = `
            <div class="messages">
                <div class="message-container">
                    <div class="message-author-icon"><img src="{authorProfilePicture}" /></div>
                    <div class="message-content-container">
                        <div class="message-author"><span class="message-author-name" style="color: {roleColor}">{messageAuthor}</span> <span class="message-author-date">{messageDate}</span></div>
                        <div class="message-content">{messageContent}</div>
                    </div>
                </div>
            `
        }

        messageTemplate = messageTemplate.replace("{authorProfilePicture}", message.authorProfile);
        messageTemplate = messageTemplate.replace("{roleColor}", message.color);
        messageTemplate = messageTemplate.replace("{messageAuthor}", message.username);
        if (message.edited === "true") message.currentTime += " (EDITED)";
        messageTemplate = messageTemplate.replace("{messageDate}", message.currentTime);
        messageTemplate = messageTemplate.replace("{messageContent}", message.messageType === "attachment"
            ? this._renderAttachment(message.content)
            : message.content);

        var top = this.html.split(`<div class="messages">`)[0];
        var bottom = this.html.split(`<div class="messages">`)[1];
        this.html = top + messageTemplate + bottom;
    }

    _renderAttachment(content) {
        let attachment;
        try {
            attachment = JSON.parse(content);
        } catch (error) {
            attachment = { url: content, name: "Attachment" };
        }

        if (!attachment || typeof attachment !== "object") {
            attachment = { url: "", name: "Attachment" };
        }
        const rawUrl = String(attachment.url || "");
        const url = this._escapeAttribute(/^https?:\/\//i.test(rawUrl) ? rawUrl : "");
        const name = this._escapeHtml(attachment.name || "Attachment");
        const contentType = (attachment.contentType || "").split(";")[0].toLowerCase();
        const extension = (attachment.name || "").split(".").pop().toLowerCase();
        const image = contentType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"].includes(extension);
        const video = contentType.startsWith("video/") || ["mp4", "webm", "mov", "mkv", "ogv"].includes(extension);
        const audio = contentType.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus"].includes(extension);
        const size = Number(attachment.size);
        const sizeLabel = Number.isFinite(size) && size > 0 ? ` <span class="attachment-size">(${this._formatSize(size)})</span>` : "";
        let preview = "";

        if (image) {
            preview = `<img class="attachment-preview" src="${url}" alt="${this._escapeAttribute(attachment.name || "Image")}" />`;
        } else if (video) {
            const type = contentType ? ` type="${this._escapeAttribute(contentType)}"` : "";
            preview = `<video class="attachment-preview" controls preload="metadata"><source src="${url}"${type}></video>`;
        } else if (audio) {
            const type = contentType ? ` type="${this._escapeAttribute(contentType)}"` : "";
            preview = `<audio controls preload="metadata"><source src="${url}"${type}></audio>`;
        }

        return `<div class="attachment">${preview}<a href="${url}" download="${this._escapeAttribute(attachment.name || "attachment")}">${name}</a>${sizeLabel}</div>`;
    }

    _formatSize(size) {
        const units = ["B", "KB", "MB", "GB"];
        let value = size;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    _escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    _escapeAttribute(value) {
        return this._escapeHtml(value);
    }

    writeHtmlFile(messages, ticket) {
        if (ticket)
            this._prepareHtml(ticket);

        if (messages)
            messages.forEach(message => {
                this._addMessage(message);
            });

        const filename =  ticket.ticketId + ".html";
        fs.writeFileSync(this.config.tickets.folder + "/" + filename, this.html);
        return filename;
    }
}

module.exports = { MakeHTML };