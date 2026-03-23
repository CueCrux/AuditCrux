import { aggregateCategory, hasArrayField, hasField, isObject, isValidationError, testResult } from "../scoring.js";
import type { AuditMemoryConfig, CategoryResult, MemoryClient, ToolTestResult } from "../types.js";

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

export async function runCatA(config: AuditMemoryConfig, client: MemoryClient): Promise<CategoryResult> {
  const results: ToolTestResult[] = [];

  // --- query_memory ---

  // happy_path: POST with valid query returns results array
  {
    const { result: res, ms } = await timed(() => client.callTool("query_memory", { query: "audit test probe" }));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "results")) {
      results.push(testResult("query_memory", "happy_path", "pass", ms, "returns {results[]}", `${(res.data.results as unknown[]).length} results`));
    } else {
      results.push(testResult("query_memory", "happy_path", "fail", ms, "returns {results[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_query: POST without query returns validation error
  {
    const { result: res, ms } = await timed(() => client.callTool("query_memory", {}));
    if (!res.success && isValidationError(res.error)) {
      results.push(testResult("query_memory", "missing_query", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("query_memory", "missing_query", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // limit_bounds: limit=999 exceeds max=20
  {
    const { result: res, ms } = await timed(() => client.callTool("query_memory", { query: "test", limit: 999 }));
    if (!res.success && isValidationError(res.error)) {
      results.push(testResult("query_memory", "limit_bounds", "pass", ms, "validation error for limit>20", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("query_memory", "limit_bounds", "fail", ms, "validation error for limit>20", `success=${res.success}`));
    }
  }

  // --- list_topics ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("list_topics", {}));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "items")) {
      results.push(testResult("list_topics", "happy_path", "pass", ms, "returns {items[]}", `${(res.data.items as unknown[]).length} items`));
    } else {
      results.push(testResult("list_topics", "happy_path", "fail", ms, "returns {items[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // limit_valid: limit=5 returns at most 5
  {
    const { result: res, ms } = await timed(() => client.callTool("list_topics", { limit: 5 }));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "items")) {
      const count = (res.data.items as unknown[]).length;
      if (count <= 5) {
        results.push(testResult("list_topics", "limit_valid", "pass", ms, "<=5 items", `${count} items`));
      } else {
        results.push(testResult("list_topics", "limit_valid", "fail", ms, "<=5 items", `${count} items (exceeds limit)`));
      }
    } else {
      results.push(testResult("list_topics", "limit_valid", "fail", ms, "<=5 items", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // --- get_versioned_snapshot ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("get_versioned_snapshot", { topic: "audit-probe" }));
    if (res.success && isObject(res.data) && hasField(res.data, "topic") && hasArrayField(res.data, "items")) {
      results.push(testResult("get_versioned_snapshot", "happy_path", "pass", ms, "returns {topic,items[]}", `topic=${res.data.topic}`));
    } else {
      results.push(testResult("get_versioned_snapshot", "happy_path", "fail", ms, "returns {topic,items[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_topic
  {
    const { result: res, ms } = await timed(() => client.callTool("get_versioned_snapshot", {}));
    if (!res.success && isValidationError(res.error)) {
      results.push(testResult("get_versioned_snapshot", "missing_topic", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_versioned_snapshot", "missing_topic", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- get_audit_trail ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("get_audit_trail", { topic: "audit-probe" }));
    if (res.success && isObject(res.data) && hasField(res.data, "topic") && hasArrayField(res.data, "items")) {
      results.push(testResult("get_audit_trail", "happy_path", "pass", ms, "returns {topic,items[]}", `topic=${res.data.topic}`));
    } else {
      results.push(testResult("get_audit_trail", "happy_path", "fail", ms, "returns {topic,items[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_topic
  {
    const { result: res, ms } = await timed(() => client.callTool("get_audit_trail", {}));
    if (!res.success && isValidationError(res.error)) {
      results.push(testResult("get_audit_trail", "missing_topic", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_audit_trail", "missing_topic", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- check_claim ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("check_claim", { claim_text: "MemoryCrux audit probe claim" }));
    if (res.success && isObject(res.data) && hasField(res.data, "verdict")) {
      results.push(testResult("check_claim", "happy_path", "pass", ms, "returns {verdict}", `verdict=${res.data.verdict}`));
    } else {
      results.push(testResult("check_claim", "happy_path", "fail", ms, "returns {verdict}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_claim
  {
    const { result: res, ms } = await timed(() => client.callTool("check_claim", {}));
    if (!res.success && isValidationError(res.error)) {
      results.push(testResult("check_claim", "missing_claim", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("check_claim", "missing_claim", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- get_freshness_report ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("get_freshness_report", {}));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "items")) {
      results.push(testResult("get_freshness_report", "happy_path", "pass", ms, "returns {items[]}", `${(res.data.items as unknown[]).length} items`));
    } else {
      results.push(testResult("get_freshness_report", "happy_path", "fail", ms, "returns {items[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // custom_stale_days
  {
    const { result: res, ms } = await timed(() => client.callTool("get_freshness_report", { stale_after_days: 7 }));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "items")) {
      results.push(testResult("get_freshness_report", "custom_stale_days", "pass", ms, "stale_after_days=7 accepted", `${(res.data.items as unknown[]).length} items`));
    } else {
      results.push(testResult("get_freshness_report", "custom_stale_days", "fail", ms, "stale_after_days=7 accepted", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // --- get_contradictions ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("get_contradictions", {}));
    if (res.success && isObject(res.data) && hasArrayField(res.data, "items")) {
      results.push(testResult("get_contradictions", "happy_path", "pass", ms, "returns {items[]}", `${(res.data.items as unknown[]).length} items`));
    } else {
      results.push(testResult("get_contradictions", "happy_path", "fail", ms, "returns {items[]}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  return aggregateCategory("catA", "A: Core Memory", results);
}
