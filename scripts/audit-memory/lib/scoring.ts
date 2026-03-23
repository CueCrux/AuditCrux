import type { CategoryResult, MemoryCategoryId, ToolTestResult, ToolTestVerdict } from "./types.js";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

export function aggregateCategory(
  category: MemoryCategoryId,
  label: string,
  results: ToolTestResult[],
  skipped: boolean = false,
  skipReason?: string,
): CategoryResult {
  const passed = results.filter((r) => r.verdict === "pass").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const skippedCount = results.filter((r) => r.verdict === "skip").length;
  const errors = results.filter((r) => r.verdict === "error").length;
  const latencies = results.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);

  return {
    category,
    label,
    passed: !skipped && failed === 0 && errors === 0,
    skipped,
    skipReason,
    toolResults: results,
    metrics: {
      total: results.length,
      passed,
      failed,
      skipped: skippedCount,
      errors,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    },
  };
}

export function testResult(
  toolName: string,
  testName: string,
  verdict: ToolTestVerdict,
  latencyMs: number,
  expected: string,
  actual: string,
  error?: string,
): ToolTestResult {
  return { toolName, testName, verdict, latencyMs, expected, actual, error };
}

/** Check that a value is a non-null object */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Check that a value is an array */
export function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** Check that a key exists on an object and its value is an array */
export function hasArrayField(obj: unknown, key: string): boolean {
  return isObject(obj) && key in obj && isArray((obj as Record<string, unknown>)[key]);
}

/** Check that a key exists on an object */
export function hasField(obj: unknown, key: string): boolean {
  return isObject(obj) && key in obj;
}

/** Check that an error result contains a validation error or equivalent rejection */
export function isValidationError(error?: { type: string; message: string }): boolean {
  if (!error) return false;
  const combined = `${error.type} ${error.message}`.toLowerCase();
  return (
    combined.includes("validation") ||
    combined.includes("invalid") ||
    combined.includes("required") ||
    combined.includes("unprocessable") ||
    combined.includes("bad_request")
  );
}

/** Check that an error result is any kind of rejection (validation, auth, not_found) */
export function isRejection(error?: { type: string; message: string }): boolean {
  if (!error) return false;
  return isValidationError(error) || error.type.includes("not_found") || error.type.includes("auth");
}
