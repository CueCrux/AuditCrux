#!/usr/bin/env tsx
// Quick test: verify dataset loader works

import { loadDataset, stratifiedSample, typeCounts } from "./lib/dataset-loader.js";

console.log("Loading LongMemEval_S...");
const problems = loadDataset("s");
console.log("Loaded:", problems.length, "problems");
console.log("Type distribution:", typeCounts(problems));

// Test stratified sample (2 per type = pilot)
const pilot = stratifiedSample(problems, 2);
console.log("\nPilot sample (2/type):", pilot.length, "problems");
console.log("Pilot types:", typeCounts(pilot));

// Sample problem stats
const p = problems[0];
console.log("\nFirst problem:");
console.log("  ID:", p.problemId);
console.log("  Type:", p.questionType);
console.log("  Sessions:", p.sessions.length);
console.log("  Est. tokens:", p.estimatedTokens);
console.log("  Question:", p.question.slice(0, 80));
console.log("  Answer:", p.answer.slice(0, 80));
console.log("  First session date:", p.sessions[0]?.date);
console.log("  First session turns:", p.sessions[0]?.turns.length);
console.log("  First session text (80c):", p.sessions[0]?.contentText.slice(0, 80));

// Verify date parsing from ingest module
import { parseDate } from "./lib/ingest-sessions.js";
console.log("\nDate parsing:");
console.log('  "2023/05/20 (Sat) 02:21" →', parseDate("2023/05/20 (Sat) 02:21"));
console.log('  "2023/05/30 (Tue) 23:40" →', parseDate("2023/05/30 (Tue) 23:40"));
console.log('  "" →', parseDate(""));

console.log("\n✓ Dataset loader verified");
