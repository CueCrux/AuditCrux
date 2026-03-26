// MemoryCrux Benchmark — Config resolver

import type { BenchConfig } from "./types.js";
import { resolve } from "node:path";

const DEFAULTS = {
  vaultcruxApiBase: "http://localhost:14333",
  vaultcruxMcpUrl: "http://localhost:14336/mcp",
  benchTenantPrefix: "__memorycrux_bench",
  timeoutMs: 30_000,
  maxTurnsPerPhase: 20,
} as const;

export function resolveConfig(overrides?: Partial<BenchConfig>): BenchConfig {
  const outputDir =
    overrides?.outputDir ??
    process.env.BENCH_OUTPUT_DIR ??
    resolve(import.meta.dirname, "..", "results");

  return {
    anthropicApiKey:
      overrides?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
    openaiApiKey:
      overrides?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    vaultcruxApiBase:
      overrides?.vaultcruxApiBase ??
      process.env.BENCH_VAULTCRUX_API_BASE ??
      process.env.AUDIT_MEMORY_API_BASE ??
      DEFAULTS.vaultcruxApiBase,
    vaultcruxMcpUrl:
      overrides?.vaultcruxMcpUrl ??
      process.env.BENCH_VAULTCRUX_MCP_URL ??
      process.env.AUDIT_MEMORY_MCP_URL ??
      DEFAULTS.vaultcruxMcpUrl,
    vaultcruxApiKey:
      overrides?.vaultcruxApiKey ??
      process.env.BENCH_VAULTCRUX_API_KEY ??
      process.env.AUDIT_MEMORY_API_KEY ??
      process.env.API_KEY ??
      "",
    benchTenantPrefix:
      overrides?.benchTenantPrefix ??
      process.env.BENCH_TENANT_PREFIX ??
      DEFAULTS.benchTenantPrefix,
    outputDir,
    timeoutMs:
      overrides?.timeoutMs ??
      (Number(process.env.BENCH_TIMEOUT_MS) || DEFAULTS.timeoutMs),
    maxTurnsPerPhase:
      overrides?.maxTurnsPerPhase ??
      (Number(process.env.BENCH_MAX_TURNS_PER_PHASE) || DEFAULTS.maxTurnsPerPhase),
  };
}

export function validateConfig(config: BenchConfig): string[] {
  const errors: string[] = [];
  if (!config.anthropicApiKey && !config.openaiApiKey) {
    errors.push("At least one of ANTHROPIC_API_KEY or OPENAI_API_KEY must be set");
  }
  return errors;
}
