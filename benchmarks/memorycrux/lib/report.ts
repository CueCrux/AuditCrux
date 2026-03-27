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

function fmt(v: number | null, unit: string): string {
  if (v == null) return "N/A";
  return `${v.toFixed(1)}${unit}`;
}

function fmtRatio(v: number | null): string {
  if (v == null) return "N/A";
  return (v * 100).toFixed(1) + "%";
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

  // Crux Score section
  if (s.cruxScore) {
    const cx = s.cruxScore;
    const f = cx.fundamentals;
    const d = cx.derived;
    const c = cx.composite;

    lines.push("## Crux Score (Effective Minutes)");
    lines.push("");
    lines.push(`**Cx = ${c.Cx_em != null ? `${c.Cx_em} Em` : "N/A"}** (v${cx.metrics_version}, weights: w1=${c.weights.w1}, w2=${c.weights.w2}, w3=${c.weights.w3})`);
    lines.push("");

    lines.push("### Fundamentals");
    lines.push("");
    lines.push("| Dimension | Value |");
    lines.push("|---|---|");
    lines.push(`| T_orient | ${fmt(f.T_orient_s, "s")} |`);
    lines.push(`| T_task | ${f.T_task_s.toFixed(1)}s |`);
    lines.push(`| T_human | ${fmt(f.T_human_s, "s")} |`);
    lines.push(`| R_decision | ${fmtRatio(f.R_decision)} |`);
    lines.push(`| R_constraint | ${fmtRatio(f.R_constraint)} |`);
    lines.push(`| R_incident | ${f.R_incident != null ? f.R_incident : "N/A"} |`);
    lines.push(`| P_context | ${fmtRatio(f.P_context)} |`);
    lines.push(`| A_coverage | ${fmtRatio(f.A_coverage)} |`);
    lines.push(`| K_decision | ${fmtRatio(f.K_decision)} |`);
    lines.push(`| K_causal | ${fmtRatio(f.K_causal)} |`);
    lines.push(`| K_checkpoint | ${fmtRatio(f.K_checkpoint)} |`);
    lines.push(`| S_gate | ${f.S_gate != null ? f.S_gate : "N/A"} |`);
    lines.push(`| S_detect | ${f.S_detect != null ? f.S_detect : "N/A"} |`);
    lines.push(`| S_stale | ${fmtRatio(f.S_stale)} |`);
    lines.push(`| C_tokens | $${f.C_tokens_usd.toFixed(4)} |`);
    lines.push(`| N_tools | ${f.N_tools} |`);
    lines.push(`| N_turns | ${f.N_turns} |`);
    lines.push(`| N_corrections | ${f.N_corrections} |`);
    lines.push("");

    lines.push("### Derived");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|---|---|");
    lines.push(`| Q_info | ${fmtRatio(d.Q_info)} |`);
    lines.push(`| Q_context | ${fmtRatio(d.Q_context)} |`);
    lines.push(`| Q_continuity | ${fmtRatio(d.Q_continuity)} |`);
    lines.push(`| Q_safety | ${fmtRatio(d.Q_safety)} |`);
    lines.push(`| V_time | ${d.V_time != null ? `${d.V_time.toFixed(2)}×` : "N/A"} |`);
    lines.push(`| V_cost | ${d.V_cost != null ? `$${d.V_cost.toFixed(4)}` : "N/A"} |`);
    lines.push(`| V_orient | ${fmtRatio(d.V_orient)} |`);
    lines.push("");
  }

  return lines.join("\n");
}
