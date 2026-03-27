// LongMemEval External Benchmark — Dataset Loader
//
// Parses longmemeval_s_cleaned.json / longmemeval_m_cleaned.json into typed structures.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  LmeDataset,
  LmeProblem,
  LmeQuestionType,
  LmeSession,
  LmeSessionTurn,
  LongMemEvalRawItem,
} from "./types.js";

const DATASET_DIR = resolve(
  import.meta.dirname ?? new URL(".", import.meta.url).pathname,
  "..",
  "..",
  "_datasets",
  "LongMemEval",
  "data",
);

function datasetFilename(dataset: LmeDataset): string {
  return dataset === "s"
    ? "longmemeval_s_cleaned.json"
    : "longmemeval_m_cleaned.json";
}

/**
 * Load the full dataset into memory. LongMemEval_S is ~277MB, LongMemEval_M is ~2.7GB.
 * For M, consider using `loadProblems()` with a filter instead.
 */
export function loadDataset(dataset: LmeDataset): LmeProblem[] {
  const filePath = resolve(DATASET_DIR, datasetFilename(dataset));
  const raw: LongMemEvalRawItem[] = JSON.parse(readFileSync(filePath, "utf-8"));
  return raw.map(parseProblem);
}

/**
 * Load only specific problems by question_id. Useful for pilot runs.
 */
export function loadProblems(
  dataset: LmeDataset,
  questionIds?: string[],
): LmeProblem[] {
  const all = loadDataset(dataset);
  if (!questionIds || questionIds.length === 0) return all;
  const filter = new Set(questionIds);
  return all.filter((p) => filter.has(p.problemId));
}

/**
 * Load the oracle/reference file for evaluation (longmemeval_oracle.json or the dataset itself).
 */
export function loadReference(dataset: LmeDataset): LongMemEvalRawItem[] {
  // The cleaned dataset files contain the ground truth answers
  const filePath = resolve(DATASET_DIR, datasetFilename(dataset));
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/**
 * Get a stratified sample: N questions per ability type.
 */
export function stratifiedSample(
  problems: LmeProblem[],
  perType: number,
): LmeProblem[] {
  const byType = new Map<LmeQuestionType, LmeProblem[]>();
  for (const p of problems) {
    const list = byType.get(p.questionType) ?? [];
    list.push(p);
    byType.set(p.questionType, list);
  }
  const result: LmeProblem[] = [];
  for (const [, items] of byType) {
    // Deterministic: take first N
    result.push(...items.slice(0, perType));
  }
  return result;
}

/**
 * Get per-type distribution of a problem set.
 */
export function typeCounts(
  problems: LmeProblem[],
): Record<LmeQuestionType, number> {
  const counts = {} as Record<LmeQuestionType, number>;
  for (const p of problems) {
    counts[p.questionType] = (counts[p.questionType] ?? 0) + 1;
  }
  return counts;
}

// ── Internal parsing ──

function parseProblem(raw: LongMemEvalRawItem): LmeProblem {
  const sessions: LmeSession[] = [];
  let totalContentChars = 0;

  for (let i = 0; i < raw.haystack_sessions.length; i++) {
    const rawSession = raw.haystack_sessions[i];
    const turns = normalizeTurns(rawSession);
    const contentText = turns.map((t) => `${t.role}: ${t.content}`).join("\n");
    const charCount = turns.reduce((sum, t) => sum + t.content.length, 0);
    totalContentChars += charCount;

    sessions.push({
      sessionId: raw.haystack_session_ids[i] ?? `session_${i}`,
      date: raw.haystack_dates[i] ?? "",
      turns,
      contentText,
      charCount,
    });
  }

  return {
    problemId: raw.question_id,
    questionType: raw.question_type,
    question: raw.question,
    questionDate: raw.question_date,
    answer: raw.answer,
    answerSessionIds: raw.answer_session_ids,
    sessions,
    totalContentChars,
    estimatedTokens: Math.ceil(totalContentChars / 4),
  };
}

/**
 * Sessions can be:
 * - An array of {role, content} turn objects (cleaned format)
 * - A JSON string encoding of the above (original format)
 * - A plain string (fallback)
 */
function normalizeTurns(raw: unknown): LmeSessionTurn[] {
  if (Array.isArray(raw)) {
    // Array of turn objects
    if (raw.length === 0) return [];
    if (typeof raw[0] === "object" && raw[0] !== null && "role" in raw[0]) {
      return raw as LmeSessionTurn[];
    }
    // Array of strings?
    return raw.map((s) => ({ role: "user" as const, content: String(s) }));
  }
  if (typeof raw === "string") {
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        return normalizeTurns(parsed);
      } catch {
        // Fall through to plain text
      }
    }
    if (raw.trim().length === 0) return [];
    return [{ role: "user", content: raw }];
  }
  return [];
}
