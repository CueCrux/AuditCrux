#!/usr/bin/env tsx
// CueCrux Proposition-Level Scorer
//
// Decomposes ground-truth answers into atomic propositions, then verifies
// each against model hypotheses. Produces recall, contradiction rate, and
// partial credit — enabling granular model-vs-model comparison.
// Maps to CruxScore v1.2: R_proposition (I10), C_contradiction (I11), Q_proposition (Q6).
//
// Usage:
//   npx tsx score-propositions.ts
//   npx tsx score-propositions.ts --results-dir results/ --judge-model gpt-4o-mini
//   npx tsx score-propositions.ts --runs lme-s-sonnet-4-6-T2-...,lme-s-gpt-4o-mini-T2-...
//   npx tsx score-propositions.ts --concurrency 5
//
// Requires: OPENAI_API_KEY in environment

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PropositionScorer,
  aggregatePropositionScores,
  type PropositionScore,
  type PropositionAggregate,
} from "./lib/proposition-scorer.js";

// ── CLI args ──

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};

const resultsDir = get("--results-dir") ?? "results";
const judgeModel = get("--judge-model") ?? "gpt-4o-mini";
const concurrency = parseInt(get("--concurrency") ?? "3", 10);
const runFilter = get("--runs")?.split(",").map((s) => s.trim());

const baseDir = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  resultsDir,
);

if (!existsSync(baseDir)) {
  console.error(`Results directory not found: ${baseDir}`);
  process.exit(1);
}

// ── Discover runs ──

interface HypEntry {
  question_id: string;
  hypothesis: string;
}

interface RunMeta {
  runId: string;
  dataset: string;
  arm: string;
  model: string;
}

interface RefEntry {
  question_id: string;
  question: string;
  answer: string;
  question_type: string;
}

const runDirs = readdirSync(baseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith("lme-"))
  .map((d) => d.name)
  .filter((name) => !runFilter || runFilter.some((f) => name.includes(f)))
  .sort();

if (runDirs.length === 0) {
  console.error("No matching run directories found.");
  process.exit(1);
}

console.log(`\nFound ${runDirs.length} run(s) to score with proposition-level analysis.`);
console.log(`Judge model: ${judgeModel}  |  Concurrency: ${concurrency}\n`);

// ── Load references (cached per dataset) ──

const refCache = new Map<string, Map<string, RefEntry>>();

function loadRefs(dataset: string): Map<string, RefEntry> {
  if (refCache.has(dataset)) return refCache.get(dataset)!;
  const refPath = resolve(
    import.meta.dirname ?? ".",
    "references",
    `longmemeval_${dataset}_references.json`,
  );
  if (!existsSync(refPath)) {
    console.error(`Reference file not found: ${refPath}`);
    process.exit(1);
  }
  const refs: RefEntry[] = JSON.parse(readFileSync(refPath, "utf-8"));
  const map = new Map(refs.map((r) => [r.question_id, r]));
  refCache.set(dataset, map);
  return map;
}

// ── Process runs ──

interface RunResult {
  runId: string;
  arm: string;
  model: string;
  dataset: string;
  scores: PropositionScore[];
  aggregate: PropositionAggregate;
}

const allResults: RunResult[] = [];

// Shared scorer instance — decomposition cache shared across runs
const scorer = new PropositionScorer({ model: judgeModel });

