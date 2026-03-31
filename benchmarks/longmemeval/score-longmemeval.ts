#!/usr/bin/env tsx
// CueCrux Memory Benchmark Score Aggregator — Cross-arm comparison from eval results
//
// Usage:
//   npx tsx score-longmemeval.ts --results-dir results/
//   npx tsx score-longmemeval.ts --results-dir results/ --eval-model gpt-4o
//   npx tsx score-longmemeval.ts --results-dir results/ --propositions   (include proposition-level scores)

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
const includePropositions = args.includes("--propositions");

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

// ── Map to CruxScore v1.2 fundamentals ──

interface CruxFundamentalsSubset {
  R_temporal: number | null;        // I6: temporal-reasoning accuracy
  R_supersession: number | null;    // I7: knowledge-update accuracy
  A_abstention: number | null;      // I8: abstention precision (unanswerable subset)
  K_synthesis: number | null;       // K4: multi-session synthesis accuracy
  R_retrieval: number | null;       // I9: not directly available from auto-eval
  R_proposition: number | null;     // I10: proposition recall (from proposition scorer)
  C_contradiction: number | null;   // I11: contradiction rate (from proposition scorer)
}

// Load proposition scores if available (keyed by runId)
const propScoresByRun = new Map<string, { meanRecall: number; meanContradictionRate: number }>();
for (const dir of runDirs) {
  const runDir = resolve(baseDir, dir);
  const propFiles = readdirSync(runDir).filter(
    (f) => f.startsWith("proposition-scores-") && f.endsWith(".json"),
  );
  if (propFiles.length === 0) continue;
  const propPath = resolve(runDir, propFiles[propFiles.length - 1]);
  try {
    const data = JSON.parse(readFileSync(propPath, "utf-8"));
    if (data.runId && data.aggregate?.overall) {
      propScoresByRun.set(data.runId, {
        meanRecall: data.aggregate.overall.meanRecall,
        meanContradictionRate: data.aggregate.overall.meanContradictionRate,
      });
    }
  } catch { /* skip malformed */ }
}

const cruxMappings: Array<{ runId: string; arm: string; model: string; fundamentals: CruxFundamentalsSubset }> = [];

for (const row of rows) {
  const tr = row.byType["temporal-reasoning"];
  const ku = row.byType["knowledge-update"];
  const ms = row.byType["multi-session"];
  const prop = propScoresByRun.get(row.runId);

  cruxMappings.push({
    runId: row.runId,
    arm: row.arm,
    model: row.model,
    fundamentals: {
      R_temporal: tr ? tr.accuracy : null,
      R_supersession: ku ? ku.accuracy : null,
      A_abstention: null, // auto-eval doesn't tag abstention questions separately
      K_synthesis: ms ? ms.accuracy : null,
      R_retrieval: null,  // Recall@k not available from auto-eval (requires retrieval logs)
      R_proposition: prop ? prop.meanRecall : null,
      C_contradiction: prop ? prop.meanContradictionRate : null,
    },
  });
}

// ── Print comparison table ──

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║              Memory Benchmark Score Comparison              ║");
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

// ── CruxScore v1.2 Mapping ──

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║           CruxScore v1.2 Fundamental Mapping                        ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

const cruxHeader = ["Arm", "Model", "R_temporal", "R_supersess", "K_synthesis", "R_prop", "C_contra"];
console.log(cruxHeader.map((h) => h.padEnd(14)).join(""));
console.log("-".repeat(cruxHeader.length * 14));

for (const mapping of cruxMappings.sort((a, b) => a.arm.localeCompare(b.arm))) {
  const f = mapping.fundamentals;
  const fmt = (v: number | null) => v != null ? pct(v) : "—";
  const cols = [
    mapping.arm,
    shortModel(mapping.model),
    fmt(f.R_temporal),
    fmt(f.R_supersession),
    fmt(f.K_synthesis),
    fmt(f.R_proposition),
    fmt(f.C_contradiction),
  ];
  console.log(cols.map((c) => c.padEnd(14)).join(""));
}

console.log("\nNote: A_abstention and R_retrieval require additional data not available from auto-eval.");
console.log("R_proposition and C_contradiction require running score-propositions.ts first.\n");

// ── Proposition-level scores (if available) ──

if (includePropositions) {
  interface PropAggregate {
    overall: { meanRecall: number; meanContradictionRate: number; meanPartialCredit: number; totalQuestions: number };
    byType: Record<string, { meanRecall: number; meanContradictionRate: number; meanPartialCredit: number; totalQuestions: number }>;
  }

  interface PropFile {
    runId: string;
    arm: string;
    model: string;
    aggregate: PropAggregate;
  }

  const propRows: Array<{ runId: string; arm: string; model: string; aggregate: PropAggregate }> = [];

  for (const dir of runDirs) {
    // Look for proposition-scores-*.json in each run dir
    const runDir = resolve(baseDir, dir);
    const propFiles = readdirSync(runDir).filter(
      (f) => f.startsWith("proposition-scores-") && f.endsWith(".json"),
    );
    if (propFiles.length === 0) continue;

    // Use the most recent one
    const propPath = resolve(runDir, propFiles[propFiles.length - 1]);
    const data: PropFile = JSON.parse(readFileSync(propPath, "utf-8"));
    propRows.push(data);
  }

  if (propRows.length > 0) {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║           Proposition-Level Partial Credit                           ║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

    const propHeader = ["Arm", "Model", "Recall", "Contradict", "Partial", "N"];
    console.log(propHeader.map((h) => h.padEnd(14)).join(""));
    console.log("─".repeat(propHeader.length * 14));

    for (const r of propRows.sort((a, b) => b.aggregate.overall.meanPartialCredit - a.aggregate.overall.meanPartialCredit)) {
      const o = r.aggregate.overall;
      const cols = [
        r.arm,
        shortModel(r.model),
        pct(o.meanRecall),
        pct(o.meanContradictionRate),
        pct(o.meanPartialCredit),
        String(o.totalQuestions),
      ];
      console.log(cols.map((c) => c.padEnd(14)).join(""));
    }
    console.log("");
  } else {
    console.log("No proposition scores found. Run score-propositions.ts first.\n");
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
