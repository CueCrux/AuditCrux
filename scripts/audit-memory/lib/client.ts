import type { AuditMemoryConfig, ClientResult, MemoryClient } from "./types.js";

function authHeaders(config: AuditMemoryConfig): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-tenant-id": config.tenantId,
    "x-api-key": config.apiKey,
  };
}

async function safeFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ClientResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!res.ok) {
      const errObj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      return {
        success: false,
        status: res.status,
        error: {
          type: String(errObj.type ?? errObj.code ?? `HTTP_${res.status}`),
          message: String(errObj.message ?? errObj.error ?? text).slice(0, 500),
        },
      };
    }

    // Unwrap VaultCrux { ok, data } envelope
    if (typeof body === "object" && body !== null && "ok" in (body as Record<string, unknown>)) {
      const envelope = body as Record<string, unknown>;
      if (envelope.ok === true) {
        return { success: true, status: res.status, data: envelope.data ?? envelope };
      }
      const errData = (envelope.error ?? {}) as Record<string, unknown>;
      return {
        success: false,
        status: res.status,
        error: {
          type: String(errData.type ?? "UpstreamError"),
          message: String(errData.message ?? "upstream returned ok=false"),
        },
      };
    }

    return { success: true, status: res.status, data: body };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isUnavailable = msg.includes("ECONNREFUSED") || msg.includes("abort") || msg.includes("fetch failed");
    return {
      success: false,
      status: isUnavailable ? 503 : undefined,
      error: {
        type: isUnavailable ? "Unavailable" : "FetchError",
        message: msg.slice(0, 500),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- API-mode client ----------

function createApiClient(config: AuditMemoryConfig): MemoryClient {
  const base = config.apiBase.replace(/\/$/, "");
  const hdrs = authHeaders(config);

  return {
    async callTool(toolName, args) {
      // Map tool name to API method + path + body using the same patterns as tools.ts
      const { method, path, body } = mapToolToApi(toolName, args, config);
      return safeFetch(`${base}${path}`, { method, headers: hdrs, body: body ? JSON.stringify(body) : undefined }, config.timeoutMs);
    },

    async callApi(method, path, body) {
      return safeFetch(`${base}${path}`, { method, headers: hdrs, body: body ? JSON.stringify(body) : undefined }, config.timeoutMs);
    },

    async probe() {
      const res = await safeFetch(`${base}/readyz`, { method: "GET", headers: hdrs }, 5_000);
      return res.success;
    },
  };
}

// ---------- MCP-mode client ----------

let mcpRequestId = 0;

function createMcpClient(config: AuditMemoryConfig): MemoryClient {
  const url = config.mcpUrl;
  const hdrs = { ...authHeaders(config), "x-agent-id": config.agentId };

  return {
    async callTool(toolName, args) {
      const rpcBody = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: ++mcpRequestId,
      };
      const res = await safeFetch(url, { method: "POST", headers: hdrs, body: JSON.stringify(rpcBody) }, config.timeoutMs);
      if (!res.success) return res;

      // Parse JSON-RPC response
      const rpc = res.data as Record<string, unknown>;
      if (rpc.error) {
        const rpcErr = rpc.error as Record<string, unknown>;
        return { success: false, error: { type: "RPCError", message: String(rpcErr.message ?? rpcErr.code) } };
      }
      const result = rpc.result as Record<string, unknown> | undefined;
      if (result?.isError) {
        const content = (result.content as Array<Record<string, unknown>>)?.[0];
        return { success: false, error: { type: "ToolError", message: String(content?.text ?? "tool error") } };
      }
      // Extract data from MCP tool result content
      const content = (result?.content as Array<Record<string, unknown>>)?.[0];
      if (content?.type === "text") {
        try {
          return { success: true, data: JSON.parse(String(content.text)) };
        } catch {
          return { success: true, data: content.text };
        }
      }
      return { success: true, data: result };
    },

    async callApi(method, path, body) {
      // In MCP mode, API calls are not directly supported — fall back to direct HTTP
      const base = config.apiBase.replace(/\/$/, "");
      return safeFetch(`${base}${path}`, { method, headers: authHeaders(config), body: body ? JSON.stringify(body) : undefined }, config.timeoutMs);
    },

    async probe() {
      const healthUrl = url.replace(/\/mcp$/, "/healthz");
      const res = await safeFetch(healthUrl, { method: "GET", headers: hdrs }, 5_000);
      return res.success;
    },
  };
}

// ---------- Tool → API mapping ----------

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    qs.set(key, String(value));
  }
  const rendered = qs.toString();
  return rendered.length > 0 ? `?${rendered}` : "";
}

