#!/usr/bin/env tsx
// MemoryCrux Benchmark Harness — CLI entry point
//
// Usage:
//   pnpm bench:mc --project alpha --arm T2 --model claude-sonnet-4-6 [--variant clean] [--phase 4] [--dry-run]
//   pnpm bench:mc --project beta --arm C0,C2,T2 --model claude-sonnet-4-6
//   pnpm bench:mc --matrix headline  (runs Alpha+Beta on headline models x headline arms)

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { resolveConfig, validateConfig } from "./lib/config.js";
import { getArmConfig, getModelProvider, HEADLINE_ARMS, HEADLINE_MODELS } from "./lib/arms.js";
import { generateRunId } from "./lib/run-id.js";
import { executeRun } from "./lib/orchestrator.js";
import { loadFixture } from "./fixtures/_shared/fixture-schema.js";
import { writeRunReport } from "./lib/report.js";
import type {
  BenchArm,
  BenchModel,
  BenchProject,
  ReasoningProfile,
  RunManifest,
} from "./lib/types.js";

const VALID_PROJECTS: BenchProject[] = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
const VALID_ARMS: BenchArm[] = ["C0", "C1", "C2", "C3", "F1", "T1", "T2", "T3"];
const VALID_MODELS: BenchModel[] = [
  "claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5",
  "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano",
];
const VALID_PROFILES: ReasoningProfile[] = ["balanced", "deep", "minimal"];

function usage(): never {
  console.log(`
MemoryCrux Benchmark Harness v1.1

Usage:
  run-benchmark.ts [options]

Options:
  --project <name>       Project to run (alpha|beta|gamma|delta|epsilon|zeta)
  --arm <arm[,arm]>      Arms to run (C0|C1|C2|C3|F1|T1|T2|T3) — comma-separated
  --model <id[,id]>      Models to run — comma-separated
  --variant <id>         Kill/fixture variant (default: all variants for project)
  --profile <name>       Reasoning profile (balanced|deep|minimal) — default: balanced
  --phase <n>            MemoryCrux phase (1-4) — default: 4
  --matrix <preset>      Run a preset matrix: headline
  --repetitions <n>      Repetitions per cell (default: 1)
  --dry-run              Print config and manifest, don't call LLMs
  --help                 Show this help
`);
  process.exit(0);
}

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      arm: { type: "string" },
      model: { type: "string" },
      variant: { type: "string" },
      profile: { type: "string", default: "balanced" },
      phase: { type: "string", default: "4" },
      matrix: { type: "string" },
      repetitions: { type: "string", default: "1" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) usage();
  return values;
}

function expandMatrix(args: ReturnType<typeof parseCliArgs>): RunManifest[] {
  let projects: BenchProject[];
  let arms: BenchArm[];
  let models: BenchModel[];

  if (args.matrix === "headline") {
    projects = ["alpha", "beta"];
    arms = [...HEADLINE_ARMS];
    models = [...HEADLINE_MODELS];
  } else {
    if (!args.project) {
      console.error("Error: --project is required (or use --matrix headline)");
      process.exit(1);
    }
    projects = args.project.split(",") as BenchProject[];
    arms = (args.arm ?? "T2").split(",") as BenchArm[];
    models = (args.model ?? "claude-sonnet-4-6").split(",") as BenchModel[];
  }

  // Validate
  for (const p of projects) {
    if (!VALID_PROJECTS.includes(p)) {
      console.error(`Invalid project: ${p}. Valid: ${VALID_PROJECTS.join(", ")}`);
      process.exit(1);
    }
  }
  for (const a of arms) {
    if (!VALID_ARMS.includes(a)) {
      console.error(`Invalid arm: ${a}. Valid: ${VALID_ARMS.join(", ")}`);
      process.exit(1);
    }
  }
  for (const m of models) {
    if (!VALID_MODELS.includes(m)) {
      console.error(`Invalid model: ${m}. Valid: ${VALID_MODELS.join(", ")}`);
      process.exit(1);
    }
  }

  const profile = (args.profile ?? "balanced") as ReasoningProfile;
  if (!VALID_PROFILES.includes(profile)) {
    console.error(`Invalid profile: ${profile}. Valid: ${VALID_PROFILES.join(", ")}`);
    process.exit(1);
  }

  const phase = Number(args.phase ?? 4);
  const variant = args.variant ?? "v01";
  const repetitions = Number(args.repetitions ?? 1);

  const manifests: RunManifest[] = [];
  for (const project of projects) {
    for (const model of models) {
      for (const arm of arms) {
        // Skip OpenAI models if no key, skip Anthropic if no key
        const provider = getModelProvider(model);

        for (let rep = 0; rep < repetitions; rep++) {
          const armConfig = getArmConfig(arm, model);
          manifests.push({
            runId: generateRunId({ project, phase, model, profile, arm, variant }),
            project,
            phase,
            model,
            reasoningProfile: profile,
            arm,
            armConfig,
            variant,
            startedAt: new Date().toISOString(),
            fixtureVariantId: variant,
          });
        }
      }
    }
  }

  return manifests;
}