async function processRun(dir: string): Promise<RunResult | null> {
  const summaryPath = resolve(baseDir, dir, "summary.json");
  const hypPath = resolve(baseDir, dir, "hypotheses.jsonl");

  if (!existsSync(summaryPath) || !existsSync(hypPath)) {
    console.log(`[skip] ${dir}: missing summary.json or hypotheses.jsonl`);
    return null;
  }

  const meta: RunMeta = JSON.parse(readFileSync(summaryPath, "utf-8"));
  const refs = loadRefs(meta.dataset);

  const hypotheses: HypEntry[] = readFileSync(hypPath, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));

  console.log(`[${meta.arm}/${shortModel(meta.model)}] Scoring ${hypotheses.length} questions...`);

  // Score with bounded concurrency
  const scores: PropositionScore[] = [];
  const queue = [...hypotheses];

  async function worker() {
    while (queue.length > 0) {
      const hyp = queue.shift()!;
      const ref = refs.get(hyp.question_id);
      if (!ref) continue;

      const result = await scorer.score({
        questionId: hyp.question_id,
        questionType: ref.question_type,
        question: ref.question,
        groundTruth: ref.answer,
        hypothesis: hyp.hypothesis,
      });
      scores.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, hypotheses.length) }, () => worker());
  await Promise.all(workers);

  const aggregate = aggregatePropositionScores(scores);

  // Write per-question results alongside the run
  const outPath = resolve(baseDir, dir, `proposition-scores-${judgeModel}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ runId: meta.runId, arm: meta.arm, model: meta.model, judgeModel, scores, aggregate }, null, 2),
  );

  return { runId: meta.runId, arm: meta.arm, model: meta.model, dataset: meta.dataset, scores, aggregate };
}

// Process runs sequentially (each run's questions are concurrent internally)
for (const dir of runDirs) {
  const result = await processRun(dir);
  if (result) allResults.push(result);
}

if (allResults.length === 0) {
  console.log("\nNo runs scored.");
  process.exit(0);
}

// ── Print comparison table ──

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║           Proposition-Level Score Comparison                        ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

// Overall table
const header = ["Arm", "Model", "Recall", "Contradict", "Partial", "N"];
console.log(header.map((h) => h.padEnd(14)).join(""));
console.log("─".repeat(header.length * 14));

for (const r of allResults.sort((a, b) => b.aggregate.overall.meanPartialCredit - a.aggregate.overall.meanPartialCredit)) {
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

// Per-type breakdown
const allTypes = [
  ...new Set(allResults.flatMap((r) => Object.keys(r.aggregate.byType))),
].sort();

for (const r of allResults.sort((a, b) => a.arm.localeCompare(b.arm))) {
  console.log(
    `\n[${r.arm} / ${shortModel(r.model)}] Partial credit: ${pct(r.aggregate.overall.meanPartialCredit)}  |  Recall: ${pct(r.aggregate.overall.meanRecall)}  |  Contradiction: ${pct(r.aggregate.overall.meanContradictionRate)}`,
  );
  for (const type of allTypes) {
    const stats = r.aggregate.byType[type];
    if (!stats) continue;
    console.log(
      `  ${type.padEnd(28)} recall=${pct(stats.meanRecall).padEnd(7)} contradict=${pct(stats.meanContradictionRate).padEnd(7)} partial=${pct(stats.meanPartialCredit).padEnd(7)} (n=${stats.totalQuestions})`,
    );
  }
}

// ── Head-to-head comparison (if exactly 2 runs) ──

if (allResults.length === 2) {
  const [a, b] = allResults;
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║           Head-to-Head Comparison                                   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  console.log(`  ${shortModel(a.model).padEnd(20)} vs  ${shortModel(b.model)}`);
  console.log(`  ${"─".repeat(50)}`);

  const aScoreMap = new Map(a.scores.map((s) => [s.questionId, s]));
  const bScoreMap = new Map(b.scores.map((s) => [s.questionId, s]));

  const commonIds = [...aScoreMap.keys()].filter((id) => bScoreMap.has(id));

  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  const diffs: Array<{ qid: string; type: string; aCredit: number; bCredit: number; delta: number }> = [];

  for (const qid of commonIds) {
    const as = aScoreMap.get(qid)!;
    const bs = bScoreMap.get(qid)!;
    const delta = as.partialCredit - bs.partialCredit;
    if (Math.abs(delta) < 0.01) ties++;
    else if (delta > 0) aWins++;
    else bWins++;
    diffs.push({ qid, type: as.questionType, aCredit: as.partialCredit, bCredit: bs.partialCredit, delta });
  }

  console.log(`  ${shortModel(a.model)} wins: ${aWins}  |  ${shortModel(b.model)} wins: ${bWins}  |  Ties: ${ties}  (of ${commonIds.length})`);

  // Show biggest divergences
  const sorted = diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const top = sorted.slice(0, 10);
  if (top.length > 0) {
    console.log(`\n  Largest divergences:`);
    for (const d of top) {
      const winner =
        d.delta > 0 ? shortModel(a.model) : shortModel(b.model);
      console.log(
        `    ${d.qid}  ${d.type.padEnd(26)} ${pct(d.aCredit).padEnd(7)} vs ${pct(d.bCredit).padEnd(7)}  → ${winner} (+${pct(Math.abs(d.delta))})`,
      );
    }
  }
}

console.log(
  `\nPer-question details written to each run's proposition-scores-${judgeModel}.json\n`,
);

// ── Helpers ──

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function shortModel(model: string): string {
  return model.replace("claude-", "").replace("gpt-", "").replace(/\./g, "");
}
