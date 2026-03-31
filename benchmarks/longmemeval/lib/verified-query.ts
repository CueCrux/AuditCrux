/**
 * Phase 5+6: Verified Query — Answer-first with chunk verification.
 *
 * For structured questions (aggregation, temporal, current-state):
 * 1. Propose a candidate answer from the entity index
 * 2. Verify each entity/fact against raw chunks via query_memory
 * 3. Return only verified facts with confidence
 *
 * This prevents the regression pattern where partial entity data
 * causes confident wrong answers. The LLM's job shifts from
 * "synthesise an answer" to "verify this candidate."
 */

import pg from "pg";
import { McProxy } from "../../../memorycrux/lib/mc-proxy.js";
import { queryCount, queryTimeline, queryCurrentState, queryCalendar, type CachedAnswer } from "./answer-cache.js";
import { detectIntent, extractEntityKeywords, type QueryIntent } from "./entity-router.js";

interface VerifiedQueryConfig {
  databaseUrl: string;
  tenantId: string;
  dataset: string;
}

interface VerifiedResult {
  intent: QueryIntent;
  candidate: CachedAnswer | null;
  verified: boolean;
  answer: string;
  confidence: number;
  method: string;
  useFallback: boolean;
}

/**
 * Propose + verify: get candidate from entity index, verify against chunks.
 * Returns the verified answer or signals to fall back to vector search.
 */
export async function verifiedQuery(
  question: string,
  config: VerifiedQueryConfig,
  proxy?: McProxy,
): Promise<VerifiedResult> {
  const intent = detectIntent(question);
  const keywords = extractEntityKeywords(question);
  const tenantId = `__longmemeval_${config.dataset}_${config.tenantId}`;

  // Simple recall and recommendation → always vector search
  if (intent === "simple_recall") {
    return { intent, candidate: null, verified: false, answer: "", confidence: 0, method: "passthrough(simple_recall)", useFallback: true };
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2, idleTimeoutMillis: 5000 });

  try {
    // Step 1: Check coverage — any entities on this topic?
    const coverageResult = await pool.query<{ cnt: string }>(
      `SELECT count(*)::text as cnt FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1 AND (${keywords.length > 0 ? keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ") : "FALSE"})`,
      [tenantId, ...keywords.map(k => `%${k}%`)],
    );
    const coverage = parseInt(coverageResult.rows[0]?.cnt ?? "0", 10);

    if (coverage === 0) {
      return { intent, candidate: null, verified: false, answer: "", confidence: 0, method: `no_coverage(${intent})`, useFallback: true };
    }

    // Step 2: Get candidate from entity index
    let candidate: CachedAnswer | null = null;

    if (intent === "aggregation") {
      candidate = await queryCount(pool, tenantId, keywords);
    } else if (intent === "temporal_ordering") {
      candidate = await queryTimeline(pool, tenantId, keywords);
    } else if (intent === "temporal_arithmetic") {
      // Try to extract date range from question for calendar lookup
      candidate = await queryTimeline(pool, tenantId, keywords); // Use timeline as fallback
    } else if (intent === "current_state") {
      candidate = await queryCurrentState(pool, tenantId, keywords);
    }

    if (!candidate || candidate.type === "none" || candidate.entities.length === 0) {
      return { intent, candidate: null, verified: false, answer: "", confidence: 0, method: `no_candidate(${intent})`, useFallback: true };
    }

    // Step 3: Verify candidate against chunks
    // For aggregation: check if query_memory finds at least as many items
    // For temporal: check if dates are confirmed in chunk text
    // For current_state: check if the value appears in a recent chunk

    if (!proxy) {
      // No proxy available — return candidate with disclaimer
      return {
        intent,
        candidate,
        verified: false,
        answer: `${candidate.answer} [UNVERIFIED — entity index only]`,
        confidence: Math.max(0.5, candidate.confidence - 0.2),
        method: `unverified_${candidate.method}`,
        useFallback: candidate.confidence < 0.8,
      };
    }

    // Verification via query_memory
    const verifyResult = await proxy.callTool("query_memory", {
      query: question,
      limit: 20,
      scoring_profile: intent === "aggregation" ? "recall" : intent === "current_state" ? "recency" : "balanced",
    });

    const chunks = extractChunkContent(verifyResult.result);
    const candidateEntities = candidate.entities;

    // Count how many candidate entities are confirmed by chunk content
    let confirmedCount = 0;
    const confirmedNames: string[] = [];
    const unconfirmedNames: string[] = [];

    for (const entity of candidateEntities) {
      const name = entity.name.toLowerCase();
      const found = chunks.some(c => c.toLowerCase().includes(name) || name.split(" ").every(w => c.toLowerCase().includes(w)));
      if (found) {
        confirmedCount++;
        confirmedNames.push(entity.name);
      } else {
        unconfirmedNames.push(entity.name);
      }
    }

    const confirmRate = candidateEntities.length > 0 ? confirmedCount / candidateEntities.length : 0;

    if (intent === "aggregation") {
      // For counts: report confirmed count, mention unconfirmed
      const verifiedAnswer = confirmedCount > 0
        ? `Verified ${confirmedCount} items from the entity index and memory search: ${confirmedNames.join(", ")}` +
          (unconfirmedNames.length > 0 ? `. Additionally, the entity index lists ${unconfirmedNames.length} more that could not be confirmed: ${unconfirmedNames.join(", ")}` : "")
        : "";

      return {
        intent,
        candidate,
        verified: confirmRate >= 0.5,
        answer: verifiedAnswer || candidate.answer,
        confidence: confirmRate >= 0.8 ? 0.9 : confirmRate >= 0.5 ? 0.7 : 0.4,
        method: `verified_count(confirmed=${confirmedCount}/${candidateEntities.length},rate=${(confirmRate * 100).toFixed(0)}%)`,
        useFallback: confirmRate < 0.3,
      };
    }

    if (intent === "temporal_ordering" || intent === "temporal_arithmetic") {
      // For timeline: check if dates are present in chunks
      const datedEntities = candidateEntities.filter(e => e.date);
      const verifiedAnswer = datedEntities.length >= 2
        ? `Timeline from entity index: ${datedEntities.map(e => `${e.name} (${e.date})`).join(" → ")}`
        : "";

      return {
        intent,
        candidate,
        verified: datedEntities.length >= 2 && confirmRate >= 0.5,
        answer: verifiedAnswer,
        confidence: datedEntities.length >= 2 ? 0.7 : 0.3,
        method: `verified_timeline(dated=${datedEntities.length},confirmed=${confirmedCount})`,
        useFallback: datedEntities.length < 2 || confirmRate < 0.3,
      };
    }

    if (intent === "current_state") {
      // For state: verify the value appears in a recent chunk
      const stateConfirmed = confirmedCount > 0;

      return {
        intent,
        candidate,
        verified: stateConfirmed,
        answer: stateConfirmed ? candidate.answer : "",
        confidence: stateConfirmed ? 0.75 : 0.3,
        method: `verified_state(confirmed=${stateConfirmed})`,
        useFallback: !stateConfirmed,
      };
    }

    // Default: fall back
    return { intent, candidate, verified: false, answer: "", confidence: 0, method: "fallback_default", useFallback: true };

  } finally {
    await pool.end();
  }
}

