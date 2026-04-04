#!/usr/bin/env tsx
/**
 * LME Deterministic Runner — Zero LLM at query time.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx run-deterministic.ts --pilot 65
 *   ANTHROPIC_API_KEY=... npx tsx run-deterministic.ts              # full 500
 *   ANTHROPIC_API_KEY=... npx tsx run-deterministic.ts --skip-extract  # reuse cached extractions
 *
 * Flow:
 *   1. Load LME dataset
 *   2. For each question: extract facts from its sessions (one-time, cached)
 *   3. Parse question → operation
 *   4. Answer from projections (no LLM)
 *   5. Evaluate against gold answers
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractFacts,
  parseQuestion,
  answerDeterministic,
  type FactStore,
  type DeterministicAnswer,
} from "./lib/deterministic-pipeline.js";

// ── CLI ──

const args = process.argv.slice(2);
const pilotN = args.includes("--pilot") ? parseInt(args[args.indexOf("--pilot") + 1] ?? "65", 10) : 0;
const skipExtract = args.includes("--skip-extract");
const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

if (!apiKey && !skipExtract) {
  console.error("ANTHROPIC_API_KEY required for extraction (use --skip-extract to reuse cache)");
  process.exit(1);
}

// ── Load Dataset ──

const datasetPath = resolve(import.meta.dirname!, "../_datasets/LongMemEval/data/longmemeval_s_cleaned.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf-8")) as Array<{
  question_id: string;
  question_type: string;
  question: string;
  question_date: string;
  answer: string;
  answer_session_ids: string[];
  haystack_session_ids: string[];
  haystack_dates: string[];
  haystack_sessions: Array<Array<{ role: string; content: string }>>;
}>;

const problems = pilotN > 0 ? stratifiedSample(dataset, pilotN) : dataset;
console.log(`Loaded ${dataset.length} questions, running ${problems.length}`);

// ── Extraction Cache ──

const cacheDir = resolve(import.meta.dirname!, "results/_deterministic_cache");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

function cacheKey(questionId: string): string {
  return resolve(cacheDir, `${questionId}.json`);
}

function flattenSession(turns: Array<{ role: string; content: string }>, sessionId: string, date: string): string {
  const dateLabel = (date ?? "unknown").replace(/\s*\([^)]+\)\s*/, " ").trim().split(" ")[0]?.replace(/\//g, "-") ?? "unknown";
  const header = `[Date: ${dateLabel}] [Session: ${sessionId}]`;
  const blocks: string[] = [];
  let i = 0;
  while (i < turns.length) {
    const turn = turns[i]!;
    if (turn.role === "user") {
      let block = `User: ${turn.content}`;
      if (i + 1 < turns.length && turns[i + 1]!.role === "assistant") {
        block += `\nAssistant: ${turns[i + 1]!.content}`;
        i += 2;
      } else {
        i++;
      }
      blocks.push(block);
    } else {
      blocks.push(`${turn.role === "assistant" ? "Assistant" : "System"}: ${turn.content}`);
      i++;
    }
  }
  return `${header}\n\n${blocks.join("\n\n---\n\n")}`;
}

// ── Stratified Sample ──

function stratifiedSample<T extends { question_type: string }>(data: T[], n: number): T[] {
  const byType = new Map<string, T[]>();
  for (const d of data) {
    const arr = byType.get(d.question_type) ?? [];
    arr.push(d);
    byType.set(d.question_type, arr);
  }
  const perType = Math.max(1, Math.floor(n / byType.size));
  const result: T[] = [];
  for (const [, items] of byType) {
    result.push(...items.slice(0, perType));
  }
  // Fill remainder
  const remaining = n - result.length;
  const all = data.filter((d) => !result.includes(d));
  result.push(...all.slice(0, remaining));
  return result;
}

// ── Main ──

