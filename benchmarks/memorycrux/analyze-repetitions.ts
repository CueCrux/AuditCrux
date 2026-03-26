#!/usr/bin/env tsx
// MemoryCrux Benchmark — Repetition analysis (mean ± std across runs for same cell)
//
// Usage: npx tsx analyze-repetitions.ts

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RunSummary } from "./lib/types.js";
import {
  scoreDecisionRecall,
  scoreConstraintDetection,
  scoreDisasterPrevention,
  scoreIncidentRecall,
  scoreTokenEfficiency,
} from "./lib/scoring/track-a.js";

const resultsDir = resolve(import.meta.dirname, "results");
const fixturesDir = resolve(import.meta.dirname, "fixtures");

function loadScenario(project: string) {
  return JSON.parse(readFileSync(join(fixturesDir, project, "scenario.json"), "utf-8"));
}

function loadAllSummaries(): RunSummary[] {
  const dirs = readdirSync(resultsDir).filter((d) => d.startsWith("mc-bench-"));
  const summaries: RunSummary[] = [];
  for (const dir of dirs) {
    try {
      summaries.push(JSON.parse(readFileSync(join(resultsDir, dir, "summary.json"), "utf-8")));
    } catch {
      // skip
    }
  }
  return summaries;
}

function scoreRun(summary: RunSummary) {
  const scenario = loadScenario(summary.project);
  const sessions = summary.sessions;
  const results: Record<string, unknown> = {};

  if (summary.project === "alpha") {
    const phase3 = scenario.phases[2];
    results.decisionRecall = scoreDecisionRecall(sessions, phase3?.expectedDecisionKeys ?? []);
  }

  if (summary.project === "beta") {
    const phase1 = scenario.phases[0];
    results.decisionRecall = scoreDecisionRecall(sessions, phase1?.expectedDecisionKeys ?? []);
    results.constraintDetection = scoreConstraintDetection(sessions);
    results.disasterPrevention = scoreDisasterPrevention(sessions, "db-prod-primary");
    results.incidentRecall = scoreIncidentRecall(sessions, "INC-2025-089");
  }

  results.tokenEfficiency = scoreTokenEfficiency(summary);
  return results;
}

// ---------- Group runs by cell ----------
interface CellKey {
  project: string;
  model: string;
  arm: string;
  variant: string;
}

function cellKeyStr(s: RunSummary): string {
  return `${s.project}|${s.llm.model}|${s.arm}|${s.fixtureVariant}`;
}

const allSummaries = loadAllSummaries();
const cellMap = new Map<string, RunSummary[]>();
for (const s of allSummaries) {
  const key = cellKeyStr(s);
  const list = cellMap.get(key) ?? [];
  list.push(s);
  cellMap.set(key, list);
}

// ---------- Stats helpers ----------
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

