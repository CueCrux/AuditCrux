/**
 * Audit Suite v2 — Enterprise Corpus Types
 *
 * Extends v1 types with MIME support for heterogeneous file types.
 * Re-exports all v1 types so v2 modules only need one import.
 */

// Re-export everything from v1
export type {
    EngineMode,
    CategoryId,
    CorpusRelation,
    LivingState,
    GroundTruth,
    QueryResult,
    CategoryMetrics,
    ScalePoint,
    ReceiptChainResult,
    AuditReport,
} from "../../audit/lib/types.js";

// Also re-export the temporal ground truth from v1 corpus (same shape)
export type { TemporalGroundTruth } from "../../audit/lib/corpus.js";

/**
 * Extended CorpusDoc with MIME type.
 * v1's CorpusDoc hardcodes 'text/plain' in db.ts; v2 passes mime through.
 */
export type CorpusDocV2 = {
    id: string;
    domain: string;
    url: string;
    title: string;
    content: string;
    mime: string;
    publishedAt: string;
    licenseId: string;
    riskFlag: string;
    tenantId: string;
    artifactKey?: string;
    contentType?: "source" | "annotation" | "entity-enriched" | "ocr-extracted" | "hierarchical_summary" | "proposition";
    mimeType?: string;
    chunkIndex?: number;
    indexable?: boolean;
    processingMetadata?: Record<string, unknown>;
};
