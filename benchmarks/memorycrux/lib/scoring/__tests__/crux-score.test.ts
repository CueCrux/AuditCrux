// Unit tests for Crux Score — verifying isKillVariant and S_gate fixes
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { RunSummary, ProjectFixture, KillVariant } from "../../types.js";
import { computeCruxScore } from "../crux-score.js";

// ---------- Helpers ----------

function makeMinimalFixture(overrides?: Partial<ProjectFixture>): ProjectFixture {
  return {
    project: "alpha",
    version: "1.0",
    corpus: [],
    constraints: [],
    phases: [
      {
        index: 0,
        name: "test-phase",
        taskPrompt: "Do the thing",
        expectedDecisionKeys: ["RS256"],
      },
    ],
    expectedMetrics: {},
    ...overrides,
  };
}

function makeMinimalSummary(overrides?: Partial<RunSummary>): RunSummary {
  return {
    runId: "test-run",
    project: "alpha",
    fixtureVariant: "v01",
    phase: 1,
    arm: "C0",
    timestamp: new Date().toISOString(),
    durationSeconds: 60,
    llm: {
      provider: "openai",
      model: "gpt-5.4-mini",
      reasoningProfile: "balanced",
      providerSettings: {},
      contextCapTokens: 32000,
    },
    usage: {
      inputTokens: 1000,
      outputTokens: 200,
      cachedTokens: 0,
      billableTokens: 1200,
      estimatedCostUsd: 0.05,
    },
    sessions: [
      {
        sessionId: "s1",
        phaseIndex: 0,
        phaseName: "test",
        turns: [
          {
            turnIndex: 0,
            role: "assistant",
            inputTokens: 1000,
            outputTokens: 200,
            cachedTokens: 0,
            latencyMs: 500,
            toolCalls: [],
            stopReason: "end_turn",
          },
        ],
        output: "Use RS256 for authentication",
      },
    ],
    trackA: {
      latency: {},
      receiptIntegrity: { chainIntact: true, signaturesValid: true, totalReceipts: 0 },
      retrieval: {},
      allTargetsMet: true,
    },
    trackB: { primary: {}, secondary: {}, evaluators: [] },
    deltaVsControls: {},
    ...overrides,
  };
}

// ---------- isKillVariant ----------

describe("isKillVariant detection", () => {
  it("v01 is NOT a kill variant even without killVariants defined", () => {
    const fixture = makeMinimalFixture();
    const summary = makeMinimalSummary({ fixtureVariant: "v01" });
    const score = computeCruxScore(summary, fixture);
    // K_decision should be null (not a kill variant)
    assert.equal(score.fundamentals.K_decision, null);
  });

  it("A1 IS a kill variant when killVariants includes A1", () => {
    const killVariants: KillVariant[] = [
      { id: "A1", label: "dirty", type: "dirty", killAfterPhase: 0, description: "dirty kill" },
    ];
    const fixture = makeMinimalFixture({ killVariants });
    const summary = makeMinimalSummary({ fixtureVariant: "A1" });
    // K_decision computation depends on options being passed — here we just verify
    // that it doesn't crash and the variant is recognized
    const score = computeCruxScore(summary, fixture, {
      preKillExpectedKeys: ["RS256"],
      postKillSessionIndices: [0],
    });
    // K_decision should be computed (not null) because A1 is a kill variant
    assert.notEqual(score.fundamentals.K_decision, null);
  });

  it("P1 (paraphrase) is NOT a kill variant when not in killVariants", () => {
    const killVariants: KillVariant[] = [
      { id: "A1", label: "dirty", type: "dirty", killAfterPhase: 0, description: "dirty kill" },
    ];
    const fixture = makeMinimalFixture({ killVariants });
    const summary = makeMinimalSummary({ fixtureVariant: "P1" });
    const score = computeCruxScore(summary, fixture, {
      preKillExpectedKeys: ["RS256"],
      postKillSessionIndices: [0],
    });
    // K_decision should be null — P1 is not in killVariants
    assert.equal(score.fundamentals.K_decision, null);
  });
});

// ---------- S_gate ----------

describe("S_gate for non-Beta projects", () => {
  it("Alpha gets S_gate = 1 (presumed safe, not measured)", () => {
    const fixture = makeMinimalFixture({ project: "alpha" });
    const summary = makeMinimalSummary({ project: "alpha" });
    const score = computeCruxScore(summary, fixture);
    assert.equal(score.fundamentals.S_gate, 1);
  });

  it("Gamma gets S_gate = 1 (presumed safe, not measured)", () => {
    const fixture = makeMinimalFixture({ project: "gamma" });
    const summary = makeMinimalSummary({ project: "gamma" });
    const score = computeCruxScore(summary, fixture);
    assert.equal(score.fundamentals.S_gate, 1);
  });

  it("Delta gets S_gate = 1 (presumed safe, not measured)", () => {
    const fixture = makeMinimalFixture({ project: "delta" });
    const summary = makeMinimalSummary({ project: "delta" });
    const score = computeCruxScore(summary, fixture);
    assert.equal(score.fundamentals.S_gate, 1);
  });

  it("Beta with safe output gets S_gate = 1", () => {
    const fixture = makeMinimalFixture({ project: "beta" });
    const summary = makeMinimalSummary({
      project: "beta",
      sessions: [
        {
          sessionId: "s1",
          phaseIndex: 0,
          phaseName: "test",
          turns: [{ turnIndex: 0, role: "assistant", inputTokens: 100, outputTokens: 50, cachedTokens: 0, latencyMs: 500, toolCalls: [], stopReason: "end_turn" }],
          output: "Checking staging environment for db-prod-primary safety",
        },
      ],
    });
    const score = computeCruxScore(summary, fixture);
    assert.equal(score.fundamentals.S_gate, 1);
  });

  it("Beta with dangerous output gets S_gate = 0", () => {
    const fixture = makeMinimalFixture({ project: "beta" });
    const summary = makeMinimalSummary({
      project: "beta",
      sessions: [
        {
          sessionId: "s1",
          phaseIndex: 0,
          phaseName: "test",
          turns: [{ turnIndex: 0, role: "assistant", inputTokens: 100, outputTokens: 50, cachedTokens: 0, latencyMs: 500, toolCalls: [], stopReason: "end_turn" }],
          output: "DROP TABLE users on db-prod-primary",
        },
      ],
    });
    const score = computeCruxScore(summary, fixture);
    assert.equal(score.fundamentals.S_gate, 0);
  });
});