// ---------- Analyze ----------
const output: string[] = [
  "# MemoryCrux Benchmark — Repetition Analysis",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Total runs: ${allSummaries.length}`,
  `Unique cells: ${cellMap.size}`,
  `Cells with 3× data: ${[...cellMap.values()].filter((v) => v.length >= 3).length}`,
  "",
];

// ---------- Beta repetition analysis ----------
output.push("## Beta — Safety & Recall (3× where available)");
output.push("");
output.push("| Model | Arm | N | Recall (mean±std) | Safe (count) | Incident (count) | Cost (mean) |");
output.push("|---|---|---|---|---|---|---|");

const betaCells = [...cellMap.entries()]
  .filter(([k]) => k.startsWith("beta|"))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [key, runs] of betaCells) {
  const [, model, arm, variant] = key.split("|");
  const scores = runs.map((r) => scoreRun(r));

  const recalls = scores
    .map((s) => (s.decisionRecall as { score: number })?.score)
    .filter((v) => v !== undefined);
  const safeCount = scores.filter(
    (s) => (s.disasterPrevention as { safe: boolean })?.safe === true,
  ).length;
  const unsafeCount = runs.length - safeCount;
  const incidentCount = scores.filter((s) => s.incidentRecall === true).length;
  const costs = scores.map((s) => (s.tokenEfficiency as { totalCost: number }).totalCost);

  const recallStr =
    recalls.length > 1
      ? `${pct(mean(recalls))} ± ${pct(std(recalls))}`
      : recalls.length === 1
        ? pct(recalls[0])
        : "-";
  const safeStr =
    unsafeCount > 0 ? `${safeCount}/${runs.length} SAFE (${unsafeCount} UNSAFE)` : `${safeCount}/${runs.length} SAFE`;
  const incidentStr = `${incidentCount}/${runs.length}`;
  const costStr = `$${mean(costs).toFixed(4)}`;

  output.push(`| ${model} | ${arm} | ${runs.length} | ${recallStr} | ${safeStr} | ${incidentStr} | ${costStr} |`);

  console.log(
    `beta/${model}/${arm}/${variant} (n=${runs.length}): recall=${recallStr} safe=${safeStr} incident=${incidentStr} cost=${costStr}`,
  );
}

output.push("");

// ---------- Alpha baseline repetition ----------
output.push("## Alpha Baseline (v01) — Decision Recall");
output.push("");
output.push("| Model | Arm | N | Recall (mean±std) | Constraint | Cost (mean) |");
output.push("|---|---|---|---|---|---|");

const alphaV01Cells = [...cellMap.entries()]
  .filter(([k]) => k.startsWith("alpha|") && k.endsWith("|v01"))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [key, runs] of alphaV01Cells) {
  const [, model, arm] = key.split("|");
  const scores = runs.map((r) => scoreRun(r));

  const recalls = scores
    .map((s) => (s.decisionRecall as { score: number })?.score)
    .filter((v) => v !== undefined);
  const costs = scores.map((s) => (s.tokenEfficiency as { totalCost: number }).totalCost);

  const recallStr = recalls.length > 1 ? `${pct(mean(recalls))} ± ${pct(std(recalls))}` : pct(recalls[0]);
  const costStr = `$${mean(costs).toFixed(4)}`;

  output.push(`| ${model} | ${arm} | ${runs.length} | ${recallStr} | - | ${costStr} |`);
}

output.push("");

// ---------- Alpha kill variant repetition ----------
output.push("## Alpha Kill Variants — T2 Recall (3× where available)");
output.push("");
output.push("| Model | Variant | N | Recall (mean±std) | Cost (mean) | Tool Calls (mean) |");
output.push("|---|---|---|---|---|---|");

const alphaKillT2Cells = [...cellMap.entries()]
  .filter(([k]) => k.startsWith("alpha|") && k.includes("|T2|") && !k.endsWith("|v01"))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [key, runs] of alphaKillT2Cells) {
  const [, model, , variant] = key.split("|");
  const scores = runs.map((r) => scoreRun(r));

  const recalls = scores
    .map((s) => (s.decisionRecall as { score: number })?.score)
    .filter((v) => v !== undefined);
  const costs = scores.map((s) => (s.tokenEfficiency as { totalCost: number }).totalCost);
  const toolCalls = runs.map((r) =>
    r.sessions.reduce((s, sess) => s + sess.turns.reduce((ts, t) => ts + t.toolCalls.length, 0), 0),
  );

  const recallStr =
    recalls.length > 1
      ? `${pct(mean(recalls))} ± ${pct(std(recalls))}`
      : pct(recalls[0]);
  const costStr = `$${mean(costs).toFixed(4)}`;
  const toolStr = mean(toolCalls).toFixed(1);

  output.push(`| ${model} | ${variant} | ${runs.length} | ${recallStr} | ${costStr} | ${toolStr} |`);
}

output.push("");

// ---------- Cross-arm comparison with confidence ----------
output.push("## Key Comparison: Beta Safety — T2 vs Controls");
output.push("");

for (const model of ["gpt-5.4-mini", "gpt-5.4", "claude-sonnet-4-6"]) {
  const c0 = cellMap.get(`beta|${model}|C0|v01`) ?? [];
  const c2 = cellMap.get(`beta|${model}|C2|v01`) ?? [];
  const t2 = cellMap.get(`beta|${model}|T2|v01`) ?? [];

  const safeRate = (runs: RunSummary[]) => {
    const scores = runs.map((r) => scoreRun(r));
    const safe = scores.filter((s) => (s.disasterPrevention as { safe: boolean })?.safe).length;
    return `${safe}/${runs.length}`;
  };

  const recallStats = (runs: RunSummary[]) => {
    const scores = runs.map((r) => scoreRun(r));
    const recalls = scores
      .map((s) => (s.decisionRecall as { score: number })?.score)
      .filter((v) => v !== undefined);
    return recalls.length > 1 ? `${pct(mean(recalls))} ± ${pct(std(recalls))}` : recalls.length === 1 ? pct(recalls[0]) : "-";
  };

  output.push(`### ${model} (C0 n=${c0.length}, C2 n=${c2.length}, T2 n=${t2.length})`);
  output.push("");
  output.push(`- **C0**: recall=${recallStats(c0)}, safe=${safeRate(c0)}`);
  output.push(`- **C2**: recall=${recallStats(c2)}, safe=${safeRate(c2)}`);
  output.push(`- **T2**: recall=${recallStats(t2)}, safe=${safeRate(t2)}`);
  output.push("");
}

// ---------- Key comparison: Alpha T2 kills vs controls ----------
output.push("## Key Comparison: Alpha T2 Kill Recovery vs Control Baselines");
output.push("");
output.push("Shows whether T2's MemoryCrux persistence helps after session kills vs controls that just re-read flat corpus.");
output.push("");

for (const model of ["gpt-5.4-mini", "gpt-5.4", "claude-sonnet-4-6"]) {
  output.push(`### ${model}`);
  output.push("");
  output.push("| Cell | N | Recall (mean±std) |");
  output.push("|---|---|---|");

  for (const arm of ["C0", "C2", "T2"]) {
    for (const variant of ["v01", "A1", "A2", "A3"]) {
      const runs = cellMap.get(`alpha|${model}|${arm}|${variant}`) ?? [];
      if (runs.length === 0) continue;
      const scores = runs.map((r) => scoreRun(r));
      const recalls = scores
        .map((s) => (s.decisionRecall as { score: number })?.score)
        .filter((v) => v !== undefined);
      const recallStr =
        recalls.length > 1 ? `${pct(mean(recalls))} ± ${pct(std(recalls))}` : pct(recalls[0]);
      output.push(`| ${arm}/${variant} | ${runs.length} | ${recallStr} |`);
    }
  }
  output.push("");
}

// ---------- Write ----------
const reportPath = join(resultsDir, "repetition-analysis.md");
writeFileSync(reportPath, output.join("\n"));
console.log(`\nReport written: ${reportPath}`);
