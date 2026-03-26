// MemoryCrux Benchmark — Fixture validation

import type { CorpusDocument, FixtureConstraint, ProjectFixture, ScenarioPhase, KillVariant } from "../../lib/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

function validateDocument(doc: CorpusDocument, index: number): string[] {
  const errors: string[] = [];
  if (!doc.id) errors.push(`corpus[${index}]: missing id`);
  if (!doc.type) errors.push(`corpus[${index}]: missing type`);
  if (!doc.title) errors.push(`corpus[${index}]: missing title`);
  if (!doc.content) errors.push(`corpus[${index}]: missing content`);
  if (!doc.tokens || doc.tokens <= 0) errors.push(`corpus[${index}]: invalid tokens (${doc.tokens})`);
  return errors;
}

function validateConstraint(c: FixtureConstraint, index: number): string[] {
  const errors: string[] = [];
  if (!c.id) errors.push(`constraints[${index}]: missing id`);
  if (!c.assertion) errors.push(`constraints[${index}]: missing assertion`);
  if (!["critical", "high", "medium", "low"].includes(c.severity)) {
    errors.push(`constraints[${index}]: invalid severity "${c.severity}"`);
  }
  return errors;
}

function validatePhase(p: ScenarioPhase, index: number): string[] {
  const errors: string[] = [];
  if (p.index == null) errors.push(`phases[${index}]: missing index`);
  if (!p.name) errors.push(`phases[${index}]: missing name`);
  if (!p.taskPrompt) errors.push(`phases[${index}]: missing taskPrompt`);
  return errors;
}

export function validateFixture(fixture: ProjectFixture): string[] {
  const errors: string[] = [];
  if (!fixture.project) errors.push("missing project");
  if (!fixture.version) errors.push("missing version");
  if (!fixture.corpus?.length) errors.push("empty corpus");
  if (!fixture.phases?.length) errors.push("empty phases");

  fixture.corpus?.forEach((doc, i) => errors.push(...validateDocument(doc, i)));
  fixture.constraints?.forEach((c, i) => errors.push(...validateConstraint(c, i)));
  fixture.phases?.forEach((p, i) => errors.push(...validatePhase(p, i)));

  // Check that phase references to documents exist
  const docIds = new Set(fixture.corpus?.map((d) => d.id) ?? []);
  const constraintIds = new Set(fixture.constraints?.map((c) => c.id) ?? []);

  for (const phase of fixture.phases ?? []) {
    for (const docId of phase.newDocuments ?? []) {
      if (!docIds.has(docId)) errors.push(`phase "${phase.name}" references unknown document: ${docId}`);
    }
    for (const cId of phase.newConstraints ?? []) {
      if (!constraintIds.has(cId)) errors.push(`phase "${phase.name}" references unknown constraint: ${cId}`);
    }
  }

  return errors;
}

export function loadFixture(fixtureDir: string): ProjectFixture {
  const corpusPath = resolve(fixtureDir, "corpus.json");
  const scenarioPath = resolve(fixtureDir, "scenario.json");

  const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));

  const fixture: ProjectFixture = {
    ...scenario,
    corpus: corpus.documents ?? corpus,
    constraints: corpus.constraints ?? scenario.constraints ?? [],
  };

  const errors = validateFixture(fixture);
  if (errors.length > 0) {
    throw new Error(`Fixture validation failed for ${fixtureDir}:\n  ${errors.join("\n  ")}`);
  }

  return fixture;
}

export function countCorpusTokens(corpus: CorpusDocument[]): number {
  return corpus.reduce((sum, doc) => sum + doc.tokens, 0);
}
