/**
 * Chat export template generators — Slack-style timestamped logs
 */

export type ChatMessage = {
    timestamp: string;
    handle: string;
    message: string;
    reaction?: string;
    threadReply?: boolean;
};

export function generateChatExport(params: {
    channel: string;
    date: string;
    messages: ChatMessage[];
}): string {
    const lines: string[] = [
        `#${params.channel} — ${params.date}`,
        `--- exported chat log ---`,
        "",
    ];

    for (const msg of params.messages) {
        const prefix = msg.threadReply ? "  ↳ " : "";
        lines.push(`${prefix}[${msg.timestamp}] @${msg.handle}: ${msg.message}`);
        if (msg.reaction) {
            lines.push(`    ${msg.reaction}`);
        }
    }

    return lines.join("\n");
}

export function generateIncidentChat(params: {
    channel: string;
    incidentId: string;
    messages: ChatMessage[];
}): string {
    const lines: string[] = [
        `#${params.channel} — Incident ${params.incidentId}`,
        `--- incident channel log ---`,
        "",
    ];

    for (const msg of params.messages) {
        const prefix = msg.threadReply ? "  ↳ " : "";
        lines.push(`${prefix}[${msg.timestamp}] @${msg.handle}: ${msg.message}`);
        if (msg.reaction) {
            lines.push(`    ${msg.reaction}`);
        }
    }

    return lines.join("\n");
}

export const MIME_CHAT = "text/plain";
