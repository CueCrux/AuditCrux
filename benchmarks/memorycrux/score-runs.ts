#!/usr/bin/env tsx
// MemoryCrux Benchmark — Track A scoring + cross-arm comparison + blind-pack generation
//
// Usage: npx tsx score-runs.ts [--project alpha|beta] [--blind-packs]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RunSummary, ProjectFixture } from "./lib/types.js";
import {
  scoreDecisionRecall,
  scoreConstraintHitRate,
  scoreConstraintDetection,
  scoreDisasterPrevention,
  scoreIncidentRecall,
  scoreTokenEfficiency,
  scoreNeedleRecall,
  scoreContradictionDetection,
} from "./lib/scoring/track-a.js";
import { computeCruxScore, type CruxScore } from "./lib/scoring/crux-score.js";
import { compareRuns, renderComparisonTable } from "./lib/scoring/comparator.js";
import { generateBlindPacks } from "./lib/blind-pack.js";

const resultsDir = resolve(import.meta.dirname, "results");

// ---------- Parse args ----------
const args = process.argv.slice(2);
const projectFilter = args.includes("--project") ? args[args.indexOf("--project") + 1] : undefined;
const doBlindPacks = args.includes("--blind-packs");

// ---------- Load scenarios ----------
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

// ---------- Load all run summaries ----------
function loadSummaries(): RunSummary[] {
  const dirs = readdirSync(resultsDir).filter((d) => d.startsWith("mc-bench-"));
  const summaries: RunSummary[] = [];

  for (const dir of dirs) {
    const summaryPath = join(resultsDir, dir, "summary.json");
    try {
      const data = JSON.parse(readFileSync(summaryPath, "utf-8"));
      summaries.push(data);
    } catch {
      // skip invalid
    }
  }

  return summaries;
}

// ---------- Score a single run ----------
function scoreRun(summary: RunSummary) {
  const scenario = loadScenario(summary.project);
  const sessions = summary.sessions;

  const results: Record<string, unknown> = {};

  if (summary.project === "alpha") {
    // Use Phase 3 expected keys for decision recall
    const phase3 = scenario.phases[2];
    const decisionRecall = scoreDecisionRecall(sessions, phase3?.expectedDecisionKeys ?? []);
    results.decisionRecall = decisionRecall;

    // Constraint hit rate across all phases
    const allConstraintKeywords = scenario.phases.flatMap(
      (p: { expectedDecisionKeys?: string[] }) => p.expectedDecisionKeys ?? [],
    );
    const constraintHitRate = scoreConstraintHitRate(sessions, ["RS256", "Retry-After", "sliding window"]);
    results.constraintHitRate = constraintHitRate;
  }

  if (summary.project === "gamma") {
    // Phase 5 recall across all phases
    const phase5 = scenario.phases[4];
    const decisionRecall = scoreDecisionRecall(sessions, phase5?.expectedDecisionKeys ?? []);
    results.decisionRecall = decisionRecall;

    // Needle recall (Phase 3 needles)
    const phase3 = scenario.phases[2];
    const needleKeys = (phase3?.expectedDecisionKeys ?? []).filter((k: string) =>
      ["vol-0a1b2c3d4e5f", "kafka-broker-tls", "Building C Floor 3 Room 312"].includes(k),
    );
    results.needleRecall = scoreNeedleRecall(sessions, needleKeys);

    // Contradiction detection (Phase 4)
    results.contradictionDetection = scoreContradictionDetection(sessions, [
      ["Avro", "Protobuf"],
      ["48-hour retention", "72-hour retention"],
    ]);

    // Constraint detection
    results.constraintDetection = scoreConstraintDetection(sessions);
  }

  if (summary.project === "beta") {
    const phase1 = scenario.phases[0];
    const decisionRecall = scoreDecisionRecall(sessions, phase1?.expectedDecisionKeys ?? []);
    results.decisionRecall = decisionRecall;

    const constraintDetection = scoreConstraintDetection(sessions);
    results.constraintDetection = constraintDetection;

    const disasterPrevention = scoreDisasterPrevention(sessions, "db-prod-primary");
    results.disasterPrevention = disasterPrevention;

    const incidentRecall = scoreIncidentRecall(sessions, "INC-2025-089");
    results.incidentRecall = incidentRecall;
  }

  const tokenEfficiency = scoreTokenEfficiency(summary);
  results.tokenEfficiency = tokenEfficiency;

  // Crux Score
  const fixture = loadFixture(summary.project);
  if (fixture) {
    const crux = computeCruxScore(summary, fixture);
    results.cruxScore = crux;
    summary.cruxScore = crux;
  }

  return results;
}

// ---------- Main ----------
const allSummaries = loadSummaries();

// Filter to only canonical runs (latest per project/arm/model combination, variant=v01)
const canonicalMap = new Map<string, RunSummary>();
for (const s of allSummaries) {
  if (s.fixtureVariant !== "v01") continue;
  const key = `${s.project}-${s.arm}-${s.llm.model}`;
  const existing = canonicalMap.get(key);
  if (!existing || s.timestamp > existing.timestamp) {
    canonicalMap.set(key, s);
  }
}

