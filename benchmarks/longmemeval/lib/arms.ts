// LongMemEval External Benchmark — Arm Definitions
//
// External benchmark arms differ from internal MemoryCrux arms:
// - C0 = bare (no context, no tools) — tests model training knowledge only
// - C2 = context-stuffed (full session text in prompt, no tools) — LongMemEval_S only
// - F1 = raw VaultCrux API tools (retrieval subset via McProxy)
// - T2 = full MemoryCrux MCP tool suite (all 21 tools via McProxy)

import type { LmeArm, LmeArmConfig } from "./types.js";

const ARM_DEFS: Record<LmeArm, LmeArmConfig> = {
  C0: {
    arm: "C0",
    mode: "bare",
    needsVaultCrux: false,
    label: "Bare (no context, no tools)",
    toolSet: "none",
  },
  C2: {
    arm: "C2",
    mode: "context_stuffed",
    needsVaultCrux: false,
    label: "Context-stuffed (full session history)",
    toolSet: "none",
  },
  F1: {
    arm: "F1",
    mode: "raw_api",
    needsVaultCrux: true,
    label: "Raw VaultCrux API (retrieval tools)",
    toolSet: "retrieval",
  },
  T2: {
    arm: "T2",
    mode: "mcp",
    needsVaultCrux: true,
    label: "MemoryCrux MCP (full tool suite)",
    toolSet: "full",
  },
};

export function getArmConfig(arm: LmeArm): LmeArmConfig {
  return ARM_DEFS[arm];
}

export function getAllArms(): LmeArm[] {
  return Object.keys(ARM_DEFS) as LmeArm[];
}

/**
 * Filter tool definitions based on arm's tool set.
 * - "none" → empty array (C0, C2)
 * - "retrieval" → query_memory, list_topics, get_relevant_context (F1)
 * - "full" → all 21 tools (T2)
 */
const RETRIEVAL_TOOLS = new Set([
  "query_memory",
  "list_topics",
  "get_relevant_context",
  "get_freshness_report",
  "check_claim",
  "get_contradictions",
  "assess_coverage",
]);

export function filterToolDefs<T extends { name: string }>(
  allTools: T[],
  toolSet: LmeArmConfig["toolSet"],
): T[] {
  if (toolSet === "none") return [];
  if (toolSet === "full") return allTools;
  // retrieval subset
  return allTools.filter((t) => RETRIEVAL_TOOLS.has(t.name));
}
