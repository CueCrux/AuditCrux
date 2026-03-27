#!/usr/bin/env tsx
// MemoryCrux Benchmark — Repetition analysis (mean ± std across runs for same cell)
//
// Usage: npx tsx analyze-repetitions.ts [--json]

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RunSummary, ProjectFixture } from "./lib/types.js";
import {
  scoreDecisionRecall,
  scoreConstraintDetection,
  scoreDisasterPrevention,
  scoreIncidentRecall,
  scoreTokenEfficiency,
} from "./lib/scoring/track-a.js";
import { computeCruxScore, type CruxScore } from "./lib/scoring/crux-score.js";

const resultsDir = resolve(import.meta.dirname, "results");
const fixturesDir = resolve(import.meta.dirname, "fixtures");

function loadScenario(project: string) {
  return JSON.parse(readFileSync(join(fixturesDir, project, "scenario.json"), "utf-8"));
}

function loadFixture(project: string): ProjectFixture | null {
  try {
    const scenario = loadScenario(project);
    const corpusPath = join(fixturesDir, project, "corpus.json");
    const corpus = existsSync(corpusPath) ? JSON.parse(readFileSync(corpusPath, "utf-8")) : [];
    return {
      project: project as ProjectFixture["project"],
      version: scenario.version ?? "1.0.0",
      corpus: Array.isArray(corpus) ? corpus : corpus.documents ?? [],
      constraints: scenario.constraints ?? [],
      phases: scenario.phases ?? [],
      killVariants: scenario.killVariants,
      expectedMetrics: scenario.expectedMetrics ?? {},
    };
  } catch {
    return null;
  }
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

  const fixture = loadFixture(summary.project);
  if (fixture) {
    results.cruxScore = computeCruxScore(summary, fixture);
  }

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

// ---------- CLI flags ----------
const jsonMode = process.argv.includes("--json");

// ---------- Stats helpers ----------
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function iqr(arr: number[]): number {
  if (arr.length < 4) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length / 4);
  const q3Idx = Math.floor((3 * sorted.length) / 4);
  const q1 = sorted.length % 4 === 0
    ? (sorted[q1Idx - 1] + sorted[q1Idx]) / 2
    : sorted[q1Idx];
  const q3 = sorted.length % 4 === 0
    ? (sorted[q3Idx - 1] + sorted[q3Idx]) / 2
    : sorted[q3Idx];
  return q3 - q1;
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
output.push("| Model | Arm | N | Recall (mean±std) | Recall (med±IQR) | Safe Rate | Incident Rate | Cost (mean) | Cost (med±IQR) | Cx Em (mean±std) | Cx Em (med±IQR) |");
output.push("|---|---|---|---|---|---|---|---|---|---|---|");

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
  const incidentCount = scores.filter((s) => s.incidentRecall === true).length;
  const costs = scores.map((s) => (s.tokenEfficiency as { totalCost: number }).totalCost);

  const recallStr =
    recalls.length > 1
      ? `${pct(mean(recalls))} ± ${pct(std(recalls))}`
      : recalls.length === 1
        ? pct(recalls[0])
        : "-";
  const recallMedStr =
    recalls.length > 1
      ? `${pct(median(recalls))} ± ${pct(iqr(recalls))}`
      : recalls.length === 1
        ? pct(recalls[0])
        : "-";
  const safeRateStr = `${safeCount}/${runs.length}`;
  const incidentRateStr = `${incidentCount}/${runs.length}`;
  const costStr = `$${mean(costs).toFixed(4)}`;
  const costMedStr = costs.length > 1
    ? `$${median(costs).toFixed(4)} ± $${iqr(costs).toFixed(4)}`
    : `$${mean(costs).toFixed(4)}`;

  const cxValues = scores
    .map((s) => (s.cruxScore as CruxScore)?.composite.Cx_em)
    .filter((v): v is number => v != null);
  const cxStr = cxValues.length > 1
    ? `${mean(cxValues).toFixed(1)} ± ${std(cxValues).toFixed(1)}`
    : cxValues.length === 1
      ? cxValues[0].toFixed(1)
      : "-";
  const cxMedStr = cxValues.length > 1
    ? `${median(cxValues).toFixed(1)} ± ${iqr(cxValues).toFixed(1)}`
    : cxValues.length === 1
      ? cxValues[0].toFixed(1)
      : "-";

  output.push(`| ${model} | ${arm} | ${runs.length} | ${recallStr} | ${recallMedStr} | ${safeRateStr} | ${incidentRateStr} | ${costStr} | ${costMedStr} | ${cxStr} | ${cxMedStr} |`);

  if (!jsonMode) {
    console.log(
      `beta/${model}/${arm}/${variant} (n=${runs.length}): recall=${recallStr} safe=${safeRateStr} Cx=${cxStr}Em cost=${costStr}`,
    );
  }
}