async function main() {
  const args = parseCliArgs();
  const config = resolveConfig();
  const errors = validateConfig(config);

  const manifests = expandMatrix(args);

  console.log("=== MemoryCrux Benchmark Harness v1.1 ===\n");
  console.log(`Config:`);
  console.log(`  VaultCrux API: ${config.vaultcruxApiBase}`);
  console.log(`  Output dir:    ${config.outputDir}`);
  console.log(`  Timeout:       ${config.timeoutMs}ms`);
  console.log(`  Max turns/phase: ${config.maxTurnsPerPhase}`);
  console.log(`  Anthropic key: ${config.anthropicApiKey ? "set" : "NOT SET"}`);
  console.log(`  OpenAI key:    ${config.openaiApiKey ? "set" : "NOT SET"}`);
  console.log();

  if (errors.length > 0 && !args["dry-run"]) {
    console.error("Config errors:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Run matrix: ${manifests.length} cell(s)\n`);
  console.log("| # | Project | Model | Arm | Variant | Run ID |");
  console.log("|---|---------|-------|-----|---------|--------|");
  for (let i = 0; i < manifests.length; i++) {
    const m = manifests[i];
    console.log(`| ${i + 1} | ${m.project} | ${m.model} | ${m.arm} | ${m.variant} | ${m.runId} |`);
  }
  console.log();

  if (args["dry-run"]) {
    console.log("[DRY RUN] Would execute the above matrix. Exiting.");
    process.exit(0);
  }

  // Filter manifests by available API keys
  const runnableManifests = manifests.filter((m) => {
    const provider = getModelProvider(m.model);
    if (provider === "anthropic" && !config.anthropicApiKey) {
      console.warn(`  Skipping ${m.runId}: ANTHROPIC_API_KEY not set`);
      return false;
    }
    if (provider === "openai" && !config.openaiApiKey) {
      console.warn(`  Skipping ${m.runId}: OPENAI_API_KEY not set`);
      return false;
    }
    return true;
  });

  if (runnableManifests.length === 0) {
    console.error("\nNo runnable cells — check API keys.");
    process.exit(1);
  }

  console.log(`\nExecuting ${runnableManifests.length} cell(s)...\n`);

  const fixturesDir = resolve(import.meta.dirname, "fixtures");
  const fixtureCache: Record<string, ReturnType<typeof loadFixture>> = {};

  for (let i = 0; i < runnableManifests.length; i++) {
    const manifest = runnableManifests[i];
    console.log(`--- [${i + 1}/${runnableManifests.length}] ${manifest.runId} ---`);

    // Load fixture (cached per project)
    if (!fixtureCache[manifest.project]) {
      const dir = resolve(fixturesDir, manifest.project);
      fixtureCache[manifest.project] = loadFixture(dir);
    }
    const fixture = fixtureCache[manifest.project];

    try {
      const { summary } = await executeRun(manifest, fixture, config);
      const { jsonPath, mdPath } = writeRunReport(summary, config.outputDir);
      console.log(`  Done: ${summary.durationSeconds.toFixed(1)}s, $${summary.usage.estimatedCostUsd.toFixed(4)}`);
      console.log(`  Report: ${mdPath}`);
    } catch (err: unknown) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
