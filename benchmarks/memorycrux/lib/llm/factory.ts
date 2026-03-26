// MemoryCrux Benchmark — LLM adapter factory

import type { LlmAdapter } from "./adapter.js";
import type { BenchConfig, BenchModel } from "../types.js";
import { getModelProvider } from "../arms.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOpenAIAdapter } from "./openai.js";

export function createAdapter(model: BenchModel, config: BenchConfig): LlmAdapter {
  const provider = getModelProvider(model);

  if (provider === "anthropic") {
    if (!config.anthropicApiKey) {
      throw new Error(`ANTHROPIC_API_KEY required for model ${model}`);
    }
    return createAnthropicAdapter(model, config.anthropicApiKey);
  }

  if (provider === "openai") {
    if (!config.openaiApiKey) {
      throw new Error(`OPENAI_API_KEY required for model ${model}`);
    }
    return createOpenAIAdapter(model, config.openaiApiKey);
  }

  throw new Error(`Unknown provider for model: ${model}`);
}
