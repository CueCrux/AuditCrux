// MemoryCrux Benchmark — MC tool proxy for treatment arms
//
// Proxies LLM tool_use calls to VaultCrux REST API endpoints.
// Each MCP tool maps to a specific API route.

import { randomUUID } from "node:crypto";
import type { BenchConfig, ToolCallRecord } from "./types.js";

interface McProxyConfig {
  apiBase: string;
  apiKey: string;
  tenantId: string;
  agentId: string;
  timeoutMs: number;
}

// Tool → REST endpoint mapping
interface ToolRoute {
  method: "GET" | "POST";
  path: string | ((args: Record<string, unknown>) => string);
  buildBody?: (args: Record<string, unknown>) => Record<string, unknown> | undefined;
  buildQuery?: (args: Record<string, unknown>) => Record<string, string>;
}

const TOOL_ROUTES: Record<string, ToolRoute> = {
  query_memory: {
    method: "POST",
    path: "/v1/memory/query",
    buildBody: (args) => ({
      query: args.query,
      limit: args.limit,
      confidence_threshold: args.confidence_threshold,
      topic: args.topic,
      date_from: args.date_from,
      date_to: args.date_to,
      date_range: args.date_range,
      agent_id: args.agent_id,
    }),
  },
  list_topics: {
    method: "GET",
    path: "/v1/memory/topics",
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.limit) q.limit = String(args.limit);
      return q;
    },
  },
  get_relevant_context: {
    method: "POST",
    path: "/v1/memory/context/briefing",
    buildBody: (args) => ({
      task_description: args.task_description,
      token_budget: args.token_budget,
      priority_signal: args.priority_signal,
    }),
  },
  check_constraints: {
    method: "POST",
    path: "/v1/memory/constraints/check",
    buildBody: (args) => ({
      action_description: args.action_description,
      target_resources: args.target_resources,
      team_id: args.team_id,
      metadata: args.metadata,
    }),
  },
  verify_before_acting: {
    method: "POST",
    path: "/v1/memory/verify",
    buildBody: (args) => ({
      tool_name: args.tool_name,
      action_description: args.action_description,
      target_resources: args.target_resources,
      team_id: args.team_id,
      server_digest: args.server_digest,
      publisher_id: args.publisher_id,
      is_mutation: args.is_mutation,
      metadata: args.metadata,
    }),
  },
  record_decision_context: {
    method: "POST",
    path: "/v1/memory/decisions/record",
    buildBody: (args) => ({
      session_id: args.session_id,
      decision_id: args.decision_id,
      context: args.context,
      agentId: args.agentId ?? args.agent_id,
      occurredAt: args.occurredAt ?? args.occurred_at,
    }),
  },
  checkpoint_decision_state: {
    method: "POST",
    path: "/v1/memory/checkpoints",
    buildBody: (args) => ({
      session_id: args.session_id,
      summary: args.summary,
      decisions_so_far: args.decisions_so_far,
      assumptions_in_effect: args.assumptions_in_effect,
      open_questions: args.open_questions,
    }),
  },
  get_checkpoints: {
    method: "GET",
    path: (args) => `/v1/memory/checkpoints/${encodeURIComponent(String(args.session_id))}`,
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.limit) q.limit = String(args.limit);
      return q;
    },
  },
  assess_coverage: {
    method: "POST",
    path: "/v1/memory/coverage/assess",
    buildBody: (args) => ({
      task_description: args.task_description,
      domains: args.domains,
      action_types: args.action_types,
    }),
  },
  escalate_with_context: {
    method: "POST",
    path: "/v1/memory/escalations",
    buildBody: (args) => ({
      question: args.question,
      recommended_action: args.recommended_action,
      reasoning: args.reasoning,
      evidence_gathered: args.evidence_gathered,
      options_considered: args.options_considered,
      session_id: args.session_id,
      urgency: args.urgency,
    }),
  },
  suggest_constraint: {
    method: "POST",
    path: "/v1/memory/constraints/suggest",
    buildBody: (args) => ({
      assertion: args.assertion,
      constraint_type: args.constraint_type,
      scope: args.scope,
      evidence: args.evidence,
      severity: args.severity,
      confidence: args.confidence,
      discovery_context: args.discovery_context,
      session_id: args.session_id,
    }),
  },
  get_constraints: {
    method: "GET",
    path: "/v1/memory/constraints",
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.status) q.status = String(args.status);
      if (args.constraint_type) q.constraint_type = String(args.constraint_type);
      if (args.team_id) q.team_id = String(args.team_id);
      if (args.limit) q.limit = String(args.limit);
      return q;
    },
  },
  get_decision_context: {
    method: "GET",
    path: (args) => `/v1/memory/decisions/session/${encodeURIComponent(String(args.session_id))}`,
  },
  get_platform_capabilities: {
    method: "GET",
    path: "/v1/memory/capabilities",
    buildQuery: (args) => {
      const q: Record<string, string> = {};
      if (args.category) q.category = String(args.category);
      if (args.min_trust_tier) q.min_trust_tier = String(args.min_trust_tier);
      if (args.max_credit_cost) q.max_credit_cost = String(args.max_credit_cost);
      return q;
    },
  },
};