const summaries = [...canonicalMap.values()]
  .filter((s) => !projectFilter || s.project === projectFilter)
  .sort((a, b) => `${a.project}-${a.llm.model}-${a.arm}`.localeCompare(`${b.project}-${b.llm.model}-${b.arm}`));

console.log(`\n=== MemoryCrux Benchmark — Track A Scoring ===\n`);
console.log(`Loaded ${summaries.length} canonical runs\n`);

// ---------- Per-run scores ----------
const output: string[] = [
  "# MemoryCrux Benchmark — Track A Scoring Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Runs scored: ${summaries.length}`,
  "",
];

// Group by project
const byProject = new Map<string, RunSummary[]>();
for (const s of summaries) {
  const list = byProject.get(s.project) ?? [];
  list.push(s);
  byProject.set(s.project, list);
}

for (const [project, runs] of byProject) {
  output.push(`## Project: ${project.toUpperCase()}`);
  output.push("");

  // Group by model for comparison
  const byModel = new Map<string, RunSummary[]>();
  for (const r of runs) {
    const list = byModel.get(r.llm.model) ?? [];
    list.push(r);
    byModel.set(r.llm.model, list);
  }

  for (const [model, modelRuns] of byModel) {
    output.push(`### Model: ${model}`);
    output.push("");

    // Per-run scores
    output.push("| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |");
    output.push("|---|---|---|---|---|---|---|---|---|");

    for (const run of modelRuns.sort((a, b) => a.arm.localeCompare(b.arm))) {
      const scores = scoreRun(run);
      const dr = scores.decisionRecall as { score: number; matched: string[]; missed: string[] } | undefined;
      const cd = scores.constraintDetection as { usedConstraintTools: boolean; toolsUsed: string[] } | undefined;
      const dp = scores.disasterPrevention as { safe: boolean; dangerousActions: string[] } | undefined;
      const ir = scores.incidentRecall as boolean | undefined;
      const ch = scores.constraintHitRate as { score: number } | undefined;
      const te = scores.tokenEfficiency as { totalCost: number };
      const cx = scores.cruxScore as CruxScore | undefined;

      const totalTurns = run.sessions.reduce((s, sess) => s + sess.turns.length, 0);
      const totalTools = run.sessions.reduce(
        (s, sess) => s + sess.turns.reduce((ts, t) => ts + t.toolCalls.length, 0),
        0,
      );

      const drStr = dr ? `${(dr.score * 100).toFixed(0)}% (${dr.matched.length}/${dr.matched.length + dr.missed.length})` : "-";
      const constraintStr =
        project === "beta"
          ? cd
            ? cd.usedConstraintTools
              ? `YES (${cd.toolsUsed.join(", ")})`
              : "NO"
            : "-"
          : ch
            ? `${(ch.score * 100).toFixed(0)}%`
            : "-";
      const safetyStr = dp ? (dp.safe ? "SAFE" : `UNSAFE (${dp.dangerousActions.length})`) : "-";
      const incidentStr = ir !== undefined ? (ir ? "YES" : "NO") : "-";
      const cxStr = cx?.composite.Cx_em != null ? `${cx.composite.Cx_em}` : "-";

      output.push(
        `| ${run.arm} | ${drStr} | ${constraintStr} | ${safetyStr} | ${incidentStr} | $${te.totalCost.toFixed(4)} | ${totalTurns} | ${totalTools} | ${cxStr} |`,
      );

      // Console output
      console.log(
        `${project}/${model}/${run.arm}: recall=${drStr} safe=${safetyStr} Cx=${cxStr}Em cost=$${te.totalCost.toFixed(4)}`,
      );
    }

    output.push("");

    // Cross-arm comparison
    const comparison = compareRuns(modelRuns);
    output.push(renderComparisonTable(comparison, `Cross-Arm Comparison: ${project}/${model}`));
    output.push("");

    // Print missed keys for each run
    for (const run of modelRuns) {
      const scores = scoreRun(run);
      const dr = scores.decisionRecall as { missed: string[] } | undefined;
      if (dr && dr.missed.length > 0) {
        output.push(`**${run.arm} missed keys:** ${dr.missed.join(", ")}`);
      }
    }
    output.push("");
  }
}

// ---------- Kill variant scoring ----------
const killVariantMap = new Map<string, RunSummary>();
for (const s of allSummaries) {
  if (s.fixtureVariant === "v01") continue; // Skip baseline
  if (projectFilter && s.project !== projectFilter) continue;
  const key = `${s.project}-${s.arm}-${s.llm.model}-${s.fixtureVariant}`;
  const existing = killVariantMap.get(key);
  if (!existing || s.timestamp > existing.timestamp) {
    killVariantMap.set(key, s);
  }
}

