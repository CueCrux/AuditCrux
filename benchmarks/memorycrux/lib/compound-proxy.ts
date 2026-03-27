// MemoryCrux Benchmark — Compound tool proxy for T3 arm
//
// Wraps McProxy to collapse 21 VaultCrux tools into 4 compound tools.
// Each compound tool composes multiple underlying API calls and merges results.

import type { ToolCallRecord } from "./types.js";
import type { McProxy } from "./mc-proxy.js";

export class CompoundProxy {
  constructor(private mc: McProxy) {}

  get tenantId(): string {
    return this.mc.tenantId;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallRecord> {
    const start = performance.now();

    switch (name) {
      case "brief_me":
        return this.briefMe(args, start);
      case "search":
        return this.search(args, start);
      case "safe_to_proceed":
        return this.safeToProceed(args, start);
      case "save_decision":
        return this.saveDecision(args, start);
      default:
        // Fall through to raw McProxy for edge-case tools (T2 originals)
        return this.mc.callTool(name, args);
    }
  }

  /**
   * brief_me — Session boot compound.
   * Composes: get_relevant_context + get_constraints + get_checkpoints +
   *           assess_coverage + get_freshness_report + get_contradictions
   */
  private async briefMe(args: Record<string, unknown>, start: number): Promise<ToolCallRecord> {
    const task = String(args.task_description ?? args.task ?? "");
    const tokenBudget = Number(args.token_budget ?? 8000);
    const sessionId = args.session_id ? String(args.session_id) : undefined;

    // Fire all sub-calls concurrently
    const [context, constraints, checkpoints, coverage, freshness, contradictions] = await Promise.allSettled([
      this.mc.callTool("get_relevant_context", {
        task_description: task,
        token_budget: tokenBudget,
      }),
      this.mc.callTool("get_constraints", {}),
      sessionId
        ? this.mc.callTool("get_checkpoints", { session_id: sessionId })
        : Promise.resolve(null),
      this.mc.callTool("assess_coverage", { task_description: task }),
      this.mc.callTool("get_freshness_report", { stale_after_days: 30 }),
      this.mc.callTool("get_contradictions", {}),
    ]);

    const briefing: Record<string, unknown> = {};
    const errors: string[] = [];

    if (context.status === "fulfilled" && context.value?.success) {
      briefing.context = context.value.result;
    } else {
      errors.push(`context: ${context.status === "rejected" ? context.reason : context.value?.error}`);
    }

    if (constraints.status === "fulfilled" && constraints.value?.success) {
      briefing.constraints = constraints.value.result;
    } else {
      errors.push(`constraints: ${constraints.status === "rejected" ? constraints.reason : constraints.value?.error}`);
    }

    if (checkpoints.status === "fulfilled" && checkpoints.value != null) {
      if (checkpoints.value.success) {
        briefing.prior_checkpoints = checkpoints.value.result;
      }
    }

    if (coverage.status === "fulfilled" && coverage.value?.success) {
      briefing.coverage_gaps = coverage.value.result;
    }

    if (freshness.status === "fulfilled" && freshness.value?.success) {
      briefing.freshness = freshness.value.result;
    }

    if (contradictions.status === "fulfilled" && contradictions.value?.success) {
      briefing.contradictions = contradictions.value.result;
    }

    if (errors.length > 0) {
      briefing._warnings = errors;
    }

    return {
      toolName: "brief_me",
      args,
      result: briefing,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    };
  }

  /**
   * search — Query memory compound.
   * Composes: query_memory + (optionally) check_claim + list_topics
   */
  private async search(args: Record<string, unknown>, start: number): Promise<ToolCallRecord> {
    const query = String(args.query ?? "");
    const limit = Number(args.limit ?? 10);
    const verifyClaim = args.verify_claim ? String(args.verify_claim) : undefined;

    const calls: Promise<ToolCallRecord | null>[] = [
      this.mc.callTool("query_memory", { query, limit, topic: args.topic }),
    ];

    if (verifyClaim) {
      calls.push(this.mc.callTool("check_claim", { claim_text: verifyClaim }));
    }

    if (args.browse_topics) {
      calls.push(this.mc.callTool("list_topics", { limit: 20 }));
    }

    const results = await Promise.allSettled(calls);
    const merged: Record<string, unknown> = {};

    if (results[0].status === "fulfilled" && results[0].value?.success) {
      merged.results = results[0].value.result;
    } else {
      return {
        toolName: "search",
        args,
        result: null,
        latencyMs: Math.round(performance.now() - start),
        success: false,
        error: results[0].status === "rejected" ? String(results[0].reason) : results[0].value?.error,
      };
    }

    if (verifyClaim && results[1]?.status === "fulfilled" && results[1].value?.success) {
      merged.claim_check = results[1].value.result;
    }

    const topicIdx = verifyClaim ? 2 : 1;
    if (args.browse_topics && results[topicIdx]?.status === "fulfilled" && results[topicIdx].value?.success) {
      merged.topics = results[topicIdx].value.result;
    }

    return {
      toolName: "search",
      args,
      result: merged,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    };
  }

  /**
   * safe_to_proceed — Safety gate compound.
   * Composes: check_constraints + verify_before_acting
   */
  private async safeToProceed(args: Record<string, unknown>, start: number): Promise<ToolCallRecord> {
    const action = String(args.action ?? "");
    const resource = args.resource ? String(args.resource) : undefined;

    const [constraintCheck, verification] = await Promise.allSettled([
      this.mc.callTool("check_constraints", {
        action_description: action,
        target_resources: resource ? [resource] : undefined,
      }),
      this.mc.callTool("verify_before_acting", {
        action_description: action,
        target_resources: resource ? [resource] : undefined,
        is_mutation: args.is_mutation,
      }),
    ]);

    const verdict: Record<string, unknown> = {};

    if (constraintCheck.status === "fulfilled" && constraintCheck.value?.success) {
      verdict.constraint_violations = constraintCheck.value.result;
    }

    if (verification.status === "fulfilled" && verification.value?.success) {
      verdict.safety_verdict = verification.value.result;
    }

    // Derive a simple go/no-go
    const hasViolations = constraintCheck.status === "fulfilled" && constraintCheck.value?.success
      ? hasConstraintViolations(constraintCheck.value.result)
      : false;
    const verifyBlocked = verification.status === "fulfilled" && verification.value?.success
      ? isVerifyBlocked(verification.value.result)
      : false;

    verdict.safe = !hasViolations && !verifyBlocked;
    verdict.action = action;

    return {
      toolName: "safe_to_proceed",
      args,
      result: verdict,
      latencyMs: Math.round(performance.now() - start),
      success: true,
    };
  }

  /**
   * save_decision — Decision recording compound.
   * Composes: record_decision_context + (optionally) checkpoint_decision_state
   */
  private async saveDecision(args: Record<string, unknown>, start: number): Promise<ToolCallRecord> {
    const decision = String(args.decision ?? "");
    const reasoning = String(args.reasoning ?? "");
    const checkpoint = Boolean(args.checkpoint);
    const sessionId = args.session_id ? String(args.session_id) : undefined;

    const recordResult = await this.mc.callTool("record_decision_context", {
      decision,
      reasoning,
      alternatives_considered: args.alternatives,
      context: args.context,
      tags: args.tags,
      session_id: sessionId,
    });

    const result: Record<string, unknown> = {
      decision_recorded: recordResult.success,
      record: recordResult.result,
    };

    if (recordResult.error) {
      result.record_error = recordResult.error;
    }

    // Optionally checkpoint
    if (checkpoint && sessionId) {
      const cpResult = await this.mc.callTool("checkpoint_decision_state", {
        session_id: sessionId,
        summary: args.checkpoint_summary ?? `Decision: ${decision}`,
        decisions_so_far: args.decisions_so_far,
        open_questions: args.open_questions,
      });
      result.checkpoint = cpResult.success;
      result.checkpoint_data = cpResult.result;
    }

    return {
      toolName: "save_decision",
      args,
      result,
      latencyMs: Math.round(performance.now() - start),
      success: recordResult.success,
      error: recordResult.error,
    };
  }
}

// Helper: check if constraint check result has violations
function hasConstraintViolations(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.violations) && r.violations.length > 0) return true;
  if (Array.isArray(r.matches) && r.matches.length > 0) return true;
  if (r.blocked === true) return true;
  return false;
}

// Helper: check if verify_before_acting returned a block
function isVerifyBlocked(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  if (r.verdict === "block" || r.verdict === "deny") return true;
  if (r.safe === false) return true;
  return false;
}
