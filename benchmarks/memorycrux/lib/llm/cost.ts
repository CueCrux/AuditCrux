// MemoryCrux Benchmark — Token cost calculator
// Prices per 1M tokens (USD), as of 2026-03-25

import type { BenchModel } from "../types.js";

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M: number;
}

const PRICING: Record<BenchModel, ModelPricing> = {
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.30 },
  "claude-opus-4-6": { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.50 },
  "claude-haiku-4-5": { inputPer1M: 0.80, outputPer1M: 4.0, cachedInputPer1M: 0.08 },
  "gpt-5.4": { inputPer1M: 2.50, outputPer1M: 10.0, cachedInputPer1M: 1.25 },
  "gpt-5.4-mini": { inputPer1M: 0.40, outputPer1M: 1.60, cachedInputPer1M: 0.10 },
  "gpt-5.4-nano": { inputPer1M: 0.10, outputPer1M: 0.40, cachedInputPer1M: 0.025 },
  "qwen2.5-32b": { inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 }, // local inference
};

export function estimateCost(
  model: BenchModel,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;

  const freshInput = inputTokens - cachedTokens;
  return (
    (freshInput / 1_000_000) * p.inputPer1M +
    (cachedTokens / 1_000_000) * p.cachedInputPer1M +
    (outputTokens / 1_000_000) * p.outputPer1M
  );
}

export function getPricing(model: BenchModel): ModelPricing | undefined {
  return PRICING[model];
}
