import * as fs from "node:fs";
import * as path from "node:path";
import type { MemoryAuditReport } from "./types.js";

const RESULTS_DIR = path.resolve(import.meta.dirname, "../../audit-results");

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function verdictIcon(v: string): string {
  switch (v) {
    case "pass": return "PASS";
    case "fail": return "FAIL";
    case "skip": return "SKIP";
    case "error": return "ERR";
    default: return v.toUpperCase();
  }
}

function renderMarkdown(report: MemoryAuditReport): string {
  const lines: string[] = [];
  lines.push(`# MemoryCrux Audit Report — ${report.runId}`);
  lines.push("");
  lines.push(`- **Target:** ${report.target} @ ${report.targetUrl}`);
  lines.push(`- **Tenant:** ${report.tenantId}`);
  lines.push(`- **Started:** ${report.startedAt}`);
  lines.push(`- **Duration:** ${report.summary.durationS}s`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Category | Tools | Tests | Passed | Failed | Skipped | Verdict |");
  lines.push("|----------|-------|-------|--------|--------|---------|---------|");
  for (const cat of report.results) {
    const verdict = cat.skipped ? "SKIP" : cat.passed ? "PASS" : "FAIL";
    lines.push(
      `| ${cat.label} | ${new Set(cat.toolResults.map((r) => r.toolName)).size} | ${cat.metrics.total} | ${cat.metrics.passed} | ${cat.metrics.failed} | ${cat.metrics.skipped} | ${verdict} |`,
    );
  }
  lines.push("");
  lines.push(
    `**Overall:** ${report.summary.passedTests}/${report.summary.totalTests} tests passed, ${report.summary.skippedCategories} categories skipped`,
  );
  lines.push("");

  // Per-category details
  for (const cat of report.results) {
    lines.push(`## ${cat.label}`);
    if (cat.skipped) {
      lines.push(`> Skipped: ${cat.skipReason ?? "upstream unavailable"}`);
      lines.push("");
      continue;
    }
    lines.push("");
    lines.push("| Tool | Test | Verdict | Latency | Notes |");
    lines.push("|------|------|---------|---------|-------|");
    for (const r of cat.toolResults) {
      const notes = r.error ?? r.actual;
      lines.push(`| ${r.toolName} | ${r.testName} | ${verdictIcon(r.verdict)} | ${r.latencyMs}ms | ${notes.slice(0, 100)} |`);
    }
    lines.push("");
    lines.push(`P50: ${cat.metrics.latencyP50Ms}ms | P95: ${cat.metrics.latencyP95Ms}ms`);
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReport(report: MemoryAuditReport): { jsonPath: string; mdPath: string } {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const ts = timestamp();
  const jsonPath = path.join(RESULTS_DIR, `audit-memory-${ts}.json`);
  const mdPath = path.join(RESULTS_DIR, `audit-memory-${ts}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));

  return { jsonPath, mdPath };
}
