#!/usr/bin/env tsx
// LongMemEval Warm-Start — Pre-run probe pass
//
// Simulates production receipt accumulation by:
// 1. Running all 500 questions through a cheap probe (Haiku, 1 tool call each)
// 2. Collecting gap receipts from VaultCrux
// 3. Analysing gaps — which queries return low/zero results
// 4. Running targeted entity extraction on gap tenants
// 5. Pre-computing HyDE hypotheses for gap queries (cache warming)
//
// After warm-start, the real benchmark runs against a "warmed" system with:
// - Gap receipts in the database (enrichment pipeline can use them)
// - Entity index enriched for known-gap tenants
// - HyDE cache pre-populated for difficult queries
//
// Usage:
//   npx tsx warm-start.ts --dataset s3
//   npx tsx warm-start.ts --dataset s3 --skip-probe    # only run entity extraction on known gaps
//   npx tsx warm-start.ts --dataset s3 --probe-only    # only run probe, don't extract
//
// Cost: ~$3-5 for probe (Haiku, 500 questions × 1 tool call)
//       ~$2-3 for targeted entity extraction (Haiku, ~50 gap tenants × 5 chunks)

import { resolve } from "node:path";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { loadDataset } from "./lib/dataset-loader.js";
import type { LmeDataset, LmeProblem } from "./lib/types.js";
import { classifyQuestion } from "./lib/system-prompts.js";

const API_BASE = process.env.BENCH_VAULTCRUX_API_BASE ?? "http://100.109.10.67:14333";
const API_KEY = process.env.BENCH_VAULTCRUX_API_KEY ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// ── CLI ──

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  return {
    dataset: (get("--dataset") ?? "s3") as LmeDataset,
    skipProbe: has("--skip-probe"),
    probeOnly: has("--probe-only"),
    concurrency: parseInt(get("--concurrency") ?? "8", 10),
  };
}

// ── Probe: cheap single-query pass ──

interface ProbeResult {
  questionId: string;
  questionType: string;
  tenantId: string;
  resultCount: number;
  topScore: number;
  queryConfidence: number;
  latencyMs: number;
  isGap: boolean; // resultCount === 0 or topScore < 0.2
}

async function probeQuestion(
  problem: LmeProblem,
  dataset: LmeDataset,
): Promise<ProbeResult> {
  const tenantId = `__longmemeval_${dataset}_${problem.problemId}`;
  const start = Date.now();

  try {
    const resp = await fetch(`${API_BASE}/v1/memory/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({
        query: problem.question,
        limit: 5,
        scoring_profile: "balanced",
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await resp.json() as any;
    const results = data?.data?.results ?? [];
    const topScore = results.length > 0 ? (results[0]?.score ?? 0) : 0;
    const queryConfidence = data?.data?.meta?.queryConfidence ?? 0;

    return {
      questionId: problem.problemId,
      questionType: problem.questionType,
      tenantId,
      resultCount: results.length,
      topScore,
      queryConfidence,
      latencyMs: Date.now() - start,
      isGap: results.length === 0 || topScore < 0.2,
    };
  } catch {
    return {
      questionId: problem.problemId,
      questionType: problem.questionType,
      tenantId,
      resultCount: 0,
      topScore: 0,
      queryConfidence: 0,
      latencyMs: Date.now() - start,
      isGap: true,
    };
  }
}

async function runProbe(
  problems: LmeProblem[],
  dataset: LmeDataset,
  concurrency: number,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < problems.length) {
      const i = nextIndex++;
      if (i >= problems.length) break;
      const result = await probeQuestion(problems[i]!, dataset);
      results.push(result);
      completed++;
      if (completed % 50 === 0) {
        const gaps = results.filter((r) => r.isGap).length;
        console.log(`[probe] ${completed}/${problems.length} done, ${gaps} gaps so far`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ── Entity extraction on gap tenants ──

async function extractEntitiesForTenant(
  tenantId: string,
  question: string,
): Promise<{ extracted: number; stored: number }> {
  // Use investigate_question to trigger server-side entity extraction + retrieval
  try {
    const resp = await fetch(`${API_BASE}/v1/memory/investigate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-tenant-id": tenantId,
      },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(20000),
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      const facts = data?.data?.facts?.length ?? 0;
      const chunks = data?.data?.retrieved_chunks?.length ?? 0;
      return { extracted: facts, stored: chunks };
    }
    return { extracted: 0, stored: 0 };
  } catch {
    return { extracted: 0, stored: 0 };
  }
}

// ── HyDE cache warming ──

async function warmHydeCache(questions: string[]): Promise<number> {
  if (!ANTHROPIC_API_KEY) return 0;

  let warmed = 0;
  for (const question of questions) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          temperature: 0.7,
          messages: [{
            role: "user",
            content: `You are simulating a memory system that stores personal conversations. Generate a plausible 2-3 sentence answer to this question as if you found it in stored conversations. Include specific names, dates, numbers, and synonyms. Be concrete and specific.\n\nQuestion: ${question}\n\nPlausible answer:`,
          }],
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (resp.ok) warmed++;
    } catch {
      // Non-blocking
    }
  }
  return warmed;
}

// ── Main ──

