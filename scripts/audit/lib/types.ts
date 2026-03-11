export type EngineMode = "V1" | "V3.1" | "V4.1";
export type CategoryId = "cat1" | "cat2" | "cat3" | "cat4";

export type CorpusDoc = {
    id: string;
    domain: string;
    url: string;
    title: string;
    content: string;
    publishedAt: string; // ISO8601
    licenseId: string;
    riskFlag: string;
    tenantId: string;
};

export type CorpusRelation = {
    srcId: string;
    dstId: string;
    relationType: "supports" | "contradicts" | "supersedes" | "duplicates" | "elaborates" | "derived_from" | "cites" | "about_same_entity";
    confidence: number;
};

export type LivingState = {
    artifactId: string;
    livingStatus: "dormant" | "active" | "stale" | "contested" | "superseded" | "deprecated";
    confidence: number;
};

export type GroundTruth = {
    query: string;
    mode: "light" | "verified" | "audit";
    topK: number;
    expectedDocIds: string[]; // docs that MUST appear in citations
    expectedRanking?: [string, string][]; // [higher, lower] pairs
    expectedMiSES?: string[]; // expected MiSES composition
    expectedFragilityRange?: [number, number]; // [min, max]
};

export type QueryResult = {
    query: string;
    answerId: string;
    citations: {
        id: string;
        domain: string;
        url: string;
        quoteHash?: string;
    }[];
    crown: {
        modeApplied: string;
        receiptId: string;
        miSESSize: number;
        citationIds: string[];
        fragilityScore?: number;
        signed: boolean;
        knowledgeStateCursor?: unknown;
    };
    timings: {
        retrieveMs: number;
        rerankMs: number;
        llmMs: number;
        totalMs: number;
    };
    retrievedIds: string[];
    rawResponse: unknown;
};

export type CategoryMetrics = {
    category: CategoryId;
    mode: EngineMode;
    passed: boolean;
    metrics: Record<string, number | boolean | string | string[]>;
    queries: {
        query: string;
        metrics: Record<string, number | boolean | string | string[]>;
        notes: string[];
    }[];
    notes: string[];
};

export type ScalePoint = {
    corpusSize: number;
    precision5: number;
    recall5: number;
    misesJaccard: number;
    fragilityMean: number;
    fragilityProbeMean: number; // verified-mode fragility probes (minDomains=2)
    fragilityProbeCount: number;
    latencyP50: number;
    latencyP95: number;
};

export type ReceiptChainResult = {
    answerId: string;
    chainLength: number;
    chainIntact: boolean;
    signed: boolean;
    receiptId?: string;
    error?: string;
};

export type AuditReport = {
    runId: string;
    startedAt: string;
    finishedAt: string;
    host: string;
    modes: Partial<Record<EngineMode, Partial<Record<CategoryId, CategoryMetrics>>>>;
    comparison?: {
        supersession_improvement_v41_vs_v1: string;
        causal_completeness_improvement: string;
        degradation_slope_v1: number;
        degradation_slope_v41: number;
    };
};