function mapToolToApi(
  toolName: string,
  args: Record<string, unknown>,
  config: AuditMemoryConfig,
): { method: string; path: string; body?: Record<string, unknown> } {
  switch (toolName) {
    // Group A: Core Memory
    case "query_memory":
      return {
        method: "POST",
        path: "/v1/memory/query",
        body: {
          tenantId: config.tenantId,
          agentId: (args.agent_id as string) ?? config.agentId,
          query: args.query,
          limit: args.limit ?? 8,
          confidenceThreshold: args.confidence_threshold ?? 0,
          topic: args.topic,
          dateFrom: args.date_from ?? (args.date_range as Record<string, unknown>)?.from,
          dateTo: args.date_to ?? (args.date_range as Record<string, unknown>)?.to,
        },
      };
    case "list_topics":
      return { method: "GET", path: `/v1/memory/topics${buildQuery({ limit: args.limit as number })}` };
    case "get_versioned_snapshot":
      return {
        method: "GET",
        path: `/v1/memory/snapshot${buildQuery({
          topic: args.topic as string,
          timestamp: args.timestamp as string,
          limit: args.limit as number,
        })}`,
      };
    case "get_audit_trail":
      return {
        method: "GET",
        path: `/v1/memory/audit${buildQuery({ topic: args.topic as string, limit: args.limit as number })}`,
      };
    case "check_claim":
      return {
        method: "POST",
        path: "/v1/memory/claim-check",
        body: {
          tenantId: config.tenantId,
          agentId: (args.agent_id as string) ?? config.agentId,
          claimText: args.claim_text,
          limit: args.limit ?? 5,
        },
      };
    case "get_freshness_report":
      return {
        method: "GET",
        path: `/v1/memory/freshness${buildQuery({
          limit: args.limit as number,
          stale_after_days: args.stale_after_days as number,
        })}`,
      };
    case "get_contradictions":
      return { method: "GET", path: `/v1/memory/contradictions${buildQuery({ limit: args.limit as number })}` };

    // Group B: Decision Plane
    case "get_decision_context":
      return { method: "GET", path: `/v1/memory/decisions/session/${enc(args.session_id)}` };
    case "get_causal_chain":
      return { method: "GET", path: `/v1/memory/decisions/causal-chain/${enc(args.decision_id)}` };
    case "reconstruct_knowledge_state":
      return {
        method: "GET",
        path: `/v1/memory/decisions/reconstruct/${enc(args.decision_id)}${buildQuery({
          at_timestamp: args.at_timestamp as string,
          include_superseded: args.include_superseded ? "true" : undefined,
          include_confidence_landscape: args.include_confidence_landscape ? "true" : undefined,
        })}`,
      };
    case "get_correction_chain":
      return { method: "GET", path: `/v1/memory/decisions/correction-chain/${enc(args.decision_id)}` };
    case "get_decisions_on_stale_context":
      return { method: "GET", path: `/v1/memory/decisions/stale-context/${enc(args.session_id)}` };
    case "record_decision_context":
      return {
        method: "POST",
        path: "/v1/memory/decisions/record",
        body: {
          sessionId: args.session_id,
          agentId: (args.agent_id as string) ?? config.agentId,
          decisionId: args.decision_id,
          context: args.context,
          occurredAt: args.occurred_at,
        },
      };

    // Group C: Platform Wiring
    case "get_pressure_status":
      return { method: "GET", path: "/v1/memory/pressure" };
    case "get_active_alerts":
      return { method: "GET", path: `/v1/memory/alerts${buildQuery({ limit: args.limit as number })}` };
    case "get_signals_feed":
      return {
        method: "GET",
        path: `/v1/memory/signals${buildQuery({ limit: args.limit as number, since: args.since as string })}`,
      };

    // Group D: Constraints
    case "declare_constraint":
      return { method: "POST", path: "/v1/memory/constraints", body: args };
    case "update_constraint": {
      const { constraint_id, ...body } = args;
      return { method: "PATCH", path: `/v1/memory/constraints/${enc(constraint_id)}`, body };
    }
    case "get_constraints":
      return {
        method: "GET",
        path: `/v1/memory/constraints${buildQuery({
          status: args.status as string,
          constraint_type: args.constraint_type as string,
          team_id: args.team_id as string,
          limit: args.limit as number,
        })}`,
      };
    case "check_constraints":
      return { method: "POST", path: "/v1/memory/constraints/check", body: args };
    case "verify_before_acting":
      return { method: "POST", path: "/v1/memory/verify", body: args };

    default:
      return { method: "GET", path: `/v1/memory/${toolName}` };
  }
}

function enc(value: unknown): string {
  return encodeURIComponent(String(value ?? ""));
}

// ---------- Factory ----------

export function createClient(config: AuditMemoryConfig): MemoryClient {
  return config.target === "mcp" ? createMcpClient(config) : createApiClient(config);
}
