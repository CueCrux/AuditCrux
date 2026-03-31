/**
 * Phase 4 M4: Tiered query router with bidirectional entity matrix.
 *
 * Classifies question intent and routes to the appropriate backend:
 * - Tier 1: Entity index only (COUNT, TIMELINE, CURRENT_STATE) — cheapest
 * - Tier 2: Entity index + session verification — medium
 * - Tier 3: VaultCrux vector search + entity merge — fallback
 */

import pg from "pg";
import { queryCount, queryTimeline, queryCurrentState, queryCalendar, queryNegative, type CachedAnswer } from "./answer-cache.js";

interface EntityRouterConfig {
  databaseUrl: string;
  tenantId: string;
  dataset: string;
}

interface RouterResult {
  tier: 1 | 2 | 3;
  answer: string | null;
  confidence: number;
  entities: EntityRow[];
  sessionCount: number;
  method: string;
}

interface EntityRow {
  entity_type: string;
  entity_name: string;
  predicate: string;
  object_value: string;
  occurred_at: string | null;
  session_id: string;
}

type QueryIntent = "aggregation" | "temporal_ordering" | "current_state" | "temporal_arithmetic" | "simple_recall";

// ── Intent Detection ──

const AGGREGATION_PATTERNS = [
  /how many\b/i, /how much\b/i, /\btotal\b/i, /\bcombined\b/i,
  /\ball the\b/i, /\bin total\b/i, /\bcount\b/i,
];
const TEMPORAL_ORDER_PATTERNS = [
  /\bwhat order\b/i, /\bwhich (came|happened) first\b/i,
  /\bfrom earliest\b/i, /\bfrom latest\b/i, /\border of\b/i,
  /\bbefore.*or.*after\b/i,
];
const TEMPORAL_ARITH_PATTERNS = [
  /how many (days|weeks|months|years) (ago|since|between|passed)\b/i,
  /\bwhen did\b/i, /\bhow long (ago|since)\b/i,
];
const CURRENT_STATE_PATTERNS = [
  /\bcurrent(ly)?\b/i, /\bwhat is my\b/i, /\bhow often do I (now|currently)\b/i,
  /\bwhere did .* move\b/i, /\brecent(ly)?\b/i, /\bwhat .* changed\b/i,
];

function detectIntent(question: string): QueryIntent {
  if (AGGREGATION_PATTERNS.some(p => p.test(question))) return "aggregation";
  if (TEMPORAL_ORDER_PATTERNS.some(p => p.test(question))) return "temporal_ordering";
  if (TEMPORAL_ARITH_PATTERNS.some(p => p.test(question))) return "temporal_arithmetic";
  if (CURRENT_STATE_PATTERNS.some(p => p.test(question))) return "current_state";
  return "simple_recall";
}

// ── Entity Keyword Extraction ──

function extractEntityKeywords(question: string): string[] {
  const keywords: string[] = [];
  // Extract quoted terms
  const quoted = question.match(/"([^"]+)"|'([^']+)'/g);
  if (quoted) for (const q of quoted) keywords.push(q.replace(/['"]/g, ""));
  // Extract key nouns (simple heuristic)
  const stopwords = new Set(["how", "many", "much", "what", "where", "when", "did", "do", "the", "my", "in", "on", "at", "to", "of", "a", "an", "is", "was", "were", "are", "i", "me", "have", "has", "had", "been", "being", "this", "that", "which", "who", "total", "currently", "before", "after", "since", "ago", "from", "earliest", "latest", "order", "first", "last"]);
  const words = question.replace(/[?.,!]/g, "").split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));
  keywords.push(...words);
  return [...new Set(keywords)];
}

// ── Tier 1: Entity Index Only ──

