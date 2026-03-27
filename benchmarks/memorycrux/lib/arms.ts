// MemoryCrux Benchmark — Arm definitions

import type { ArmConfig, BenchArm, BenchModel } from "./types.js";

const MODEL_MAX_CONTEXT: Record<BenchModel, number> = {
  "claude-sonnet-4-6": 1_000_000,
  "claude-opus-4-6": 1_000_000,
  "claude-haiku-4-5": 200_000,
  "gpt-5.4": 1_000_000,
  "gpt-5.4-mini": 260_000,
  "gpt-5.4-nano": 400_000,
};

const ARM_DEFS: Record<BenchArm, Omit<ArmConfig, "contextCapTokens"> & { contextCapTokens: number | "model_max" }> = {
  C0: { arm: "C0", mode: "flat", contextCapTokens: 32_000, compactionEnabled: false, label: "Flat-32k" },
  C1: { arm: "C1", mode: "flat", contextCapTokens: 128_000, compactionEnabled: false, label: "Flat-128k" },
  C2: { arm: "C2", mode: "flat", contextCapTokens: "model_max" as unknown as number, compactionEnabled: false, label: "Flat-max" },
  C3: { arm: "C3", mode: "flat", contextCapTokens: "model_max" as unknown as number, compactionEnabled: true, label: "Flat+compaction" },
  F1: { arm: "F1", mode: "file_based", contextCapTokens: 32_000, compactionEnabled: false, label: "File-based-32k" },
  T1: { arm: "T1", mode: "memorycrux", contextCapTokens: 8_000, compactionEnabled: false, label: "MemoryCrux-8k" },
  T2: { arm: "T2", mode: "memorycrux", contextCapTokens: 16_000, compactionEnabled: false, label: "MemoryCrux-16k" },
  T3: { arm: "T3", mode: "compound", contextCapTokens: 32_000, compactionEnabled: false, label: "Compound-32k" },
};

export function getArmConfig(arm: BenchArm, model: BenchModel): ArmConfig {
  const def = ARM_DEFS[arm];
  const cap = def.contextCapTokens === ("model_max" as unknown as number)
    ? MODEL_MAX_CONTEXT[model]
    : def.contextCapTokens as number;
  return { ...def, contextCapTokens: cap };
}

export function getModelMaxContext(model: BenchModel): number {
  return MODEL_MAX_CONTEXT[model];
}

export function getModelProvider(model: BenchModel): "anthropic" | "openai" {
  return model.startsWith("claude") ? "anthropic" : "openai";
}

export const ALL_ARMS: BenchArm[] = ["C0", "C1", "C2", "C3", "F1", "T1", "T2", "T3"];
export const HEADLINE_ARMS: BenchArm[] = ["C0", "C2", "F1", "T2", "T3"];
export const HEADLINE_MODELS: BenchModel[] = ["claude-sonnet-4-6", "gpt-5.4", "gpt-5.4-mini"];
