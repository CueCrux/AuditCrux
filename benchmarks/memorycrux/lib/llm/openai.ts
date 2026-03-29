// MemoryCrux Benchmark — OpenAI LLM adapter

import OpenAI from "openai";
import type { ChatOptions, ChatResult, LlmAdapter, Message, ToolDef, ToolUseBlock } from "./adapter.js";

const MODEL_MAP: Record<string, string> = {
  "gpt-5.4": "gpt-5.4",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-5.4-nano": "gpt-5.4-nano",
  "qwen2.5-32b": "Qwen/Qwen2.5-32B-Instruct-AWQ",
};

export function createOpenAIAdapter(modelKey: string, apiKey: string): LlmAdapter {
  const baseURL = process.env.OPENAI_BASE_URL; // vLLM / local inference override
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const resolvedModel = MODEL_MAP[modelKey] ?? modelKey;

  return {
    modelId: resolvedModel,
    provider: "openai",

    async chat(messages: Message[], tools?: ToolDef[], options?: ChatOptions): Promise<ChatResult> {
      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            tool_call_id: m.toolCallId!,
            content: m.content,
          };
        }

        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "assistant" as const,
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
              },
            })),
          };
        }

        return {
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        };
      });

      const openaiTools: OpenAI.ChatCompletionTool[] | undefined = tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));

      const start = performance.now();
      const response = await client.chat.completions.create({
        model: resolvedModel,
        messages: openaiMessages,
        max_completion_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
        ...(openaiTools?.length ? { tools: openaiTools } : {}),
      });
      const latencyMs = Math.round(performance.now() - start);

      const choice = response.choices[0];
      const toolUse: ToolUseBlock[] = [];

      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          toolUse.push({
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          });
        }
      }

      const usage = response.usage;
      return {
        content: choice.message.content ?? "",
        toolUse,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        cachedTokens: (usage as { prompt_tokens_details?: { cached_tokens?: number } })?.prompt_tokens_details?.cached_tokens ?? 0,
        stopReason: choice.finish_reason ?? "unknown",
        latencyMs,
        modelId: resolvedModel,
        provider: "openai",
      };
    },
  };
}