output.push("");

// ---------- Alpha baseline repetition ----------
output.push("## Alpha Baseline (v01) — Decision Recall");
output.push("");
output.push("| Model | Arm | N | Recall (mean±std) | Recall (med±IQR) | Constraint | Cost (mean) | Cost (med±IQR) |");
output.push("|---|---|---|---|---|---|---|---|");

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
  const recallMedStr = recalls.length > 1 ? `${pct(median(recalls))} ± ${pct(iqr(recalls))}` : pct(recalls[0]);
  const costStr = `$${mean(costs).toFixed(4)}`;
  const costMedStr = costs.length > 1
    ? `$${median(costs).toFixed(4)} ± $${iqr(costs).toFixed(4)}`
    : `$${mean(costs).toFixed(4)}`;

  output.push(`| ${model} | ${arm} | ${runs.length} | ${recallStr} | ${recallMedStr} | - | ${costStr} | ${costMedStr} |`);
}

output.push("");

// ---------- Alpha kill variant repetition ----------
output.push("## Alpha Kill Variants — T2 Recall (3× where available)");
output.push("");
output.push("| Model | Variant | N | Recall (mean±std) | Recall (med±IQR) | Cost (mean) | Cost (med±IQR) | Tool Calls (mean) |");
output.push("|---|---|---|---|---|---|---|---|");

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
  const recallMedStr =
    recalls.length > 1
      ? `${pct(median(recalls))} ± ${pct(iqr(recalls))}`
      : pct(recalls[0]);
  const costStr = `$${mean(costs).toFixed(4)}`;
  const costMedStr = costs.length > 1
    ? `$${median(costs).toFixed(4)} ± $${iqr(costs).toFixed(4)}`
    : `$${mean(costs).toFixed(4)}`;
  const toolStr = mean(toolCalls).toFixed(1);

  output.push(`| ${model} | ${variant} | ${runs.length} | ${recallStr} | ${recallMedStr} | ${costStr} | ${costMedStr} | ${toolStr} |`);
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
  output.push("| Cell | N | Recall (mean±std) | Recall (med±IQR) |");
  output.push("|---|---|---|---|");

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
      const recallMedStr =
        recalls.length > 1 ? `${pct(median(recalls))} ± ${pct(iqr(recalls))}` : pct(recalls[0]);
      output.push(`| ${arm}/${variant} | ${runs.length} | ${recallStr} | ${recallMedStr} |`);
    }
  }
  output.push("");
}

// ---------- Paired Deltas: Treatment vs C2 ----------
output.push("## Paired Deltas: Treatment vs C2");
output.push("");
output.push("For each model, computes delta = treatment_metric - C2_metric for matching cells.");
output.push("");
output.push("| Project | Model | Treatment | Metric | N pairs | Median Delta | IQR Delta |");
output.push("|---|---|---|---|---|---|---|");

interface PairedDelta {
  project: string;
  model: string;
  treatment: string;
  metric: string;
  nPairs: number;
  medianDelta: number;
  iqrDelta: number;
  deltas: number[];
}

const pairedDeltas: PairedDelta[] = [];

