/**
 * Wiki scratchpad template generators — half-finished drafts, personal notes
 *
 * Simulates the messy personal wikis and Confluence scratchpads found in
 * every enterprise. Broken links, TODO markers, incomplete sections.
 */

export function generateDraftDoc(params: {
    title: string;
    author: string;
    lastEdited: string;
    sections: { heading: string; body: string; complete: boolean }[];
    relatedLinks?: string[];
}): string {
    const lines: string[] = [
        `# Draft: ${params.title}`,
        "",
        `> Last edited by ${params.author} on ${params.lastEdited}`,
        `> STATUS: DRAFT — do not share`,
        "",
    ];

    for (const s of params.sections) {
        lines.push(`## ${s.heading}`, "");
        if (s.complete) {
            lines.push(s.body);
        } else {
            lines.push(s.body);
            lines.push("", "TODO: fill in the rest of this section");
        }
        lines.push("");
    }

    if (params.relatedLinks?.length) {
        lines.push("## Links", "");
        for (const link of params.relatedLinks) {
            lines.push(`- ${link}`);
        }
    }

    return lines.join("\n");
}

export function generatePersonalNotes(params: {
    topic: string;
    author: string;
    snippets: string[];
    questions: string[];
}): string {
    const lines: string[] = [
        `# ${params.topic} — notes`,
        `— ${params.author}`,
        "",
    ];

    for (const s of params.snippets) {
        lines.push(`- ${s}`);
    }

    if (params.questions.length) {
        lines.push("", "Questions:");
        for (const q of params.questions) {
            lines.push(`  ? ${q}`);
        }
    }

    return lines.join("\n");
}

export const MIME_WIKI = "text/markdown";
