#!/usr/bin/env tsx
// LongMemEval Score Aggregator — Cross-arm comparison from eval results
//
// Usage:
//   npx tsx score-longmemeval.ts --results-dir results/
//   npx tsx score-longmemeval.ts --results-dir results/ --eval-model gpt-4o

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface EvalEntry {
  question_id: string;
  hypothesis: string;
  autoeval_label: { model: string; label: boolean };
}

interface RunMeta {
  runId: string;
  dataset: string;
  arm: string;
  model: string;
  totalQuestions: number;
  usage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedTokens: number;
    totalCostUsd: number;
  };
  durationSeconds: number;
}

interface ScoreRow {
  runId: string;
  arm: string;
  model: string;
  overall: number;
  byType: Record<string, { correct: number; total: number; accuracy: number }>;
  cost: number;
  questions: number;
}

// ── CLI ──

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};

const resultsDir = get("--results-dir") ?? "results";
const evalModel = get("--eval-model") ?? "gpt-4o";

// ── Scan results ──

const baseDir = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  resultsDir,
);

if (!existsSync(baseDir)) {
  console.error(`Results directory not found: ${baseDir}`);
  process.exit(1);
}

const runDirs = readdirSync(baseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("lme-"))
  .map((d) => d.name)
  .sort();

if (runDirs.length === 0) {
  console.error("No run directories found.");
  process.exit(1);
}

const rows: ScoreRow[] = [];

for (const dir of runDirs) {
  const summaryPath = resolve(baseDir, dir, "summary.json");
  const hypPath = resolve(baseDir, dir, "hypotheses.jsonl");
  const evalPath = `${hypPath}.eval-results-${evalModel}`;

  if (!existsSync(summaryPath)) continue;

  const meta: RunMeta = JSON.parse(readFileSync(summaryPath, "utf-8"));

  // Check for eval results
  if (!existsSync(evalPath)) {
    console.log(`[skip] ${dir}: no eval results (run evaluate.sh first)`);
    continue;
  }

  const evalLines = readFileSync(evalPath, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as EvalEntry);

  // Aggregate by type
  const byType: Record<string, { correct: number; total: number; accuracy: number }> = {};
  let totalCorrect = 0;

  // Load reference data for question types
  const refPath = resolve(
    import.meta.dirname ?? ".",
    "references",
    `longmemeval_${meta.dataset}_references.json`,
  );
  const refs: Array<{ question_id: string; question_type: string }> = existsSync(refPath)
    ? JSON.parse(readFileSync(refPath, "utf-8"))
    : [];
  const qidToType = new Map(refs.map((r) => [r.question_id, r.question_type]));

  for (const entry of evalLines) {
    const qtype = qidToType.get(entry.question_id) ?? "unknown";
    if (!byType[qtype]) byType[qtype] = { correct: 0, total: 0, accuracy: 0 };
    byType[qtype].total++;
    if (entry.autoeval_label.label) {
      byType[qtype].correct++;
      totalCorrect++;
    }
  }

  for (const stats of Object.values(byType)) {
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }

  const overall = evalLines.length > 0 ? totalCorrect / evalLines.length : 0;

  rows.push({
    runId: meta.runId,
    arm: meta.arm,
    model: meta.model,
    overall,
    byType,
    cost: meta.usage.totalCostUsd,
    questions: evalLines.length,
  });
}

if (rows.length === 0) {
  console.log("No scored runs found. Run evaluate.sh on hypothesis files first.");
  process.exit(0);
}

// ── Print comparison table ──

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║              LongMemEval Score Comparison                   ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// Overall table
const allTypes = [...new Set(rows.flatMap((r) => Object.keys(r.byType)))].sort();

// Header
const header = ["Arm", "Model", "Overall", ...allTypes.map(shortType), "Cost", "N"];
console.log(header.map((h) => h.padEnd(12)).join(""));
console.log("-".repeat(header.length * 12));

for (const row of rows.sort((a, b) => b.overall - a.overall)) {
  const cols = [
    row.arm,
    shortModel(row.model),
    pct(row.overall),
    ...allTypes.map((t) => (row.byType[t] ? pct(row.byType[t].accuracy) : "—")),
    `$${row.cost.toFixed(2)}`,
    String(row.questions),
  ];
  console.log(cols.map((c) => c.padEnd(12)).join(""));
}

console.log("");

// Per-type detail
for (const row of rows.sort((a, b) => a.arm.localeCompare(b.arm))) {
  console.log(`\n[${row.arm} / ${shortModel(row.model)}] ${pct(row.overall)} overall ($${row.cost.toFixed(2)})`);
  for (const [type, stats] of Object.entries(row.byType).sort()) {
    console.log(`  ${type}: ${stats.correct}/${stats.total} (${pct(stats.accuracy)})`);
  }
}

// ── Helpers ──

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace("gpt-", "").replace(/\./g, "");
}

function shortType(type: string): string {
  const map: Record<string, string> = {
    "single-session-user": "ss-user",
    "single-session-assistant": "ss-asst",
    "single-session-preference": "ss-pref",
    "multi-session": "multi",
    "temporal-reasoning": "temporal",
    "knowledge-update": "kn-update",
  };
  return map[type] ?? type.slice(0, 10);
}
