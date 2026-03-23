import * as crypto from "node:crypto";
import { createClient } from "./lib/client.js";
import { resolveConfig } from "./lib/config.js";
import { writeReport } from "./lib/report.js";
import type { AuditMemoryConfig, CategoryResult, CategoryRunner, MemoryAuditReport, MemoryCategoryId, TargetMode } from "./lib/types.js";

// Category runners — imported lazily per milestone
import { runCatA } from "./lib/categories/cat-a-core-memory.js";
import { runCatB } from "./lib/categories/cat-b-decision-plane.js";
import { runCatC } from "./lib/categories/cat-c-platform-wiring.js";
import { runCatD } from "./lib/categories/cat-d-constraints.js";

const CATEGORY_RUNNERS: Record<MemoryCategoryId, { label: string; runner: CategoryRunner }> = {
  catA: { label: "A: Core Memory", runner: runCatA },
  catB: { label: "B: Decision Plane", runner: runCatB },
  catC: { label: "C: Platform Wiring", runner: runCatC },
  catD: { label: "D: Constraints", runner: runCatD },
};

const CATEGORY_ALIASES: Record<string, MemoryCategoryId> = {
  A: "catA", a: "catA", catA: "catA",
  B: "catB", b: "catB", catB: "catB",
  C: "catC", c: "catC", catC: "catC",
  D: "catD", d: "catD", catD: "catD",
};

function parseArgs(argv: string[]): { cat: MemoryCategoryId | "all"; target?: TargetMode; dryRun: boolean } {
  let cat: MemoryCategoryId | "all" = "all";
  let target: TargetMode | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cat" && argv[i + 1]) {
      const alias = argv[++i]!;
      if (alias === "all") {
        cat = "all";
      } else {
        const mapped = CATEGORY_ALIASES[alias];
        if (!mapped) {
          console.error(`Unknown category: ${alias}. Use A, B, C, D, or all.`);
          process.exit(1);
        }
        cat = mapped;
      }
    } else if (arg === "--target" && argv[i + 1]) {
      const t = argv[++i]!;
      if (t !== "api" && t !== "mcp") {
        console.error(`Unknown target: ${t}. Use api or mcp.`);
        process.exit(1);
      }
      target = t;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  return { cat, target, dryRun };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config: AuditMemoryConfig = resolveConfig({ target: args.target });
  const client = createClient(config);

  const targetUrl = config.target === "mcp" ? config.mcpUrl : config.apiBase;

  console.log(`MemoryCrux Audit Suite`);
  console.log(`  Target:  ${config.target} @ ${targetUrl}`);
  console.log(`  Tenant:  ${config.tenantId}`);
  console.log(`  Timeout: ${config.timeoutMs}ms`);
  console.log(`  Cat:     ${args.cat}`);
  console.log("");

  // Probe target
  const reachable = await client.probe();
  console.log(`  Probe:   ${reachable ? "OK" : "UNREACHABLE"}`);
  console.log("");

  if (args.dryRun) {
    if (!reachable) {
      console.log("Dry run: target unreachable. Check URL and ensure VaultCrux is running.");
      process.exit(1);
    }
    console.log("Dry run: config valid, target reachable. Ready to run.");
    process.exit(0);
  }

  if (!reachable) {
    console.error("Target unreachable. Run with --dry-run to diagnose.");
    process.exit(1);
  }

  const runId = crypto.randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const results: CategoryResult[] = [];

  // Determine which categories to run
  const catIds: MemoryCategoryId[] =
    args.cat === "all"
      ? (Object.keys(CATEGORY_RUNNERS) as MemoryCategoryId[])
      : [args.cat];

  for (const catId of catIds) {
    const { label, runner } = CATEGORY_RUNNERS[catId];
    console.log(`--- ${label} ---`);
    const result = await runner(config, client);
    results.push(result);
    const status = result.skipped ? "SKIP" : result.passed ? "PASS" : "FAIL";
    console.log(`  ${status} (${result.metrics.passed}/${result.metrics.total} tests)`);
    console.log("");
  }

  const finishedAt = new Date().toISOString();
  const durationS = ((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1);

  const toolNames = new Set(results.flatMap((r) => r.toolResults.map((t) => t.toolName)));
  const passedToolNames = new Set(
    results.flatMap((r) =>
      r.toolResults
        .filter((t) => t.verdict === "pass")
        .map((t) => t.toolName),
    ),
  );

  const report: MemoryAuditReport = {
    runId,
    startedAt,
    finishedAt,
    target: config.target,
    targetUrl,
    tenantId: config.tenantId,
    results,
    summary: {
      totalCategories: results.length,
      passedCategories: results.filter((r) => r.passed).length,
      skippedCategories: results.filter((r) => r.skipped).length,
      totalTools: toolNames.size,
      passedTools: passedToolNames.size,
      totalTests: results.reduce((s, r) => s + r.metrics.total, 0),
      passedTests: results.reduce((s, r) => s + r.metrics.passed, 0),
      durationS,
    },
  };

  const { jsonPath, mdPath } = writeReport(report);
  console.log("=== Report ===");
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log(`  Tests: ${report.summary.passedTests}/${report.summary.totalTests} passed`);
  console.log(`  Categories: ${report.summary.passedCategories}/${report.summary.totalCategories} passed, ${report.summary.skippedCategories} skipped`);

  const hasFails = results.some((r) => !r.passed && !r.skipped);
  process.exit(hasFails ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