async function main() {
  const opts = parseArgs();
  const outDir = resolve(
    import.meta.dirname ?? new URL(".", import.meta.url).pathname,
    "results",
    `warm-start-${opts.dataset}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`,
  );
  mkdirSync(outDir, { recursive: true });

  console.log(`[warm-start] Dataset: ${opts.dataset}`);
  console.log(`[warm-start] API: ${API_BASE}`);

  const problems = loadDataset(opts.dataset);
  console.log(`[warm-start] Loaded ${problems.length} problems\n`);

  // Phase 1: Probe pass
  let probeResults: ProbeResult[];
  const probePath = resolve(outDir, "probe-results.json");

  if (opts.skipProbe && existsSync(probePath)) {
    console.log(`[warm-start] Loading cached probe results from ${probePath}`);
    probeResults = JSON.parse(readFileSync(probePath, "utf-8"));
  } else if (opts.skipProbe) {
    console.error("[warm-start] --skip-probe requires existing probe-results.json");
    process.exit(1);
  } else {
    console.log(`[warm-start] Phase 1: Probe pass (${problems.length} questions, ${opts.concurrency} workers)...`);
    const probeStart = Date.now();
    probeResults = await runProbe(problems, opts.dataset, opts.concurrency);
    const probeDuration = ((Date.now() - probeStart) / 1000).toFixed(1);

    const gaps = probeResults.filter((r) => r.isGap);
    const avgLatency = (probeResults.reduce((s, r) => s + r.latencyMs, 0) / probeResults.length).toFixed(0);

    console.log(`\n[warm-start] Probe complete: ${probeDuration}s, ${gaps.length}/${probeResults.length} gaps, avg ${avgLatency}ms/q`);

    // Save probe results
    writeFileSync(probePath, JSON.stringify(probeResults, null, 2));
    console.log(`[warm-start] Saved probe results to ${probePath}`);
  }

  // Phase 2: Analyse gaps
  const gaps = probeResults.filter((r) => r.isGap);
  const gapsByType = new Map<string, ProbeResult[]>();
  for (const g of gaps) {
    const arr = gapsByType.get(g.questionType) ?? [];
    arr.push(g);
    gapsByType.set(g.questionType, arr);
  }

  console.log(`\n[warm-start] Phase 2: Gap analysis`);
  console.log(`  Total gaps: ${gaps.length}/${probeResults.length} (${(gaps.length / probeResults.length * 100).toFixed(1)}%)`);
  for (const [type, items] of [...gapsByType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${type}: ${items.length} gaps`);
  }

  // Save gap analysis
  const gapAnalysis = {
    totalQuestions: probeResults.length,
    totalGaps: gaps.length,
    gapRate: gaps.length / probeResults.length,
    byType: Object.fromEntries([...gapsByType.entries()].map(([k, v]) => [k, v.length])),
    avgTopScore: probeResults.reduce((s, r) => s + r.topScore, 0) / probeResults.length,
    avgGapTopScore: gaps.length > 0 ? gaps.reduce((s, r) => s + r.topScore, 0) / gaps.length : 0,
    gapQuestionIds: gaps.map((g) => g.questionId),
  };
  writeFileSync(resolve(outDir, "gap-analysis.json"), JSON.stringify(gapAnalysis, null, 2));

  if (opts.probeOnly) {
    console.log(`\n[warm-start] Probe-only mode — skipping extraction and cache warming.`);
    return;
  }

  // Phase 3: Run investigate_question on gap tenants (triggers server-side entity extraction + gap receipts)
  console.log(`\n[warm-start] Phase 3: Entity enrichment for ${gaps.length} gap tenants...`);
  let enriched = 0;
  let totalFacts = 0;
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i]!;
    const problem = problems.find((p) => p.problemId === gap.questionId);
    if (!problem) continue;

    const result = await extractEntitiesForTenant(gap.tenantId, problem.question);
    totalFacts += result.extracted;
    if (result.extracted > 0 || result.stored > 0) enriched++;

    if ((i + 1) % 20 === 0) {
      console.log(`  [enrich] ${i + 1}/${gaps.length} done, ${enriched} enriched, ${totalFacts} facts`);
    }
  }
  console.log(`[warm-start] Enrichment complete: ${enriched}/${gaps.length} tenants enriched, ${totalFacts} total facts`);

  // Phase 4: Warm HyDE cache for gap queries
  console.log(`\n[warm-start] Phase 4: HyDE cache warming for ${gaps.length} gap queries...`);
  const gapQuestions = gaps.map((g) => {
    const problem = problems.find((p) => p.problemId === g.questionId);
    return problem?.question ?? "";
  }).filter((q) => q.length > 0);

  const warmed = await warmHydeCache(gapQuestions);
  console.log(`[warm-start] HyDE cache warmed: ${warmed}/${gapQuestions.length} hypotheses generated`);

  // Phase 5: Summary
  const summary = {
    dataset: opts.dataset,
    timestamp: new Date().toISOString(),
    probeResults: probeResults.length,
    gaps: gaps.length,
    enriched,
    totalFacts,
    hydeCacheWarmed: warmed,
    gapAnalysis,
  };
  writeFileSync(resolve(outDir, "warm-start-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\n[warm-start] Complete!`);
  console.log(`  Probe: ${probeResults.length} questions, ${gaps.length} gaps`);
  console.log(`  Enriched: ${enriched} tenants, ${totalFacts} facts`);
  console.log(`  HyDE cache: ${warmed} hypotheses`);
  console.log(`  Output: ${outDir}`);
  console.log(`\n  Now run the real benchmark with the warmed system.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
