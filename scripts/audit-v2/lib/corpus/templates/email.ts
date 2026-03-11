/**
 * Email thread template generators — RE:RE:FW: chains with buried decisions
 */

export type EmailMessage = {
    from: string;
    to: string[];
    cc?: string[];
    date: string;
    body: string;
};

export function generateEmailThread(params: {
    subject: string;
    messages: EmailMessage[];
}): string {
    const parts: string[] = [];

    // Emails display newest-first (like Outlook/Gmail export)
    const reversed = [...params.messages].reverse();

    for (let i = 0; i < reversed.length; i++) {
        const msg = reversed[i];
        const depth = reversed.length - 1 - i;
        const prefix = depth === 0 ? "" : "RE: ".repeat(Math.min(depth, 3));

        parts.push(
            `From: ${msg.from}`,
            `To: ${msg.to.join("; ")}`,
            ...(msg.cc?.length ? [`Cc: ${msg.cc.join("; ")}`] : []),
            `Date: ${msg.date}`,
            `Subject: ${prefix}${params.subject}`,
            "",
            msg.body,
        );

        if (i < reversed.length - 1) {
            parts.push("", "---", "");
        }
    }

    return parts.join("\n");
}

export function generateForwardedEmail(params: {
    subject: string;
    originalFrom: string;
    originalDate: string;
    originalBody: string;
    forwardFrom: string;
    forwardTo: string[];
    forwardDate: string;
    forwardBody: string;
}): string {
    return [
        `From: ${params.forwardFrom}`,
        `To: ${params.forwardTo.join("; ")}`,
        `Date: ${params.forwardDate}`,
        `Subject: FW: ${params.subject}`,
        "",
        params.forwardBody,
        "",
        "---------- Forwarded message ---------",
        `From: ${params.originalFrom}`,
        `Date: ${params.originalDate}`,
        `Subject: ${params.subject}`,
        "",
        params.originalBody,
    ].join("\n");
}

export const MIME_EMAIL = "text/plain";