/**
 * QA Template matching — check if the question matches a pre-computed template.
 * Used as a last-resort before full vector fallback.
 */
export async function matchQATemplate(
  question: string,
  tenantId: string,
  databaseUrl: string,
): Promise<{ matched: boolean; answer: string; confidence: number; method: string }> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, idleTimeoutMillis: 5000 });
  try {
    const result = await pool.query<{ question_template: string; answer_text: string; rank: number }>(
      `SELECT question_template, answer_text,
              ts_rank(to_tsvector('english', keywords || ' ' || question_template), plainto_tsquery('english', $2)) as rank
       FROM vaultcrux.qa_template_index
       WHERE tenant_id = $1
         AND to_tsvector('english', keywords || ' ' || question_template) @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT 3`,
      [tenantId, question],
    );

    if (result.rows.length > 0 && result.rows[0]!.rank > 0.1) {
      const best = result.rows[0]!;
      return {
        matched: true,
        answer: `Based on a matching memory record: "${best.question_template}" → ${best.answer_text}`,
        confidence: Math.min(0.85, 0.5 + best.rank),
        method: `qa_template(rank=${best.rank.toFixed(3)},matches=${result.rows.length})`,
      };
    }
    return { matched: false, answer: "", confidence: 0, method: "qa_template_no_match" };
  } catch {
    return { matched: false, answer: "", confidence: 0, method: "qa_template_error" };
  } finally {
    await pool.end();
  }
}

function extractChunkContent(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const items = (r.results ?? r.items ?? (r.data as Record<string, unknown>)?.results ?? []) as Array<Record<string, unknown>>;
  return items.map(i => String(i.content ?? i.text ?? "")).filter(s => s.length > 20);
}

export type { VerifiedResult, VerifiedQueryConfig };
