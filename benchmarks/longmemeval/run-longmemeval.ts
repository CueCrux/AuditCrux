#!/usr/bin/env tsx
// LongMemEval External Benchmark — CLI Entry Point
//
// Usage:
//   npx tsx run-longmemeval.ts --dataset s --arm T2 --model claude-sonnet-4-6
//   npx tsx run-longmemeval.ts --dataset s --arm C0,C2,F1,T2 --model claude-sonnet-4-6 --pilot 10
//   npx tsx run-longmemeval.ts --dataset m --arm F1,T2 --model claude-sonnet-4-6
//   npx tsx run-longmemeval.ts --dataset s --arm T2 --model gpt-5.4 --questions q001,q002
//   npx tsx run-longmemeval.ts --dataset s --arm T2 --model gpt-5.4 --budget-limit 50
//   npx tsx run-longmemeval.ts --dataset s --arm T2 --model gpt-5.4 --dry-run
//   npx tsx run-longmemeval.ts --dataset s --arm T2 --model gpt-5.4 --skip-seed

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { McProxy } from "../memorycrux/lib/mc-proxy.js";
import { resolveConfig } from "../memorycrux/lib/config.js";
import { createAdapter } from "../memorycrux/lib/llm/factory.js";
import { MEMORYCRUX_TOOL_DEFS, LOCAL_BENCHMARK_TOOL_DEFS } from "../memorycrux/lib/llm/tool-bridge.js";
import type { BenchModel } from "../memorycrux/lib/types.js";
import { loadDataset, loadProblems, stratifiedSample } from "./lib/dataset-loader.js";
import { getArmConfig, filterToolDefs } from "./lib/arms.js";
import { executeRun, CASCADE_CHAIN } from "./lib/orchestrator.js";
import { writeHypotheses, writeRunSummary, writeReport, writeTrace } from "./lib/hypothesis-writer.js";
import type { LmeArm, LmeDataset, LmeRunManifest } from "./lib/types.js";

// ── CLI argument parsing ──

function parseArgs(): {
  dataset: LmeDataset;
  arms: LmeArm[];
  models: string[];
  pilot?: number;
  questions?: string[];
  budgetLimit?: number;
  dryRun: boolean;
  skipSeed: boolean;
  concurrency: number;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const dataset = (get("--dataset") ?? "s") as LmeDataset;
  if (!["s", "s2", "s3", "m"].includes(dataset)) {
    console.error("--dataset must be 's', 's2', 's3', or 'm'");
    process.exit(1);
  }

  const armStr = get("--arm") ?? "T2";
  const arms = armStr.split(",") as LmeArm[];
  for (const a of arms) {
    if (!["C0", "C2", "F1", "T2"].includes(a)) {
      console.error(`Unknown arm: ${a}. Must be C0, C2, F1, or T2.`);
      process.exit(1);
    }
  }

  const modelStr = get("--model") ?? "claude-sonnet-4-6";
  const models = modelStr.split(",");

  const pilotStr = get("--pilot");
  const pilot = pilotStr ? parseInt(pilotStr, 10) : undefined;

  const questionsStr = get("--questions");
  const questions = questionsStr ? questionsStr.split(",") : undefined;

  const budgetStr = get("--budget-limit");
  const budgetLimit = budgetStr ? parseFloat(budgetStr) : undefined;

  const concurrencyStr = get("--concurrency");
  const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 1;

  // Custom cascade chain: --cascade-chain "haiku,sonnet" (omit opus to cap at 2 tiers)
  const cascadeChainStr = get("--cascade-chain");

  return {
    dataset,
    arms,
    models,
    pilot,
    questions,
    budgetLimit,
    dryRun: has("--dry-run"),
    skipSeed: has("--skip-seed"),
    concurrency,
    cascadeChainStr,
  };
}

// ── Main ──

