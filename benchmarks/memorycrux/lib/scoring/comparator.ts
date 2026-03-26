// MemoryCrux Benchmark — Cross-arm comparison

import type { RunSummary } from "../types.js";

export interface ComparisonRow {
  metric: string;
  values: Record<string, string | number>;
  winner?: string;
}

/**
 * Compare multiple run summaries for the same project.
 * Groups by arm, shows key metrics side-by-side.
 */
export function compareRuns(summaries: RunSummary[]): ComparisonRow[] {
  if (summaries.length === 0) return [];

  const rows: ComparisonRow[] = [];

  // Input tokens
  {
    const values: Record<string, number> = {};
    for (const s of summaries) values[s.arm] = s.usage.inputTokens;
    const minArm = Object.entries(values).sort(([, a], [, b]) => a - b)[0]?.[0];
    rows.push({ metric: "Input tokens", values, winner: minArm });
  }

  // Output tokens
  {
    const values: Record<string, number> = {};
    for (const s of summaries) values[s.arm] = s.usage.outputTokens;
    rows.push({ metric: "Output tokens", values });
  }

  // Cost
  {
    const values: Record<string, string> = {};
    for (const s of summaries) values[s.arm] = `$${s.usage.estimatedCostUsd.toFixed(4)}`;
    rows.push({ metric: "Estimated cost", values });
  }

  // Duration
  {
    const values: Record<string, string> = {};
    for (const s of summaries) values[s.arm] = `${s.durationSeconds.toFixed(1)}s`;
    rows.push({ metric: "Duration", values });
  }

  // Total tool calls (treatment only)
  {
    const values: Record<string, number> = {};
    for (const s of summaries) {
      const total = s.sessions.reduce(
        (sum, sess) => sum + sess.turns.reduce((ts, t) => ts + t.toolCalls.length, 0),
        0,
      );
      values[s.arm] = total;
    }
    rows.push({ metric: "Tool calls", values });
  }

  // Total turns
  {
    const values: Record<string, number> = {};
    for (const s of summaries) {
      values[s.arm] = s.sessions.reduce((sum, sess) => sum + sess.turns.length, 0);
    }
    rows.push({ metric: "Total turns", values });
  }

  return rows;
}

/**
 * Render a comparison table as Markdown.
 */
export function renderComparisonTable(rows: ComparisonRow[], title: string): string {
  if (rows.length === 0) return "";

  const arms = [...new Set(rows.flatMap((r) => Object.keys(r.values)))];
  const lines: string[] = [
    `## ${title}`,
    "",
    `| Metric | ${arms.join(" | ")} | Winner |`,
    `|---|${arms.map(() => "---").join("|")}|---|`,
  ];

  for (const row of rows) {
    const vals = arms.map((a) => String(row.values[a] ?? "-"));
    lines.push(`| ${row.metric} | ${vals.join(" | ")} | ${row.winner ?? "-"} |`);
  }

  return lines.join("\n");
}