function computePairedDeltas(
  project: string,
  treatmentArms: string[],
  variants: string[],
  metricExtractors: Record<string, (scores: Record<string, unknown>[]) => number[]>,
) {
  const models = [...new Set(
    [...cellMap.keys()]
      .filter((k) => k.startsWith(`${project}|`))
      .map((k) => k.split("|")[1]),
  )];

  for (const model of models) {
    for (const treatment of treatmentArms) {
      for (const [metricName, extractor] of Object.entries(metricExtractors)) {
        const deltas: number[] = [];
        for (const variant of variants) {
          const c2Runs = cellMap.get(`${project}|${model}|C2|${variant}`) ?? [];
          const tRuns = cellMap.get(`${project}|${model}|${treatment}|${variant}`) ?? [];
          if (c2Runs.length === 0 || tRuns.length === 0) continue;

          const c2Scores = c2Runs.map((r) => scoreRun(r));
          const tScores = tRuns.map((r) => scoreRun(r));

          const c2Vals = extractor(c2Scores);
          const tVals = extractor(tScores);

          if (c2Vals.length > 0 && tVals.length > 0) {
            deltas.push(mean(tVals) - mean(c2Vals));
          }
        }

        if (deltas.length > 0) {
          const entry: PairedDelta = {
            project,
            model,
            treatment,
            metric: metricName,
            nPairs: deltas.length,
            medianDelta: median(deltas),
            iqrDelta: iqr(deltas),
            deltas,
          };
          pairedDeltas.push(entry);
          const sign = entry.medianDelta >= 0 ? "+" : "";
          output.push(`| ${project} | ${model} | ${treatment} | ${metricName} | ${entry.nPairs} | ${sign}${entry.medianDelta.toFixed(3)} | ${entry.iqrDelta.toFixed(3)} |`);
        }
      }
    }
  }
}

const recallExtractor = (scores: Record<string, unknown>[]) =>
  scores
    .map((s) => (s.decisionRecall as { score: number })?.score)
    .filter((v): v is number => v !== undefined);

const costExtractor = (scores: Record<string, unknown>[]) =>
  scores.map((s) => (s.tokenEfficiency as { totalCost: number }).totalCost);

const cxExtractor = (scores: Record<string, unknown>[]) =>
  scores
    .map((s) => (s.cruxScore as CruxScore)?.composite.Cx_em)
    .filter((v): v is number => v != null);

computePairedDeltas("alpha", ["T2", "F1"], ["v01", "A1", "A2", "A3"], {
  recall: recallExtractor,
  cost: costExtractor,
  Cx_em: cxExtractor,
});

computePairedDeltas("beta", ["T2", "F1"], ["v01"], {
  recall: recallExtractor,
  cost: costExtractor,
  Cx_em: cxExtractor,
});

output.push("");

// ---------- Build JSON data for all cells ----------
interface CellData {
  project: string;
  model: string;
  arm: string;
  variant: string;
  n: number;
  recall: { mean: number; std: number; median: number; iqr: number } | null;
  cost: { mean: number; std: number; median: number; iqr: number };
  Cx_em: { mean: number; std: number; median: number; iqr: number } | null;
  safeRate: string | null;
  incidentRate: string | null;
}

function buildCellData(): CellData[] {
  const cells: CellData[] = [];
  for (const [key, runs] of cellMap) {
    const [project, model, arm, variant] = key.split("|");
    const scores = runs.map((r) => scoreRun(r));

    const recalls = recallExtractor(scores);
    const costs = costExtractor(scores);
    const cxValues = cxExtractor(scores);

    const recallData = recalls.length > 0
      ? { mean: mean(recalls), std: std(recalls), median: median(recalls), iqr: iqr(recalls) }
      : null;

    const costData = { mean: mean(costs), std: std(costs), median: median(costs), iqr: iqr(costs) };

    const cxData = cxValues.length > 0
      ? { mean: mean(cxValues), std: std(cxValues), median: median(cxValues), iqr: iqr(cxValues) }
      : null;

    let safeRate: string | null = null;
    let incidentRate: string | null = null;
    if (project === "beta") {
      const safeCount = scores.filter(
        (s) => (s.disasterPrevention as { safe: boolean })?.safe === true,
      ).length;
      const incidentCount = scores.filter((s) => s.incidentRecall === true).length;
      safeRate = `${safeCount}/${runs.length}`;
      incidentRate = `${incidentCount}/${runs.length}`;
    }

    cells.push({ project, model, arm, variant, n: runs.length, recall: recallData, cost: costData, Cx_em: cxData, safeRate, incidentRate });
  }
  return cells;
}

// ---------- Output ----------
if (jsonMode) {
  const jsonOutput = {
    generated: new Date().toISOString(),
    totalRuns: allSummaries.length,
    cells: buildCellData(),
    pairedDeltas: pairedDeltas.map(({ deltas, ...rest }) => rest),
  };
  console.log(JSON.stringify(jsonOutput, null, 2));
} else {
  const reportPath = join(resultsDir, "repetition-analysis.md");
  writeFileSync(reportPath, output.join("\n"));
  console.log(`\nReport written: ${reportPath}`);
}