async function tier1Query(
  pool: pg.Pool,
  tenantId: string,
  intent: QueryIntent,
  question: string,
): Promise<RouterResult | null> {
  const keywords = extractEntityKeywords(question);
  const keywordPattern = keywords.map(k => `%${k}%`).join("|");

  if (intent === "aggregation") {
    // COUNT query: find all matching entities
    const result = await pool.query<EntityRow>(
      `SELECT DISTINCT entity_name, entity_type, predicate, object_value, occurred_at::text, session_id
       FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1
         AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})
       ORDER BY occurred_at ASC NULLS LAST`,
      [tenantId, ...keywords.map(k => `%${k}%`)],
    );

    if (result.rows.length >= 2) {
      // Deduplicate by entity_name
      const unique = new Map<string, EntityRow>();
      for (const row of result.rows) {
        if (!unique.has(row.entity_name)) unique.set(row.entity_name, row);
      }
      const entities = [...unique.values()];
      const names = entities.map(e => e.entity_name).join(", ");
      const count = entities.length;

      return {
        tier: 1,
        answer: `Based on the entity index, I found ${count} items: ${names}`,
        confidence: count >= 3 ? 0.8 : 0.6,
        entities: result.rows,
        sessionCount: new Set(result.rows.map(r => r.session_id)).size,
        method: "tier1_count",
      };
    }
  }

  if (intent === "temporal_ordering") {
    const result = await pool.query<EntityRow>(
      `SELECT DISTINCT entity_name, entity_type, predicate, object_value, occurred_at::text, session_id
       FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1
         AND occurred_at IS NOT NULL
         AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})
       ORDER BY occurred_at ASC`,
      [tenantId, ...keywords.map(k => `%${k}%`)],
    );

    if (result.rows.length >= 2) {
      const unique = new Map<string, EntityRow>();
      for (const row of result.rows) {
        if (!unique.has(row.entity_name)) unique.set(row.entity_name, row);
      }
      const ordered = [...unique.values()].sort((a, b) =>
        (a.occurred_at ?? "").localeCompare(b.occurred_at ?? ""));
      const timeline = ordered.map(e => `${e.entity_name} (${e.occurred_at?.slice(0, 10) ?? "unknown date"})`).join(" → ");

      return {
        tier: 1,
        answer: `Based on the entity timeline: ${timeline}`,
        confidence: ordered.every(e => e.occurred_at) ? 0.9 : 0.6,
        entities: result.rows,
        sessionCount: new Set(result.rows.map(r => r.session_id)).size,
        method: "tier1_timeline",
      };
    }
  }

  if (intent === "current_state") {
    const result = await pool.query<EntityRow>(
      `SELECT DISTINCT ON (entity_name, predicate)
         entity_name, entity_type, predicate, object_value, occurred_at::text, session_id
       FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1
         AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})
       ORDER BY entity_name, predicate, occurred_at DESC NULLS LAST`,
      [tenantId, ...keywords.map(k => `%${k}%`)],
    );

    if (result.rows.length >= 1) {
      const facts = result.rows.map(e => `${e.entity_name}: ${e.predicate} → ${e.object_value} (as of ${e.occurred_at?.slice(0, 10) ?? "unknown"})`).join("; ");

      return {
        tier: 1,
        answer: `Based on the latest entity state: ${facts}`,
        confidence: 0.7,
        entities: result.rows,
        sessionCount: new Set(result.rows.map(r => r.session_id)).size,
        method: "tier1_current_state",
      };
    }
  }

  return null; // Tier 1 can't answer — escalate
}

// ── Tier 2: Graph + Backward Session Verify ──

