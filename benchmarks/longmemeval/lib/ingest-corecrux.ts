// LongMemEval — CoreCrux v5 Ingest Adapter
//
// Seeds LME sessions directly into CoreCrux's append-only spine
// instead of VaultCrux Postgres. Each session becomes a knowledge event
// that gets sealed into a segment with a .ccxi companion index.
//
// Env:
//   CORECRUX_BASE_URL (default: http://100.111.227.102:4006)
//   CORECRUX_JWT (service JWT for admin:write scope)

import { randomUUID } from "node:crypto";
import type { LmeProblem, LmeSession } from "./types.js";

interface CoreCruxIngestConfig {
  baseUrl: string;
  jwt: string;
  retries: number;
  retryBaseMs: number;
}

const DEFAULT_CONFIG: CoreCruxIngestConfig = {
  baseUrl: process.env.CORECRUX_BASE_URL ?? "http://100.111.227.102:4006",
  jwt: process.env.CORECRUX_JWT ?? "",
  retries: 3,
  retryBaseMs: 1000,
};

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  const cleaned = dateStr.replace(/\s*\([^)]+\)\s*/, " ").trim();
  const [datePart, timePart] = cleaned.split(" ");
  const isoDate = datePart!.replace(/\//g, "-");
  const isoTime = timePart ? `${timePart}:00` : "00:00:00";
  const iso = `${isoDate}T${isoTime}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function flattenSession(session: LmeSession): string {
  const dateLabel = session.date.replace(/\s*\([^)]+\)\s*/, " ").trim().split(" ")[0]?.replace(/\//g, "-") ?? "unknown";
  const header = `[Date: ${dateLabel}] [Session: ${session.sessionId}]`;
  const blocks: string[] = [];
  let i = 0;
  while (i < session.turns.length) {
    const turn = session.turns[i]!;
    if (turn.role === "user") {
      let block = `User: ${turn.content}`;
      if (i + 1 < session.turns.length && session.turns[i + 1]!.role === "assistant") {
        block += `\nAssistant: ${session.turns[i + 1]!.content}`;
        i += 2;
      } else {
        i += 1;
      }
      blocks.push(block);
    } else {
      blocks.push(`${turn.role === "assistant" ? "Assistant" : "System"}: ${turn.content}`);
      i += 1;
    }
  }
  return `${header}\n\n${blocks.join("\n\n---\n\n")}`;
}

/**
 * Ingest all sessions for an LME problem into CoreCrux via /v1/admin/append.
 *
 * All sessions for a problem are batched into a single append call to the
 * same stream (tenant:problemId). This triggers a single seal + .ccxi build.
 */
export async function ingestProblemViaCorecrux(
  problem: LmeProblem,
  tenantId: string,
  config?: Partial<CoreCruxIngestConfig>,
): Promise<{ seeded: number; failed: number; durationMs: number }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const start = performance.now();

  const events = problem.sessions
    .map((session) => {
      const content = flattenSession(session);
      if (!content.trim()) return null;
      return {
        event_id: randomUUID(),
        occurred_at: parseDate(session.date),
        event_type: "knowledge.document.ingested.v1",
        content_type: "application/json",
        payload: JSON.stringify({
          id: `${problem.problemId}_${session.sessionId}`,
          title: `Session ${session.sessionId}`,
          content,
          domain: "longmemeval",
          problemId: problem.problemId,
          sessionId: session.sessionId,
        }),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (events.length === 0) {
    return { seeded: 0, failed: 0, durationMs: 0 };
  }

  for (let attempt = 0; attempt < cfg.retries; attempt++) {
    try {
      const resp = await fetch(`${cfg.baseUrl}/v1/admin/append`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.jwt}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          stream_type: "knowledge",
          stream_id: `${tenantId}:${problem.problemId}`,
          expected_next_seq: 0,
          events,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`CoreCrux append failed (${resp.status}): ${body.slice(0, 200)}`);
      }

      const durationMs = Math.round(performance.now() - start);
      return { seeded: events.length, failed: 0, durationMs };
    } catch (err) {
      if (attempt < cfg.retries - 1) {
        await new Promise((r) => setTimeout(r, cfg.retryBaseMs * Math.pow(2, attempt)));
      } else {
        console.error(`[corecrux-ingest] FAIL ${problem.problemId}: ${err instanceof Error ? err.message : String(err)}`);
        return { seeded: 0, failed: events.length, durationMs: Math.round(performance.now() - start) };
      }
    }
  }

  return { seeded: 0, failed: events.length, durationMs: Math.round(performance.now() - start) };
}

/**
 * Wait for CoreCrux to seal + build .ccxi + reload indexes.
 * Much faster than Postgres embedding pipeline — just needs seal + index load.
 */
export async function waitForCorecruxIndex(sessionCount: number): Promise<void> {
  // CoreCrux seals synchronously on append (head_max_record_bytes=0).
  // .ccxi build is also synchronous. Index reload is async (500ms delay).
  // 3s is generous.
  const waitMs = Math.max(3000, Math.min(sessionCount * 50, 10_000));
  console.log(`  [corecrux-ingest] Waiting ${(waitMs / 1000).toFixed(0)}s for seal + .ccxi index...`);
  await new Promise((r) => setTimeout(r, waitMs));
}

/**
 * Verify CoreCrux ingestion by querying text-search.
 */
export async function verifyCorecruxIngestion(
  tenantId: string,
  sampleQuery: string,
  config?: Partial<CoreCruxIngestConfig>,
): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  try {
    const resp = await fetch(`${cfg.baseUrl}/v1/query/text-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.jwt}`,
      },
      body: JSON.stringify({ tenant_id: tenantId, query: sampleQuery, limit: 3 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return false;
    const body = await resp.json() as { results?: unknown[] };
    const count = body.results?.length ?? 0;
    console.log(`  [corecrux-ingest] Verification: text-search returned ${count} results`);
    return count > 0;
  } catch {
    return false;
  }
}
