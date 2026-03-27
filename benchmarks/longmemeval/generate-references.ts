#!/usr/bin/env tsx
// Generate reference JSON for evaluate_qa.py from the LongMemEval dataset.
//
// Usage: npx tsx generate-references.ts --dataset s
//        npx tsx generate-references.ts --dataset m

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadDataset } from "./lib/dataset-loader.js";
import type { LmeDataset } from "./lib/types.js";

const args = process.argv.slice(2);
const dsIdx = args.indexOf("--dataset");
const dataset = (dsIdx >= 0 ? args[dsIdx + 1] : "s") as LmeDataset;

if (dataset !== "s" && dataset !== "m") {
  console.error("--dataset must be 's' or 'm'");
  process.exit(1);
}

console.log(`Loading LongMemEval_${dataset.toUpperCase()}...`);
const problems = loadDataset(dataset);

const references = problems.map((p) => ({
  question_id: p.problemId,
  question: p.question,
  answer: p.answer,
  question_type: p.questionType,
}));

const outDir = resolve(import.meta.dirname ?? ".", "references");
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, `longmemeval_${dataset}_references.json`);
writeFileSync(outPath, JSON.stringify(references, null, 2), "utf-8");
console.log(`Wrote ${references.length} references to ${outPath}`);
