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

/**
 * Seed a MemoryCrux tenant with the fixture corpus and constraints.
 * Called once per treatment arm before running sessions.
 */
export async function seedCorpus(
  proxy: McProxy,
  fixture: ProjectFixture,
  phaseFilter?: number,
): Promise<SeedResult> {
  const start = performance.now();

  let documentsSeeded = 0;
  let documentsFailed = 0;
  let constraintsSeeded = 0;
  let constraintsFailed = 0;

  // Seed documents (optionally filtered by phase)
  const docs = phaseFilter != null
    ? fixture.corpus.filter((d) => {
        if (d.phase == null) return true; // always include phase-less docs
        if (typeof d.phase === "number") return d.phase <= phaseFilter;
        return true; // string phases like "before-phase-1"
      })
    : fixture.corpus;

  for (const doc of docs) {
    const ok = await proxy.seedDocument({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      domain: doc.domain,
      metadata: doc.metadata,
    });
    if (ok) documentsSeeded++;
    else documentsFailed++;
  }

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

  for (const c of constraints) {
    const ok = await proxy.seedConstraint({
      id: c.id,
      assertion: c.assertion,
      severity: c.severity,
      scope: c.scope,
      resource: c.resource,
      actionClass: c.actionClass,
    });
    if (ok) constraintsSeeded++;
    else constraintsFailed++;
  }

  const durationMs = Math.round(performance.now() - start);

  return { documentsSeeded, documentsFailed, constraintsSeeded, constraintsFailed, durationMs };
}
