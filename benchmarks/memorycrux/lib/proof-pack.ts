// MemoryCrux Benchmark — Proof pack generator
//
// Bundles run evidence behind headline claims into machine-readable
// and human-readable proof packs.

import type { RunSummary, ProjectFixture } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofPackConfig {
  claim: string;
  claimId: string;
  runFilter: (summary: RunSummary) => boolean;
  metricsExtractor: (summary: RunSummary, fixture: ProjectFixture) => Record<string, unknown>;
  sensitiveFields?: string[];
}

export interface ProofPack {
  claimId: string;
  claim: string;
  generated: string;
  standardVersion: string;
  runs: Array<{
    runId: string;
    project: string;
    model: string;
    arm: string;
    variant: string;
    metrics: Record<string, unknown>;
  }>;
  statistics: {
    n: number;
    medians: Record<string, number>;
    iqrs: Record<string, number>;
  };
  exclusions: Array<{ runId: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Sensitive-data stripping
// ---------------------------------------------------------------------------

const DEFAULT_SENSITIVE_PATTERNS = [
  "apikey",
  "api_key",
  "key",
  "token",
  "secret",
  "password",
];

function isSensitiveKey(key: string, extra: string[]): boolean {
  const lower = key.toLowerCase();
  const patterns = [...DEFAULT_SENSITIVE_PATTERNS, ...extra.map((s) => s.toLowerCase())];
  return patterns.some((p) => lower.includes(p));
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value === "string" && value.startsWith("/")) return true;
  return false;
}

export function stripSensitiveData<T>(obj: T, sensitiveFields?: string[]): T {
  const extra = sensitiveFields ?? [];

  function walk(node: unknown): unknown {
    if (node === null || node === undefined) return node;
    if (typeof node === "number" || typeof node === "boolean") return node;
    if (typeof node === "string") {
      // Strip absolute paths
      if (node.startsWith("/")) return "[REDACTED]";
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isSensitiveKey(k, extra)) {
          out[k] = "[REDACTED]";
        } else if (isSensitiveValue(v)) {
          out[k] = "[REDACTED]";
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return node;
  }

  return walk(obj) as T;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function iqr(values: number[]): number {
  if (values.length < 4) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  return sorted[q3Idx] - sorted[q1Idx];
}

function computeStatistics(
  runs: Array<{ metrics: Record<string, unknown> }>,
): { n: number; medians: Record<string, number>; iqrs: Record<string, number> } {
  const n = runs.length;
  const numericKeys: Map<string, number[]> = new Map();

  for (const run of runs) {
    for (const [k, v] of Object.entries(run.metrics)) {
      if (typeof v === "number") {
        if (!numericKeys.has(k)) numericKeys.set(k, []);
        numericKeys.get(k)!.push(v);
      }
    }
  }

  const medians: Record<string, number> = {};
  const iqrs_: Record<string, number> = {};
  for (const [k, values] of numericKeys) {
    medians[k] = median(values);
    iqrs_[k] = iqr(values);
  }

  return { n, medians, iqrs: iqrs_ };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateProofPack(
  config: ProofPackConfig,
  summaries: RunSummary[],
  fixtures: Map<string, ProjectFixture>,
): ProofPack {
  const matching = summaries.filter(config.runFilter);
  const exclusions: Array<{ runId: string; reason: string }> = [];
  const runs: ProofPack["runs"] = [];

  for (const s of matching) {
    const fixture = fixtures.get(s.project);
    if (!fixture) {
      exclusions.push({ runId: s.runId, reason: `No fixture found for project "${s.project}"` });
      continue;
    }

    try {
      const rawMetrics = config.metricsExtractor(s, fixture);
      const metrics = stripSensitiveData(rawMetrics, config.sensitiveFields);

      runs.push({
        runId: s.runId,
        project: s.project,
        model: s.llm.model,
        arm: s.arm,
        variant: s.fixtureVariant,
        metrics,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      exclusions.push({ runId: s.runId, reason: `Metrics extraction failed: ${msg}` });
    }
  }

  const statistics = computeStatistics(runs);

  return {
    claimId: config.claimId,
    claim: config.claim,
    generated: new Date().toISOString(),
    standardVersion: "1.0",
    runs,
    statistics,
    exclusions,
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export function renderProofPackMarkdown(pack: ProofPack): string {
  const lines: string[] = [];

  lines.push(`# Proof Pack: ${pack.claimId}`);
  lines.push("");
  lines.push(`**Claim:** ${pack.claim}`);
  lines.push("");
  lines.push(`**Standard:** MemoryCrux Benchmark Standard v${pack.standardVersion}`);
  lines.push(`**Generated:** ${pack.generated.slice(0, 10)}`);
  lines.push(`**Runs:** ${pack.statistics.n}`);
  lines.push("");

  // Statistics
  lines.push("## Statistics");
  lines.push("");
  if (Object.keys(pack.statistics.medians).length > 0) {
    lines.push("| Metric | Median | IQR |");
    lines.push("|--------|--------|-----|");
    for (const key of Object.keys(pack.statistics.medians)) {
      const med = pack.statistics.medians[key];
      const iqrVal = pack.statistics.iqrs[key] ?? 0;
      lines.push(`| ${key} | ${formatNum(med)} | ${formatNum(iqrVal)} |`);
    }
  } else {
    lines.push("No numeric metrics to summarise.");
  }
  lines.push("");

  // Per-run table
  lines.push("## Per-Run Evidence");
  lines.push("");
  if (pack.runs.length > 0) {
    // Collect all metric keys
    const metricKeys = new Set<string>();
    for (const run of pack.runs) {
      for (const k of Object.keys(run.metrics)) metricKeys.add(k);
    }
    const cols = ["Run ID", "Project", "Model", "Arm", "Variant", ...metricKeys];
    lines.push(`| ${cols.join(" | ")} |`);
    lines.push(`| ${cols.map(() => "---").join(" | ")} |`);

    for (const run of pack.runs) {
      const cells = [
        run.runId.slice(0, 12),
        run.project,
        run.model,
        run.arm,
        run.variant,
        ...[...metricKeys].map((k) => formatCell(run.metrics[k])),
      ];
      lines.push(`| ${cells.join(" | ")} |`);
    }
  } else {
    lines.push("No runs matched the filter.");
  }
  lines.push("");

  // Exclusions
  if (pack.exclusions.length > 0) {
    lines.push("## Exclusions");
    lines.push("");
    lines.push("| Run ID | Reason |");
    lines.push("|--------|--------|");
    for (const ex of pack.exclusions) {
      lines.push(`| ${ex.runId.slice(0, 12)} | ${ex.reason} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatNum(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(4);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "N/A";
  if (typeof v === "number") return formatNum(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
