/**
 * Phase 7: CoreCrux projection client — queries entity projections via HTTP.
 * Replaces Postgres materialised views with GPU-resident in-memory BTreeMaps.
 */

const CORECRUX_URL = process.env.CORECRUX_BASE_URL ?? "http://100.111.227.102:4006";
const CORECRUX_JWT = process.env.CORECRUX_JWT ?? "";

interface ProjectionResult {
  type: "count" | "timeline" | "current_state" | "none";
  answer: string;
  confidence: number;
  items: Array<{ name: string; date: string | null; value: string }>;
  method: string;
}

async function corecruxGet(path: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`${CORECRUX_URL}${path}`, {
    headers: {
      ...(CORECRUX_JWT ? { Authorization: `Bearer ${CORECRUX_JWT}` } : {}),
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) return {};
  return await resp.json() as Record<string, unknown>;
}

export async function corecruxCount(
  tenantId: string,
  entityType: string,
  predicate: string,
): Promise<ProjectionResult> {
  const data = await corecruxGet(
    `/v1/projections/entity/count?tenant_id=${encodeURIComponent(tenantId)}&entity_type=${encodeURIComponent(entityType)}&predicate=${encodeURIComponent(predicate)}`,
  );

  const count = data.count as number ?? 0;
  const items = (data.items as string[] ?? []).map(name => ({ name, date: null, value: "" }));

  if (count === 0) return { type: "none", answer: "", confidence: 0, items: [], method: "corecrux_count_empty" };

  return {
    type: "count",
    answer: `From CoreCrux projection: ${count} items found: ${items.map(i => i.name).join(", ")}`,
    confidence: count >= 4 ? 0.9 : count >= 2 ? 0.8 : 0.6,
    items,
    method: `corecrux_count(${count})`,
  };
}

export async function corecruxTimeline(
  tenantId: string,
  entityType: string,
  predicate: string,
): Promise<ProjectionResult> {
  const data = await corecruxGet(
    `/v1/projections/entity/timeline?tenant_id=${encodeURIComponent(tenantId)}&entity_type=${encodeURIComponent(entityType)}&predicate=${encodeURIComponent(predicate)}`,
  );

  const events = (data.timeline as Array<{ entity_name: string; object_value: string; occurred_at: string }>) ?? [];
  if (events.length < 2) return { type: "none", answer: "", confidence: 0, items: [], method: "corecrux_timeline_insufficient" };

  const timeline = events.map(e => `${e.entity_name} (${e.occurred_at?.slice(0, 10) ?? "?"})`).join(" → ");
  const items = events.map(e => ({ name: e.entity_name, date: e.occurred_at?.slice(0, 10) ?? null, value: e.object_value }));

  return {
    type: "timeline",
    answer: `From CoreCrux timeline: ${timeline}`,
    confidence: events.length >= 3 ? 0.9 : 0.7,
    items,
    method: `corecrux_timeline(${events.length})`,
  };
}

export async function corecruxCurrentState(
  tenantId: string,
  entityName: string,
  predicate: string,
): Promise<ProjectionResult> {
  const data = await corecruxGet(
    `/v1/projections/entity/current-state?tenant_id=${encodeURIComponent(tenantId)}&entity_name=${encodeURIComponent(entityName)}&predicate=${encodeURIComponent(predicate)}`,
  );

  if (data.not_found) return { type: "none", answer: "", confidence: 0, items: [], method: "corecrux_state_not_found" };

  const currentValue = data.current_value as string;
  const occurredAt = data.occurred_at as string | null;
  const previousValue = data.previous_value as string | null;

  return {
    type: "current_state",
    answer: `From CoreCrux state: ${entityName} ${predicate} = ${currentValue} (as of ${occurredAt?.slice(0, 10) ?? "unknown"})${previousValue ? ` [previously: ${previousValue}]` : ""}`,
    confidence: occurredAt ? 0.85 : 0.6,
    items: [{ name: entityName, date: occurredAt?.slice(0, 10) ?? null, value: currentValue }],
    method: `corecrux_state(${previousValue ? "with_history" : "single"})`,
  };
}

export type { ProjectionResult };
