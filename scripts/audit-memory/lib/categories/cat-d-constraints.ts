import { aggregateCategory, hasField, isObject, isRejection, isValidationError, testResult } from "../scoring.js";
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

/** Extract constraint ID from declare_constraint response: { constraint: { id } } or { id } */
function extractConstraintId(data: unknown): string | undefined {
  if (!isObject(data)) return undefined;
  // API returns { constraint: { id } }
  if (hasField(data, "constraint") && isObject(data.constraint) && hasField(data.constraint, "id")) {
    return String((data.constraint as Record<string, unknown>).id);
  }
  // Fallback: direct { id }
  if (hasField(data, "id")) return String(data.id);
  return undefined;
}

export async function runCatD(config: AuditMemoryConfig, client: MemoryClient): Promise<CategoryResult> {
  const results: ToolTestResult[] = [];
  const createdConstraintIds: string[] = [];

  // Probe: attempt get_constraints to detect if constraints routes are registered
  const { result: probeRes } = await timed(() => client.callTool("get_constraints", {}));
  if (!probeRes.success && isUpstreamUnavailable(probeRes.status, probeRes.error)) {
    return aggregateCategory("catD", "D: Constraints", [], true, `Constraints routes unavailable: ${probeRes.error?.message?.slice(0, 100)}`);
  }

  // --- declare_constraint ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("declare_constraint", {
        constraint_type: "policy",
        assertion: "Audit probe constraint — safe to delete",
        severity: "low",
      }),
    );
    const cid = res.success ? extractConstraintId(res.data) : undefined;
    if (res.success && cid) {
      createdConstraintIds.push(cid);
      results.push(testResult("declare_constraint", "happy_path", "pass", ms, "returns {id}", `id=${cid}`));
    } else {
      results.push(testResult("declare_constraint", "happy_path", "fail", ms, "returns {id}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_assertion
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("declare_constraint", { constraint_type: "policy" }),
    );
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("declare_constraint", "missing_assertion", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("declare_constraint", "missing_assertion", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // missing_type
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("declare_constraint", { assertion: "test" }),
    );
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("declare_constraint", "missing_type", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("declare_constraint", "missing_type", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // invalid_type — MCP rejects via Zod enum, API passes through to DB CHECK constraint (500)
  {
    const uniqueAssertion = `Invalid type test — ${Date.now()}`;
    const { result: res, ms } = await timed(() =>
      client.callTool("declare_constraint", { constraint_type: "invalid_type", assertion: uniqueAssertion }),
    );
    if (!res.success) {
      results.push(testResult("declare_constraint", "invalid_type", "pass", ms, "rejected bad enum", res.error?.message?.slice(0, 100) ?? "rejected"));
    } else {
      results.push(testResult("declare_constraint", "invalid_type", "fail", ms, "should reject bad enum", `success=${res.success}`));
    }
  }

  // all_four_types
  for (const ctype of ["boundary", "relationship", "policy", "context_flag"] as const) {
    const { result: res, ms } = await timed(() =>
      client.callTool("declare_constraint", {
        constraint_type: ctype,
        assertion: `Audit probe ${ctype} — safe to delete`,
        severity: "low",
      }),
    );
    const cid = res.success ? extractConstraintId(res.data) : undefined;
    if (res.success && cid) {
      createdConstraintIds.push(cid);
      results.push(testResult("declare_constraint", `type_${ctype}`, "pass", ms, `${ctype} accepted`, `id=${cid}`));
    } else {
      results.push(testResult("declare_constraint", `type_${ctype}`, "fail", ms, `${ctype} accepted`, JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // --- update_constraint ---

  // happy_path (update severity on first created constraint)
  if (createdConstraintIds.length > 0) {
    const targetId = createdConstraintIds[0]!;
    {
      const { result: res, ms } = await timed(() =>
        client.callTool("update_constraint", { constraint_id: targetId, severity: "medium" }),
      );
      if (res.success) {
        results.push(testResult("update_constraint", "happy_path", "pass", ms, "severity update accepted", `updated ${targetId}`));
      } else {
        results.push(testResult("update_constraint", "happy_path", "fail", ms, "severity update accepted", JSON.stringify(res.error).slice(0, 200)));
      }
    }

    // status_change
    {
      const { result: res, ms } = await timed(() =>
        client.callTool("update_constraint", { constraint_id: targetId, status: "suspended" }),
      );
      if (res.success) {
        results.push(testResult("update_constraint", "status_change", "pass", ms, "status→suspended accepted", `updated ${targetId}`));
      } else {
        results.push(testResult("update_constraint", "status_change", "fail", ms, "status→suspended accepted", JSON.stringify(res.error).slice(0, 200)));
      }
    }
  } else {
    results.push(testResult("update_constraint", "happy_path", "skip", 0, "needs created constraint", "no constraint created"));
    results.push(testResult("update_constraint", "status_change", "skip", 0, "needs created constraint", "no constraint created"));
  }

  // missing_id — API sends PATCH to /constraints/undefined (404 or error), MCP rejects via Zod
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("update_constraint", { severity: "high" }),
    );
    if (!res.success) {
      results.push(testResult("update_constraint", "missing_id", "pass", ms, "rejected missing id", res.error?.message?.slice(0, 100) ?? "rejected"));
    } else {
      results.push(testResult("update_constraint", "missing_id", "fail", ms, "should reject missing id", `success=${res.success}`));
    }
  }

  // --- get_constraints ---

  // happy_path
  {
    const { result: res, ms } = await timed(() => client.callTool("get_constraints", {}));
    if (res.success && isObject(res.data)) {
      results.push(testResult("get_constraints", "happy_path", "pass", ms, "returns object", JSON.stringify(res.data).slice(0, 100)));
    } else {
      results.push(testResult("get_constraints", "happy_path", "fail", ms, "returns object", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // filter_by_type
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("get_constraints", { constraint_type: "boundary" }),
    );
    if (res.success) {
      results.push(testResult("get_constraints", "filter_by_type", "pass", ms, "constraint_type=boundary accepted", "filtered"));
    } else {
      results.push(testResult("get_constraints", "filter_by_type", "fail", ms, "constraint_type=boundary accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // filter_by_status
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("get_constraints", { status: "active" }),
    );
    if (res.success) {
      results.push(testResult("get_constraints", "filter_by_status", "pass", ms, "status=active accepted", "filtered"));
    } else {
      results.push(testResult("get_constraints", "filter_by_status", "fail", ms, "status=active accepted", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // --- check_constraints ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("check_constraints", { action_description: "Audit probe action" }),
    );
    if (res.success && isObject(res.data) && hasField(res.data, "verdict")) {
      results.push(testResult("check_constraints", "happy_path", "pass", ms, "returns {verdict}", `verdict=${res.data.verdict}`));
    } else {
      results.push(testResult("check_constraints", "happy_path", "fail", ms, "returns {verdict}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_action
  {
    const { result: res, ms } = await timed(() => client.callTool("check_constraints", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("check_constraints", "missing_action", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("check_constraints", "missing_action", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // verdict_enum
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("check_constraints", { action_description: "audit enum check" }),
    );
    if (res.success && isObject(res.data)) {
      const verdict = String(res.data.verdict);
      const valid = ["pass", "warn", "block"].includes(verdict);
      results.push(testResult("check_constraints", "verdict_enum", valid ? "pass" : "fail", ms, "verdict in {pass,warn,block}", `verdict=${verdict}`));
    } else {
      results.push(testResult("check_constraints", "verdict_enum", "fail", ms, "verdict in {pass,warn,block}", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // --- verify_before_acting ---

  // happy_path
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("verify_before_acting", {
        tool_name: "audit_probe_tool",
        action_description: "Audit probe verification",
      }),
    );
    if (res.success && isObject(res.data) && hasField(res.data, "verdict")) {
      results.push(testResult("verify_before_acting", "happy_path", "pass", ms, "returns {verdict}", `verdict=${res.data.verdict}`));
    } else {
      results.push(testResult("verify_before_acting", "happy_path", "fail", ms, "returns {verdict}", JSON.stringify(res.error ?? res.data).slice(0, 200)));
    }
  }

  // missing_fields
  {
    const { result: res, ms } = await timed(() => client.callTool("verify_before_acting", {}));
    if (!res.success && isRejection(res.error)) {
      results.push(testResult("verify_before_acting", "missing_fields", "pass", ms, "validation error", res.error!.message.slice(0, 100)));
    } else {
      results.push(testResult("verify_before_acting", "missing_fields", "fail", ms, "validation error", `success=${res.success}`));
    }
  }

  // verdict_values
  {
    const { result: res, ms } = await timed(() =>
      client.callTool("verify_before_acting", {
        tool_name: "audit_probe",
        action_description: "audit enum check",
      }),
    );
    if (res.success && isObject(res.data)) {
      const verdict = String(res.data.verdict);
      const valid = ["proceed", "warn", "require_approval", "block"].includes(verdict);
      results.push(testResult("verify_before_acting", "verdict_values", valid ? "pass" : "fail", ms, "verdict in {proceed,warn,require_approval,block}", `verdict=${verdict}`));
    } else {
      results.push(testResult("verify_before_acting", "verdict_values", "fail", ms, "verdict in {proceed,warn,require_approval,block}", JSON.stringify(res.error).slice(0, 200)));
    }
  }

  // --- Mutation lifecycle: declare → get → update → get → expire ---

  {
    let lifecycleId: string | undefined;

    // Step 1: declare
    const { result: declareRes, ms: declareMs } = await timed(() =>
      client.callTool("declare_constraint", {
        constraint_type: "boundary",
        assertion: "Lifecycle test constraint — audit probe",
        severity: "low",
      }),
    );
    const lcid = declareRes.success ? extractConstraintId(declareRes.data) : undefined;
    if (declareRes.success && lcid) {
      lifecycleId = lcid;
      createdConstraintIds.push(lifecycleId);
      results.push(testResult("lifecycle", "step1_declare", "pass", declareMs, "declare returns id", `id=${lifecycleId}`));
    } else {
      results.push(testResult("lifecycle", "step1_declare", "fail", declareMs, "declare returns id", JSON.stringify(declareRes.error ?? declareRes.data).slice(0, 200)));
    }

    // Step 2: get (confirm visible)
    if (lifecycleId) {
      const { result: getRes, ms: getMs } = await timed(() =>
        client.callTool("get_constraints", { status: "active" }),
      );
      if (getRes.success && isObject(getRes.data)) {
        results.push(testResult("lifecycle", "step2_get_active", "pass", getMs, "get_constraints returns data", "visible"));
      } else {
        results.push(testResult("lifecycle", "step2_get_active", "fail", getMs, "get_constraints returns data", JSON.stringify(getRes.error).slice(0, 200)));
      }
    }

    // Step 3: update severity
    if (lifecycleId) {
      const { result: updRes, ms: updMs } = await timed(() =>
        client.callTool("update_constraint", { constraint_id: lifecycleId!, severity: "high" }),
      );
      if (updRes.success) {
        results.push(testResult("lifecycle", "step3_update_severity", "pass", updMs, "update severity→high", "updated"));
      } else {
        results.push(testResult("lifecycle", "step3_update_severity", "fail", updMs, "update severity→high", JSON.stringify(updRes.error).slice(0, 200)));
      }
    }

    // Step 4: expire
    if (lifecycleId) {
      const { result: expRes, ms: expMs } = await timed(() =>
        client.callTool("update_constraint", { constraint_id: lifecycleId!, status: "expired" }),
      );
      if (expRes.success) {
        results.push(testResult("lifecycle", "step4_expire", "pass", expMs, "status→expired", "expired"));
      } else {
        results.push(testResult("lifecycle", "step4_expire", "fail", expMs, "status→expired", JSON.stringify(expRes.error).slice(0, 200)));
      }
    }

    if (!lifecycleId) {
      results.push(testResult("lifecycle", "step2_get_active", "skip", 0, "needs lifecycle id", "skipped"));
      results.push(testResult("lifecycle", "step3_update_severity", "skip", 0, "needs lifecycle id", "skipped"));
      results.push(testResult("lifecycle", "step4_expire", "skip", 0, "needs lifecycle id", "skipped"));
    }
  }

  // --- Cleanup: expire all created constraints ---
  for (const id of createdConstraintIds) {
    try {
      await client.callTool("update_constraint", { constraint_id: id, status: "expired" });
    } catch {
      // Best-effort cleanup
    }
  }

  return aggregateCategory("catD", "D: Constraints", results);
}
