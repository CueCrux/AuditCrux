import type { AuditMemoryConfig, TargetMode } from "./types.js";

export function resolveConfig(overrides?: Partial<AuditMemoryConfig>): AuditMemoryConfig {
  const target: TargetMode =
    (overrides?.target as TargetMode) ??
    (process.env.AUDIT_MEMORY_TARGET as TargetMode) ??
    "api";

  return {
    target,
    apiBase: overrides?.apiBase ?? process.env.AUDIT_MEMORY_API_BASE ?? "http://localhost:14333",
    mcpUrl: overrides?.mcpUrl ?? process.env.AUDIT_MEMORY_MCP_URL ?? "http://localhost:14336/mcp",
    apiKey: overrides?.apiKey ?? process.env.AUDIT_MEMORY_API_KEY ?? process.env.API_KEY ?? "",
    tenantId: overrides?.tenantId ?? process.env.AUDIT_MEMORY_TENANT_ID ?? "__audit_memory__",
    agentId: overrides?.agentId ?? process.env.AUDIT_MEMORY_AGENT_ID ?? "audit-agent",
    timeoutMs: overrides?.timeoutMs ?? (Number(process.env.AUDIT_MEMORY_TIMEOUT_MS) || 15_000),
  };
}
