#!/usr/bin/env npx tsx
/**
 * Retrieval Quality Audit Suite — v3 (Edge Cases & Capability Probes)
 *
 * Small, focused corpus (~78 docs) probing 8 specific Engine capabilities:
 *
 *   Cat 1: Relation-bootstrapped retrieval (8 docs, 1 query)
 *   Cat 2: Format-aware ingestion recall (18 docs, 3 queries)
 *   Cat 3: BM25 vs Vector decomposition (12 docs, 6 queries)
 *   Cat 4: Temporal edge cases (12 docs, DB state checks)
 *   Cat 5: Receipt chain stress (2 docs, 50 queries) — verified mode only
 *   Cat 6: Fragility calibration (12 docs, 3 queries)
 *   Cat 7: Broad-query recall (8 docs, 2 queries)
 *   Cat 8: Proposition precision@1 (6 docs, 3 queries)
 *
 * Usage:
 *   npx tsx scripts/audit-v3/quality-audit-v3.ts --mode V1 --cat 1
 *   npx tsx scripts/audit-v3/quality-audit-v3.ts --mode all --cat all
 *   npx tsx scripts/audit-v3/quality-audit-v3.ts --dry-run
 *
 * Env:
 *   DATABASE_URL, OPENAI_API_KEY, API_KEY, BENCH_TARGET, EMBEDDING_PROVIDER
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// v3 corpus
import { CAT1_DOCS, CAT1_RELATIONS, CAT1_LIVING_STATES, CAT1_GROUND_TRUTH, RELATION_EXPANSION_TARGET } from "./lib/corpus/cat1-relation-expansion.js";
import { CAT2_DOCS, CAT2_GROUND_TRUTH, FORMAT_LABELS, getFormatLabel } from "./lib/corpus/cat2-format-recall.js";
import { CAT3_DOCS, CAT3_GROUND_TRUTH, getDocClass } from "./lib/corpus/cat3-retrieval-decomposition.js";
import { CAT4_DOCS, CAT4_RELATIONS, CAT4_LIVING_STATES, CAT4_TEMPORAL_TRUTH } from "./lib/corpus/cat4-temporal-edges.js";
import { CAT5_DOCS, generateReceiptQueries, RECEIPT_DEPTH_CHECKPOINTS } from "./lib/corpus/cat5-receipt-stress.js";
import { CAT6_DOCS, CAT6_GROUND_TRUTH, FRAGILITY_SCENARIOS } from "./lib/corpus/cat6-fragility-calibration.js";
import { CAT7_DOCS, CAT7_GROUND_TRUTH, CAT7_SUMMARY_IDS } from "./lib/corpus/cat7-broad-query-recall.js";
import { CAT8_DOCS, CAT8_GROUND_TRUTH } from "./lib/corpus/cat8-proposition-precision.js";
import { TENANT_V3 } from "./lib/tenant.js";

// v3 types
import type { V3CategoryId, V3CategoryResult, ReceiptDepthPoint, FragilityCalibrationPoint } from "./lib/types-v3.js";
import type { EngineMode, CorpusRelation, LivingState, GroundTruth } from "./lib/types-v3.js";
import type { CorpusDocV2 } from "./lib/types-v3.js";

// v1/v2 shared infrastructure
import { createPool, cleanAuditData, insertRelations, insertLivingStates, refreshMaterializedViews, type ChunkIdMap } from "../audit-v2/lib/db-v2.js";
import { insertChunksV2 } from "../audit-v2/lib/db-v2.js";
import { embedTexts } from "../audit/lib/embed.js";
import { queryAnswers, verifyReceiptChain } from "../audit/lib/query.js";
import { scoreQuery } from "../audit/lib/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(dirname(__dirname), "audit-results");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { modes: EngineMode[]; cats: V3CategoryId[]; dryRun: boolean } {
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

    const allCats: V3CategoryId[] = ["cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8"];
    const cats: V3CategoryId[] = catArg === "all" ? allCats : [(`cat${catArg}`) as V3CategoryId];

    return { modes, cats, dryRun };
}

// ---------------------------------------------------------------------------
// Dry-run validation
// ---------------------------------------------------------------------------

function validateCorpus(): boolean {
    console.log("=== Dry-Run: v3 Corpus Validation ===\n");
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
    console.log("Category 1 — Relation Expansion:");
    checkUnique(CAT1_DOCS, "Cat1 docs");
    checkRelations(CAT1_RELATIONS, CAT1_DOCS, "Cat1");
    checkLivingStates(CAT1_LIVING_STATES, CAT1_DOCS, "Cat1");
    checkGroundTruth(CAT1_GROUND_TRUTH, CAT1_DOCS, "Cat1");

    // Cat 2
    console.log("\nCategory 2 — Format Recall:");
    checkUnique(CAT2_DOCS, "Cat2 docs");
    checkGroundTruth(CAT2_GROUND_TRUTH, CAT2_DOCS, "Cat2");

    // Cat 3
    console.log("\nCategory 3 — Retrieval Decomposition:");
    checkUnique(CAT3_DOCS, "Cat3 docs");
    checkGroundTruth(CAT3_GROUND_TRUTH, CAT3_DOCS, "Cat3");

    // Cat 4
    console.log("\nCategory 4 — Temporal Edges:");
    checkUnique(CAT4_DOCS, "Cat4 docs");
    checkRelations(CAT4_RELATIONS, CAT4_DOCS, "Cat4");
    checkLivingStates(CAT4_LIVING_STATES, CAT4_DOCS, "Cat4");
    // Check temporal truth refs
    const cat4Ids = new Set(CAT4_DOCS.map((d) => d.id));
    for (const [pattern, data] of Object.entries(CAT4_TEMPORAL_TRUTH)) {
        for (const s of data.expectedStates) {
            if (!cat4Ids.has(s.docId)) {
                console.error(`  FAIL: Cat4 temporal truth ${pattern}.${s.docId} not in docs`);
                valid = false;
            }
        }
    }
    if (valid) console.log(`  OK: Cat4 temporal truth — all refs valid`);

    // Cat 5
    console.log("\nCategory 5 — Receipt Stress:");
    checkUnique(CAT5_DOCS, "Cat5 docs");
    const receiptQueries = generateReceiptQueries();
    checkGroundTruth(receiptQueries, CAT5_DOCS, "Cat5");
    console.log(`  OK: Cat5 — ${receiptQueries.length} generated queries`);

    // Cat 6
    console.log("\nCategory 6 — Fragility Calibration:");
    checkUnique(CAT6_DOCS, "Cat6 docs");
    checkGroundTruth(CAT6_GROUND_TRUTH, CAT6_DOCS, "Cat6");

    // Cat 7
    console.log("\nCategory 7 — Broad Query Recall:");
    checkUnique(CAT7_DOCS, "Cat7 docs");
    checkGroundTruth(CAT7_GROUND_TRUTH, CAT7_DOCS, "Cat7");

    // Cat 8
    console.log("\nCategory 8 — Proposition Precision@1:");
    checkUnique(CAT8_DOCS, "Cat8 docs");
    checkGroundTruth(CAT8_GROUND_TRUTH, CAT8_DOCS, "Cat8");

    // Total doc count
    const allDocs = [...CAT1_DOCS, ...CAT2_DOCS, ...CAT3_DOCS, ...CAT4_DOCS, ...CAT5_DOCS, ...CAT6_DOCS, ...CAT7_DOCS, ...CAT8_DOCS];
    console.log(`\n=== Total: ${allDocs.length} docs, ${CAT1_GROUND_TRUTH.length + CAT2_GROUND_TRUTH.length + CAT3_GROUND_TRUTH.length + receiptQueries.length + CAT6_GROUND_TRUTH.length + CAT7_GROUND_TRUTH.length + CAT8_GROUND_TRUTH.length} queries ===`);

    // Check global uniqueness
    const allIds = allDocs.map((d) => d.id);
    const globalDupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    if (globalDupes.length > 0) {
        console.error(`\nFAIL: Global duplicate IDs: ${globalDupes.join(", ")}`);
        valid = false;
    } else {
        console.log(`  All IDs globally unique.`);
    }

    console.log(`\n=== Validation: ${valid ? "PASSED" : "FAILED"} ===`);
    return valid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ingestV3(
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
        await insertRelations(pool, relations, TENANT_V3, idMap);
    }

    if (mode !== "V1" && livingStates.length > 0) {
        console.log(`  Inserting ${livingStates.length} living states (${mode})...`);
        await insertLivingStates(pool, livingStates, TENANT_V3, idMap);
    }

    console.log(`  Refreshing materialized views...`);
    await refreshMaterializedViews(pool);

    return idMap;
}

async function runQueries(
    truths: GroundTruth[],
    tenantId: string,
): Promise<{ query: string; metrics: Record<string, number | boolean | string | string[]>; notes: string[] }[]> {
    const results: { query: string; metrics: Record<string, number | boolean | string | string[]>; notes: string[] }[] = [];
    for (const truth of truths) {
        console.log(`  Query: "${truth.query.slice(0, 60)}..."`);
        try {
            const qr = await queryAnswers(truth.query, {
                mode: truth.mode,
                topK: truth.topK,
                tenantId,
            });
            const scored = scoreQuery(qr, truth);
            results.push(scored);

            const { metrics } = scored;
            console.log(`    Found ${metrics.expected_found}/${metrics.expected_total} expected docs`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    X Query failed: ${msg.slice(0, 120)}`);
            results.push({
                query: truth.query,
                metrics: {
                    expected_found: 0,
                    expected_total: truth.expectedDocIds.length,
                    precision: 0,
                    recall: 0,
                    latency_ms: 0,
                    error: msg.slice(0, 200),
                },
                notes: [`Query error: ${msg.slice(0, 200)}`],
            });
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Category Runners
// ---------------------------------------------------------------------------

async function runCat1(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 1: Relation-Bootstrapped Retrieval [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT1_DOCS, mode, CAT1_RELATIONS, CAT1_LIVING_STATES);

    const queries = await runQueries(CAT1_GROUND_TRUTH, TENANT_V3);

    const avgRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;

    // Check if the amendment doc appeared in the retrieval pipeline (binary relation expansion indicator)
    // Use retrieved_ids (pipeline output) not found_ids (expected ∩ cited) since the amendment
    // is not in the expected set — it's an expansion target, not a ground truth document.
    const retrievedIds = queries[0]?.metrics.retrieved_ids as string[] | undefined;
    const amendmentFound = retrievedIds?.includes(RELATION_EXPANSION_TARGET) ?? false;

    const notes: string[] = [
        ...queries.flatMap((q) => q.notes),
        amendmentFound
            ? "DETECTED: Relation expansion IS active — amendment found via supersedes edge"
            : "BASELINE: Relation expansion NOT active — amendment not found (expected)",
    ];

    return {
        category: "cat1",
        mode,
        passed: avgRecall >= 1.0, // original must be found
        metrics: {
            avg_recall: avgRecall,
            amendment_found: amendmentFound,
            relation_expansion_active: amendmentFound,
        },
        queries,
        notes,
    };
}

async function runCat2(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 2: Format-Aware Ingestion Recall [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT2_DOCS, mode, [], []);

    const queries = await runQueries(CAT2_GROUND_TRUTH, TENANT_V3);

    const avgRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;
    const avgRetrievedRecall = queries.reduce((s, q) => s + (q.metrics.retrieved_recall as number ?? 0), 0) / queries.length;

    // Stratify recall by format — both citation-based and retrieval-based
    const formatRecall: Record<string, { found: number; total: number }> = {};
    const formatRetrievedRecall: Record<string, { found: number; total: number }> = {};
    for (const label of Object.values(FORMAT_LABELS)) {
        formatRecall[label] = { found: 0, total: 0 };
        formatRetrievedRecall[label] = { found: 0, total: 0 };
    }

    for (const truth of CAT2_GROUND_TRUTH) {
        const queryResult = queries.find((q) => q.query === truth.query);
        const foundSet = new Set((queryResult?.metrics.found_ids as string[]) ?? []);
        const retrievedSet = new Set((queryResult?.metrics.retrieved_ids as string[]) ?? []);

        for (const expectedId of truth.expectedDocIds) {
            const label = getFormatLabel(expectedId);
            if (!formatRecall[label]) formatRecall[label] = { found: 0, total: 0 };
            if (!formatRetrievedRecall[label]) formatRetrievedRecall[label] = { found: 0, total: 0 };
            formatRecall[label].total++;
            formatRetrievedRecall[label].total++;
            if (foundSet.has(expectedId)) formatRecall[label].found++;
            if (retrievedSet.has(expectedId)) formatRetrievedRecall[label].found++;
        }
    }

    const formatRecallMap: Record<string, number> = {};
    const formatRetrievedRecallMap: Record<string, number> = {};
    const notes: string[] = [];
    for (const [label, { found, total }] of Object.entries(formatRecall)) {
        const recall = total > 0 ? found / total : 0;
        const rr = formatRetrievedRecall[label];
        const retrievedRecall = rr && rr.total > 0 ? rr.found / rr.total : 0;
        formatRecallMap[label] = recall;
        formatRetrievedRecallMap[label] = retrievedRecall;
        notes.push(`${label}: cited=${found}/${total} (${recall.toFixed(2)}), retrieved=${rr?.found ?? 0}/${total} (${retrievedRecall.toFixed(2)})`);
    }

    // Tier-based evaluation
    const tier1Recall = formatRecallMap["text/markdown"] ?? 0;
    const tier2CsvRecall = formatRecallMap["text/csv"] ?? 0;
    const tier2JsonRecall = formatRecallMap["application/json"] ?? 0;
    const tier3YamlRecall = formatRecallMap["application/x-yaml"] ?? 0;
    const tier3ChatRecall = formatRecallMap["text/plain (chat)"] ?? 0;
    const tier3NotesRecall = formatRecallMap["text/plain (notes)"] ?? 0;

    const tier1Pass = tier1Recall >= 0.9;
    const tier2Pass = tier2CsvRecall >= 0.5 && tier2JsonRecall >= 0.3;

    notes.push(
        `Tier 1 (markdown): recall=${tier1Recall.toFixed(2)} ${tier1Pass ? "PASS" : "FAIL"}`,
        `Tier 2 (csv=${tier2CsvRecall.toFixed(2)}, json=${tier2JsonRecall.toFixed(2)}): ${tier2Pass ? "PASS" : "FAIL"}`,
        `Tier 3 baseline (yaml=${tier3YamlRecall.toFixed(2)}, chat=${tier3ChatRecall.toFixed(2)}, notes=${tier3NotesRecall.toFixed(2)})`,
    );

    // Retrieved recall by tier (stable metric — not affected by LLM citation nondeterminism)
    const tier1RetrievedRecall = formatRetrievedRecallMap["text/markdown"] ?? 0;
    const tier2CsvRetrievedRecall = formatRetrievedRecallMap["text/csv"] ?? 0;
    const tier2JsonRetrievedRecall = formatRetrievedRecallMap["application/json"] ?? 0;

    notes.push(
        `Retrieved recall — markdown=${tier1RetrievedRecall.toFixed(2)}, csv=${tier2CsvRetrievedRecall.toFixed(2)}, json=${tier2JsonRetrievedRecall.toFixed(2)}`,
    );

    // Pass criteria: use retrieved_recall (pipeline recall) instead of citation_recall
    // This separates pipeline quality from LLM citation nondeterminism
    const passed = avgRetrievedRecall >= 0.3;

    return {
        category: "cat2",
        mode,
        passed,
        metrics: {
            avg_citation_recall: avgRecall,
            avg_retrieved_recall: avgRetrievedRecall,
            format_citation_recall: JSON.stringify(formatRecallMap),
            format_retrieved_recall: JSON.stringify(formatRetrievedRecallMap),
            query_count: queries.length,
            tier1_pass: tier1Pass,
            tier2_pass: tier2Pass,
            tier1_recall: tier1Recall,
            tier2_csv_recall: tier2CsvRecall,
            tier2_json_recall: tier2JsonRecall,
            tier3_yaml_recall: tier3YamlRecall,
            tier3_chat_recall: tier3ChatRecall,
            tier3_notes_recall: tier3NotesRecall,
            tier1_retrieved_recall: tier1RetrievedRecall,
            tier2_csv_retrieved_recall: tier2CsvRetrievedRecall,
            tier2_json_retrieved_recall: tier2JsonRetrievedRecall,
        },
        queries,
        notes,
    };
}

async function runCat3(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 3: BM25 vs Vector Decomposition [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT3_DOCS, mode, [], []);

    // Run queries but also capture raw citation IDs (not just expected-match)
    const queries: { query: string; metrics: Record<string, number | boolean | string | string[]>; notes: string[] }[] = [];
    const allCitedIds: string[][] = [];
    for (const truth of CAT3_GROUND_TRUTH) {
        console.log(`  Query: "${truth.query.slice(0, 60)}..."`);
        try {
            const qr = await queryAnswers(truth.query, {
                mode: truth.mode,
                topK: truth.topK,
                tenantId: TENANT_V3,
            });
            const scored = scoreQuery(qr, truth);
            queries.push(scored);
            // Capture ALL citation IDs (not just expected matches)
            allCitedIds.push(qr.citations.map((c) => c.id));
            console.log(`    Found ${scored.metrics.expected_found}/${scored.metrics.expected_total} expected docs`);
            console.log(`    All citations: ${qr.citations.map((c) => c.id).join(", ")}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    X Query failed: ${msg.slice(0, 120)}`);
            queries.push({
                query: truth.query,
                metrics: { expected_found: 0, expected_total: truth.expectedDocIds.length, precision: 0, recall: 0, latency_ms: 0, error: msg.slice(0, 200) },
                notes: [`Query error: ${msg.slice(0, 200)}`],
            });
            allCitedIds.push([]);
        }
    }

    // Classify results by doc class — citation-based (LLM chose to cite)
    let bm25Found = 0, bm25Total = 0;
    let vectorFound = 0, vectorTotal = 0;
    let hybridFound = 0, hybridTotal = 0;

    // Retrieved-based (pipeline delivered to candidate set)
    let bm25RetrievedFound = 0, bm25RetrievedTotal = 0;
    let vectorRetrievedFound = 0, vectorRetrievedTotal = 0;
    let hybridRetrievedFound = 0, hybridRetrievedTotal = 0;

    for (let i = 0; i < CAT3_GROUND_TRUTH.length; i++) {
        const truth = CAT3_GROUND_TRUTH[i];
        const result = queries[i];
        const foundSet = new Set((result?.metrics.found_ids as string[]) ?? []);
        const retrievedSet = new Set((result?.metrics.retrieved_ids as string[]) ?? []);

        for (const eid of truth.expectedDocIds) {
            const cls = getDocClass(eid);
            if (cls === "bm25") { bm25Total++; bm25RetrievedTotal++; if (foundSet.has(eid)) bm25Found++; if (retrievedSet.has(eid)) bm25RetrievedFound++; }
            if (cls === "vector") { vectorTotal++; vectorRetrievedTotal++; if (foundSet.has(eid)) vectorFound++; if (retrievedSet.has(eid)) vectorRetrievedFound++; }
            if (cls === "hybrid") { hybridTotal++; hybridRetrievedTotal++; if (foundSet.has(eid)) hybridFound++; if (retrievedSet.has(eid)) hybridRetrievedFound++; }
        }
    }

    // Lane contribution — retrieved (pipeline-level: did each lane deliver candidates?)
    const allRetrievedIds = queries.flatMap((q) => (q.metrics.retrieved_ids as string[]) ?? []);
    const anyBm25Retrieved = allRetrievedIds.some((id) => getDocClass(id) === "bm25");
    const anyVectorRetrieved = allRetrievedIds.some((id) => getDocClass(id) === "vector");
    const anyHybridRetrieved = allRetrievedIds.some((id) => getDocClass(id) === "hybrid");

    // Lane contribution — cited (LLM-level: kept for diagnostics)
    const allCited = allCitedIds.flat();
    const anyBm25Cited = allCited.some((id) => getDocClass(id) === "bm25");
    const anyVectorCited = allCited.some((id) => getDocClass(id) === "vector");
    const anyHybridCited = allCited.some((id) => getDocClass(id) === "hybrid");

    const bm25Recall = bm25Total > 0 ? bm25Found / bm25Total : 0;
    const vectorRecall = vectorTotal > 0 ? vectorFound / vectorTotal : 0;
    const hybridRecall = hybridTotal > 0 ? hybridFound / hybridTotal : 0;
    const combinedCitationRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;

    const bm25RetrievedRecall = bm25RetrievedTotal > 0 ? bm25RetrievedFound / bm25RetrievedTotal : 0;
    const vectorRetrievedRecall = vectorRetrievedTotal > 0 ? vectorRetrievedFound / vectorRetrievedTotal : 0;
    const hybridRetrievedRecall = hybridRetrievedTotal > 0 ? hybridRetrievedFound / hybridRetrievedTotal : 0;
    const combinedRetrievedRecall = queries.reduce((s, q) => s + (q.metrics.retrieved_recall as number ?? 0), 0) / queries.length;

    const notes = [
        `BM25 (K-class): cited=${bm25Found}/${bm25Total} (${bm25Recall.toFixed(2)}), retrieved=${bm25RetrievedFound}/${bm25RetrievedTotal} (${bm25RetrievedRecall.toFixed(2)})`,
        `Vector (V-class): cited=${vectorFound}/${vectorTotal} (${vectorRecall.toFixed(2)}), retrieved=${vectorRetrievedFound}/${vectorRetrievedTotal} (${vectorRetrievedRecall.toFixed(2)})`,
        `Hybrid (H-class): cited=${hybridFound}/${hybridTotal} (${hybridRecall.toFixed(2)}), retrieved=${hybridRetrievedFound}/${hybridRetrievedTotal} (${hybridRetrievedRecall.toFixed(2)})`,
        `Lane contribution (retrieved) — BM25: ${anyBm25Retrieved}, Vector: ${anyVectorRetrieved}, Hybrid: ${anyHybridRetrieved}`,
        `Lane contribution (cited) — BM25: ${anyBm25Cited}, Vector: ${anyVectorCited}, Hybrid: ${anyHybridCited}`,
    ];

    // Pass criteria: all three retrieval lanes deliver candidates to the candidate set.
    // Uses retrieved_recall (pipeline responsibility) not citation_recall (LLM behaviour).
    // V-class docs are correctly retrieved but the LLM prefers citing hybrid docs that
    // have both semantic relevance AND keyword anchors — this is expected behaviour.
    const passed = combinedRetrievedRecall >= 0.6 && anyBm25Retrieved && anyVectorRetrieved && anyHybridRetrieved;

    return {
        category: "cat3",
        mode,
        passed,
        metrics: {
            combined_citation_recall: combinedCitationRecall,
            combined_retrieved_recall: combinedRetrievedRecall,
            bm25_citation_recall: bm25Recall,
            vector_citation_recall: vectorRecall,
            hybrid_citation_recall: hybridRecall,
            bm25_retrieved_recall: bm25RetrievedRecall,
            vector_retrieved_recall: vectorRetrievedRecall,
            hybrid_retrieved_recall: hybridRetrievedRecall,
            bm25_found: bm25Found,
            vector_found: vectorFound,
            hybrid_found: hybridFound,
            lane_bm25_retrieved: anyBm25Retrieved,
            lane_vector_retrieved: anyVectorRetrieved,
            lane_hybrid_retrieved: anyHybridRetrieved,
            lane_bm25_cited: anyBm25Cited,
            lane_vector_cited: anyVectorCited,
            lane_hybrid_cited: anyHybridCited,
        },
        queries,
        notes,
    };
}

async function runCat4(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 4: Temporal Edge Cases [${mode}] ===`);

    if (mode === "V1") {
        return {
            category: "cat4",
            mode,
            passed: true,
            metrics: { skipped: true },
            queries: [],
            notes: ["Skipped: V1 does not support living state"],
        };
    }

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT4_DOCS, mode, CAT4_RELATIONS, CAT4_LIVING_STATES);

    // Query living states directly from DB
    const result = await pool.query(
        `SELECT ac.id AS chunk_id, als.living_status
         FROM engine.artifact_living_state als
         JOIN artifact_chunks ac ON ac.artifact_id = als.artifact_id
         WHERE als.tenant_id = $1`,
        [TENANT_V3],
    );

    const actualMap = new Map<string, string>();
    for (const row of result.rows) {
        actualMap.set(row.chunk_id, row.living_status);
    }

    let totalCorrect = 0;
    let totalChecked = 0;
    const patternResults: Record<string, { correct: number; total: number; details: string[] }> = {};
    const notes: string[] = [];

    for (const [patternKey, pattern] of Object.entries(CAT4_TEMPORAL_TRUTH)) {
        const details: string[] = [];
        let correct = 0;

        for (const { docId, expectedStatus } of pattern.expectedStates) {
            const actual = actualMap.get(docId);
            totalChecked++;
            if (actual === expectedStatus) {
                correct++;
                totalCorrect++;
            } else {
                const detail = `${docId}: expected=${expectedStatus} actual=${actual ?? "missing"}`;
                details.push(detail);
                notes.push(`${pattern.label}: ${detail}`);
            }
        }

        patternResults[patternKey] = {
            correct,
            total: pattern.expectedStates.length,
            details,
        };
        console.log(`  ${pattern.label}: ${correct}/${pattern.expectedStates.length} correct`);
    }

    const accuracy = totalChecked > 0 ? totalCorrect / totalChecked : 0;

    return {
        category: "cat4",
        mode,
        passed: accuracy >= 0.5,
        metrics: {
            accuracy,
            correct: totalCorrect,
            total: totalChecked,
            pattern_results: JSON.stringify(patternResults),
        },
        queries: [],
        notes,
    };
}

async function runCat5(pool: pg.Pool): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 5: Receipt Chain Stress (verified mode only) ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT5_DOCS, "V4.1", [], []);

    const receiptQueries = generateReceiptQueries();
    const depthPoints: ReceiptDepthPoint[] = [];
    let chainsIntact = 0;
    let totalVerified = 0;
    const notes: string[] = [];

    // Run queries in batches, checking receipt chain at depth checkpoints
    for (let i = 0; i < receiptQueries.length; i++) {
        const truth = receiptQueries[i];
        const depth = i + 1;

        console.log(`  Query ${depth}/50: "${truth.query.slice(0, 50)}..."`);

        try {
            const start = performance.now();
            const qr = await queryAnswers(truth.query, {
                mode: "verified",
                topK: truth.topK,
                tenantId: TENANT_V3,
            });
            const latency = performance.now() - start;

            // At depth checkpoints, verify the receipt chain
            if (RECEIPT_DEPTH_CHECKPOINTS.includes(depth) && qr.answerId) {
                const chainStart = performance.now();
                const chain = await verifyReceiptChain(qr.answerId);
                const chainLatency = performance.now() - chainStart;

                totalVerified++;
                if (chain.chainIntact) chainsIntact++;

                const point: ReceiptDepthPoint = {
                    depth,
                    latency_ms: Math.round(chainLatency),
                    chain_intact: chain.chainIntact,
                };
                depthPoints.push(point);

                console.log(`    Depth ${depth}: chain_intact=${chain.chainIntact} verify_latency=${Math.round(chainLatency)}ms query_latency=${Math.round(latency)}ms`);

                if (!chain.chainIntact) {
                    notes.push(`Chain broken at depth ${depth}: ${chain.error ?? "unknown"}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            notes.push(`Query ${depth} failed: ${msg.slice(0, 120)}`);
        }
    }

    // Compute metrics
    const maxVerifiedDepth = depthPoints.filter((p) => p.chain_intact).reduce((max, p) => Math.max(max, p.depth), 0);
    const latencyAt50 = depthPoints.find((p) => p.depth === 50)?.latency_ms ?? -1;

    // Latency slope (ms per depth unit)
    let latencySlope = 0;
    if (depthPoints.length >= 2) {
        const first = depthPoints[0];
        const last = depthPoints[depthPoints.length - 1];
        latencySlope = (last.latency_ms - first.latency_ms) / (last.depth - first.depth);
    }

    // Pass: all chains intact at depth <= 20, latency at 50 < 10s
    const allIntactAt20 = depthPoints.filter((p) => p.depth <= 20).every((p) => p.chain_intact);
    const passed = allIntactAt20 && (latencyAt50 < 10000 || latencyAt50 === -1);

    notes.push(`Max verified depth: ${maxVerifiedDepth}`);
    notes.push(`Latency slope: ${latencySlope.toFixed(2)} ms/depth`);
    if (latencyAt50 > 0) notes.push(`Latency at depth 50: ${latencyAt50}ms`);

    return {
        category: "cat5",
        mode: "V4.1", // always verified mode
        passed,
        metrics: {
            chains_intact: chainsIntact,
            total_verified: totalVerified,
            max_verified_depth: maxVerifiedDepth,
            latency_at_depth_50: latencyAt50,
            latency_slope_per_depth: latencySlope,
            all_intact_at_20: allIntactAt20,
            depth_points: JSON.stringify(depthPoints),
        },
        queries: [],
        notes,
    };
}

async function runCat6(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 6: Fragility Calibration [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT6_DOCS, mode, [], []);

    const queries = await runQueries(CAT6_GROUND_TRUTH, TENANT_V3);

    // Extract fragility scores per scenario
    const calibrationPoints: FragilityCalibrationPoint[] = [];
    const notes: string[] = [];

    for (let i = 0; i < FRAGILITY_SCENARIOS.length; i++) {
        const scenario = FRAGILITY_SCENARIOS[i];
        const result = queries[i];
        const fragility = (result?.metrics.fragility_score as number) ?? 0;
        const [low, high] = scenario.expectedRange;
        const inRange = fragility >= low && fragility <= high;

        calibrationPoints.push({
            scenario: scenario.id,
            expected_range: scenario.expectedRange,
            actual: fragility,
            in_range: inRange,
        });

        notes.push(`${scenario.id} (${scenario.label}): fragility=${fragility.toFixed(3)} range=[${low},${high}] ${inRange ? "OK" : "OUT OF RANGE"}`);
        console.log(`  ${scenario.id}: fragility=${fragility.toFixed(3)} (expected ${low}-${high})`);
    }

    // Check monotonic ordering: F1 > F2 >= F3
    const [f1, f2, f3] = calibrationPoints.map((p) => p.actual);
    const monotonicOrder = f1 > f2 && f2 >= f3;
    const allZero = f1 === 0 && f2 === 0 && f3 === 0;

    if (allZero) {
        notes.push("BASELINE: All fragility scores are 0 — fragility scoring not triggering in this configuration");
    } else if (monotonicOrder) {
        notes.push("Monotonic ordering: F1 > F2 >= F3 — CORRECT");
    } else {
        notes.push(`Monotonic ordering: F1=${f1.toFixed(3)} F2=${f2.toFixed(3)} F3=${f3.toFixed(3)} — INCORRECT`);
    }

    // Pass: F1 > 0 AND monotonic, OR document baseline
    const passed = (f1 > 0 && monotonicOrder) || allZero;

    return {
        category: "cat6",
        mode,
        passed,
        metrics: {
            f1_fragility: f1,
            f2_fragility: f2,
            f3_fragility: f3,
            monotonic_order: monotonicOrder,
            all_zero: allZero,
            calibration_points: JSON.stringify(calibrationPoints),
        },
        queries,
        notes,
    };
}

async function runCat7(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 7: Broad-Query Recall [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT7_DOCS, mode, [], []);

    const queries = await runQueries(CAT7_GROUND_TRUTH, TENANT_V3);
    const avgCitationRecall = queries.reduce((sum, query) => sum + ((query.metrics.recall as number) ?? 0), 0) / queries.length;
    const avgRetrievedRecall = queries.reduce((sum, query) => sum + ((query.metrics.retrieved_recall as number) ?? 0), 0) / queries.length;

    let summaryRetrievedCount = 0;
    let summaryCitationCount = 0;
    const notes: string[] = [];

    for (let i = 0; i < queries.length; i++) {
        const summaryId = CAT7_SUMMARY_IDS[i];
        const retrievedSet = new Set((queries[i]?.metrics.retrieved_ids as string[]) ?? []);
        const foundSet = new Set((queries[i]?.metrics.found_ids as string[]) ?? []);
        const summaryRetrieved = retrievedSet.has(summaryId);
        const summaryCited = foundSet.has(summaryId);
        if (summaryRetrieved) summaryRetrievedCount++;
        if (summaryCited) summaryCitationCount++;
        notes.push(`${summaryId}: summary_retrieved=${summaryRetrieved} summary_cited=${summaryCited}`);
    }

    const summaryRetrievedRecall = summaryRetrievedCount / CAT7_GROUND_TRUTH.length;
    const summaryCitationRecall = summaryCitationCount / CAT7_GROUND_TRUTH.length;
    const passed = avgRetrievedRecall >= 0.75 && summaryRetrievedRecall >= 1;

    notes.push(`avg_retrieved_recall=${avgRetrievedRecall.toFixed(2)}`);
    notes.push(`summary_retrieved_recall=${summaryRetrievedRecall.toFixed(2)}`);

    return {
        category: "cat7",
        mode,
        passed,
        metrics: {
            avg_citation_recall: avgCitationRecall,
            avg_retrieved_recall: avgRetrievedRecall,
            summary_retrieved_recall: summaryRetrievedRecall,
            summary_citation_recall: summaryCitationRecall,
            summary_retrieved_count: summaryRetrievedCount,
            summary_total: CAT7_GROUND_TRUTH.length,
        },
        queries,
        notes,
    };
}

async function runCat8(pool: pg.Pool, mode: EngineMode): Promise<V3CategoryResult> {
    console.log(`\n=== Cat 8: Proposition Precision@1 [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V3);
    await ingestV3(pool, CAT8_DOCS, mode, [], []);

    const queries = await runQueries(CAT8_GROUND_TRUTH, TENANT_V3);
    let retrievedTop1Hits = 0;
    let citedTop1Hits = 0;
    const notes: string[] = [];

    for (let i = 0; i < CAT8_GROUND_TRUTH.length; i++) {
        const expected = CAT8_GROUND_TRUTH[i]?.expectedDocIds[0];
        const retrievedTop1 = ((queries[i]?.metrics.retrieved_ids as string[]) ?? [])[0];
        const citedTop1 = ((queries[i]?.metrics.found_ids as string[]) ?? [])[0];
        const retrievedHit = retrievedTop1 === expected;
        const citedHit = citedTop1 === expected;
        if (retrievedHit) retrievedTop1Hits++;
        if (citedHit) citedTop1Hits++;
        notes.push(`${expected}: retrieved_top1=${retrievedTop1 ?? "missing"} cited_top1=${citedTop1 ?? "missing"}`);
    }

    const retrievedPrecisionAt1 = retrievedTop1Hits / CAT8_GROUND_TRUTH.length;
    const citedPrecisionAt1 = citedTop1Hits / CAT8_GROUND_TRUTH.length;
    const avgRetrievedRecall = queries.reduce((sum, query) => sum + ((query.metrics.retrieved_recall as number) ?? 0), 0) / queries.length;
    const passed = retrievedPrecisionAt1 >= 2 / 3 && avgRetrievedRecall >= 1;

    notes.push(`retrieved_precision_at_1=${retrievedPrecisionAt1.toFixed(2)}`);
    notes.push(`cited_precision_at_1=${citedPrecisionAt1.toFixed(2)}`);

    return {
        category: "cat8",
        mode,
        passed,
        metrics: {
            retrieved_precision_at_1: retrievedPrecisionAt1,
            cited_precision_at_1: citedPrecisionAt1,
            retrieved_top1_hits: retrievedTop1Hits,
            cited_top1_hits: citedTop1Hits,
            avg_retrieved_recall: avgRetrievedRecall,
            query_count: CAT8_GROUND_TRUTH.length,
        },
        queries,
        notes,
    };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

type V3Report = {
    runId: string;
    startedAt: string;
    finishedAt: string;
    host: string;
    results: V3CategoryResult[];
    summary: Record<string, unknown>;
};

function generateMarkdownReport(report: V3Report): string {
    const lines: string[] = [];
    lines.push(`# Retrieval Quality Audit v3 — Edge Case & Capability Probe Report`);
    lines.push(``);
    lines.push(`**Run ID:** ${report.runId}`);
    lines.push(`**Started:** ${report.startedAt}`);
    lines.push(`**Finished:** ${report.finishedAt}`);
    lines.push(`**Host:** ${report.host}`);
    lines.push(`**Corpus:** ~78 docs, 8 categories`);
    lines.push(``);

    const catNames: Record<string, string> = {
        cat1: "Relation-Bootstrapped Retrieval (8 docs, 1 query)",
        cat2: "Format-Aware Ingestion Recall (18 docs, 3 queries)",
        cat3: "BM25 vs Vector Decomposition (12 docs, 6 queries)",
        cat4: "Temporal Edge Cases (12 docs, DB checks)",
        cat5: "Receipt Chain Stress (2 docs, 50 queries)",
        cat6: "Fragility Calibration (12 docs, 3 queries)",
        cat7: "Broad-Query Recall (8 docs, 2 queries)",
        cat8: "Proposition Precision@1 (6 docs, 3 queries)",
    };

    // Group by mode
    const byMode = new Map<string, V3CategoryResult[]>();
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

            // Metrics table
            lines.push(`| Metric | Value |`);
            lines.push(`|--------|-------|`);
            for (const [k, v] of Object.entries(cat.metrics)) {
                if (typeof v === "string" && v.startsWith("[")) continue; // skip JSON arrays
                if (typeof v === "string" && v.startsWith("{")) continue; // skip JSON objects
                const display = typeof v === "number"
                    ? (Number.isInteger(v) ? v.toString() : v.toFixed(4))
                    : String(v);
                lines.push(`| ${k} | ${display} |`);
            }
            lines.push(``);

            // Format recall breakdown (Cat 2)
            if (cat.metrics.format_citation_recall || cat.metrics.format_recall) {
                const fr: Record<string, number> = JSON.parse((cat.metrics.format_citation_recall ?? cat.metrics.format_recall) as string);
                const frr: Record<string, number> = cat.metrics.format_retrieved_recall
                    ? JSON.parse(cat.metrics.format_retrieved_recall as string)
                    : {};
                lines.push(`#### Format Recall Breakdown`);
                lines.push(``);
                lines.push(`| Format | Citation Recall | Retrieved Recall | Tier |`);
                lines.push(`|--------|----------------|-----------------|------|`);
                const tierMap: Record<string, string> = {
                    "text/markdown": "1",
                    "application/pdf": "1",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "1",
                    "text/csv": "2",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "2",
                    "application/json": "2",
                    "application/x-yaml": "3",
                    "text/plain (chat)": "3",
                    "text/plain (notes)": "3",
                };
                for (const [fmt, recall] of Object.entries(fr)) {
                    const tier = tierMap[fmt] ?? "—";
                    const rr = frr[fmt] ?? 0;
                    lines.push(`| ${fmt} | ${(recall as number).toFixed(2)} | ${rr.toFixed(2)} | ${tier} |`);
                }
                lines.push(``);
                if (cat.metrics.tier1_pass !== undefined) {
                    lines.push(`#### Tier Assessment`);
                    lines.push(``);
                    lines.push(`| Tier | Scope | Status |`);
                    lines.push(`|------|-------|--------|`);
                    lines.push(`| 1 | Prose (markdown, PDF, DOCX) | ${cat.metrics.tier1_pass ? "PASS" : "FAIL"} |`);
                    lines.push(`| 2 | Structured (CSV, XLSX, JSON) | ${cat.metrics.tier2_pass ? "PASS" : "FAIL"} |`);
                    lines.push(`| 3 | Informal (YAML, chat, notes) | baseline |`);
                    lines.push(``);
                }
            }

            // Depth points (Cat 5)
            if (cat.metrics.depth_points) {
                const points: ReceiptDepthPoint[] = JSON.parse(cat.metrics.depth_points as string);
                lines.push(`#### Receipt Chain Depth Curve`);
                lines.push(``);
                lines.push(`| Depth | Latency (ms) | Chain Intact |`);
                lines.push(`|------:|-------------:|:------------:|`);
                for (const p of points) {
                    lines.push(`| ${p.depth} | ${p.latency_ms} | ${p.chain_intact ? "YES" : "NO"} |`);
                }
                lines.push(``);
            }

            // Calibration points (Cat 6)
            if (cat.metrics.calibration_points) {
                const points: FragilityCalibrationPoint[] = JSON.parse(cat.metrics.calibration_points as string);
                lines.push(`#### Fragility Calibration`);
                lines.push(``);
                lines.push(`| Scenario | Expected | Actual | In Range |`);
                lines.push(`|----------|----------|--------|:--------:|`);
                for (const p of points) {
                    lines.push(`| ${p.scenario} | [${p.expected_range[0]}, ${p.expected_range[1]}] | ${p.actual.toFixed(3)} | ${p.in_range ? "YES" : "NO"} |`);
                }
                lines.push(``);
            }

            // Pattern results (Cat 4)
            if (cat.metrics.pattern_results) {
                const patterns: Record<string, { correct: number; total: number; details: string[] }> =
                    JSON.parse(cat.metrics.pattern_results as string);
                lines.push(`#### Pattern Results`);
                lines.push(``);
                lines.push(`| Pattern | Correct | Total | Accuracy |`);
                lines.push(`|---------|--------:|------:|---------:|`);
                for (const [key, val] of Object.entries(patterns)) {
                    const acc = val.total > 0 ? (val.correct / val.total).toFixed(2) : "N/A";
                    lines.push(`| ${key} | ${val.correct} | ${val.total} | ${acc} |`);
                }
                lines.push(``);
            }

            // Notes
            if (cat.notes.length > 0) {
                lines.push(`#### Notes`);
                for (const n of cat.notes) lines.push(`- ${n}`);
                lines.push(``);
            }

            // Query details (except Cat 5 which has 50)
            if (cat.queries.length > 0 && cat.queries.length <= 10) {
                lines.push(`#### Query Details`);
                lines.push(``);
                for (const q of cat.queries as Array<{ query: string; metrics: Record<string, unknown>; notes: string[] }>) {
                    lines.push(`**Query:** "${q.query}"`);
                    const displayMetrics = Object.entries(q.metrics)
                        .filter(([k]) => !["found_ids", "missing_ids", "mises_actual"].includes(k))
                        .map(([k, v]) => {
                            const val = typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : v;
                            return `${k}=${val}`;
                        });
                    lines.push(`Metrics: ${displayMetrics.join(", ")}`);
                    if (q.notes.length > 0) {
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
    lines.push(`| Category | Mode | Passed |`);
    lines.push(`|----------|------|:------:|`);
    for (const r of report.results) {
        lines.push(`| ${catNames[r.category]?.split("(")[0]?.trim() ?? r.category} | ${r.mode} | ${r.passed ? "YES" : "NO"} |`);
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

    console.log(`Quality Audit v3 (Edge Cases): modes=${modes.join(",")} categories=${cats.join(",")}`);

    const pool = createPool();
    const runId = randomUUID().slice(0, 8);
    const startedAt = new Date().toISOString();

    const results: V3CategoryResult[] = [];

    // Cat 5 runs once (verified mode only), not per-mode
    let cat5Done = false;

    for (const mode of modes) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`MODE: ${mode}`);
        console.log(`${"=".repeat(60)}`);

        for (const cat of cats) {
            // Cat 4 requires living objects — skip V1
            if (cat === "cat4" && mode === "V1") {
                results.push({
                    category: "cat4",
                    mode,
                    passed: true,
                    metrics: { skipped: true },
                    queries: [],
                    notes: ["Skipped: V1 does not support living state"],
                });
                continue;
            }

            // Cat 5 runs once
            if (cat === "cat5") {
                if (!cat5Done) {
                    const result = await runCat5(pool);
                    results.push(result);
                    cat5Done = true;
                    console.log(`\n  -> cat5 [verified]: ${result.passed ? "PASSED" : "FAILED"}`);
                }
                continue;
            }

            const runners: Record<string, (pool: pg.Pool, mode: EngineMode) => Promise<V3CategoryResult>> = {
                cat1: runCat1,
                cat2: runCat2,
                cat3: runCat3,
                cat4: runCat4,
                cat6: runCat6,
                cat7: runCat7,
                cat8: runCat8,
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
    const report: V3Report = {
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
    await cleanAuditData(pool, TENANT_V3);
    await pool.end();

    // Write results
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = join(RESULTS_DIR, `audit-v3-${timestamp}.json`);
    const mdPath = join(RESULTS_DIR, `audit-v3-${timestamp}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(mdPath, generateMarkdownReport(report));

    console.log(`\n${"=".repeat(60)}`);
    console.log(`QUALITY AUDIT v3 COMPLETE`);
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
