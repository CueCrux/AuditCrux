// MemoryCrux Benchmark — Report writer

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunSummary } from "./types.js";

export function writeRunReport(summary: RunSummary, outputDir: string): { jsonPath: string; mdPath: string } {
  const runDir = join(outputDir, summary.runId);
  mkdirSync(runDir, { recursive: true });

  const jsonPath = join(runDir, "summary.json");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const mdPath = join(runDir, "report.md");
  writeFileSync(mdPath, renderMarkdown(summary));

  return { jsonPath, mdPath };
}

function renderMarkdown(s: RunSummary): string {
  const lines: string[] = [
    `# Benchmark Run: ${s.runId}`,
    "",
    `| Field | Value |`,
    `|---|---|`,
    `| Project | ${s.project} |`,
    `| Fixture variant | ${s.fixtureVariant} |`,
    `| Phase | ${s.phase} |`,
    `| Arm | ${s.arm} |`,
    `| Model | ${s.llm.model} |`,
    `| Provider | ${s.llm.provider} |`,
    `| Profile | ${s.llm.reasoningProfile} |`,
    `| Context cap | ${s.llm.contextCapTokens.toLocaleString()} tokens |`,
    `| Duration | ${s.durationSeconds.toFixed(1)}s |`,
    `| Timestamp | ${s.timestamp} |`,
    "",
    "## Token Usage",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Input tokens | ${s.usage.inputTokens.toLocaleString()} |`,
    `| Output tokens | ${s.usage.outputTokens.toLocaleString()} |`,
    `| Cached tokens | ${s.usage.cachedTokens.toLocaleString()} |`,
    `| Billable tokens | ${s.usage.billableTokens.toLocaleString()} |`,
    `| Estimated cost | $${s.usage.estimatedCostUsd.toFixed(4)} |`,
    "",
    "## Sessions",
    "",
  ];

  for (const session of s.sessions) {
    lines.push(`### ${session.phaseName} (${session.turns.length} turns, kill: ${session.killType ?? "none"})`);
    lines.push("");

    const totalToolCalls = session.turns.reduce((sum, t) => sum + t.toolCalls.length, 0);
    lines.push(`- Tool calls: ${totalToolCalls}`);
    lines.push(`- Output length: ${session.output.length} chars`);
    lines.push("");
  }

  lines.push("## Track A");
  lines.push("");

  if (Object.keys(s.trackA.latency).length > 0) {
    lines.push("### Latency");
    lines.push("");
    lines.push("| Operation | p50 | p95 | p99 | Count |");
    lines.push("|---|---|---|---|---|");
    for (const [op, stats] of Object.entries(s.trackA.latency)) {
      lines.push(`| ${op} | ${stats.p50}ms | ${stats.p95}ms | ${stats.p99}ms | ${stats.count} |`);
    }
    lines.push("");
  }

  lines.push(`Receipt integrity: chain=${s.trackA.receiptIntegrity.chainIntact}, sigs=${s.trackA.receiptIntegrity.signaturesValid}, count=${s.trackA.receiptIntegrity.totalReceipts}`);
  lines.push("");
  lines.push(`All targets met: **${s.trackA.allTargetsMet ? "YES" : "NO"}**`);
  lines.push("");

  return lines.join("\n");
}
