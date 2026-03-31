// LongMemEval External Benchmark — Hypothesis Writer
//
// Writes JSONL hypothesis files compatible with LongMemEval's evaluate_qa.py.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LmeAnswer, LmeHypothesis, LmeRunSummary } from "./types.js";

/**
 * Write hypothesis JSONL file for evaluate_qa.py.
 * Format: one JSON object per line: { "question_id": "...", "hypothesis": "..." }
 */
export function writeHypotheses(answers: LmeAnswer[], outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });

  const lines = answers.map((a) => {
    const h: LmeHypothesis = {
      question_id: a.questionId,
      hypothesis: a.hypothesis,
    };
    return JSON.stringify(h);
  });

  writeFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
  console.log(`[hypothesis] Wrote ${answers.length} hypotheses to ${outputPath}`);
}

/**
 * Write the full run summary as JSON.
 */
export function writeRunSummary(summary: LmeRunSummary, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`[summary] Wrote run summary to ${outputPath}`);
}

/**
 * Write detailed agent trace for each question — tool calls, reasoning, reflection.
 * Human-readable markdown for auditing what the agent saw and did.
 */
export function writeTrace(answers: LmeAnswer[], outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });

  const lines: string[] = [];
  lines.push(`# Agent Trace Report`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Questions: ${answers.length}`);
  lines.push(``);

  for (const a of answers) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## ${a.questionId} (${a.questionType})`);
    lines.push(``);
    lines.push(`**Turns:** ${a.turns} | **Tool calls:** ${a.toolCalls} | **Cost:** $${a.costUsd.toFixed(4)}`);
    lines.push(``);

    if (a.toolTrace && a.toolTrace.length > 0) {
      lines.push(`### Tool Trace`);
      lines.push(``);
      for (let i = 0; i < a.toolTrace.length; i++) {
        const step = a.toolTrace[i]!;
        lines.push(`#### Step ${i + 1}: \`${step.toolName}\` (turn ${step.turn}, ${step.durationMs}ms)`);
        lines.push(``);
        if (step.agentReasoning) {
          lines.push(`**Agent reasoning:**`);
          lines.push(`> ${step.agentReasoning.slice(0, 500).replace(/\n/g, "\n> ")}`);
          lines.push(``);
        }
        lines.push(`**Args:** \`${JSON.stringify(step.toolArgs).slice(0, 300)}\``);
        lines.push(``);
        const resultStr = JSON.stringify(step.toolResult);
        lines.push(`**Result:** ${resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr}`);
        lines.push(``);
      }
    }

    if (a.reflection) {
      lines.push(`### Reflection`);
      lines.push(``);
      lines.push(`**Draft answer:**`);
      lines.push(`> ${a.reflection.draftAnswer.slice(0, 300).replace(/\n/g, "\n> ")}`);
      lines.push(``);
      lines.push(`**Self-critique:**`);
      lines.push(`> ${a.reflection.critique.slice(0, 500).replace(/\n/g, "\n> ")}`);
      lines.push(``);
      lines.push(`**Continued searching:** ${a.reflection.continuedSearching ? "YES" : "NO"}`);
      lines.push(``);
      if (a.reflection.revisedAnswer !== a.reflection.draftAnswer) {
        lines.push(`**Revised answer:**`);
        lines.push(`> ${a.reflection.revisedAnswer.slice(0, 300).replace(/\n/g, "\n> ")}`);
        lines.push(``);
      }
    }

    lines.push(`**Final hypothesis:**`);
    lines.push(`> ${a.hypothesis.slice(0, 400).replace(/\n/g, "\n> ")}`);
    lines.push(``);
  }

  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`[trace] Wrote agent trace for ${answers.length} questions to ${outputPath}`);
}

/**
 * Write a human-readable markdown report.
 */
export function writeReport(summary: LmeRunSummary, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });

  const lines: string[] = [];
  lines.push(`# LongMemEval Run Report`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run ID | \`${summary.runId}\` |`);
  lines.push(`| Dataset | LongMemEval_${summary.dataset.toUpperCase()} |`);
  lines.push(`| Arm | ${summary.arm} |`);
  lines.push(`| Model | ${summary.model} |`);
  lines.push(`| Timestamp | ${summary.timestamp} |`);
  lines.push(`| Duration | ${summary.durationSeconds}s |`);
  lines.push(`| Questions | ${summary.totalQuestions} |`);
  lines.push(``);
  lines.push(`## Token Usage`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Input tokens | ${summary.usage.totalInputTokens.toLocaleString()} |`);
  lines.push(`| Output tokens | ${summary.usage.totalOutputTokens.toLocaleString()} |`);
  lines.push(`| Cached tokens | ${summary.usage.totalCachedTokens.toLocaleString()} |`);
  lines.push(`| Total cost | $${summary.usage.totalCostUsd.toFixed(2)} |`);
  lines.push(``);

  // Per-type breakdown
  const byType = new Map<string, { count: number; totalCost: number; totalTools: number }>();
  for (const a of summary.answers) {
    const entry = byType.get(a.questionType) ?? { count: 0, totalCost: 0, totalTools: 0 };
    entry.count++;
    entry.totalCost += a.costUsd;
    entry.totalTools += a.toolCalls;
    byType.set(a.questionType, entry);
  }

  lines.push(`## Per-Type Summary`);
  lines.push(``);
  lines.push(`| Type | Questions | Avg Tools | Avg Cost |`);
  lines.push(`|------|-----------|-----------|----------|`);
  for (const [type, stats] of [...byType.entries()].sort()) {
    lines.push(
      `| ${type} | ${stats.count} | ${(stats.totalTools / stats.count).toFixed(1)} | $${(stats.totalCost / stats.count).toFixed(4)} |`,
    );
  }
  lines.push(``);

  if (summary.fixtureHash) {
    lines.push(`## Reproducibility`);
    lines.push(``);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Fixture hash | \`${summary.fixtureHash}\` |`);
    if (summary.harnessVersion) lines.push(`| Harness version | ${summary.harnessVersion} |`);
    lines.push(``);
  }

  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`[report] Wrote report to ${outputPath}`);
}
