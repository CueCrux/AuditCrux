import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { computeFixtureHash, generateReproducibilityMetadata } from "../../reproducibility.js";

describe("computeFixtureHash", () => {
  it("produces a deterministic hash for alpha", () => {
    const hash1 = computeFixtureHash("alpha");
    const hash2 = computeFixtureHash("alpha");
    assert.equal(hash1, hash2);
    assert.equal(typeof hash1, "string");
    assert.ok(hash1.length === 64, `Expected 64-char hex, got ${hash1.length}`);
  });

  it("produces different hashes for different projects", () => {
    const alphaHash = computeFixtureHash("alpha");
    const betaHash = computeFixtureHash("beta");
    assert.notEqual(alphaHash, betaHash);
  });
});

describe("generateReproducibilityMetadata", () => {
  it("includes all required fields", () => {
    const meta = generateReproducibilityMetadata("alpha");
    assert.ok(meta.fixtureHash);
    assert.ok(meta.harnessVersion);
    assert.ok(meta.nodeVersion);
    assert.ok(meta.timestamp);
    assert.ok(meta.scoringVersion);
  });
});