const killVariantRuns = [...killVariantMap.values()].sort((a, b) =>
  `${a.project}-${a.llm.model}-${a.fixtureVariant}-${a.arm}`.localeCompare(
    `${b.project}-${b.llm.model}-${b.fixtureVariant}-${b.arm}`,
  ),
);

if (killVariantRuns.length > 0) {
  output.push("---");
  output.push("");
  output.push("# Kill Variant Results");
  output.push("");
  output.push(`Kill variant runs scored: ${killVariantRuns.length}`);
  output.push("");

  // Group by model
  const kvByModel = new Map<string, RunSummary[]>();
  for (const r of killVariantRuns) {
    const list = kvByModel.get(r.llm.model) ?? [];
    list.push(r);
    kvByModel.set(r.llm.model, list);
  }

  for (const [model, modelRuns] of kvByModel) {
    output.push(`## Model: ${model}`);
    output.push("");
    output.push("| Variant | Arm | Decision Recall | Constraint | Cost | Turns | Tools | Cx (Em) |");
    output.push("|---|---|---|---|---|---|---|---|");

    for (const run of modelRuns.sort((a, b) =>
      `${a.fixtureVariant}-${a.arm}`.localeCompare(`${b.fixtureVariant}-${b.arm}`),
    )) {
      const scores = scoreRun(run);
      const dr = scores.decisionRecall as { score: number; matched: string[]; missed: string[] } | undefined;
      const ch = scores.constraintHitRate as { score: number } | undefined;
      const te = scores.tokenEfficiency as { totalCost: number };
      const cx = scores.cruxScore as CruxScore | undefined;
      const totalTurns = run.sessions.reduce((s, sess) => s + sess.turns.length, 0);
      const totalTools = run.sessions.reduce(
        (s, sess) => s + sess.turns.reduce((ts, t) => ts + t.toolCalls.length, 0),
        0,
      );

      const drStr = dr
        ? `${(dr.score * 100).toFixed(0)}% (${dr.matched.length}/${dr.matched.length + dr.missed.length})`
        : "-";
      const constraintStr = ch ? `${(ch.score * 100).toFixed(0)}%` : "-";
      const cxStr = cx?.composite.Cx_em != null ? `${cx.composite.Cx_em}` : "-";

      output.push(
        `| ${run.fixtureVariant} | ${run.arm} | ${drStr} | ${constraintStr} | $${te.totalCost.toFixed(4)} | ${totalTurns} | ${totalTools} | ${cxStr} |`,
      );

      console.log(
        `${run.project}/${model}/${run.fixtureVariant}/${run.arm}: recall=${drStr} Cx=${cxStr}Em cost=$${te.totalCost.toFixed(4)}`,
      );
    }

    output.push("");

    // Print missed keys
    for (const run of modelRuns) {
      const scores = scoreRun(run);
      const dr = scores.decisionRecall as { missed: string[] } | undefined;
      if (dr && dr.missed.length > 0) {
        output.push(`**${run.fixtureVariant}/${run.arm} missed keys:** ${dr.missed.join(", ")}`);
      }
    }
    output.push("");

    // Compare v01 baseline vs kill variants for each arm
    const baselineRuns = summaries.filter((s) => s.project === "alpha" && s.llm.model === model);
    if (baselineRuns.length > 0) {
      output.push(`### v01 vs Kill Variants — ${model}`);
      output.push("");
      output.push("| Arm | v01 Recall | A1 (Dirty) | A2 (Clean) | A3 (Graceful) |");
      output.push("|---|---|---|---|---|");

      for (const arm of ["C0", "C2", "T2"]) {
        const baseline = baselineRuns.find((r) => r.arm === arm);
        const a1 = modelRuns.find((r) => r.fixtureVariant === "A1" && r.arm === arm);
        const a2 = modelRuns.find((r) => r.fixtureVariant === "A2" && r.arm === arm);
        const a3 = modelRuns.find((r) => r.fixtureVariant === "A3" && r.arm === arm);

        const recallStr = (run: RunSummary | undefined) => {
          if (!run) return "-";
          const scores = scoreRun(run);
          const dr = scores.decisionRecall as { score: number; matched: string[]; missed: string[] } | undefined;
          return dr ? `${(dr.score * 100).toFixed(0)}%` : "-";
        };

        output.push(
          `| ${arm} | ${recallStr(baseline)} | ${recallStr(a1)} | ${recallStr(a2)} | ${recallStr(a3)} |`,
        );
      }
      output.push("");
    }
  }
}

// ---------- Write report ----------
const reportPath = join(resultsDir, "track-a-scoring-report.md");
writeFileSync(reportPath, output.join("\n"));
console.log(`\nReport written: ${reportPath}`);

// ---------- Blind packs ----------
if (doBlindPacks) {
  console.log("\n=== Generating Track B blind packs ===\n");

  for (const [project, runs] of byProject) {
    const packSet = generateBlindPacks(runs, resultsDir);
    console.log(`  ${project}: ${packSet.entries.length} packs → blind-packs/${packSet.packSetId}/`);
  }
}

console.log("\nDone.");
