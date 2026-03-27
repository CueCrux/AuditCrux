// MemoryCrux Benchmark — Seeds MemoryCrux with fixture corpus before treatment runs

import type { ProjectFixture } from "./types.js";
import { McProxy } from "./mc-proxy.js";

export interface SeedResult {
  documentsSeeded: number;
  documentsFailed: number;
  constraintsSeeded: number;
  constraintsFailed: number;
  durationMs: number;
}

/** Concurrency limiter — runs up to N tasks at a time */
async function parallelLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<boolean>,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      const ok = await fn(item);
      if (ok) succeeded++;
      else failed++;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return { succeeded, failed };
}

/** Retry a function up to maxRetries times with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Seed a MemoryCrux tenant with the fixture corpus and constraints.
 * Called once per treatment arm before running sessions.
 *
 * Uses concurrent seeding (10 parallel) with retry (3 attempts) to handle
 * large corpora (3000+ docs for Delta fixture).
 */
export async function seedCorpus(
  proxy: McProxy,
  fixture: ProjectFixture,
  phaseFilter?: number,
): Promise<SeedResult> {
  const start = performance.now();

  // Seed documents (optionally filtered by phase)
  const docs = phaseFilter != null
    ? fixture.corpus.filter((d) => {
        if (d.phase == null) return true; // always include phase-less docs
        if (typeof d.phase === "number") return d.phase <= phaseFilter;
        return true; // string phases like "before-phase-1"
      })
    : fixture.corpus;

  // Lower concurrency for large corpora to avoid overwhelming rate limiter
  const CONCURRENCY = docs.length > 500 ? 5 : 10;
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2000;

  const docResult = await parallelLimit(docs, CONCURRENCY, async (doc) => {
    try {
      await withRetry(
        () => proxy.seedDocument({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          domain: doc.domain,
          metadata: doc.metadata,
        }),
        MAX_RETRIES,
        RETRY_DELAY_MS,
      );
      return true;
    } catch (err) {
      console.error(`    ${err instanceof Error ? err.message : err}`);
      return false;
    }
  });

  // Seed constraints (optionally filtered by phase)
  const constraints = phaseFilter != null
    ? fixture.constraints.filter((_, i) => {
        // For phase filtering, check which phase introduces this constraint
        for (const phase of fixture.phases) {
          if ((phase.newConstraints ?? []).includes(fixture.constraints[i].id)) {
            return phase.index <= phaseFilter;
          }
        }
        return true; // include if no phase reference
      })
    : fixture.constraints;

  const constraintResult = await parallelLimit(constraints, CONCURRENCY, async (c) => {
    try {
      await withRetry(
        () => proxy.seedConstraint({
          id: c.id,
          assertion: c.assertion,
          severity: c.severity,
          scope: c.scope,
          resource: c.resource,
          actionClass: c.actionClass,
        }),
        MAX_RETRIES,
        RETRY_DELAY_MS,
      );
      return true;
    } catch (err) {
      console.error(`    ${err instanceof Error ? err.message : err}`);
      return false;
    }
  });

  const durationMs = Math.round(performance.now() - start);

  return {
    documentsSeeded: docResult.succeeded,
    documentsFailed: docResult.failed,
    constraintsSeeded: constraintResult.succeeded,
    constraintsFailed: constraintResult.failed,
    durationMs,
  };
}
