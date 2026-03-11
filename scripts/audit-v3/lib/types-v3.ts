/**
 * Audit Suite v3 — Edge Case & Capability Probe Types
 *
 * Extends v2 types with v3-specific category IDs and metrics.
 * Re-exports all v2 types so v3 modules only need one import.
 */

export type {
    EngineMode,
    CorpusRelation,
    LivingState,
    GroundTruth,
    QueryResult,
    ScalePoint,
    ReceiptChainResult,
    AuditReport,
} from "../../audit/lib/types.js";

export type { CorpusDocV2 } from "../../audit-v2/lib/types-v2.js";
export type { TemporalGroundTruth } from "../../audit/lib/corpus.js";

export type V3CategoryId = "cat1" | "cat2" | "cat3" | "cat4" | "cat5" | "cat6";

/** Format-stratified recall for Cat 2 */
export type FormatRecallMap = Record<string, number>;

/** Per-class recall for Cat 3 retrieval decomposition */
export type RetrievalDecomposition = {
    bm25_recall: number;
    vector_recall: number;
    hybrid_recall: number;
};

/** Receipt chain latency measurement for Cat 5 */
export type ReceiptDepthPoint = {
    depth: number;
    latency_ms: number;
    chain_intact: boolean;
};

/** Fragility calibration point for Cat 6 */
export type FragilityCalibrationPoint = {
    scenario: string;
    expected_range: [number, number];
    actual: number;
    in_range: boolean;
};

/** V3 category result */
export type V3CategoryResult = {
    category: V3CategoryId;
    mode: string;
    passed: boolean;
    metrics: Record<string, unknown>;
    queries: Array<Record<string, unknown>>;
    notes: string[];
};