export class McProxy {
  private base: string;
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(private config: McProxyConfig) {
    this.base = config.apiBase.replace(/\/$/, "");
    this.headers = {
      "content-type": "application/json",
      "x-tenant-id": config.tenantId,
      "x-api-key": config.apiKey,
    };
    this.timeoutMs = config.timeoutMs;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallRecord> {
    const start = performance.now();
    const route = TOOL_ROUTES[toolName];

    if (!route) {
      return {
        toolName,
        args,
        result: null,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
    }

    try {
      const path = typeof route.path === "function" ? route.path(args) : route.path;
      let url = `${this.base}${path}`;

      const fetchInit: RequestInit = {
        method: route.method,
        headers: { ...this.headers },
      };

      if (route.method === "POST") {
        (fetchInit.headers as Record<string, string>)["x-idempotency-key"] = randomUUID();
        if (route.buildBody) {
          const body = route.buildBody(args);
          const cleaned = body ? Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) : {};
          fetchInit.body = JSON.stringify(cleaned);
        }
      } else if (route.method === "GET" && route.buildQuery) {
        const query = route.buildQuery(args);
        const params = new URLSearchParams(query);
        const qs = params.toString();
        if (qs) url += `?${qs}`;
      }

      const res = await this.safeFetch(url, fetchInit);
      const latencyMs = Math.round(performance.now() - start);
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          toolName,
          args,
          result: body,
          latencyMs,
          success: false,
          error: `HTTP ${res.status}: ${(body as { detail?: string; message?: string }).detail ?? (body as { message?: string }).message ?? "unknown error"}`,
        };
      }

      // Unwrap VaultCrux envelope
      const data = (body as { ok?: boolean; data?: unknown }).data ?? body;
      return { toolName, args, result: data, latencyMs, success: true };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        toolName,
        args,
        result: null,
        latencyMs,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private mutationHeaders(): Record<string, string> {
    return { ...this.headers, "x-idempotency-key": randomUUID() };
  }

  async seedDocument(doc: { id: string; title: string; content: string; domain?: string; metadata?: Record<string, unknown> }): Promise<boolean> {
    try {
      const res = await this.safeFetch(`${this.base}/v1/memory/imports`, {
        method: "POST",
        headers: this.mutationHeaders(),
        body: JSON.stringify({
          sourcePlatform: "manual",
          sourceConversationId: `benchmark-fixture-${doc.id}`,
          content: doc.content,
          title: doc.title,
          timestampSource: new Date().toISOString(),
          agentId: this.config.agentId,
          topics: doc.domain ? [doc.domain] : ["benchmark"],
          metadata: { ...doc.metadata, fixtureId: doc.id },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`    seedDocument ${doc.id} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      return res.ok;
    } catch (err) {
      console.error(`    seedDocument ${doc.id} error:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  async seedConstraint(c: { id: string; assertion: string; severity: string; scope?: string; resource?: string; actionClass?: string }): Promise<boolean> {
    try {
      const res = await this.safeFetch(`${this.base}/v1/memory/constraints`, {
        method: "POST",
        headers: this.mutationHeaders(),
        body: JSON.stringify({
          constraint_type: "policy",
          assertion: c.assertion,
          severity: c.severity,
          scope: c.scope,
          evidence: { source: `benchmark-fixture:${c.id}`, resource: c.resource, actionClass: c.actionClass },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`    seedConstraint ${c.id} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      return res.ok;
    } catch (err) {
      console.error(`    seedConstraint ${c.id} error:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  async probe(): Promise<boolean> {
    try {
      const res = await this.safeFetch(`${this.base}/healthz`, {
        method: "GET",
        headers: {},
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async safeFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  static fromConfig(config: BenchConfig, armTenantSuffix: string): McProxy {
    return new McProxy({
      apiBase: config.vaultcruxApiBase,
      apiKey: config.vaultcruxApiKey,
      tenantId: `${config.benchTenantPrefix}_${armTenantSuffix}`,
      agentId: "benchmark-agent",
      timeoutMs: config.timeoutMs,
    });
  }
}
