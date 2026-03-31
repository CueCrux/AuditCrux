/**
 * Phase 5 M1-M2: Pre-computed answer cache + temporal calendar.
 *
 * Materialises answers from entity_session_index at query time (or can be
 * pre-built at ingest time for production). Includes:
 * - COUNT: how many entities match a type+predicate
 * - TIMELINE: events sorted by date
 * - CURRENT_STATE: latest value per entity+attribute
 * - CALENDAR: date → events lookup
 * - NEGATIVE: explicit negations
 */

import pg from "pg";

interface CacheConfig {
  databaseUrl: string;
  tenantId: string;
}

interface CachedAnswer {
  type: "count" | "timeline" | "current_state" | "calendar" | "negative" | "none";
  answer: string;
  confidence: number;
  entities: Array<{ name: string; predicate: string; value: string; date: string | null }>;
  method: string;
}

/**
 * COUNT query: "How many X did I Y?"
 * Searches entity index for matching type+predicate, returns deduplicated count.
 */
export async function queryCount(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<CachedAnswer> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "count_no_keywords" };

  const conditions = keywords.map((_, i) => `(entity_name ILIKE $${i + 2} OR predicate ILIKE $${i + 2} OR object_value ILIKE $${i + 2})`).join(" OR ");
  const result = await pool.query<{ entity_name: string; predicate: string; object_value: string; occurred_at: string | null; session_id: string }>(
    `SELECT DISTINCT entity_name, predicate, object_value, occurred_at::text, session_id
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1 AND (${conditions})
     ORDER BY occurred_at ASC NULLS LAST`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "count_no_results" };

  // Deduplicate by entity_name (same entity mentioned in multiple sessions = 1 item)
  const unique = new Map<string, typeof result.rows[0]>();
  for (const row of result.rows) {
    const key = `${row.entity_name}::${row.predicate}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  const entities = [...unique.values()];
  const names = entities.map(e => e.entity_name).join(", ");
  const sessions = new Set(result.rows.map(r => r.session_id)).size;

  return {
    type: "count",
    answer: `Found ${entities.length} items across ${sessions} sessions: ${names}`,
    confidence: entities.length >= 3 ? 0.85 : entities.length >= 2 ? 0.7 : 0.5,
    entities: entities.map(e => ({ name: e.entity_name, predicate: e.predicate, value: e.object_value, date: e.occurred_at?.slice(0, 10) ?? null })),
    method: `count(${entities.length}_unique,${sessions}_sessions)`,
  };
}

/**
 * TIMELINE query: "What order did I X?"
 * Returns entities sorted by occurred_at.
 */
export async function queryTimeline(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<CachedAnswer> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "timeline_no_keywords" };

  const conditions = keywords.map((_, i) => `(entity_name ILIKE $${i + 2} OR predicate ILIKE $${i + 2})`).join(" OR ");
  const result = await pool.query<{ entity_name: string; predicate: string; object_value: string; occurred_at: string | null }>(
    `SELECT DISTINCT ON (entity_name) entity_name, predicate, object_value, occurred_at::text
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1 AND occurred_at IS NOT NULL AND (${conditions})
     ORDER BY entity_name, occurred_at ASC`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length < 2) return { type: "none", answer: "", confidence: 0, entities: [], method: "timeline_insufficient" };

  const sorted = result.rows.sort((a, b) => (a.occurred_at ?? "").localeCompare(b.occurred_at ?? ""));
  const timeline = sorted.map(e => `${e.entity_name} (${e.occurred_at?.slice(0, 10) ?? "?"})`).join(" → ");

  return {
    type: "timeline",
    answer: `Timeline: ${timeline}`,
    confidence: sorted.every(e => e.occurred_at) ? 0.9 : 0.6,
    entities: sorted.map(e => ({ name: e.entity_name, predicate: e.predicate, value: e.object_value, date: e.occurred_at?.slice(0, 10) ?? null })),
    method: `timeline(${sorted.length}_events)`,
  };
}

/**
 * CURRENT_STATE query: "What is my current X?"
 * Returns latest value per entity+predicate.
 */
export async function queryCurrentState(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<CachedAnswer> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "state_no_keywords" };

  const conditions = keywords.map((_, i) => `(entity_name ILIKE $${i + 2} OR predicate ILIKE $${i + 2} OR object_value ILIKE $${i + 2})`).join(" OR ");
  const result = await pool.query<{ entity_name: string; predicate: string; object_value: string; occurred_at: string | null }>(
    `SELECT DISTINCT ON (entity_name, predicate) entity_name, predicate, object_value, occurred_at::text
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1 AND (${conditions})
     ORDER BY entity_name, predicate, occurred_at DESC NULLS LAST`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "state_no_results" };

  const facts = result.rows.map(e => `${e.entity_name}: ${e.predicate} → ${e.object_value} (as of ${e.occurred_at?.slice(0, 10) ?? "unknown"})`).join("; ");

  return {
    type: "current_state",
    answer: `Current state: ${facts}`,
    confidence: 0.75,
    entities: result.rows.map(e => ({ name: e.entity_name, predicate: e.predicate, value: e.object_value, date: e.occurred_at?.slice(0, 10) ?? null })),
    method: `current_state(${result.rows.length}_facts)`,
  };
}

/**
 * CALENDAR query: "What did I do on date X?" / "What happened N days ago?"
 * Looks up events by date.
 */
export async function queryCalendar(
  pool: pg.Pool,
  tenantId: string,
  targetDate: string, // YYYY-MM-DD
  rangeDays: number = 1,
): Promise<CachedAnswer> {
  const result = await pool.query<{ entity_name: string; predicate: string; object_value: string; occurred_at: string }>(
    `SELECT entity_name, predicate, object_value, occurred_at::text
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1
       AND occurred_at >= $2::date - ($3 || ' days')::interval
       AND occurred_at < $2::date + ($3 || ' days')::interval
     ORDER BY occurred_at ASC`,
    [tenantId, targetDate, rangeDays],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "calendar_no_events" };

  const events = result.rows.map(e => `${e.entity_name} (${e.predicate}) on ${e.occurred_at.slice(0, 10)}`).join(", ");

  return {
    type: "calendar",
    answer: `Events around ${targetDate}: ${events}`,
    confidence: 0.8,
    entities: result.rows.map(e => ({ name: e.entity_name, predicate: e.predicate, value: e.object_value, date: e.occurred_at.slice(0, 10) })),
    method: `calendar(${targetDate},±${rangeDays}d,${result.rows.length}_events)`,
  };
}

/**
 * NEGATIVE query: check for explicit negations.
 */
export async function queryNegative(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<CachedAnswer> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "negative_no_keywords" };

  const conditions = keywords.map((_, i) => `entity_name ILIKE $${i + 2}`).join(" OR ");
  const result = await pool.query<{ entity_name: string; predicate: string; object_value: string }>(
    `SELECT entity_name, predicate, object_value
     FROM vaultcrux.entity_session_index
     WHERE tenant_id = $1 AND predicate LIKE 'NOT_%' AND (${conditions})`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, entities: [], method: "negative_none_found" };

  const negations = result.rows.map(e => `${e.entity_name}: ${e.predicate.replace("NOT_", "does not ")} ${e.object_value}`).join("; ");

  return {
    type: "negative",
    answer: `Explicit negations found: ${negations}`,
    confidence: 0.85,
    entities: result.rows.map(e => ({ name: e.entity_name, predicate: e.predicate, value: e.object_value, date: null })),
    method: `negative(${result.rows.length})`,
  };
}

export type { CachedAnswer, CacheConfig };
