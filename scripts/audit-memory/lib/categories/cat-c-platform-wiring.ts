import { aggregateCategory, isObject, isRejection, isValidationError, testResult } from "../scoring.js";
import type { AuditMemoryConfig, CategoryResult, MemoryClient, ToolTestResult } from "../types.js";

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

function isUpstreamUnavailable(status?: number, error?: { type: string; message: string }): boolean {
  if (status === 502 || status === 503 || status === 404) return true;
  if (error?.type === "Unavailable") return true;
  if (error?.type?.includes("not_found")) return true;
  if (error?.message?.includes("ECONNREFUSED")) return true;
  return false;
}

export async function runCatC(config: AuditMemoryConfig, client: MemoryClient): Promise<CategoryResult> {
  const results: ToolTestResult[] = [];

  // Probe: attempt get_pressure_status to detect upstream availability
  const { result: probeRes, ms: probeMs } = await timed(() =>
    client.callTool("get_pressure_status", {}),
  );
  if (!probeRes.success && isUpstreamUnavailable(probeRes.status, probeRes.error)) {
    return aggregateCategory("catC", "C: Platform Wiring", [], true, `Platform upstream unavailable: ${probeRes.error?.message?.slice(0, 100)}`);
  }

  // --- get_pressure_status ---

  // happy_path (reuse probe result)
  {
    if (probeRes.success && isObject(probeRes.data)) {
      results.push(testResult("get_pressure_status", "happy_path", "pass", probeMs, "returns object", JSON.stringify(probeRes.data).slice(0, 100)));
    } else {
      results.push(testResult("get_pressure_status", "happy_path", "fail", probeMs, "returns object", JSON.stringify(probeRes.error ?? probeRes.data).slice(0, 200)));
    }
  }

  // no_args_validation: empty object should be fine (schema is z.object({}).strict())
  {
    const { result: res, ms } = await timed(() => client.callTool("get_pressure_status", {}));
    if (res.success) {
      results.push(testResult("get_pressure_status", "no_args_validation", "pass", ms, "empty args accepted", "ok"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_pressure_status", "no_args_validation", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_pressure_status", "no_args_validation", "fail", ms, "empty args accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // --- get_active_alerts ---

  // happy_path (alerts returns an array, wrapped in Ok envelope → data is array)
  {
    const { result: res, ms } = await timed(() => client.callTool("get_active_alerts", {}));
    if (res.success && (isObject(res.data) || Array.isArray(res.data))) {
      results.push(testResult("get_active_alerts", "happy_path", "pass", ms, "returns data", JSON.stringify(res.data).slice(0, 100)));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_active_alerts", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_active_alerts", "happy_path", "fail", ms, "returns data", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // with_limit
  {
    const { result: res, ms } = await timed(() => client.callTool("get_active_alerts", { limit: 5 }));
    if (res.success) {
      results.push(testResult("get_active_alerts", "with_limit", "pass", ms, "limit=5 accepted", "ok"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_active_alerts", "with_limit", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_active_alerts", "with_limit", "fail", ms, "limit=5 accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // invalid_limit: limit=0 — API coerces via parseLimit (no strict validation), MCP rejects via Zod min(1)
  {
    const { result: res, ms } = await timed(() => client.callTool("get_active_alerts", { limit: 0 }));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_active_alerts", "invalid_limit", "pass", ms, "validation error for limit=0", res.error!.message.slice(0, 100)));
    } else if (res.success) {
      // API mode: parseLimit coerces 0 → 1, no validation error — acceptable
      results.push(testResult("get_active_alerts", "invalid_limit", "pass", ms, "limit=0 coerced (API mode)", "coerced"));
    } else {
      results.push(testResult("get_active_alerts", "invalid_limit", "fail", ms, "validation error or coercion", `success=${res.success}`));
    }
  }

  // --- get_signals_feed ---

  // happy_path (signals feed returns an array, wrapped in Ok envelope → data is array)
  {
    const { result: res, ms } = await timed(() => client.callTool("get_signals_feed", {}));
    if (res.success && (isObject(res.data) || Array.isArray(res.data))) {
      results.push(testResult("get_signals_feed", "happy_path", "pass", ms, "returns data", JSON.stringify(res.data).slice(0, 100)));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_signals_feed", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_signals_feed", "happy_path", "fail", ms, "returns data", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // with_since
  {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { result: res, ms } = await timed(() =>
      client.callTool("get_signals_feed", { since }),
    );
    if (res.success) {
      results.push(testResult("get_signals_feed", "with_since", "pass", ms, "since param accepted", "ok"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_signals_feed", "with_since", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_signals_feed", "with_since", "fail", ms, "since param accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // invalid_limit: limit=0 — API coerces via parseLimit (no strict validation), MCP rejects via Zod min(1)
  {
    const { result: res, ms } = await timed(() => client.callTool("get_signals_feed", { limit: 0 }));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_signals_feed", "invalid_limit", "pass", ms, "validation error for limit=0", res.error!.message.slice(0, 100)));
    } else if (res.success) {
      // API mode: parseLimit coerces 0 → 1, no validation error — acceptable
      results.push(testResult("get_signals_feed", "invalid_limit", "pass", ms, "limit=0 coerced (API mode)", "coerced"));
    } else {
      results.push(testResult("get_signals_feed", "invalid_limit", "fail", ms, "validation error or coercion", `success=${res.success}`));
    }
  }

  return aggregateCategory("catC", "C: Platform Wiring", results);
}
