const MODERATION_LOG_EVENTS = [
    { type: "interaction", label: "Server interactions", description: "Slash commands, buttons, menus, and modals" },
    { type: "member.join", label: "Members joined", description: "Members joining the server" },
    { type: "member.leave", label: "Members left", description: "Members leaving the server" },
    { type: "member.update", label: "Member updates", description: "Nickname and role changes" },
    { type: "member.kick", label: "Member kicks", description: "Members kicked from the server" },
    { type: "member.verified", label: "Member verification", description: "Members completing verification" },
    { type: "message.delete", label: "Messages deleted", description: "Messages deleted by users or moderators" },
    { type: "message.update", label: "Messages edited", description: "Messages edited by their authors" },
    { type: "voice.join", label: "Voice joins", description: "Members joining voice channels" },
    { type: "voice.leave", label: "Voice leaves", description: "Members leaving voice channels" },
    { type: "voice.move", label: "Voice moves", description: "Members moving between voice channels" }
];

module.exports = { MODERATION_LOG_EVENTS };
