#!/usr/bin/env tsx
// LongMemEval Batch Ingest — Seed all problems upfront, then wait once.
//
// Phase 1: Ingest all sessions for all problems (or a subset) into VaultCrux
// Phase 2: Wait for embeddings to settle
// Phase 3: Verify retrieval on a sample
//
// Usage:
//   npx tsx batch-ingest.ts --dataset s
//   npx tsx batch-ingest.ts --dataset s --start 46 --concurrency 10
//   npx tsx batch-ingest.ts --dataset s --verify-only
//
// Then run the benchmark with --skip-seed:
//   npx tsx run-longmemeval.ts --dataset s --arm F1 --model claude-sonnet-4-6 --skip-seed

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { McProxy } from "../memorycrux/lib/mc-proxy.js";
import { resolveConfig } from "../memorycrux/lib/config.js";
import { loadDataset } from "./lib/dataset-loader.js";
import { ingestProblem, verifyIngestion } from "./lib/ingest-sessions.js";
import type { LmeDataset, LmeProblem } from "./lib/types.js";

// ── CLI ──

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
const has = (flag: string): boolean => args.includes(flag);

const dataset = (get("--dataset") ?? "s") as LmeDataset;
const startIdx = parseInt(get("--start") ?? "0", 10);
const concurrency = parseInt(get("--concurrency") ?? "5", 10);
const verifyOnly = has("--verify-only");
const cooldownMinutes = parseInt(get("--cooldown") ?? "5", 10);

const config = resolveConfig();

if (!config.vaultcruxApiBase || !config.vaultcruxApiKey) {
  console.error("BENCH_VAULTCRUX_API_BASE and BENCH_VAULTCRUX_API_KEY required");
  process.exit(1);
}

// ── Load dataset ──

console.log(`Loading LongMemEval_${dataset.toUpperCase()}...`);
const allProblems = loadDataset(dataset);
console.log(`Loaded ${allProblems.length} problems`);

const problems = allProblems.slice(startIdx);
console.log(`Processing problems ${startIdx + 1} to ${allProblems.length} (${problems.length} remaining)`);

const totalSessions = problems.reduce((s, p) => s + p.sessions.length, 0);
console.log(`Total sessions to ingest: ${totalSessions.toLocaleString()}`);

// ── Provision tenants ──

