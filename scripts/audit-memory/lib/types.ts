export type TargetMode = "api" | "mcp";

export type MemoryCategoryId = "catA" | "catB" | "catC" | "catD";

export type ToolTestVerdict = "pass" | "fail" | "skip" | "error";

export type ToolTestResult = {
  toolName: string;
  testName: string;
  verdict: ToolTestVerdict;
  latencyMs: number;
  expected: string;
  actual: string;
  error?: string;
};

export type CategoryResult = {
  category: MemoryCategoryId;
  label: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  toolResults: ToolTestResult[];
  metrics: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
  };
};

export type MemoryAuditReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  target: TargetMode;
  targetUrl: string;
  tenantId: string;
  results: CategoryResult[];
  summary: {
    totalCategories: number;
    passedCategories: number;
    skippedCategories: number;
    totalTools: number;
    passedTools: number;
    totalTests: number;
    passedTests: number;
    durationS: string;
  };
};

export type ClientResult = {
  success: boolean;
  status?: number;
  data?: unknown;
  error?: { type: string; message: string };
};

export type AuditMemoryConfig = {
  target: TargetMode;
  apiBase: string;
  mcpUrl: string;
  apiKey: string;
  tenantId: string;
  agentId: string;
  timeoutMs: number;
};

export type CategoryRunner = (
  config: AuditMemoryConfig,
  client: MemoryClient,
) => Promise<CategoryResult>;

export interface MemoryClient {
  callTool(toolName: string, args: Record<string, unknown>): Promise<ClientResult>;
  callApi(method: string, path: string, body?: Record<string, unknown>): Promise<ClientResult>;
  probe(): Promise<boolean>;
}
