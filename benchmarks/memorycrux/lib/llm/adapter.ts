// MemoryCrux Benchmark — Common LLM adapter interface

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolUseBlock[];
}

export interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export interface ChatResult {
  content: string;
  toolUse: ToolUseBlock[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  stopReason: string;
  latencyMs: number;
  modelId: string;
  provider: "anthropic" | "openai";
}

export interface LlmAdapter {
  chat(messages: Message[], tools?: ToolDef[], options?: ChatOptions): Promise<ChatResult>;
  modelId: string;
  provider: "anthropic" | "openai";
}
