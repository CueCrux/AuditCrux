#!/usr/bin/env tsx
import { loadDataset } from "./lib/dataset-loader.js";
const problems = loadDataset("s");
const tokens = problems.map(p => p.estimatedTokens).sort((a,b) => a-b);
console.log("Token distribution (estimated):");
console.log("  Min:", tokens[0]);
console.log("  P25:", tokens[Math.floor(tokens.length*0.25)]);
console.log("  Median:", tokens[Math.floor(tokens.length*0.5)]);
console.log("  P75:", tokens[Math.floor(tokens.length*0.75)]);
console.log("  P95:", tokens[Math.floor(tokens.length*0.95)]);
console.log("  Max:", tokens[tokens.length-1]);
console.log("  Mean:", Math.round(tokens.reduce((a,b)=>a+b,0)/tokens.length));
const over200k = tokens.filter(t => t > 200000).length;
const over128k = tokens.filter(t => t > 128000).length;
const over100k = tokens.filter(t => t > 100000).length;
console.log("  Over 100K:", over100k, "/", tokens.length);
console.log("  Over 128K:", over128k, "/", tokens.length);
console.log("  Over 200K:", over200k, "/", tokens.length);
