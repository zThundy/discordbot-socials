const fs = require("fs");

class MakeHTML {
    constructor() {
        this.html = "";
    }

    _prepareHtml(ticket) {
        const data = fs.readFileSync("./ticketTemplate.html", 'utf-8')
        this.html = data;

        this.html = this.html.replace("{channelName}", ticket.channelName);
        this.html = this.html.replace("{ticketTitle}", ticket.title);
        this.html = this.html.replace("{ticketDescription}", ticket.description);
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
        }

        messageTemplate = messageTemplate.replace("{authorProfilePicture}", message.authorProfile);
        messageTemplate = messageTemplate.replace("{roleColor}", message.color);
        messageTemplate = messageTemplate.replace("{messageAuthor}", message.username);
        messageTemplate = messageTemplate.replace("{messageDate}", message.currentTime);
        messageTemplate = messageTemplate.replace("{messageContent}", message.content);

        var top = this.html.split(`<div class="messages">`)[0];
        var bottom = this.html.split(`<div class="messages">`)[1];
        this.html = top + messageTemplate + bottom;
    }

    writeHtmlFile(messages, ticket) {
        if (ticket)
            this._prepareHtml(ticket);

        if (messages)
            messages.forEach(message => {
                this._addMessage(message);
            });

        const filename =  ticket.ticketId + ".html";
        fs.writeFileSync("./bot/data/tickets/" + filename, this.html);
        return filename;
    }
}

module.exports = { MakeHTML };