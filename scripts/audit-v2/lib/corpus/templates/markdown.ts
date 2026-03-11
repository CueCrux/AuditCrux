/**
 * Markdown template generators — policies, ADRs, standards, RFCs
 */

export function generatePolicy(params: {
    id: string;
    title: string;
    version: string;
    department: string;
    owner: string;
    effectiveDate: string;
    sections: { heading: string; body: string }[];
    supersedes?: string;
}): string {
    const header = [
        `# ${params.title}`,
        "",
        `**Version:** ${params.version}`,
        `**Department:** ${params.department}`,
        `**Owner:** ${params.owner}`,
        `**Effective Date:** ${params.effectiveDate}`,
        `**Document ID:** ${params.id}`,
    ];

    if (params.supersedes) {
        header.push(`**Supersedes:** ${params.supersedes}`);
    }

    header.push("", "---", "");

    const body = params.sections
        .map((s) => `## ${s.heading}\n\n${s.body}`)
        .join("\n\n");

    return header.join("\n") + body;
}

export function generateADR(params: {
    number: number;
    title: string;
    status: string;
    date: string;
    deciders: string[];
    context: string;
    decision: string;
    consequences: string[];
    alternatives?: { name: string; reason: string }[];
}): string {
    const lines = [
        `# ADR-${String(params.number).padStart(4, "0")}: ${params.title}`,
        "",
        `**Status:** ${params.status}`,
        `**Date:** ${params.date}`,
        `**Deciders:** ${params.deciders.join(", ")}`,
        "",
        "## Context",
        "",
        params.context,
        "",
        "## Decision",
        "",
        params.decision,
        "",
        "## Consequences",
        "",
        ...params.consequences.map((c) => `- ${c}`),
    ];

    if (params.alternatives?.length) {
        lines.push("", "## Alternatives Considered", "");
        for (const alt of params.alternatives) {
            lines.push(`### ${alt.name}`, "", `Rejected: ${alt.reason}`, "");
        }
    }

    return lines.join("\n");
}

export function generateRFC(params: {
    number: number;
    title: string;
    author: string;
    status: string;
    date: string;
    summary: string;
    motivation: string;
    proposal: string;
    risks: string[];
}): string {
    return [
        `# RFC-${String(params.number).padStart(4, "0")}: ${params.title}`,
        "",
        `**Author:** ${params.author}`,
        `**Status:** ${params.status}`,
        `**Date:** ${params.date}`,
        "",
        "## Summary",
        "",
        params.summary,
        "",
        "## Motivation",
        "",
        params.motivation,
        "",
        "## Proposal",
        "",
        params.proposal,
        "",
        "## Risks",
        "",
        ...params.risks.map((r) => `- ${r}`),
    ].join("\n");
}

export function generateRunbook(params: {
    title: string;
    service: string;
    severity: string;
    steps: { action: string; command?: string; notes?: string }[];
    escalation: string;
}): string {
    const stepLines: string[] = [];
    for (let i = 0; i < params.steps.length; i++) {
        const s = params.steps[i];
        stepLines.push(`### Step ${i + 1}: ${s.action}`);
        if (s.command) {
            stepLines.push("", "```bash", s.command, "```");
        }
        if (s.notes) {
            stepLines.push("", `> ${s.notes}`);
        }
        stepLines.push("");
    }

    return [
        `# Runbook: ${params.title}`,
        "",
        `**Service:** ${params.service}`,
        `**Severity:** ${params.severity}`,
        "",
        "## Steps",
        "",
        ...stepLines,
        "## Escalation",
        "",
        params.escalation,
    ].join("\n");
}

export const MIME_MARKDOWN = "text/markdown";
