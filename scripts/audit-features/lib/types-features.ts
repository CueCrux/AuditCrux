/**
 * Audit Suite — Feature-Level Test & Benchmark Types
 *
 * Tests four engine features end-to-end:
 *   Cat 1: Ask accuracy (query → answer quality across complexity tiers)
 *   Cat 2: Reverse Ask (receipt chain verification & chain depth stress)
 *   Cat 3: Proof Documents (CROWN receipt generation, integrity, signatures)
 *   Cat 4: Watch lifecycle (living state transitions & conflict resolution)
 *
 * Re-exports shared types from v1/v2.
 */

export type {
    EngineMode,
    CorpusRelation,
    LivingState,
    GroundTruth,
    QueryResult,
    ReceiptChainResult,
} from "../../audit/lib/types.js";

export type { CorpusDocV2 } from "../../audit-v2/lib/types-v2.js";

export type FeatureCategoryId = "cat1" | "cat2" | "cat3" | "cat4";

// ── Ask Accuracy (Cat 1) ─────────────────────────────────────────────────

/** Complexity tiers for ask queries */
export type AskTier = "simple" | "multi-hop" | "adversarial" | "ambiguous";

/** Per-query ask accuracy measurement */
export type AskAccuracyPoint = {
    tier: AskTier;
    query: string;
    recall: number;
    retrieved_recall: number;
    precision: number;
    latency_ms: number;
    mode_applied: string;
    citation_count: number;
};

// ── Reverse Ask (Cat 2) ──────────────────────────────────────────────────

/** Per-verification reverse ask measurement */
export type ReverseAskPoint = {
    query_index: number;
    answer_id: string;
    chain_depth: number;
    chain_intact: boolean;
    verify_latency_ms: number;
    query_latency_ms: number;
    receipt_id?: string;
    error?: string;
};

// ── Proof Documents (Cat 3) ──────────────────────────────────────────────

/** Per-scenario proof document measurement */
export type ProofDocumentPoint = {
    scenario: string;
    receipt_generated: boolean;
    receipt_id_present: boolean;
    mises_size: number;
    citation_ids_count: number;
    fragility_present: boolean;
    signed: boolean;
    knowledge_state_cursor_present: boolean;
    crown_mode_applied: string;
};

// ── Watch Lifecycle (Cat 4) ──────────────────────────────────────────────

/** Expected state at a lifecycle checkpoint */
export type WatchCheckpoint = {
    docId: string;
    expectedStatus: "dormant" | "active" | "stale" | "contested" | "superseded" | "deprecated";
    label: string;
};

/** A lifecycle scenario with multiple checkpoints */
export type WatchScenario = {
    id: string;
    label: string;
    description: string;
    checkpoints: WatchCheckpoint[];
};

// ── Shared Report Type ───────────────────────────────────────────────────

export type FeatureBenchmarks = {
    latency_p50_ms: number;
    latency_p95_ms: number;
    latency_max_ms: number;
    total_queries: number;
    total_duration_ms: number;
};

export type FeatureCategoryResult = {
    category: FeatureCategoryId;
    mode: string;
    passed: boolean;
    metrics: Record<string, unknown>;
    queries: Array<Record<string, unknown>>;
    notes: string[];
    benchmarks: FeatureBenchmarks;
};

export type FeatureReport = {
    runId: string;
    startedAt: string;
    finishedAt: string;
    host: string;
    results: FeatureCategoryResult[];
    summary: Record<string, unknown>;
};
