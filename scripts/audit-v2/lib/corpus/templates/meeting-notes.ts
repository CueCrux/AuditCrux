/**
 * Meeting notes template generators — rough notes with typos, shorthand, TODOs
 *
 * Deliberately messy to simulate real-world notes.
 */

export type ActionItem = {
    assignee: string;
    task: string;
    done?: boolean;
};

export function generateMeetingNotes(params: {
    title: string;
    date: string;
    attendees: string[];
    location: string;
    notes: string[];
    actionItems: ActionItem[];
    decisions?: string[];
}): string {
    const lines: string[] = [
        `# ${params.title}`,
        `${params.date} | ${params.location}`,
        "",
        `Attendees: ${params.attendees.join(", ")}`,
        "",
        "## Notes",
        "",
    ];

    for (const note of params.notes) {
        lines.push(`- ${note}`);
    }

    if (params.decisions?.length) {
        lines.push("", "## Decisions");
        for (const d of params.decisions) {
            lines.push(`- DECIDED: ${d}`);
        }
    }

    lines.push("", "## Action Items", "");
    for (const ai of params.actionItems) {
        const check = ai.done ? "[x]" : "[ ]";
        lines.push(`- ${check} @${ai.assignee} — ${ai.task}`);
    }

    return lines.join("\n");
}

/** Deliberately messy notes — typos, shorthand, incomplete thoughts */
export function generateRoughNotes(params: {
    title: string;
    date: string;
    scribe: string;
    rawNotes: string[];
    todos: string[];
}): string {
    const lines: string[] = [
        `${params.title}`,
        `${params.date} - notes by ${params.scribe}`,
        "",
    ];

    for (const note of params.rawNotes) {
        lines.push(note);
    }

    if (params.todos.length) {
        lines.push("", "TODO:");
        for (const t of params.todos) {
            lines.push(`  - ${t}`);
        }
    }

    return lines.join("\n");
}

export const MIME_MEETING_NOTES = "text/plain";
