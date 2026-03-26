// MemoryCrux Benchmark — Anthropic LLM adapter

import Anthropic from "@anthropic-ai/sdk";
import type { ChatOptions, ChatResult, LlmAdapter, Message, ToolDef, ToolUseBlock } from "./adapter.js";

const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-6",
  "claude-opus-4-6": "claude-opus-4-6",
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
};

export function createAnthropicAdapter(modelKey: string, apiKey: string): LlmAdapter {
  const client = new Anthropic({ apiKey });
  const resolvedModel = MODEL_MAP[modelKey] ?? modelKey;

  return {
    modelId: resolvedModel,
    provider: "anthropic",

    async chat(messages: Message[], tools?: ToolDef[], options?: ChatOptions): Promise<ChatResult> {
      const systemMsg = messages.find((m) => m.role === "system");
      const nonSystem = messages.filter((m) => m.role !== "system");

      const anthropicMessages = nonSystem.map((m) => {
        if (m.role === "tool") {
          return {
            role: "user" as const,
            content: [
              {
                type: "tool_result" as const,
                tool_use_id: m.toolCallId!,
                content: m.content,
              },
            ],
          };
        }

        if (m.role === "assistant" && m.toolCalls?.length) {
          const blocks: Anthropic.ContentBlockParam[] = [];
          if (m.content) blocks.push({ type: "text", text: m.content });
          for (const tc of m.toolCalls) {
            blocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input as Record<string, unknown>,
            });
          }
          return { role: "assistant" as const, content: blocks };
        }

        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      });

      const anthropicTools = tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      }));

      const start = performance.now();
      const response = await client.messages.create({
        model: resolvedModel,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
        system: systemMsg?.content,
        messages: anthropicMessages,
        ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
      });
      const latencyMs = Math.round(performance.now() - start);

      let textContent = "";
      const toolUse: ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textContent += block.text;
        } else if (block.type === "tool_use") {
          toolUse.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content: textContent,
        toolUse,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedTokens: (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        stopReason: response.stop_reason ?? "unknown",
        latencyMs,
        modelId: resolvedModel,
        provider: "anthropic",
      };
    },
  };
}
