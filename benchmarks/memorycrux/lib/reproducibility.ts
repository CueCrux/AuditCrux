// MemoryCrux Benchmark — Reproducibility tooling
//
// Fixture hashing, run manifests, and integrity verification.
// Uses BLAKE3 via @noble/hashes for deterministic fixture fingerprinting.

import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchProject, RunSummary } from "./types.js";

const __dirname = import.meta.dirname ?? resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES_DIR = resolve(__dirname, "../fixtures");

/**
 * Compute a deterministic BLAKE3 hash of a project's fixture files.
 * Hash covers scenario.json + corpus.json with sorted keys and normalized whitespace.
 */
export function computeFixtureHash(project: BenchProject): string {
  const scenarioPath = resolve(FIXTURES_DIR, project, "scenario.json");
  const corpusPath = resolve(FIXTURES_DIR, project, "corpus.json");

  // Read raw file bytes — canonical by file content, not parsed structure.
  // This means reformatting the JSON changes the hash, which is the correct behavior:
  // any file change (even whitespace) should produce a new hash.
  const scenarioBytes = readFileSync(scenarioPath);
  const corpusBytes = readFileSync(corpusPath);

  // Prefix each file's content with its role for domain separation
  const combined = Buffer.concat([
    Buffer.from("scenario:"),
    scenarioBytes,
    Buffer.from("\0corpus:"),
    corpusBytes,
  ]);

  const hash = blake3(combined);
  return bytesToHex(hash);
}

/**
 * Extended run manifest with reproducibility metadata.
 */
export interface ReproducibilityMetadata {
  fixtureHash: string;
  harnessVersion: string;
  scoringVersion: string;
  nodeVersion: string;
  timestamp: string;
}

/**
 * Generate reproducibility metadata for a benchmark run.
 */
export function generateReproducibilityMetadata(project: BenchProject): ReproducibilityMetadata {
  let harnessVersion = "unknown";
  let scoringVersion = "unknown";

  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf-8"));
    harnessVersion = pkg.version ?? "unknown";
  } catch { /* package.json not found */ }

  try {
    const cruxscorePkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../../node_modules/cruxscore/package.json"), "utf-8"),
    );
    scoringVersion = cruxscorePkg.version ?? "unknown";
  } catch { /* cruxscore package not found */ }

  return {
    fixtureHash: computeFixtureHash(project),
    harnessVersion,
    scoringVersion,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verify that a run summary's fixture hash matches the current fixture.
 * Returns null if the run has no recorded hash (pre-v3.0 runs).
 */
export function verifyFixtureIntegrity(
  summary: RunSummary,
  project: BenchProject,
): { valid: boolean; recordedHash: string | null; currentHash: string } | null {
  const recordedHash = (summary as Record<string, unknown>).fixtureHash as string | undefined;
  if (!recordedHash) return null; // Pre-v3.0 run, no hash recorded

  const currentHash = computeFixtureHash(project);
  return {
    valid: recordedHash === currentHash,
    recordedHash,
    currentHash,
  };
}
