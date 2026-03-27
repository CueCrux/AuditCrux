// MemoryCrux Benchmark — Semantic Scorer (opt-in, LLM-based)
//
// Provides a second scoring layer alongside Track A substring match.
// Designed to audit substring match accuracy, not replace it.
// Opt-in via --semantic CLI flag or BENCH_SEMANTIC_SCORING=true.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SessionRecord } from "../types.js";

export interface SemanticJudgment {
  key: string;
  verdict: "YES" | "NO";
  justification: string;
}

export interface SemanticRecallResult {
  score: number;
  matched: string[];
  missed: string[];
  judgments: SemanticJudgment[];
}

export interface ScorerAgreement {
  totalKeys: number;
  substringMatched: number;
  semanticMatched: number;
  agreeing: number;
  agreementRate: number;
  disagreements: Array<{
    key: string;
    substring: boolean;
    semantic: boolean;
  }>;
}

/**
 * Estimate the cost of running semantic scoring for a given number of keys.
 * Uses gpt-5.4-mini pricing: $0.40/1M input, $1.60/1M output.
 */
export function estimateSemanticCost(keyCount: number, outputLengthTokens: number): number {
  // ~200 tokens per prompt (system + key + output excerpt) + ~50 tokens response
  const inputPerKey = 200 + Math.min(outputLengthTokens, 2000);
  const outputPerKey = 50;
  const totalInput = keyCount * inputPerKey;
  const totalOutput = keyCount * outputPerKey;
  return (totalInput / 1_000_000) * 0.40 + (totalOutput / 1_000_000) * 1.60;
}

/**
 * Score decision recall using LLM-based semantic evaluation.
 * For each expected key, asks an LLM judge whether the output contains the concept.
 *
 * Requires OPENAI_API_KEY in environment (uses gpt-5.4-mini for cost efficiency).
 */
export async function scoreSemanticRecall(
  sessions: SessionRecord[],
  expectedKeys: string[],
  options?: {
    cacheDir?: string;
    runId?: string;
    dryRun?: boolean;
  },
): Promise<SemanticRecallResult> {
  if (expectedKeys.length === 0) {
    return { score: 1.0, matched: [], missed: [], judgments: [] };
  }

  const allOutput = sessions.map((s) => s.output).join("\n");
  // Truncate output to ~8K chars for cost efficiency
  const outputExcerpt = allOutput.slice(0, 8000);

  // Check cache
  const cacheDir = options?.cacheDir;
  const runId = options?.runId;
  if (cacheDir && runId) {
    const cachePath = join(cacheDir, runId, "semantic-judgments.json");
    if (existsSync(cachePath)) {
      const cached: SemanticJudgment[] = JSON.parse(readFileSync(cachePath, "utf-8"));
      return assembleResult(cached, expectedKeys);
    }
  }

  // Budget guard
  const estTokens = Math.ceil(allOutput.length / 4);
  const estCost = estimateSemanticCost(expectedKeys.length, estTokens);
  if (estCost > 1.0) {
    console.warn(
      `[semantic-scorer] Estimated cost $${estCost.toFixed(2)} exceeds $1.00 budget guard. ` +
      `Skipping semantic scoring. Set BENCH_SEMANTIC_BUDGET_LIMIT to override.`,
    );
    return { score: 0, matched: [], missed: expectedKeys, judgments: [] };
  }

  if (options?.dryRun) {
    console.log(`[semantic-scorer] Dry run: would score ${expectedKeys.length} keys, est. $${estCost.toFixed(4)}`);
    return { score: 0, matched: [], missed: expectedKeys, judgments: [] };
  }

  // Call LLM for each key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[semantic-scorer] OPENAI_API_KEY not set. Skipping semantic scoring.");
    return { score: 0, matched: [], missed: expectedKeys, judgments: [] };
  }

  const judgments: SemanticJudgment[] = [];

  for (const key of expectedKeys) {
    const judgment = await judgeKey(apiKey, key, outputExcerpt);
    judgments.push(judgment);
  }

  // Cache results
  if (cacheDir && runId) {
    const cacheRunDir = join(cacheDir, runId);
    mkdirSync(cacheRunDir, { recursive: true });
    writeFileSync(join(cacheRunDir, "semantic-judgments.json"), JSON.stringify(judgments, null, 2));
  }

  return assembleResult(judgments, expectedKeys);
}

/**
 * Compute scorer agreement between substring and semantic results.
 */
export function computeScorerAgreement(
  substringResult: { matched: string[]; missed: string[] },
  semanticResult: SemanticRecallResult,
  expectedKeys: string[],
): ScorerAgreement {
  const substringSet = new Set(substringResult.matched);
  const semanticSet = new Set(semanticResult.matched);

  let agreeing = 0;
  const disagreements: ScorerAgreement["disagreements"] = [];

  for (const key of expectedKeys) {
    const sub = substringSet.has(key);
    const sem = semanticSet.has(key);
    if (sub === sem) {
      agreeing++;
    } else {
      disagreements.push({ key, substring: sub, semantic: sem });
    }
  }

  return {
    totalKeys: expectedKeys.length,
    substringMatched: substringResult.matched.length,
    semanticMatched: semanticResult.matched.length,
    agreeing,
    agreementRate: expectedKeys.length > 0 ? agreeing / expectedKeys.length : 1.0,
    disagreements,
  };
}

// ---------- Internal ----------

function assembleResult(judgments: SemanticJudgment[], expectedKeys: string[]): SemanticRecallResult {
  const matched: string[] = [];
  const missed: string[] = [];

  for (const j of judgments) {
    if (j.verdict === "YES") matched.push(j.key);
    else missed.push(j.key);
  }

  // Include keys not judged (cache miss) as missed
  const judgedKeys = new Set(judgments.map((j) => j.key));
  for (const key of expectedKeys) {
    if (!judgedKeys.has(key)) missed.push(key);
  }

  return {
    score: expectedKeys.length > 0 ? matched.length / expectedKeys.length : 1.0,
    matched,
    missed,
    judgments,
  };
}

async function judgeKey(apiKey: string, key: string, outputExcerpt: string): Promise<SemanticJudgment> {
  const prompt = `You are a benchmark scorer. Determine whether the following agent output contains the concept represented by the key "${key}".

The key may appear verbatim, paraphrased, or referenced indirectly. Score YES if the concept is present in any form. Score NO only if the concept is genuinely absent.

Agent output (excerpt):
---
${outputExcerpt.slice(0, 4000)}
---

Respond with exactly one line in this format:
VERDICT: YES|NO — <one-sentence justification>`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[semantic-scorer] API error for key "${key}": ${response.status} ${text.slice(0, 200)}`);
      return { key, verdict: "NO", justification: `API error: ${response.status}` };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const match = content.match(/VERDICT:\s*(YES|NO)\s*[—-]\s*(.*)/i);

    if (match) {
      return {
        key,
        verdict: match[1].toUpperCase() as "YES" | "NO",
        justification: match[2].trim(),
      };
    }

    // Fallback: check if content contains YES or NO
    const hasYes = content.toUpperCase().includes("YES");
    return {
      key,
      verdict: hasYes ? "YES" : "NO",
      justification: content.slice(0, 200),
    };
  } catch (err) {
    console.warn(`[semantic-scorer] Error for key "${key}":`, err);
    return { key, verdict: "NO", justification: `Error: ${String(err)}` };
  }
}
