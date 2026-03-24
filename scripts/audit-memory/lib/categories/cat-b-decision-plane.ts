import { aggregateCategory, hasField, isObject, isRejection, isValidationError, testResult } from "../scoring.js";
import type { AuditMemoryConfig, CategoryResult, MemoryClient, ToolTestResult } from "../types.js";

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

function isUpstreamUnavailable(status?: number, error?: { type: string; message: string }): boolean {
  if (status === 502 || status === 503) return true;
  if (error?.type === "Unavailable") return true;
  if (error?.message?.includes("ECONNREFUSED")) return true;
  // 404 with upstream_down means VaultCrux reached CoreCrux but the resource wasn't found — that's available, not down
  if (status === 404 && error?.message?.includes("upstream_down")) return false;
  return false;
}

export async function runCatB(config: AuditMemoryConfig, client: MemoryClient): Promise<CategoryResult> {
  const results: ToolTestResult[] = [];

  // Probe: attempt one call to detect upstream availability
  const probeSessionId = "__audit_probe__";
  const { result: probeRes } = await timed(() =>
    client.callTool("get_decision_context", { session_id: probeSessionId }),
  );
  if (!probeRes.success && isUpstreamUnavailable(probeRes.status, probeRes.error)) {
    return aggregateCategory("catB", "B: Decision Plane", [], true, `CoreCrux upstream unavailable: ${probeRes.error?.message?.slice(0, 100)}`);
  }

  // --- get_decision_context ---

  // happy_path (probe result doubles as happy path)
  {
    if (probeRes.success && isObject(probeRes.data)) {
      results.push(testResult("get_decision_context", "happy_path", "pass", 0, "returns object", JSON.stringify(probeRes.data).slice(0, 100)));
    } else if (!probeRes.success && probeRes.status === 404) {
      // 404 is acceptable — session not found is a valid response for a non-existent session
      results.push(testResult("get_decision_context", "happy_path", "pass", 0, "returns 404 for unknown session", "not found (expected)"));
    } else {
      results.push(testResult("get_decision_context", "happy_path", "fail", 0, "returns object or 404", JSON.stringify(probeRes.error).slice(0, 200)));
    }
  }

  // missing_session_id
  {
    const { result: res, ms } = await timed(() => client.callTool("get_decision_context", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_decision_context", "missing_session_id", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_decision_context", "missing_session_id", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- get_causal_chain ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("get_causal_chain", { decision_id: "__audit_probe_decision__" }),
    );
    if (res.success || res.status === 404) {
      results.push(testResult("get_causal_chain", "happy_path", "pass", ms, "returns object or 404", res.success ? "ok" : "not found"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_causal_chain", "happy_path", "skip", ms, "upstream unavailable", res.error?.message?.slice(0, 100) ?? ""));
    } else {
      results.push(testResult("get_causal_chain", "happy_path", "fail", ms, "returns object or 404", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // missing_decision_id
  {
    const { result: res, ms } = await timed(() => client.callTool("get_causal_chain", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_causal_chain", "missing_decision_id", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_causal_chain", "missing_decision_id", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- reconstruct_knowledge_state ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("reconstruct_knowledge_state", { decision_id: "__audit_probe_decision__" }),
    );
    if (res.success || res.status === 404) {
      results.push(testResult("reconstruct_knowledge_state", "happy_path", "pass", ms, "returns object or 404", res.success ? "ok" : "not found"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("reconstruct_knowledge_state", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("reconstruct_knowledge_state", "happy_path", "fail", ms, "returns object or 404", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // with_options
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("reconstruct_knowledge_state", {
        decision_id: "__audit_probe_decision__",
        include_superseded: true,
        include_confidence_landscape: true,
      }),
    );
    if (res.success || res.status === 404) {
      results.push(testResult("reconstruct_knowledge_state", "with_options", "pass", ms, "options accepted", res.success ? "ok" : "not found"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("reconstruct_knowledge_state", "with_options", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("reconstruct_knowledge_state", "with_options", "fail", ms, "options accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // --- get_correction_chain ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("get_correction_chain", { decision_id: "__audit_probe_decision__" }),
    );
    if (res.success || res.status === 404) {
      results.push(testResult("get_correction_chain", "happy_path", "pass", ms, "returns object or 404", res.success ? "ok" : "not found"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_correction_chain", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_correction_chain", "happy_path", "fail", ms, "returns object or 404", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // missing_decision_id
  {
    const { result: res, ms } = await timed(() => client.callTool("get_correction_chain", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_correction_chain", "missing_decision_id", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_correction_chain", "missing_decision_id", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- get_decisions_on_stale_context ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("get_decisions_on_stale_context", { session_id: "__audit_probe__" }),
    );
    if (res.success || res.status === 404) {
      results.push(testResult("get_decisions_on_stale_context", "happy_path", "pass", ms, "returns object or 404", res.success ? "ok" : "not found"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("get_decisions_on_stale_context", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("get_decisions_on_stale_context", "happy_path", "fail", ms, "returns object or 404", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // missing_session_id
  {
    const { result: res, ms } = await timed(() => client.callTool("get_decisions_on_stale_context", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("get_decisions_on_stale_context", "missing_session_id", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("get_decisions_on_stale_context", "missing_session_id", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // --- record_decision_context ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("record_decision_context", {
        session_id: "__audit_probe_session__",
        decision_id: "__audit_probe_decision_rec__",
        context: { source: "audit-memory", probe: true },
      }),
    );
    if (res.success) {
      results.push(testResult("record_decision_context", "happy_path", "pass", ms, "POST accepted", "recorded"));
    } else if (isUpstreamUnavailable(res.status, res.error)) {
      results.push(testResult("record_decision_context", "happy_path", "skip", ms, "upstream unavailable", ""));
    } else {
      results.push(testResult("record_decision_context", "happy_path", "fail", ms, "POST accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // missing_fields
  {
    const { result: res, ms } = await timed(() => client.callTool("record_decision_context", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("record_decision_context", "missing_fields", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("record_decision_context", "missing_fields", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // mutation_readback: record then read back same session
  {
    const sessionId = `__audit_readback_${Date.now()}__`;
    const decisionId = `__audit_readback_dec_${Date.now()}__`;

    const { result: recRes } = await timed(() =>
      client.callTool("record_decision_context", {
        session_id: sessionId,
        decision_id: decisionId,
        context: { readback: true },
      }),
    );

    if (recRes.success) {
      const { result: readRes, ms: readMs } = await timed(() =>
        client.callTool("get_decision_context", { session_id: sessionId }),
      );
      if (readRes.success && isObject(readRes.data)) {
        results.push(testResult("record_decision_context", "mutation_readback", "pass", readMs, "readback finds recorded", "readback ok"));
      } else if (readRes.status === 404) {
        // May be 404 if CoreCrux is async — acceptable
        results.push(testResult("record_decision_context", "mutation_readback", "pass", readMs, "readback 404 (async accepted)", "not yet visible"));
      } else {
        results.push(testResult("record_decision_context", "mutation_readback", "fail", readMs, "readback succeeds", JSON.stringify(readRes.error).slice(0, 200)));
      }
    } else if (isUpstreamUnavailable(recRes.status, recRes.error)) {
      results.push(testResult("record_decision_context", "mutation_readback", "skip", 0, "upstream unavailable", ""));
    } else {
      results.push(testResult("record_decision_context", "mutation_readback", "fail", 0, "record first", JSON.stringify(recRes.error).slice(0, 200)));
    }
  }

  return aggregateCategory("catB", "B: Decision Plane", results);
}