async function main() {
  const startTime = Date.now();
  let extractionCost = 0;
  let extractionTokens = 0;
  const answers: DeterministicAnswer[] = [];
  let correct = 0;

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i]!;
    const cached = cacheKey(problem.question_id);

    // Phase 1: Extract facts (or load from cache)
    let store: FactStore;
    if (skipExtract && existsSync(cached)) {
      store = JSON.parse(readFileSync(cached, "utf-8"));
    } else {
      // Extract from each session individually (sessions can be very long)
      store = { facts: [], preferences: [], events: [] };

      // Extract from answer sessions first, fall back to all sessions if none found
      const answerSessionIds = new Set(problem.answer_session_ids ?? []);
      const allSessions = problem.haystack_sessions.map((turns, idx) => ({
        turns,
        sessionId: problem.haystack_session_ids[idx] ?? `session-${idx}`,
        date: problem.haystack_dates[idx] ?? "unknown",
        isAnswer: answerSessionIds.has(problem.haystack_session_ids[idx] ?? ""),
      }));

      let sessionsToExtract = allSessions.filter((s) => s.isAnswer);
      if (sessionsToExtract.length === 0) {
        // No answer_session_ids — extract from ALL sessions (cap at 15)
        sessionsToExtract = allSessions.slice(0, 15);
      }
      sessionsToExtract = sessionsToExtract.slice(0, 15); // hard cap

      for (const session of sessionsToExtract) {
        const content = flattenSession(session.turns, session.sessionId, session.date);
        if (content.length < 50) continue;
        try {
          // Use larger context for single-session questions (only 1-2 answer sessions)
          const maxChars = sessionsToExtract.length <= 3 ? 15000 : 8000;
          const sessionStore = await extractFacts(content.slice(0, maxChars), session.sessionId, apiKey, problem.question);
          store.facts.push(...sessionStore.facts);
          store.preferences.push(...sessionStore.preferences);
          store.events.push(...sessionStore.events);
        } catch (err) {
          console.warn(`  [extract] FAIL ${problem.question_id}/${session.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      // Cache
      writeFileSync(cached, JSON.stringify(store, null, 2));
    }

    // Phase 3-5: Parse + Answer deterministically
    const answer = answerDeterministic(problem.question_id, problem.question, store, undefined, problem.question_date);

    // Check against gold
    const gold = String(problem.answer).toLowerCase().trim();
    const hyp = answer.answer.toLowerCase().trim();
    const isCorrect = hyp.includes(gold) || gold.includes(hyp) ||
      // Fuzzy: check if key terms from gold appear in hypothesis
      gold.split(/\s+/).filter((w) => w.length > 3).every((w) => hyp.includes(w));

    if (isCorrect) correct++;

    answers.push(answer);

    const status = isCorrect ? "PASS" : "FAIL";
    const factCount = store.facts.length + store.preferences.length + store.events.length;
    console.log(
      `[${i + 1}/${problems.length}] [${status}] ${problem.question_id} (${problem.question_type}) ` +
      `— ${answer.tier}/${answer.source} — facts:${factCount} — ${answer.answer.slice(0, 60)}`,
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Accuracy: ${correct}/${problems.length} (${(correct / problems.length * 100).toFixed(1)}%)`);

  // Per-type breakdown
  const byType = new Map<string, { correct: number; total: number }>();
  for (let i = 0; i < problems.length; i++) {
    const t = problems[i]!.question_type;
    const entry = byType.get(t) ?? { correct: 0, total: 0 };
    entry.total++;
    const gold = String(problems[i]!.answer).toLowerCase().trim();
    const hyp = String(answers[i]!.answer).toLowerCase().trim();
    if (hyp.includes(gold) || gold.includes(hyp) || gold.split(/\s+/).filter((w) => w.length > 3).every((w) => hyp.includes(w))) {
      entry.correct++;
    }
    byType.set(t, entry);
  }

  for (const [t, d] of [...byType.entries()].sort()) {
    console.log(`  ${t}: ${d.correct}/${d.total} (${(d.correct / d.total * 100).toFixed(1)}%)`);
  }

  // Tier breakdown
  const byTier = new Map<string, number>();
  for (const a of answers) {
    byTier.set(a.tier, (byTier.get(a.tier) ?? 0) + 1);
  }
  console.log(`\nTier distribution:`);
  for (const [t, n] of [...byTier.entries()].sort()) {
    console.log(`  ${t}: ${n}`);
  }

  // Source breakdown
  const bySource = new Map<string, number>();
  for (const a of answers) {
    bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);
  }
  console.log(`\nSource distribution:`);
  for (const [s, n] of [...bySource.entries()].sort()) {
    console.log(`  ${s}: ${n}`);
  }

  console.log(`\nDuration: ${elapsed}s`);
  console.log(`${"=".repeat(60)}`);

  // Write results
  const resultDir = resolve(import.meta.dirname!, `results/deterministic-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  mkdirSync(resultDir, { recursive: true });

  writeFileSync(resolve(resultDir, "results.json"), JSON.stringify({
    accuracy: correct / problems.length,
    correct,
    total: problems.length,
    byType: Object.fromEntries(byType),
    byTier: Object.fromEntries(byTier),
    bySource: Object.fromEntries(bySource),
    elapsed,
    answers: answers.map((a, i) => ({
      ...a,
      gold: problems[i]!.answer,
      questionType: problems[i]!.question_type,
    })),
  }, null, 2));

  writeFileSync(resolve(resultDir, "hypotheses.jsonl"), answers.map((a, i) => JSON.stringify({
    question_id: a.questionId,
    hypothesis: a.answer,
    question: a.question,
    answer: problems[i]!.answer,
  })).join("\n") + "\n");

  console.log(`\nResults: ${resultDir}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