async function main() {
  const opts = parseArgs();
  const benchConfig = resolveConfig();

  // Load dataset
  console.log(`Loading LongMemEval_${opts.dataset.toUpperCase()}...`);
  let problems = opts.questions
    ? loadProblems(opts.dataset, opts.questions)
    : loadDataset(opts.dataset);

  console.log(`Loaded ${problems.length} problems`);

  // Apply pilot filter
  if (opts.pilot) {
    // Stratified sample: N per type for even coverage
    const perType = Math.max(1, Math.ceil(opts.pilot / 6)); // 6 question types
    problems = stratifiedSample(problems, perType).slice(0, opts.pilot);
    console.log(`Pilot mode: ${problems.length} problems (${perType}/type)`);
  }

  // Expand matrix: arms × models
  const matrix: Array<{ arm: LmeArm; model: string }> = [];
  for (const arm of opts.arms) {
    for (const model of opts.models) {
      // C2 not supported for LongMemEval_M (exceeds context windows)
      if ((opts.dataset === "m") && arm === "C2") {
        console.log(`Skipping ${arm}/${model}: C2 not supported for LongMemEval_M (corpus exceeds context windows)`);
        continue;
      }
      matrix.push({ arm, model });
    }
  }

  if (opts.dryRun) {
    console.log("\n[dry-run] Would execute the following runs:");
    for (const cell of matrix) {
      console.log(`  - ${cell.arm} / ${cell.model} / ${problems.length} questions`);
    }
    console.log(`\nTotal cells: ${matrix.length}`);
    return;
  }

  // Validate API keys (after dry-run check)
  const errors = [];
  const modelsToValidate = opts.models.includes("cascade")
    ? CASCADE_CHAIN as string[]  // cascade needs Anthropic key for all three tiers
    : opts.models;
  for (const model of modelsToValidate) {
    const provider = model.startsWith("claude") ? "anthropic" : "openai";
    if (provider === "anthropic" && !benchConfig.anthropicApiKey) {
      errors.push("ANTHROPIC_API_KEY required for " + model);
    }
    if (provider === "openai" && !benchConfig.openaiApiKey && !process.env.OPENAI_BASE_URL) {
      errors.push("OPENAI_API_KEY required for " + model + " (or set OPENAI_BASE_URL for local inference)");
    }
  }
  if (errors.length > 0) {
    console.error("Configuration errors:\n  " + errors.join("\n  "));
    process.exit(1);
  }

  // Execute each cell
  const resultsBase = resolve(
    import.meta.dirname ?? new URL(".", import.meta.url).pathname,
    "results",
  );

  for (const cell of matrix) {
    const isCascade = cell.model === "cascade";
    const displayModel = isCascade ? "cascade" : cell.model;
    const baseModel = isCascade ? CASCADE_CHAIN[0]! : cell.model;

    const runId = `lme-${opts.dataset}-${shortModel(displayModel)}-${cell.arm}-${timestamp()}-${randomBytes(3).toString("hex")}`;
    const armConfig = getArmConfig(cell.arm);

    const manifest: LmeRunManifest = {
      runId,
      dataset: opts.dataset,
      arm: cell.arm,
      armConfig,
      model: displayModel,
      startedAt: new Date().toISOString(),
      pilotSize: opts.pilot,
      questionFilter: opts.questions,
      budgetLimitUsd: opts.budgetLimit,
      skipSeed: opts.skipSeed,
    };

    // Create LLM adapter (base model for cascade, or the specified model)
    const adapter = createAdapter(baseModel as BenchModel, benchConfig);

    // Probe VaultCrux for treatment arms
    if (armConfig.needsVaultCrux) {
      if (!benchConfig.vaultcruxApiBase || !benchConfig.vaultcruxApiKey) {
        console.error(`VaultCrux config required for arm ${cell.arm}. Set BENCH_VAULTCRUX_API_BASE and BENCH_VAULTCRUX_API_KEY.`);
        process.exit(1);
      }
      const probeProxy = new McProxy({
        apiBase: benchConfig.vaultcruxApiBase,
        apiKey: benchConfig.vaultcruxApiKey,
        tenantId: "__longmemeval_probe",
        agentId: "longmemeval-bench",
        timeoutMs: benchConfig.timeoutMs,
      });

      const healthy = await probeProxy.probe();
      if (!healthy) {
        console.error(`VaultCrux is not reachable at ${benchConfig.vaultcruxApiBase}`);
        process.exit(1);
      }
      console.log(`VaultCrux healthy at ${benchConfig.vaultcruxApiBase}`);
    }

    // Filter tool definitions based on arm (include local benchmark tools)
    const allToolDefs = [...MEMORYCRUX_TOOL_DEFS, ...LOCAL_BENCHMARK_TOOL_DEFS];
    const toolDefs = filterToolDefs(allToolDefs, armConfig.toolSet);

    // Incremental output — save each answer as it completes so crashes don't lose work
    const outDir = resolve(resultsBase, runId);
    const { mkdirSync, appendFileSync } = await import("node:fs");
    mkdirSync(outDir, { recursive: true });
    const incrementalPath = resolve(outDir, "hypotheses.jsonl");

    // Parse custom cascade chain if provided
    const CHAIN_ALIASES: Record<string, BenchModel> = {
      haiku: "claude-haiku-4-5",
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-6",
    };
    let cascadeChain: BenchModel[] | undefined;
    if (isCascade && opts.cascadeChainStr) {
      cascadeChain = opts.cascadeChainStr.split(",").map((s) => {
        const alias = s.trim().toLowerCase();
        return CHAIN_ALIASES[alias] ?? (alias as BenchModel);
      });
      console.log(`[cascade] Custom chain: ${cascadeChain.join(" → ")}`);
    }

    // Execute — orchestrator creates per-problem McProxy instances internally
    const summary = await executeRun(problems, {
      adapter,
      toolDefs,
      armConfig,
      manifest,
      benchConfig,
      concurrency: opts.concurrency,
      cascade: isCascade,
      cascadeChain,
      onAnswer: (answer) => {
        const hyp = { question_id: answer.questionId, hypothesis: answer.hypothesis };
        appendFileSync(incrementalPath, JSON.stringify(hyp) + "\n");
      },
    });

    // Write final outputs (overwrites incremental)
    writeHypotheses(summary.answers, resolve(outDir, "hypotheses.jsonl"));
    writeRunSummary(summary, resolve(outDir, "summary.json"));
    writeReport(summary, resolve(outDir, "report.md"));
    // Write agent trace if any answers have trace data
    if (summary.answers.some((a) => a.toolTrace?.length)) {
      writeTrace(summary.answers, resolve(outDir, "agent-trace.md"));
    }

    console.log(`\n[output] Results written to ${outDir}`);
  }
}

// ── Helpers ──

function shortModel(model: string): string {
  return model
    .replace("claude-", "")
    .replace("gpt-", "")
    .replace(/\./g, "");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