function provisionTenants(problems: LmeProblem[]): void {
  const tenantIds = problems.map((p) => `__longmemeval_${dataset}_${p.problemId}`);
  tenantIds.push("__longmemeval_probe");

  // Batch in groups of 100 to avoid SQL statement size limits
  const batchSize = 100;
  let provisioned = 0;

  for (let i = 0; i < tenantIds.length; i += batchSize) {
    const batch = tenantIds.slice(i, i + batchSize);
    const values = batch
      .map((id) => `('${id}', 'LongMemEval Benchmark ${id}')`)
      .join(",\n    ");
    const sql = `INSERT INTO tenants (id, name) VALUES\n    ${values}\n    ON CONFLICT (id) DO NOTHING;`;

    const dbUrl = process.env.BENCH_VAULTCRUX_DB_URL;
    try {
      if (dbUrl) {
        execSync(`psql "${dbUrl}" -c "${sql.replace(/"/g, '\\"')}"`, {
          timeout: 15000,
          stdio: "pipe",
        });
      } else {
        const tmpSql = `/tmp/lme-provision-${Date.now()}.sql`;
        writeFileSync(tmpSql, sql, "utf-8");
        execSync(`cat ${tmpSql} | ssh -o ConnectTimeout=5 root@100.75.64.43 "docker exec -i postgres-vaultcrux psql -U vaultcrux -d vaultcrux"`, {
          timeout: 15000,
          stdio: "pipe",
        });
        unlinkSync(tmpSql);
      }
      provisioned += batch.length;
    } catch (err) {
      console.warn(`[provision] Batch ${i}-${i + batch.length} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  console.log(`[provision] Created ${provisioned} tenant rows`);
}

// ── Phase 1: Batch ingest ──

async function batchIngest(): Promise<void> {
  const startTime = Date.now();
  let totalSeeded = 0;
  let totalFailed = 0;

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    const tenantId = `__longmemeval_${dataset}_${problem.problemId}`;
    const proxy = new McProxy({
      apiBase: config.vaultcruxApiBase,
      apiKey: config.vaultcruxApiKey,
      tenantId,
      agentId: "longmemeval-batch-ingest",
      timeoutMs: config.timeoutMs,
    });

    const globalIdx = startIdx + i + 1;
    process.stdout.write(`[${globalIdx}/${allProblems.length}] ${problem.problemId} (${problem.sessions.length} sessions)... `);

    const result = await ingestProblem(proxy, problem, { concurrency });
    totalSeeded += result.seeded;
    totalFailed += result.failed;

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = totalSeeded / Math.max(elapsed, 1);
    const remaining = totalSessions - totalSeeded - totalFailed;
    const eta = Math.round(remaining / Math.max(rate, 0.1));

    console.log(
      `${result.seeded}/${result.totalSessions} seeded in ${(result.durationMs / 1000).toFixed(1)}s` +
      ` [total: ${totalSeeded.toLocaleString()} seeded, ${totalFailed} failed, ${rate.toFixed(1)} docs/s, ETA: ${formatTime(eta)}]`,
    );
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n[ingest] Phase 1 complete: ${totalSeeded.toLocaleString()} seeded, ${totalFailed} failed in ${formatTime(totalTime)}`);
  console.log(`[ingest] Throughput: ${(totalSeeded / Math.max(totalTime, 1)).toFixed(1)} docs/sec`);
}

// ── Phase 2: Cooldown ──

async function cooldown(): Promise<void> {
  const waitMs = cooldownMinutes * 60 * 1000;
  console.log(`\n[cooldown] Waiting ${cooldownMinutes} minutes for embeddings to process ${totalSessions.toLocaleString()} documents...`);

  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const remaining = Math.ceil((waitMs - (Date.now() - start)) / 1000);
    process.stdout.write(`\r[cooldown] ${remaining}s remaining...   `);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\n[cooldown] Done`);
}

// ── Phase 3: Verify ──

async function verify(): Promise<void> {
  console.log(`\n[verify] Spot-checking retrieval on 10 random problems...`);
  const sample = problems
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);

  let passed = 0;
  for (const problem of sample) {
    const tenantId = `__longmemeval_${dataset}_${problem.problemId}`;
    const proxy = new McProxy({
      apiBase: config.vaultcruxApiBase,
      apiKey: config.vaultcruxApiKey,
      tenantId,
      agentId: "longmemeval-verify",
      timeoutMs: config.timeoutMs,
    });

    const ok = await verifyIngestion(proxy, problem.question);
    if (ok) passed++;
  }

  console.log(`[verify] ${passed}/10 problems returned results`);
  if (passed < 5) {
    console.warn(`[verify] WARNING: Less than 50% verified — embeddings may still be processing. Consider longer --cooldown.`);
  }
}

// ── Helpers ──

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Main ──

async function main() {
  // Probe VaultCrux
  const probeProxy = new McProxy({
    apiBase: config.vaultcruxApiBase,
    apiKey: config.vaultcruxApiKey,
    tenantId: "__longmemeval_probe",
    agentId: "longmemeval-batch-ingest",
    timeoutMs: config.timeoutMs,
  });

  if (verifyOnly) {
    await verify();
    return;
  }

  const healthy = await probeProxy.probe();
  if (!healthy) {
    console.error(`VaultCrux not reachable at ${config.vaultcruxApiBase}`);
    process.exit(1);
  }
  console.log(`VaultCrux healthy at ${config.vaultcruxApiBase}`);

  console.log(`\n=== Phase 1: Batch Ingest ===`);
  provisionTenants(problems);
  await batchIngest();

  console.log(`\n=== Phase 2: Embedding Cooldown ===`);
  await cooldown();

  console.log(`\n=== Phase 3: Verification ===`);
  await verify();

  console.log(`\n✓ Batch ingest complete. Run benchmarks with --skip-seed`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