async function tier2Verify(
  pool: pg.Pool,
  tenantId: string,
  tier1Result: RouterResult,
  keywords: string[],
): Promise<RouterResult> {
  // Backward: count sessions that contain matching entity types
  const sessionResult = await pool.query<{ cnt: string }>(
    `SELECT count(DISTINCT session_id)::text as cnt
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1
       AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  const backwardSessionCount = parseInt(sessionResult.rows[0]?.cnt ?? "0", 10);

  // Matrix check: does forward count match backward session count?
  const forwardCount = new Set(tier1Result.entities.map(e => e.entity_name)).size;

  if (backwardSessionCount >= forwardCount) {
    // Backward confirms or exceeds forward — high confidence
    return {
      ...tier1Result,
      tier: 2,
      confidence: Math.min(0.95, tier1Result.confidence + 0.15),
      method: `${tier1Result.method}+tier2_verified(fwd=${forwardCount},bwd=${backwardSessionCount})`,
    };
  } else {
    // Backward found fewer sessions than entities — possible false positives
    return {
      ...tier1Result,
      tier: 2,
      confidence: Math.max(0.4, tier1Result.confidence - 0.2),
      method: `${tier1Result.method}+tier2_mismatch(fwd=${forwardCount},bwd=${backwardSessionCount})`,
    };
  }
}

// ── Public API ──

export async function routeQuery(
  question: string,
  config: EntityRouterConfig,
): Promise<RouterResult> {
  const intent = detectIntent(question);
  const tenantId = `__longmemeval_${config.dataset}_${config.tenantId}`;
  const keywords = extractEntityKeywords(question);

  // Simple recall → always vector search (no entity structure needed)
  // All other intents try entity index with answer-first verification
  if (intent === "simple_recall") {
    return {
      tier: 3,
      answer: null,
      confidence: 0,
      entities: [],
      sessionCount: 0,
      method: "tier3_passthrough(simple_recall)",
    };
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2, idleTimeoutMillis: 5000 });

  try {
    // Phase 5 M4: Confidence-first routing — check if we have ANY data on this topic
    const coverageCheck = await pool.query<{ cnt: string }>(
      `SELECT count(*)::text as cnt FROM vaultcrux.entity_session_index
       WHERE tenant_id = $1 AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})`,
      [tenantId, ...keywords.map(k => `%${k}%`)],
    );
    const coverage = parseInt(coverageCheck.rows[0]?.cnt ?? "0", 10);

    if (coverage === 0) {
      // No entity coverage on this topic — skip Tier 1/2, go straight to Tier 3
      return {
        tier: 3,
        answer: null,
        confidence: 0,
        entities: [],
        sessionCount: 0,
        method: `tier3_no_coverage(intent=${intent},keywords=${keywords.join(",")})`,
      };
    }

    // Phase 5 M1-M2: Try answer cache first (pre-computed/materialised answers)
    let cached: CachedAnswer | null = null;
    if (intent === "aggregation") {
      cached = await queryCount(pool, tenantId, keywords);
    } else if (intent === "temporal_ordering") {
      cached = await queryTimeline(pool, tenantId, keywords);
    } else if (intent === "current_state") {
      cached = await queryCurrentState(pool, tenantId, keywords);
    } else if (intent === "temporal_arithmetic") {
      // Try calendar lookup if we can extract a date from the question
      const dateMatch = question.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        cached = await queryCalendar(pool, tenantId, dateMatch[1]!, 3);
      }
    }

    // Phase 5 M5: Check negative knowledge
    if (!cached || cached.type === "none") {
      const negative = await queryNegative(pool, tenantId, keywords);
      if (negative.type !== "none") cached = negative;
    }

    if (cached && cached.type !== "none" && cached.confidence >= 0.85) {
      // Cache hit with HIGH confidence only — prevent partial data from causing regressions
      const sessionResult = await pool.query<{ cnt: string }>(
        `SELECT count(DISTINCT session_id)::text as cnt FROM vaultcrux.entity_session_index
         WHERE tenant_id = $1 AND (${keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ")})`,
        [tenantId, ...keywords.map(k => `%${k}%`)],
      );
      const sessionCount = parseInt(sessionResult.rows[0]?.cnt ?? "0", 10);
      const entityCount = cached.entities.length;
      const verified = sessionCount >= entityCount;

      // For counts: add completeness disclaimer if fewer than expected
      let answer = cached.answer;
      if (cached.type === "count") {
        answer += `. NOTE: This count is from the entity index and may be incomplete — verify with a broader memory search if the count seems low.`;
      }

      // For current_state: only trust if we have multiple temporal values (version history)
      if (cached.type === "current_state" && cached.entities.length === 1 && !cached.entities[0]?.date) {
        // Single value with no date — might be stale, demote to Tier 3
        return {
          tier: 3,
          answer: null,
          confidence: 0,
          entities: [],
          sessionCount: 0,
          method: `tier3_state_no_history(single_value_no_date)`,
        };
      }

      return {
        tier: verified ? 1 : 2,
        answer,
        confidence: verified ? Math.min(0.90, cached.confidence + 0.05) : Math.max(0.5, cached.confidence - 0.15),
        entities: cached.entities.map(e => ({
          entity_type: "", entity_name: e.name, predicate: e.predicate,
          object_value: e.value, occurred_at: e.date, session_id: "",
        })),
        sessionCount,
        method: `${cached.method}+${verified ? "verified" : "unverified"}(fwd=${entityCount},bwd=${sessionCount})`,
      };
    }

    // Fall back to Tier 1 live query — raised thresholds to prevent partial-data regressions
    const tier1 = await tier1Query(pool, tenantId, intent, question);

    if (tier1 && tier1.confidence >= 0.9) {
      // Very high confidence only for Tier 1 direct answer
      return tier1;
    }

    if (tier1 && tier1.confidence >= 0.7) {
      // Medium-high: verify with Tier 2 before trusting
      const verified = await tier2Verify(pool, tenantId, tier1, keywords);
      // Only return if verification raised confidence
      if (verified.confidence >= 0.8) return verified;
      // Otherwise fall through to Tier 3 with entity hints
      return {
        tier: 3,
        answer: null,
        confidence: 0,
        entities: tier1.entities,
        sessionCount: tier1.sessionCount,
        method: `tier3_with_hints(tier1_conf=${tier1.confidence},tier2_conf=${verified.confidence})`,
      };
    }

    return {
      tier: 3,
      answer: null,
      confidence: 0,
      entities: tier1?.entities ?? [],
      sessionCount: 0,
      method: `tier3_fallback(intent=${intent},tier1_conf=${tier1?.confidence ?? 0})`,
    };
  } finally {
    await pool.end();
  }
}

export { detectIntent, extractEntityKeywords };
export type { RouterResult, QueryIntent, EntityRouterConfig };
