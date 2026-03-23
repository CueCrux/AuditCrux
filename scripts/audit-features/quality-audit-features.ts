#!/usr/bin/env npx tsx
/**
 * Retrieval Quality Audit Suite — Feature-Level Tests & Benchmarks
 *
 * Tests four engine features end-to-end with detailed logging:
 *
 *   Cat 1: Ask Accuracy (16 docs, 12 queries across 4 complexity tiers)
 *   Cat 2: Reverse Ask (4 docs, 30 queries, receipt chain verification)
 *   Cat 3: Proof Documents (10 docs, 4 queries, CROWN receipt integrity)
 *   Cat 4: Watch Lifecycle (20 docs, DB state checks, 4 lifecycle scenarios)
 *
 * Usage:
 *   npx tsx scripts/audit-features/quality-audit-features.ts --mode V4.1 --cat 1
 *   npx tsx scripts/audit-features/quality-audit-features.ts --mode all --cat all
 *   npx tsx scripts/audit-features/quality-audit-features.ts --dry-run
 *
 * Env:
 *   DATABASE_URL, OPENAI_API_KEY, API_KEY, BENCH_TARGET, AUDIT_EMBEDDING_PROVIDER
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Feature corpus
import { CAT1_DOCS, CAT1_GROUND_TRUTH, QUERY_TIERS } from "./lib/corpus/cat1-ask-accuracy.js";
import { CAT2_DOCS, generateReverseAskQueries, REVERSE_ASK_DEPTH_CHECKPOINTS } from "./lib/corpus/cat2-reverse-ask.js";
import { CAT3_DOCS, CAT3_GROUND_TRUTH, PROOF_SCENARIOS } from "./lib/corpus/cat3-proof-documents.js";
import { CAT4_DOCS, CAT4_RELATIONS, CAT4_LIVING_STATES, WATCH_SCENARIOS } from "./lib/corpus/cat4-watch-lifecycle.js";
import { TENANT_FEATURES } from "./lib/tenant.js";

// Feature types
import type {
    FeatureCategoryId,
    FeatureCategoryResult,
    FeatureBenchmarks,
    FeatureReport,
    EngineMode,
    CorpusRelation,
    LivingState,
    GroundTruth,
    CorpusDocV2,
    AskTier,
    ReverseAskPoint,
    ProofDocumentPoint,
} from "./lib/types-features.js";

// Shared infrastructure
import { createPool, cleanAuditData, insertRelations, insertLivingStates, refreshMaterializedViews, type ChunkIdMap } from "../audit-v2/lib/db-v2.js";
import { insertChunksV2 } from "../audit-v2/lib/db-v2.js";
import { embedTexts } from "../audit/lib/embed.js";
import { queryAnswers, verifyReceiptChain, fetchReceipt, verifyCoseEnvelope } from "../audit/lib/query.js";
import { scoreQuery, percentile } from "../audit/lib/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(dirname(__dirname), "audit-results");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { modes: EngineMode[]; cats: FeatureCategoryId[]; dryRun: boolean } {
    const args = process.argv.slice(2);
    let modeArg = "all";
    let catArg = "all";
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--mode" && args[i + 1]) modeArg = args[++i];
        if (args[i] === "--cat" && args[i + 1]) catArg = args[++i];
        if (args[i] === "--dry-run") dryRun = true;
    }

    const allModes: EngineMode[] = ["V1", "V3.1", "V4.1"];
    const modes: EngineMode[] = modeArg === "all" ? allModes : [modeArg as EngineMode];

    const allCats: FeatureCategoryId[] = ["cat1", "cat2", "cat3", "cat4"];
    const cats: FeatureCategoryId[] = catArg === "all" ? allCats : [(`cat${catArg}`) as FeatureCategoryId];

    return { modes, cats, dryRun };
}

// ---------------------------------------------------------------------------
// Dry-run validation
// ---------------------------------------------------------------------------

function validateCorpus(): boolean {
    console.log("=== Dry-Run: Feature Corpus Validation ===\n");
    let valid = true;

    function checkUnique(docs: CorpusDocV2[], label: string) {
        const ids = docs.map((d) => d.id);
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
        if (dupes.length > 0) {
            console.error(`  FAIL: ${label} has duplicate IDs: ${dupes.join(", ")}`);
            valid = false;
        } else {
            console.log(`  OK: ${label} — ${ids.length} docs, all unique`);
        }
    }

    function checkRelations(relations: CorpusRelation[], docs: CorpusDocV2[], label: string) {
        const ids = new Set(docs.map((d) => d.id));
        for (const r of relations) {
            if (!ids.has(r.srcId)) {
                console.error(`  FAIL: ${label} relation srcId "${r.srcId}" not in docs`);
                valid = false;
            }
            if (!ids.has(r.dstId)) {
                console.error(`  FAIL: ${label} relation dstId "${r.dstId}" not in docs`);
                valid = false;
            }
        }
        if (valid) console.log(`  OK: ${label} — ${relations.length} relations, all refs valid`);
    }

    function checkLivingStates(states: LivingState[], docs: CorpusDocV2[], label: string) {
        const ids = new Set(docs.map((d) => d.id));
        for (const s of states) {
            if (!ids.has(s.artifactId)) {
                console.error(`  FAIL: ${label} living state artifactId "${s.artifactId}" not in docs`);
                valid = false;
            }
        }
        if (valid) console.log(`  OK: ${label} — ${states.length} living states, all refs valid`);
    }

    function checkGroundTruth(truths: GroundTruth[], docs: CorpusDocV2[], label: string) {
        const ids = new Set(docs.map((d) => d.id));
        for (const t of truths) {
            for (const eid of t.expectedDocIds) {
                if (!ids.has(eid)) {
                    console.error(`  FAIL: ${label} ground truth expected doc "${eid}" not in docs`);
                    valid = false;
                }
            }
        }
        if (valid) console.log(`  OK: ${label} — ${truths.length} queries, all expected docs exist`);
    }

    // Cat 1
    console.log("Category 1 — Ask Accuracy:");
    checkUnique(CAT1_DOCS, "Cat1 docs");
    checkGroundTruth(CAT1_GROUND_TRUTH, CAT1_DOCS, "Cat1");
    console.log(`  Tiers: ${["simple", "multi-hop", "adversarial", "ambiguous"].map((t) => `${t}=${QUERY_TIERS.filter((q) => q.tier === t).length}`).join(", ")}`);

    // Cat 2
    console.log("\nCategory 2 — Reverse Ask:");
    checkUnique(CAT2_DOCS, "Cat2 docs");
    const reverseQueries = generateReverseAskQueries();
    checkGroundTruth(reverseQueries, CAT2_DOCS, "Cat2");
    console.log(`  OK: Cat2 — ${reverseQueries.length} generated queries, depth checkpoints: ${REVERSE_ASK_DEPTH_CHECKPOINTS.join(", ")}`);

    // Cat 3
    console.log("\nCategory 3 — Proof Documents:");
    checkUnique(CAT3_DOCS, "Cat3 docs");
    checkGroundTruth(CAT3_GROUND_TRUTH, CAT3_DOCS, "Cat3");
    console.log(`  Scenarios: ${PROOF_SCENARIOS.map((s) => s.id).join(", ")}`);

    // Cat 4
    console.log("\nCategory 4 — Watch Lifecycle:");
    checkUnique(CAT4_DOCS, "Cat4 docs");
    checkRelations(CAT4_RELATIONS, CAT4_DOCS, "Cat4");
    checkLivingStates(CAT4_LIVING_STATES, CAT4_DOCS, "Cat4");
    console.log(`  Scenarios: ${WATCH_SCENARIOS.map((s) => s.id).join(", ")}`);
    console.log(`  Total checkpoints: ${WATCH_SCENARIOS.reduce((s, sc) => s + sc.checkpoints.length, 0)}`);

    // Total
    const allDocs = [...CAT1_DOCS, ...CAT2_DOCS, ...CAT3_DOCS, ...CAT4_DOCS];
    const allIds = allDocs.map((d) => d.id);
    const globalDupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    if (globalDupes.length > 0) {
        console.error(`\nFAIL: Global duplicate IDs: ${globalDupes.join(", ")}`);
        valid = false;
    } else {
        console.log(`\n  All IDs globally unique.`);
    }

    console.log(`\n=== Total: ${allDocs.length} docs, ${CAT1_GROUND_TRUTH.length + reverseQueries.length + CAT3_GROUND_TRUTH.length} API queries, ${WATCH_SCENARIOS.reduce((s, sc) => s + sc.checkpoints.length, 0)} DB checks ===`);
    console.log(`=== Validation: ${valid ? "PASSED" : "FAILED"} ===`);
    return valid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBenchmarks(latencies: number[]): FeatureBenchmarks {
    return {
        latency_p50_ms: Math.round(percentile(latencies, 50)),
        latency_p95_ms: Math.round(percentile(latencies, 95)),
        latency_max_ms: latencies.length > 0 ? Math.round(Math.max(...latencies)) : 0,
        total_queries: latencies.length,
        total_duration_ms: Math.round(latencies.reduce((s, l) => s + l, 0)),
    };
}

async function ingestFeature(
    pool: pg.Pool,
    docs: CorpusDocV2[],
    mode: EngineMode,
    relations: CorpusRelation[],
    livingStates: LivingState[],
): Promise<ChunkIdMap> {
    console.log(`  Embedding ${docs.length} documents...`);
    const embeddings = await embedTexts(docs.map((d) => d.content));

    console.log(`  Inserting ${docs.length} chunks...`);
    const idMap = await insertChunksV2(pool, docs, embeddings);

    if (mode !== "V1" && relations.length > 0) {
        console.log(`  Inserting ${relations.length} relations (${mode})...`);
        await insertRelations(pool, relations, TENANT_FEATURES, idMap);
    }

    if (mode !== "V1" && livingStates.length > 0) {
        console.log(`  Inserting ${livingStates.length} living states (${mode})...`);
        await insertLivingStates(pool, livingStates, TENANT_FEATURES, idMap);
    }

    console.log(`  Refreshing materialized views...`);
    await refreshMaterializedViews(pool);

    return idMap;
}

// ---------------------------------------------------------------------------
// Cat 1: Ask Accuracy
// ---------------------------------------------------------------------------

async function runCat1(pool: pg.Pool, mode: EngineMode): Promise<FeatureCategoryResult> {
    console.log(`\n=== Cat 1: Ask Accuracy [${mode}] ===`);

    await cleanAuditData(pool, TENANT_FEATURES);
    await ingestFeature(pool, CAT1_DOCS, mode, [], []);

    const latencies: number[] = [];
    const queries: Array<Record<string, unknown>> = [];
    const tierResults: Record<AskTier, { found: number; total: number; recall_sum: number; retrieved_recall_sum: number; count: number }> = {
        simple: { found: 0, total: 0, recall_sum: 0, retrieved_recall_sum: 0, count: 0 },
        "multi-hop": { found: 0, total: 0, recall_sum: 0, retrieved_recall_sum: 0, count: 0 },
        adversarial: { found: 0, total: 0, recall_sum: 0, retrieved_recall_sum: 0, count: 0 },
        ambiguous: { found: 0, total: 0, recall_sum: 0, retrieved_recall_sum: 0, count: 0 },
    };
    const notes: string[] = [];

    for (const truth of CAT1_GROUND_TRUTH) {
        const tierEntry = QUERY_TIERS.find((t) => t.query === truth.query);
        const tier: AskTier = tierEntry?.tier ?? "simple";

        console.log(`  [${tier}] Query: "${truth.query.slice(0, 60)}..."`);
        try {
            const start = performance.now();
            const qr = await queryAnswers(truth.query, {
                mode: truth.mode,
                topK: truth.topK,
                tenantId: TENANT_FEATURES,
            });
            const latency = performance.now() - start;
            latencies.push(latency);

            const scored = scoreQuery(qr, truth);
            const recall = scored.metrics.recall as number;
            const retrievedRecall = (scored.metrics.retrieved_recall as number) ?? 0;

            tierResults[tier].found += scored.metrics.expected_found as number;
            tierResults[tier].total += scored.metrics.expected_total as number;
            tierResults[tier].recall_sum += recall;
            tierResults[tier].retrieved_recall_sum += retrievedRecall;
            tierResults[tier].count++;

            queries.push({
                ...scored,
                tier,
                latency_ms: Math.round(latency),
                citation_count: qr.citations.length,
                mode_applied: qr.crown.modeApplied,
            });

            console.log(`    Found ${scored.metrics.expected_found}/${scored.metrics.expected_total} | recall=${recall.toFixed(2)} | ${Math.round(latency)}ms`);

            if (scored.notes.length > 0) {
                notes.push(...scored.notes.map((n) => `[${tier}] ${n}`));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    X Query failed: ${msg.slice(0, 120)}`);
            notes.push(`[${tier}] Query error: ${msg.slice(0, 200)}`);
            queries.push({
                query: truth.query,
                tier,
                metrics: { expected_found: 0, expected_total: truth.expectedDocIds.length, recall: 0, latency_ms: 0, error: msg.slice(0, 200) },
                notes: [`Query error: ${msg.slice(0, 200)}`],
            });
        }
    }

    // Compute tier metrics
    const tierMetrics: Record<string, unknown> = {};
    for (const [tier, data] of Object.entries(tierResults)) {
        const avgRecall = data.count > 0 ? data.recall_sum / data.count : 0;
        const avgRetrievedRecall = data.count > 0 ? data.retrieved_recall_sum / data.count : 0;
        tierMetrics[`${tier}_avg_recall`] = avgRecall;
        tierMetrics[`${tier}_avg_retrieved_recall`] = avgRetrievedRecall;
        tierMetrics[`${tier}_found`] = data.found;
        tierMetrics[`${tier}_total`] = data.total;
        notes.push(`${tier}: recall=${avgRecall.toFixed(2)} retrieved_recall=${avgRetrievedRecall.toFixed(2)} (${data.found}/${data.total})`);
    }

    const overallRecall = CAT1_GROUND_TRUTH.length > 0
        ? Object.values(tierResults).reduce((s, t) => s + t.recall_sum, 0) / CAT1_GROUND_TRUTH.length
        : 0;
    const overallRetrievedRecall = CAT1_GROUND_TRUTH.length > 0
        ? Object.values(tierResults).reduce((s, t) => s + t.retrieved_recall_sum, 0) / CAT1_GROUND_TRUTH.length
        : 0;

    // Pass: simple tier >= 90% recall, overall retrieved recall >= 60%
    const simpleRecall = tierResults.simple.count > 0 ? tierResults.simple.recall_sum / tierResults.simple.count : 0;
    const passed = simpleRecall >= 0.9 && overallRetrievedRecall >= 0.6;

    return {
        category: "cat1",
        mode,
        passed,
        metrics: {
            overall_recall: overallRecall,
            overall_retrieved_recall: overallRetrievedRecall,
            query_count: CAT1_GROUND_TRUTH.length,
            ...tierMetrics,
        },
        queries,
        notes,
        benchmarks: computeBenchmarks(latencies),
    };
}

// ---------------------------------------------------------------------------
// Cat 2: Reverse Ask
// ---------------------------------------------------------------------------

async function runCat2(pool: pg.Pool): Promise<FeatureCategoryResult> {
    console.log(`\n=== Cat 2: Reverse Ask (verified mode) ===`);

    await cleanAuditData(pool, TENANT_FEATURES);
    await ingestFeature(pool, CAT2_DOCS, "V4.1", [], []);

    const reverseQueries = generateReverseAskQueries();
    const depthPoints: ReverseAskPoint[] = [];
    let chainsIntact = 0;
    let totalVerified = 0;
    const latencies: number[] = [];
    const notes: string[] = [];

    for (let i = 0; i < reverseQueries.length; i++) {
        const truth = reverseQueries[i];
        const depth = i + 1;

        console.log(`  Query ${depth}/${reverseQueries.length}: "${truth.query.slice(0, 50)}..."`);

        try {
            const queryStart = performance.now();
            const qr = await queryAnswers(truth.query, {
                mode: "verified",
                topK: truth.topK,
                tenantId: TENANT_FEATURES,
            });
            const queryLatency = performance.now() - queryStart;
            latencies.push(queryLatency);

            // At depth checkpoints, verify the receipt chain
            if (REVERSE_ASK_DEPTH_CHECKPOINTS.includes(depth) && qr.answerId) {
                const verifyStart = performance.now();
                const chain = await verifyReceiptChain(qr.answerId);
                const verifyLatency = performance.now() - verifyStart;

                totalVerified++;
                if (chain.chainIntact) chainsIntact++;

                const point: ReverseAskPoint = {
                    query_index: i,
                    answer_id: qr.answerId,
                    chain_depth: depth,
                    chain_intact: chain.chainIntact,
                    verify_latency_ms: Math.round(verifyLatency),
                    query_latency_ms: Math.round(queryLatency),
                    receipt_id: chain.receiptId,
                };
                depthPoints.push(point);

                console.log(`    Depth ${depth}: chain_intact=${chain.chainIntact} verify=${Math.round(verifyLatency)}ms query=${Math.round(queryLatency)}ms`);

                if (!chain.chainIntact) {
                    notes.push(`Chain broken at depth ${depth}: ${chain.error ?? "unknown"}`);
                }

                // Check receipt ID consistency
                if (qr.crown.receiptId && chain.receiptId && qr.crown.receiptId !== chain.receiptId) {
                    notes.push(`Receipt ID mismatch at depth ${depth}: answer=${qr.crown.receiptId} chain=${chain.receiptId}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            notes.push(`Query ${depth} failed: ${msg.slice(0, 120)}`);
        }
    }

    // Compute metrics
    const maxVerifiedDepth = depthPoints.filter((p) => p.chain_intact).reduce((max, p) => Math.max(max, p.chain_depth), 0);
    const latencyAtMax = depthPoints.find((p) => p.chain_depth === REVERSE_ASK_DEPTH_CHECKPOINTS[REVERSE_ASK_DEPTH_CHECKPOINTS.length - 1])?.verify_latency_ms ?? -1;

    // Latency slope
    let latencySlope = 0;
    if (depthPoints.length >= 2) {
        const first = depthPoints[0];
        const last = depthPoints[depthPoints.length - 1];
        latencySlope = (last.verify_latency_ms - first.verify_latency_ms) / (last.chain_depth - first.chain_depth);
    }

    // Pass: all chains intact at depth <= 15, verify latency < 5s at max depth
    const allIntactAt15 = depthPoints.filter((p) => p.chain_depth <= 15).every((p) => p.chain_intact);
    const passed = allIntactAt15 && (latencyAtMax < 5000 || latencyAtMax === -1);

    notes.push(`Max verified depth: ${maxVerifiedDepth}`);
    notes.push(`Latency slope: ${latencySlope.toFixed(2)} ms/depth`);
    notes.push(`Chains intact: ${chainsIntact}/${totalVerified}`);
    if (latencyAtMax > 0) notes.push(`Latency at max depth: ${latencyAtMax}ms`);

    return {
        category: "cat2",
        mode: "V4.1",
        passed,
        metrics: {
            chains_intact: chainsIntact,
            total_verified: totalVerified,
            max_verified_depth: maxVerifiedDepth,
            latency_at_max_depth: latencyAtMax,
            latency_slope_per_depth: latencySlope,
            all_intact_at_15: allIntactAt15,
            depth_points: JSON.stringify(depthPoints),
        },
        queries: [],
        notes,
        benchmarks: computeBenchmarks(latencies),
    };
}

// ---------------------------------------------------------------------------
// Cat 3: Proof Documents
// ---------------------------------------------------------------------------

async function runCat3(pool: pg.Pool, mode: EngineMode): Promise<FeatureCategoryResult> {
    console.log(`\n=== Cat 3: Proof Documents [${mode}] ===`);

    await cleanAuditData(pool, TENANT_FEATURES);
    await ingestFeature(pool, CAT3_DOCS, mode, [], []);

    const latencies: number[] = [];
    const proofPoints: ProofDocumentPoint[] = [];
    const queries: Array<Record<string, unknown>> = [];
    const notes: string[] = [];

    for (let i = 0; i < CAT3_GROUND_TRUTH.length; i++) {
        const truth = CAT3_GROUND_TRUTH[i];
        const scenario = PROOF_SCENARIOS[i];

        console.log(`  [${scenario?.id}] Query: "${truth.query.slice(0, 60)}..."`);

        try {
            const start = performance.now();
            const qr = await queryAnswers(truth.query, {
                mode: truth.mode,
                topK: truth.topK,
                tenantId: TENANT_FEATURES,
            });
            const latency = performance.now() - start;
            latencies.push(latency);

            const scored = scoreQuery(qr, truth);

            // Extract proof document metrics from CROWN envelope
            const point: ProofDocumentPoint = {
                scenario: scenario?.id ?? `query_${i}`,
                receipt_generated: !!qr.crown.receiptId,
                receipt_id_present: !!qr.crown.receiptId && qr.crown.receiptId.length > 0,
                mises_size: qr.crown.miSESSize ?? 0,
                citation_ids_count: qr.crown.citationIds?.length ?? 0,
                fragility_present: qr.crown.fragilityScore !== undefined && qr.crown.fragilityScore !== null,
                signed: qr.crown.signed,
                knowledge_state_cursor_present: qr.crown.knowledgeStateCursor !== undefined && qr.crown.knowledgeStateCursor !== null,
                crown_mode_applied: qr.crown.modeApplied ?? "unknown",
                // COSE defaults — populated below if receipt is signed
                cose_envelope_present: false,
                cose_signature_valid: false,
                cose_kid_present: false,
                cose_cwt_issuer: null,
                cose_cwt_subject: null,
                cose_content_type_correct: false,
                cose_algorithm_correct: false,
                cose_cbor_receipt_hash_match: false,
            };

            // COSE_Sign1 envelope verification (SCITT alignment)
            if (qr.crown.signed && qr.answerId) {
                try {
                    const receiptData = await fetchReceipt(qr.answerId);
                    const cose = verifyCoseEnvelope(receiptData);
                    point.cose_envelope_present = cose.envelope_present;
                    point.cose_signature_valid = cose.signature_valid;
                    point.cose_kid_present = cose.kid_present;
                    point.cose_cwt_issuer = cose.cwt_issuer;
                    point.cose_cwt_subject = cose.cwt_subject;
                    point.cose_content_type_correct = cose.content_type_correct;
                    point.cose_algorithm_correct = cose.algorithm_correct;
                    point.cose_cbor_receipt_hash_match = cose.cbor_receipt_hash_match;
                    if (cose.error) point.cose_error = cose.error;
                } catch (coseErr) {
                    const coseMsg = coseErr instanceof Error ? coseErr.message : String(coseErr);
                    point.cose_error = coseMsg.slice(0, 200);
                    notes.push(`${scenario?.id}: COSE fetch error: ${coseMsg.slice(0, 120)}`);
                }
            }

            proofPoints.push(point);

            queries.push({
                ...scored,
                scenario: scenario?.id,
                latency_ms: Math.round(latency),
                proof: point,
            });

            const coseStatus = point.cose_envelope_present
                ? (point.cose_signature_valid ? "COSE:PASS" : `COSE:FAIL${point.cose_error ? ` (${point.cose_error.slice(0, 40)})` : ""}`)
                : (point.signed ? "COSE:missing" : "unsigned");
            console.log(`    Receipt: ${point.receipt_generated ? "YES" : "NO"} | MiSES: ${point.mises_size} | Signed: ${point.signed} | Fragility: ${point.fragility_present ? qr.crown.fragilityScore?.toFixed(3) : "N/A"} | ${coseStatus}`);

            // Detailed notes
            if (!point.receipt_generated) notes.push(`${scenario?.id}: No receipt generated`);
            if (point.mises_size === 0) notes.push(`${scenario?.id}: MiSES empty`);
            if (scored.notes.length > 0) notes.push(...scored.notes.map((n) => `${scenario?.id}: ${n}`));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    X Query failed: ${msg.slice(0, 120)}`);
            notes.push(`${scenario?.id}: Query error: ${msg.slice(0, 200)}`);
            queries.push({
                query: truth.query,
                scenario: scenario?.id,
                metrics: { error: msg.slice(0, 200) },
                notes: [`Query error: ${msg.slice(0, 200)}`],
            });
        }
    }

    // Aggregate proof metrics
    const receiptsGenerated = proofPoints.filter((p) => p.receipt_generated).length;
    const allReceiptsPresent = receiptsGenerated === proofPoints.length;
    const avgMisesSize = proofPoints.length > 0 ? proofPoints.reduce((s, p) => s + p.mises_size, 0) / proofPoints.length : 0;
    const signedCount = proofPoints.filter((p) => p.signed).length;
    const fragilityCount = proofPoints.filter((p) => p.fragility_present).length;
    const cursorCount = proofPoints.filter((p) => p.knowledge_state_cursor_present).length;

    // COSE envelope aggregate metrics
    const coseEnvelopeCount = proofPoints.filter((p) => p.cose_envelope_present).length;
    const coseSigValidCount = proofPoints.filter((p) => p.cose_signature_valid).length;
    const coseKidCount = proofPoints.filter((p) => p.cose_kid_present).length;
    const coseCwtIssuerCount = proofPoints.filter((p) => p.cose_cwt_issuer !== null).length;
    const coseCwtSubjectCount = proofPoints.filter((p) => p.cose_cwt_subject !== null).length;
    const coseCtCorrectCount = proofPoints.filter((p) => p.cose_content_type_correct).length;
    const coseAlgCorrectCount = proofPoints.filter((p) => p.cose_algorithm_correct).length;
    const coseHashMatchCount = proofPoints.filter((p) => p.cose_cbor_receipt_hash_match).length;
    // COSE pass: all signed receipts have valid envelopes
    const signedPoints = proofPoints.filter((p) => p.signed);
    const allCoseValid = signedPoints.length > 0 && signedPoints.every((p) =>
        p.cose_envelope_present && p.cose_signature_valid &&
        p.cose_kid_present && p.cose_content_type_correct &&
        p.cose_algorithm_correct && p.cose_cbor_receipt_hash_match
    );

    // Mode consistency check
    const modeConsistent = proofPoints.every((p) => p.crown_mode_applied !== "unknown");

    notes.push(`Receipts generated: ${receiptsGenerated}/${proofPoints.length}`);
    notes.push(`Signed: ${signedCount}/${proofPoints.length}`);
    notes.push(`Fragility present: ${fragilityCount}/${proofPoints.length}`);
    notes.push(`Knowledge state cursor: ${cursorCount}/${proofPoints.length}`);
    notes.push(`Avg MiSES size: ${avgMisesSize.toFixed(1)}`);
    notes.push(`COSE envelopes: ${coseEnvelopeCount}/${signedCount} | sig valid: ${coseSigValidCount}/${signedCount} | hash match: ${coseHashMatchCount}/${signedCount}`);
    notes.push(`COSE kid: ${coseKidCount}/${signedCount} | CWT iss: ${coseCwtIssuerCount}/${signedCount} | CWT sub: ${coseCwtSubjectCount}/${signedCount}`);
    if (!allCoseValid && signedCount > 0) {
        notes.push(`COSE SCITT alignment: FAIL — not all signed receipts have valid COSE envelopes`);
    }

    // Pass: all receipts generated, mode applied is consistent, AND all COSE envelopes valid
    const passed = allReceiptsPresent && modeConsistent && allCoseValid;

    return {
        category: "cat3",
        mode,
        passed,
        metrics: {
            receipts_generated: receiptsGenerated,
            total_scenarios: proofPoints.length,
            all_receipts_present: allReceiptsPresent,
            avg_mises_size: avgMisesSize,
            signed_count: signedCount,
            fragility_present_count: fragilityCount,
            knowledge_cursor_count: cursorCount,
            mode_consistent: modeConsistent,
            cose_envelope_count: coseEnvelopeCount,
            cose_sig_valid_count: coseSigValidCount,
            cose_kid_count: coseKidCount,
            cose_cwt_issuer_count: coseCwtIssuerCount,
            cose_cwt_subject_count: coseCwtSubjectCount,
            cose_content_type_correct_count: coseCtCorrectCount,
            cose_algorithm_correct_count: coseAlgCorrectCount,
            cose_hash_match_count: coseHashMatchCount,
            all_cose_valid: allCoseValid,
            proof_points: JSON.stringify(proofPoints),
        },
        queries,
        notes,
        benchmarks: computeBenchmarks(latencies),
    };
}

// ---------------------------------------------------------------------------
// Cat 4: Watch Lifecycle
// ---------------------------------------------------------------------------

async function runCat4(pool: pg.Pool, mode: EngineMode): Promise<FeatureCategoryResult> {
    console.log(`\n=== Cat 4: Watch Lifecycle [${mode}] ===`);

    if (mode === "V1") {
        return {
            category: "cat4",
            mode,
            passed: true,
            metrics: { skipped: true },
            queries: [],
            notes: ["Skipped: V1 does not support living state"],
            benchmarks: computeBenchmarks([]),
        };
    }

    await cleanAuditData(pool, TENANT_FEATURES);
    const startMs = performance.now();
    await ingestFeature(pool, CAT4_DOCS, mode, CAT4_RELATIONS, CAT4_LIVING_STATES);
    const ingestLatency = performance.now() - startMs;

    // Query living states directly from DB
    const result = await pool.query(
        `SELECT ac.id AS chunk_id, als.living_status, als.confidence
         FROM engine.artifact_living_state als
         JOIN artifact_chunks ac ON ac.artifact_id = als.artifact_id
         WHERE als.tenant_id = $1`,
        [TENANT_FEATURES],
    );

    const actualMap = new Map<string, { status: string; confidence: number }>();
    for (const row of result.rows) {
        actualMap.set(row.chunk_id, { status: row.living_status, confidence: parseFloat(row.confidence) });
    }

    // Evaluate each scenario
    let totalCorrect = 0;
    let totalChecked = 0;
    const scenarioResults: Record<string, { correct: number; total: number; details: string[] }> = {};
    const notes: string[] = [];

    for (const scenario of WATCH_SCENARIOS) {
        const details: string[] = [];
        let correct = 0;

        console.log(`\n  Scenario: ${scenario.label}`);

        for (const checkpoint of scenario.checkpoints) {
            totalChecked++;
            const actual = actualMap.get(checkpoint.docId);

            if (!actual) {
                details.push(`${checkpoint.docId} (${checkpoint.label}): expected=${checkpoint.expectedStatus} actual=MISSING`);
                notes.push(`${scenario.id}: ${checkpoint.label} — missing from DB`);
                console.log(`    ${checkpoint.label}: MISSING (expected ${checkpoint.expectedStatus})`);
            } else if (actual.status === checkpoint.expectedStatus) {
                correct++;
                totalCorrect++;
                console.log(`    ${checkpoint.label}: ${actual.status} ✓ (confidence=${actual.confidence.toFixed(2)})`);
            } else {
                details.push(`${checkpoint.docId} (${checkpoint.label}): expected=${checkpoint.expectedStatus} actual=${actual.status}`);
                notes.push(`${scenario.id}: ${checkpoint.label} — expected=${checkpoint.expectedStatus} actual=${actual.status}`);
                console.log(`    ${checkpoint.label}: ${actual.status} ✗ (expected ${checkpoint.expectedStatus})`);
            }
        }

        scenarioResults[scenario.id] = {
            correct,
            total: scenario.checkpoints.length,
            details,
        };

        console.log(`  -> ${scenario.id}: ${correct}/${scenario.checkpoints.length} correct`);
    }

    const accuracy = totalChecked > 0 ? totalCorrect / totalChecked : 0;

    notes.push(`Overall accuracy: ${totalCorrect}/${totalChecked} (${(accuracy * 100).toFixed(1)}%)`);
    notes.push(`Ingest latency: ${Math.round(ingestLatency)}ms`);

    // Pass: >= 75% of checkpoints correct
    const passed = accuracy >= 0.75;

    return {
        category: "cat4",
        mode,
        passed,
        metrics: {
            accuracy,
            correct: totalCorrect,
            total: totalChecked,
            scenario_results: JSON.stringify(scenarioResults),
            ingest_latency_ms: Math.round(ingestLatency),
        },
        queries: [],
        notes,
        benchmarks: computeBenchmarks([ingestLatency]),
    };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(report: FeatureReport): string {
    const lines: string[] = [];
    lines.push(`# Feature-Level Audit Report — Ask, Reverse Ask, Proof Documents, Watch`);
    lines.push(``);
    lines.push(`**Run ID:** ${report.runId}`);
    lines.push(`**Started:** ${report.startedAt}`);
    lines.push(`**Finished:** ${report.finishedAt}`);
    lines.push(`**Host:** ${report.host}`);
    lines.push(`**Corpus:** ~50 docs, 4 feature categories`);
    lines.push(``);

    const catNames: Record<string, string> = {
        cat1: "Ask Accuracy (16 docs, 12 queries, 4 tiers)",
        cat2: "Reverse Ask (4 docs, 30 queries, receipt chain verification)",
        cat3: "Proof Documents (10 docs, 4 queries, CROWN integrity)",
        cat4: "Watch Lifecycle (20 docs, 4 scenarios, DB state checks)",
    };

    // Group by mode
    const byMode = new Map<string, FeatureCategoryResult[]>();
    for (const r of report.results) {
        const arr = byMode.get(r.mode) ?? [];
        arr.push(r);
        byMode.set(r.mode, arr);
    }

    for (const [mode, cats] of byMode) {
        lines.push(`## Mode: ${mode}`);
        lines.push(``);

        for (const cat of cats) {
            lines.push(`### ${catNames[cat.category] ?? cat.category}`);
            lines.push(``);
            lines.push(`**Passed:** ${cat.passed ? "YES" : "NO"}`);
            lines.push(``);

            // Benchmarks
            lines.push(`#### Benchmarks`);
            lines.push(``);
            lines.push(`| Metric | Value |`);
            lines.push(`|--------|-------|`);
            lines.push(`| p50 latency | ${cat.benchmarks.latency_p50_ms}ms |`);
            lines.push(`| p95 latency | ${cat.benchmarks.latency_p95_ms}ms |`);
            lines.push(`| max latency | ${cat.benchmarks.latency_max_ms}ms |`);
            lines.push(`| total queries | ${cat.benchmarks.total_queries} |`);
            lines.push(`| total duration | ${cat.benchmarks.total_duration_ms}ms |`);
            lines.push(``);

            // Metrics table (skip JSON blobs)
            lines.push(`#### Metrics`);
            lines.push(``);
            lines.push(`| Metric | Value |`);
            lines.push(`|--------|-------|`);
            for (const [k, v] of Object.entries(cat.metrics)) {
                if (typeof v === "string" && (v.startsWith("[") || v.startsWith("{"))) continue;
                const display = typeof v === "number"
                    ? (Number.isInteger(v) ? v.toString() : (v as number).toFixed(4))
                    : String(v);
                lines.push(`| ${k} | ${display} |`);
            }
            lines.push(``);

            // Tier breakdown (Cat 1)
            if (cat.category === "cat1") {
                lines.push(`#### Tier Breakdown`);
                lines.push(``);
                lines.push(`| Tier | Avg Recall | Avg Retrieved Recall | Found/Total |`);
                lines.push(`|------|-----------|---------------------|-------------|`);
                for (const tier of ["simple", "multi-hop", "adversarial", "ambiguous"]) {
                    const recall = (cat.metrics[`${tier}_avg_recall`] as number) ?? 0;
                    const rr = (cat.metrics[`${tier}_avg_retrieved_recall`] as number) ?? 0;
                    const found = cat.metrics[`${tier}_found`] ?? 0;
                    const total = cat.metrics[`${tier}_total`] ?? 0;
                    lines.push(`| ${tier} | ${(recall as number).toFixed(2)} | ${(rr as number).toFixed(2)} | ${found}/${total} |`);
                }
                lines.push(``);
            }

            // Depth curve (Cat 2)
            if (cat.metrics.depth_points) {
                const points: ReverseAskPoint[] = JSON.parse(cat.metrics.depth_points as string);
                lines.push(`#### Receipt Chain Depth Curve`);
                lines.push(``);
                lines.push(`| Depth | Verify Latency (ms) | Query Latency (ms) | Chain Intact |`);
                lines.push(`|------:|-------------------:|------------------:|:------------:|`);
                for (const p of points) {
                    lines.push(`| ${p.chain_depth} | ${p.verify_latency_ms} | ${p.query_latency_ms} | ${p.chain_intact ? "YES" : "NO"} |`);
                }
                lines.push(``);
            }

            // Proof points (Cat 3)
            if (cat.metrics.proof_points) {
                const points: ProofDocumentPoint[] = JSON.parse(cat.metrics.proof_points as string);
                lines.push(`#### Proof Document Details`);
                lines.push(``);
                lines.push(`| Scenario | Receipt | MiSES Size | Signed | Fragility | Cursor | Mode |`);
                lines.push(`|----------|:-------:|----------:|:------:|:---------:|:------:|------|`);
                for (const p of points) {
                    lines.push(`| ${p.scenario} | ${p.receipt_generated ? "YES" : "NO"} | ${p.mises_size} | ${p.signed ? "YES" : "NO"} | ${p.fragility_present ? "YES" : "NO"} | ${p.knowledge_state_cursor_present ? "YES" : "NO"} | ${p.crown_mode_applied} |`);
                }
                lines.push(``);

                // COSE_Sign1 envelope verification details
                const cosePoints = points.filter((p) => p.signed);
                if (cosePoints.length > 0) {
                    lines.push(`#### COSE_Sign1 Envelope Verification (SCITT Alignment)`);
                    lines.push(``);
                    lines.push(`| Scenario | Envelope | Sig Valid | Kid | CWT iss | CWT sub | Content-Type | Alg | Hash Match |`);
                    lines.push(`|----------|:--------:|:---------:|:---:|:-------:|:-------:|:------------:|:---:|:----------:|`);
                    for (const p of cosePoints) {
                        lines.push(`| ${p.scenario} | ${p.cose_envelope_present ? "YES" : "NO"} | ${p.cose_signature_valid ? "YES" : "NO"} | ${p.cose_kid_present ? "YES" : "NO"} | ${p.cose_cwt_issuer ? "YES" : "NO"} | ${p.cose_cwt_subject ? "YES" : "NO"} | ${p.cose_content_type_correct ? "YES" : "NO"} | ${p.cose_algorithm_correct ? "YES" : "NO"} | ${p.cose_cbor_receipt_hash_match ? "YES" : "NO"} |`);
                    }
                    lines.push(``);
                }
            }

            // Scenario results (Cat 4)
            if (cat.metrics.scenario_results) {
                const scenarios: Record<string, { correct: number; total: number; details: string[] }> =
                    JSON.parse(cat.metrics.scenario_results as string);
                lines.push(`#### Lifecycle Scenario Results`);
                lines.push(``);
                lines.push(`| Scenario | Correct | Total | Accuracy |`);
                lines.push(`|---------|--------:|------:|---------:|`);
                for (const [key, val] of Object.entries(scenarios)) {
                    const acc = val.total > 0 ? (val.correct / val.total * 100).toFixed(0) : "N/A";
                    lines.push(`| ${key} | ${val.correct} | ${val.total} | ${acc}% |`);
                }
                lines.push(``);

                // Show mismatches
                const allDetails = Object.values(scenarios).flatMap((s) => s.details);
                if (allDetails.length > 0) {
                    lines.push(`#### State Mismatches`);
                    lines.push(``);
                    for (const d of allDetails) lines.push(`- ${d}`);
                    lines.push(``);
                }
            }

            // Notes
            if (cat.notes.length > 0) {
                lines.push(`#### Notes`);
                for (const n of cat.notes) lines.push(`- ${n}`);
                lines.push(``);
            }

            // Query details (if <= 15 queries)
            if (cat.queries.length > 0 && cat.queries.length <= 15) {
                lines.push(`#### Query Details`);
                lines.push(``);
                for (const q of cat.queries as Array<{ query?: string; metrics?: Record<string, unknown>; notes?: string[]; tier?: string; scenario?: string }>) {
                    const label = q.tier ? `[${q.tier}]` : q.scenario ? `[${q.scenario}]` : "";
                    lines.push(`**${label} Query:** "${q.query ?? "N/A"}"`);
                    if (q.metrics) {
                        const displayMetrics = Object.entries(q.metrics)
                            .filter(([k]) => !["found_ids", "missing_ids", "mises_actual", "retrieved_ids", "error"].includes(k))
                            .map(([k, v]) => {
                                const val = typeof v === "number" ? (Number.isInteger(v) ? v : (v as number).toFixed(3)) : v;
                                return `${k}=${val}`;
                            });
                        lines.push(`Metrics: ${displayMetrics.join(", ")}`);
                    }
                    if (q.notes && q.notes.length > 0) {
                        for (const n of q.notes) lines.push(`- ${n}`);
                    }
                    lines.push(``);
                }
            }
        }
    }

    // Summary
    lines.push(`## Summary`);
    lines.push(``);
    lines.push(`| Category | Mode | Passed | p50 (ms) | p95 (ms) |`);
    lines.push(`|----------|------|:------:|---------:|---------:|`);
    for (const r of report.results) {
        lines.push(`| ${catNames[r.category]?.split("(")[0]?.trim() ?? r.category} | ${r.mode} | ${r.passed ? "YES" : "NO"} | ${r.benchmarks.latency_p50_ms} | ${r.benchmarks.latency_p95_ms} |`);
    }
    lines.push(``);

    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const { modes, cats, dryRun } = parseArgs();

    if (dryRun) {
        const valid = validateCorpus();
        process.exit(valid ? 0 : 1);
    }

    console.log(`Feature-Level Audit: modes=${modes.join(",")} categories=${cats.join(",")}`);

    const pool = createPool();
    const runId = randomUUID().slice(0, 8);
    const startedAt = new Date().toISOString();

    const results: FeatureCategoryResult[] = [];

    // Cat 2 runs once (verified mode only), not per-mode
    let cat2Done = false;

    for (const mode of modes) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`MODE: ${mode}`);
        console.log(`${"=".repeat(60)}`);

        for (const cat of cats) {
            // Cat 4 requires living state — skip V1
            if (cat === "cat4" && mode === "V1") {
                results.push({
                    category: "cat4",
                    mode,
                    passed: true,
                    metrics: { skipped: true },
                    queries: [],
                    notes: ["Skipped: V1 does not support living state"],
                    benchmarks: computeBenchmarks([]),
                });
                continue;
            }

            // Cat 2 runs once
            if (cat === "cat2") {
                if (!cat2Done) {
                    const result = await runCat2(pool);
                    results.push(result);
                    cat2Done = true;
                    console.log(`\n  -> cat2 [verified]: ${result.passed ? "PASSED" : "FAILED"}`);
                }
                continue;
            }

            const runners: Record<string, (pool: pg.Pool, mode: EngineMode) => Promise<FeatureCategoryResult>> = {
                cat1: runCat1,
                cat3: runCat3,
                cat4: runCat4,
            };

            const runner = runners[cat];
            if (!runner) {
                console.error(`  Unknown category: ${cat}`);
                continue;
            }

            const result = await runner(pool, mode);
            results.push(result);
            console.log(`\n  -> ${cat} [${mode}]: ${result.passed ? "PASSED" : "FAILED"}`);
        }
    }

    const finishedAt = new Date().toISOString();

    // Build report
    const report: FeatureReport = {
        runId,
        startedAt,
        finishedAt,
        host: process.env.HOSTNAME ?? "unknown",
        results,
        summary: {
            total_passed: results.filter((r) => r.passed).length,
            total_categories: results.length,
            duration_s: ((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(1),
        },
    };

    // Clean up
    console.log(`\nCleaning up audit data...`);
    await cleanAuditData(pool, TENANT_FEATURES);
    await pool.end();

    // Write results
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = join(RESULTS_DIR, `audit-features-${timestamp}.json`);
    const mdPath = join(RESULTS_DIR, `audit-features-${timestamp}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(mdPath, generateMarkdownReport(report));

    console.log(`\n${"=".repeat(60)}`);
    console.log(`FEATURE-LEVEL AUDIT COMPLETE`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  Duration: ${report.summary.duration_s}s`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Report: ${mdPath}`);
    console.log(`  Passed: ${report.summary.total_passed}/${report.summary.total_categories}`);
    console.log(`${"=".repeat(60)}`);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
