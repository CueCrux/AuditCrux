// LongMemEval External Benchmark — Session Ingestion Adapter
//
// Ingests LongMemEval sessions into VaultCrux as memory records.
// Each session becomes one memory record via POST /v1/memory/imports.
// Uses session-level ingestion (not turn-level) per Supermemory's finding.

import { McProxy } from "../../memorycrux/lib/mc-proxy.js";
import type { LmeProblem, LmeSession } from "./types.js";

interface IngestConfig {
  concurrency: number; // Max parallel requests (default: 5)
  retries: number; // Max retries per document (default: 5)
  retryBaseMs: number; // Base retry delay in ms (default: 2000)
  cooldownMs: number; // Delay after all docs seeded (default: 30000)
}

const DEFAULT_INGEST_CONFIG: IngestConfig = {
  concurrency: 5,
  retries: 5,
  retryBaseMs: 2000,
  cooldownMs: 30_000,
};

interface IngestResult {
  totalSessions: number;
  seeded: number;
  failed: number;
  durationMs: number;
  problemId: string;
}

/**
 * Parse a LongMemEval date string like "2023/05/20 (Sat) 02:21" into ISO 8601.
 * Falls back to current time if parsing fails.
 */
function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  // Strip the day-of-week part: "2023/05/20 (Sat) 02:21" → "2023/05/20 02:21"
  const cleaned = dateStr.replace(/\s*\([^)]+\)\s*/, " ").trim();
  // Convert "2023/05/20 02:21" → "2023-05-20T02:21:00Z"
  const [datePart, timePart] = cleaned.split(" ");
  const isoDate = datePart.replace(/\//g, "-");
  const isoTime = timePart ? `${timePart}:00` : "00:00:00";
  const iso = `${isoDate}T${isoTime}Z`;
  // Validate
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/**
 * Flatten a session's turns into a single text document for ingestion.
 * Format: "User: ...\nAssistant: ...\n" — preserves turn structure for retrieval.
 */
function flattenSession(session: LmeSession): string {
  return session.turns
    .map((t) => {
      const speaker = t.role === "user" ? "User" : t.role === "assistant" ? "Assistant" : "System";
      return `${speaker}: ${t.content}`;
    })
    .join("\n\n");
}

/**
 * Ingest all sessions for a problem into VaultCrux.
 */
export async function ingestProblem(
  proxy: McProxy,
  problem: LmeProblem,
  config: Partial<IngestConfig> = {},
): Promise<IngestResult> {
  const cfg = { ...DEFAULT_INGEST_CONFIG, ...config };
  const start = performance.now();
  let seeded = 0;
  let failed = 0;

  // Process in batches with concurrency limit
  const queue = [...problem.sessions];
  const inFlight: Promise<void>[] = [];

  for (const session of queue) {
    const task = ingestSession(proxy, problem, session, cfg)
      .then(() => { seeded++; })
      .catch((err) => {
        console.error(`  [ingest] FAIL ${session.sessionId}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      });

    inFlight.push(task);

    if (inFlight.length >= cfg.concurrency) {
      await Promise.race(inFlight);
      // Remove resolved promises
      for (let i = inFlight.length - 1; i >= 0; i--) {
        const resolved = await Promise.race([
          inFlight[i].then(() => true),
          Promise.resolve(false),
        ]);
        if (resolved) inFlight.splice(i, 1);
      }
    }
  }

  // Wait for remaining
  await Promise.allSettled(inFlight);

  const durationMs = Math.round(performance.now() - start);
  return { totalSessions: problem.sessions.length, seeded, failed, durationMs, problemId: problem.problemId };
}

async function ingestSession(
  proxy: McProxy,
  problem: LmeProblem,
  session: LmeSession,
  config: IngestConfig,
): Promise<void> {
  const content = flattenSession(session);
  if (content.trim().length === 0) return; // Skip empty sessions

  const timestamp = parseDate(session.date);

  for (let attempt = 0; attempt < config.retries; attempt++) {
    try {
      await proxy.seedDocument({
        id: `${problem.problemId}_${session.sessionId}`,
        title: `Session ${session.sessionId}`,
        content,
        domain: "longmemeval",
        metadata: {
          benchmark: "longmemeval",
          problemId: problem.problemId,
          sessionId: session.sessionId,
          sessionDate: session.date,
          timestampSource: timestamp,
          turnCount: session.turns.length,
        },
      });
      return;
    } catch (err) {
      if (attempt < config.retries - 1) {
        const delay = config.retryBaseMs * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Wait for embeddings to be processed after ingestion.
 * Duration scales with session count.
 */
export async function waitForEmbeddings(
  sessionCount: number,
  baseCooldownMs = 30_000,
): Promise<void> {
  // Scale cooldown: 30s base + 0.5s per session (embedding processing time)
  const cooldown = baseCooldownMs + Math.min(sessionCount * 500, 120_000);
  console.log(`  [ingest] Waiting ${(cooldown / 1000).toFixed(0)}s for ${sessionCount} embeddings...`);
  await new Promise((r) => setTimeout(r, cooldown));
}

/**
 * Verify ingestion by querying VaultCrux for a sample.
 */
export async function verifyIngestion(
  proxy: McProxy,
  sampleQuery: string,
): Promise<boolean> {
  const result = await proxy.callTool("query_memory", { query: sampleQuery, limit: 3 });
  if (!result.success) {
    console.error(`  [ingest] Verification failed: ${result.error}`);
    return false;
  }
  const data = result.result as { results?: unknown[]; items?: unknown[] } | null;
  const count = data?.results?.length ?? data?.items?.length ?? 0;
  console.log(`  [ingest] Verification: query_memory returned ${count} items`);
  return count > 0;
}

export { parseDate, flattenSession };
