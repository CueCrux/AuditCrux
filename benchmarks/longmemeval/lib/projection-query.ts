/**
 * Phase 6: Projection-based queries — reads from materialised projection tables
 * instead of ad-hoc SQL against the raw entity_session_index.
 *
 * Key differences from answer-cache.ts:
 * - Queries materialised projections (pre-computed, validated)
 * - Uses entity_type indexing (not keyword ILIKE matching)
 * - Count projection has deduplicated items
 * - Timeline projection has pre-sorted events
 * - Current-state projection has version history
 */

import pg from "pg";

interface ProjectionResult {
  type: "count" | "timeline" | "current_state" | "none";
  answer: string;
  confidence: number;
  items: Array<{ name: string; date: string | null; value: string }>;
  method: string;
}

/**
 * Count projection: "How many X did I Y?"
 * Reads from entity_count_projection — pre-computed, deduplicated counts.
 */
export async function projectionCount(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<ProjectionResult> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_count_no_kw" };

  // Search by entity_type OR predicate OR items content
  const conditions = keywords.map((_, i) =>
    `(entity_type ILIKE $${i + 2} OR predicate ILIKE $${i + 2} OR items::text ILIKE $${i + 2})`
  ).join(" OR ");

  const result = await pool.query<{ entity_type: string; predicate: string; item_count: number; items: string }>(
    `SELECT entity_type, predicate, item_count, items::text
     FROM vaultcrux.entity_count_projection
     WHERE tenant_id = $1 AND (${conditions})
     ORDER BY item_count DESC
     LIMIT 5`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_count_empty" };

  // Merge all matching projections
  const allItems = new Map<string, { name: string; date: string | null; value: string }>();
  for (const row of result.rows) {
    try {
      const items = JSON.parse(row.items) as Array<{ name: string; date: string | null; value: string }>;
      for (const item of items) {
        if (item.name && !allItems.has(item.name)) {
          allItems.set(item.name, item);
        }
      }
    } catch { /* skip parse errors */ }
  }

  const items = [...allItems.values()];
  if (items.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_count_no_items" };

  const names = items.map(i => i.name).join(", ");

  return {
    type: "count",
    answer: `From materialised projection: ${items.length} items found: ${names}`,
    confidence: items.length >= 4 ? 0.9 : items.length >= 2 ? 0.8 : 0.6,
    items,
    method: `proj_count(${items.length}_items,${result.rows.length}_projections)`,
  };
}

/**
 * Timeline projection: "What order did I X?"
 * Reads from entity_timeline_projection — pre-sorted events.
 */
export async function projectionTimeline(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<ProjectionResult> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_tl_no_kw" };

  const conditions = keywords.map((_, i) =>
    `(entity_type ILIKE $${i + 2} OR predicate ILIKE $${i + 2} OR timeline::text ILIKE $${i + 2})`
  ).join(" OR ");

  const result = await pool.query<{ entity_type: string; predicate: string; timeline: string; event_count: number }>(
    `SELECT entity_type, predicate, timeline::text, event_count
     FROM vaultcrux.entity_timeline_projection
     WHERE tenant_id = $1 AND (${conditions})
     ORDER BY event_count DESC
     LIMIT 3`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_tl_empty" };

  // Merge timelines and sort by date
  const allEvents = new Map<string, { name: string; date: string | null; value: string }>();
  for (const row of result.rows) {
    try {
      const events = JSON.parse(row.timeline) as Array<{ name: string; date: string | null; value: string }>;
      for (const e of events) {
        if (e.name && e.date && !allEvents.has(e.name)) {
          allEvents.set(e.name, e);
        }
      }
    } catch { /* skip */ }
  }

  const sorted = [...allEvents.values()].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  if (sorted.length < 2) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_tl_insufficient" };

  const timeline = sorted.map(e => `${e.name} (${e.date?.slice(0, 10) ?? "?"})`).join(" → ");

  return {
    type: "timeline",
    answer: `From materialised timeline: ${timeline}`,
    confidence: sorted.length >= 3 ? 0.9 : 0.7,
    items: sorted,
    method: `proj_timeline(${sorted.length}_events)`,
  };
}

/**
 * Current-state projection: "What is my current X?"
 * Reads from entity_current_state_projection — latest value per attribute.
 */
export async function projectionCurrentState(
  pool: pg.Pool,
  tenantId: string,
  keywords: string[],
): Promise<ProjectionResult> {
  if (keywords.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_state_no_kw" };

  const conditions = keywords.map((_, i) =>
    `(entity_name ILIKE $${i + 2} OR predicate ILIKE $${i + 2} OR current_value ILIKE $${i + 2})`
  ).join(" OR ");

  const result = await pool.query<{ entity_name: string; predicate: string; current_value: string; occurred_at: string | null; previous_value: string | null }>(
    `SELECT entity_name, predicate, current_value, occurred_at::text, previous_value
     FROM vaultcrux.entity_current_state_projection
     WHERE tenant_id = $1 AND (${conditions})
     ORDER BY occurred_at DESC NULLS LAST
     LIMIT 10`,
    [tenantId, ...keywords.map(k => `%${k}%`)],
  );

  if (result.rows.length === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "proj_state_empty" };

  const facts = result.rows.map(r => `${r.entity_name}: ${r.predicate} = ${r.current_value} (as of ${r.occurred_at?.slice(0, 10) ?? "unknown"})`);
  const items = result.rows.map(r => ({ name: r.entity_name, date: r.occurred_at?.slice(0, 10) ?? null, value: r.current_value }));

  return {
    type: "current_state",
    answer: `From materialised state: ${facts.join("; ")}`,
    confidence: result.rows.some(r => r.occurred_at) ? 0.85 : 0.6,
    items,
    method: `proj_state(${result.rows.length}_facts)`,
  };
}

export type { ProjectionResult };
