#!/usr/bin/env npx tsx
/**
 * Retrieval Quality Audit Suite — v2 (Enterprise Corpus)
 *
 * Tests retrieval quality using a heterogeneous enterprise corpus
 * with 8+ MIME types across organized and messy content.
 *
 *   Cat 1: Supersession accuracy (20 docs, 4 chains, cross-format)
 *   Cat 2: Causal chain retrieval (25 docs, 5 chains, cross-format)
 *   Cat 3: Corpus degradation under scale (550 base + noise to 25K)
 *   Cat 4: Temporal reconstruction (60 docs, 6 lifecycles)
 *
 * Usage:
 *   npx tsx scripts/audit-v2/quality-audit-v2.ts --mode V1 --cat 1
 *   npx tsx scripts/audit-v2/quality-audit-v2.ts --mode all --cat all
 *   npx tsx scripts/audit-v2/quality-audit-v2.ts --dry-run
 *
 * Env:
 *   DATABASE_URL, OPENAI_API_KEY, API_KEY, BENCH_TARGET
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// v2 corpus
import { CAT1_DOCS, CAT1_RELATIONS, CAT1_LIVING_STATES, CAT1_GROUND_TRUTH } from "./lib/corpus/cat1-supersession.js";
import { CAT2_DOCS, CAT2_RELATIONS, CAT2_LIVING_STATES, CAT2_GROUND_TRUTH } from "./lib/corpus/cat2-causal.js";
import { CAT3_SIGNAL_DOCS, CAT3_QUERIES, CAT3_FRAGILITY_PROBES, generateCat3ContextDocs } from "./lib/corpus/cat3-scale.js";
import { CAT4_DOCS, CAT4_RELATIONS, CAT4_LIVING_STATES, CAT4_GROUND_TRUTH } from "./lib/corpus/cat4-temporal.js";
import { TENANT_V2 } from "./lib/corpus/tenant.js";
import { generateNoiseDocsV2 } from "./lib/corpus/noise.js";

// v2 types and db
import type { EngineMode, CategoryId, CategoryMetrics, AuditReport, ScalePoint, GroundTruth, CorpusRelation, LivingState } from "./lib/types-v2.js";
import type { CorpusDocV2 } from "./lib/types-v2.js";
import { createPool, cleanAuditData, insertRelations, insertLivingStates, refreshMaterializedViews, type ChunkIdMap } from "./lib/db-v2.js";
import { insertChunksV2 } from "./lib/db-v2.js";

// v1 shared infrastructure (reused unchanged)
import { embedTexts } from "../audit/lib/embed.js";
import { queryAnswers, verifyReceiptChain } from "../audit/lib/query.js";
import { scoreQuery, jaccard, percentile } from "../audit/lib/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { modes: EngineMode[]; cats: CategoryId[]; dryRun: boolean } {
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

    const allCats: CategoryId[] = ["cat1", "cat2", "cat3", "cat4"];
    const cats: CategoryId[] = catArg === "all" ? allCats : [(`cat${catArg}`) as CategoryId];

    return { modes, cats, dryRun };
}

// ---------------------------------------------------------------------------
// Dry-run validation
// ---------------------------------------------------------------------------

function validateCorpus(): boolean {
    console.log("=== Dry-Run: Corpus Validation ===\n");
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
    console.log("\nCategory 1 — Supersession:");
    checkUnique(CAT1_DOCS, "Cat1 docs");
    checkRelations(CAT1_RELATIONS, CAT1_DOCS, "Cat1");
    checkLivingStates(CAT1_LIVING_STATES, CAT1_DOCS, "Cat1");
    checkGroundTruth(CAT1_GROUND_TRUTH, CAT1_DOCS, "Cat1");

    // Cat 2
    console.log("\nCategory 2 — Causal Chain:");
    checkUnique(CAT2_DOCS, "Cat2 docs");
    checkRelations(CAT2_RELATIONS, CAT2_DOCS, "Cat2");
    checkLivingStates(CAT2_LIVING_STATES, CAT2_DOCS, "Cat2");
    checkGroundTruth(CAT2_GROUND_TRUTH, CAT2_DOCS, "Cat2");

    // Cat 3
    console.log("\nCategory 3 — Scale:");
    checkUnique(CAT3_SIGNAL_DOCS, "Cat3 signal docs");
    const contextDocs = generateCat3ContextDocs();
    checkUnique(contextDocs, "Cat3 context docs");
    const allCat3 = [...CAT3_SIGNAL_DOCS, ...contextDocs];
    checkGroundTruth(CAT3_QUERIES, allCat3, "Cat3 queries");
    checkGroundTruth(CAT3_FRAGILITY_PROBES, allCat3, "Cat3 fragility probes");
    // Noise docs
    const noiseSample = generateNoiseDocsV2(0, 100);
    checkUnique(noiseSample, "Cat3 noise sample (100)");
    console.log(`  OK: Cat3 noise generator — 100 sample docs, MIME distribution: ${countMimeTypes(noiseSample)}`);

    // Cat 4
    console.log("\nCategory 4 — Temporal:");
    checkUnique(CAT4_DOCS, "Cat4 docs");
    checkRelations(CAT4_RELATIONS, CAT4_DOCS, "Cat4");
    checkLivingStates(CAT4_LIVING_STATES, CAT4_DOCS, "Cat4");

    // MIME type distribution
    console.log("\n=== MIME Type Distribution ===");
    const allDocs = [...CAT1_DOCS, ...CAT2_DOCS, ...CAT3_SIGNAL_DOCS, ...contextDocs, ...CAT4_DOCS];
    console.log(`  Total signal+context docs: ${allDocs.length}`);
    console.log(`  ${countMimeTypes(allDocs)}`);

    console.log(`\n=== Validation: ${valid ? "PASSED" : "FAILED"} ===`);
    return valid;
}

function countMimeTypes(docs: CorpusDocV2[]): string {
    const counts = new Map<string, number>();
    for (const d of docs) {
        counts.set(d.mime, (counts.get(d.mime) ?? 0) + 1);
    }
    return [...counts.entries()].map(([m, c]) => `${m}=${c}`).join(", ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ingestCorpusV2(
    pool: pg.Pool,
    docs: CorpusDocV2[],
    mode: EngineMode,
    relations: CorpusRelation[],
    livingStates: LivingState[],
): Promise<ChunkIdMap> {
    console.log(`  Embedding ${docs.length} documents...`);
    const embeddings = await embedTexts(docs.map((d) => d.content));

    console.log(`  Inserting ${docs.length} chunks (with MIME types)...`);
    const idMap = await insertChunksV2(pool, docs, embeddings);

    if (mode !== "V1" && relations.length > 0) {
        console.log(`  Inserting ${relations.length} relations (${mode})...`);
        await insertRelations(pool, relations, TENANT_V2, idMap);
    }

    if (mode !== "V1" && livingStates.length > 0) {
        console.log(`  Inserting ${livingStates.length} living states (${mode})...`);
        await insertLivingStates(pool, livingStates, TENANT_V2, idMap);
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
            if (scored.notes.length > 0) {
                for (const n of scored.notes) console.log(`    ! ${n}`);
            }
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
// Category runners
// ---------------------------------------------------------------------------

async function runCat1(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Cat 1: Supersession Accuracy [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V2);
    await ingestCorpusV2(pool, CAT1_DOCS, mode, CAT1_RELATIONS, CAT1_LIVING_STATES);

    const queries = await runQueries(CAT1_GROUND_TRUTH, TENANT_V2);

    const avgRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;
    const avgPrecision = queries.reduce((s, q) => s + (q.metrics.precision as number), 0) / queries.length;
    const rankingScores = queries
        .map((q) => q.metrics.ranking_accuracy as number | undefined)
        .filter((r): r is number => r !== undefined);
    const avgRanking = rankingScores.length > 0
        ? rankingScores.reduce((s, v) => s + v, 0) / rankingScores.length
        : -1;

    const passed = avgRecall >= 0.5;

    return {
        category: "cat1",
        mode,
        passed,
        metrics: {
            avg_recall: avgRecall,
            avg_precision: avgPrecision,
            avg_ranking_accuracy: avgRanking,
            query_count: queries.length,
            latency_ms: queries.reduce((s, q) => s + (q.metrics.latency_ms as number), 0) / queries.length,
        },
        queries,
        notes: queries.flatMap((q) => q.notes),
    };
}

async function runCat2(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Cat 2: Causal Chain Retrieval [${mode}] ===`);

    await cleanAuditData(pool, TENANT_V2);
    await ingestCorpusV2(pool, CAT2_DOCS, mode, CAT2_RELATIONS, CAT2_LIVING_STATES);

    const queries = await runQueries(CAT2_GROUND_TRUTH, TENANT_V2);

    const avgRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;
    const avgPrecision = queries.reduce((s, q) => s + (q.metrics.precision as number), 0) / queries.length;

    // Per-chain recall (queries 0-1: chain1, 2-3: chain2, etc.)
    const chainRecalls: number[] = [];
    for (let i = 0; i < queries.length; i += 2) {
        const chainQ = queries.slice(i, Math.min(i + 2, queries.length));
        const cr = chainQ.reduce((s, q) => s + (q.metrics.recall as number), 0) / chainQ.length;
        chainRecalls.push(cr);
    }

    const passed = avgRecall >= 0.3;

    return {
        category: "cat2",
        mode,
        passed,
        metrics: {
            avg_recall: avgRecall,
            avg_precision: avgPrecision,
            chain_recalls: JSON.stringify(chainRecalls),
            query_count: queries.length,
            latency_ms: queries.reduce((s, q) => s + (q.metrics.latency_ms as number), 0) / queries.length,
        },
        queries,
        notes: queries.flatMap((q) => q.notes),
    };
}

async function runCat3(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Cat 3: Corpus Degradation Under Scale [${mode}] ===`);

    const scalePoints: ScalePoint[] = [];
    const baselineMisesIds: string[][] = [];

    const contextDocs = generateCat3ContextDocs();
    const baseSize = CAT3_SIGNAL_DOCS.length + contextDocs.length;
    const scales = [baseSize, 1000, 2500, 5000, 10000, 25000];

    for (const scale of scales) {
        console.log(`\n  --- Scale point: ${scale} docs ---`);

        await cleanAuditData(pool, TENANT_V2);

        const noiseCount = Math.max(0, scale - baseSize);
        const noiseDocs = noiseCount > 0 ? generateNoiseDocsV2(0, noiseCount) : [];
        const allDocs: CorpusDocV2[] = [...CAT3_SIGNAL_DOCS, ...contextDocs, ...noiseDocs];

        await ingestCorpusV2(pool, allDocs, mode, [], []);

        const queries = await runQueries(CAT3_QUERIES, TENANT_V2);

        // Fragility probes
        console.log(`  Running ${CAT3_FRAGILITY_PROBES.length} fragility probes (verified mode)...`);
        const fragilityProbes = await runQueries(CAT3_FRAGILITY_PROBES, TENANT_V2);
        const probeFragilities = fragilityProbes
            .map((q) => q.metrics.fragility_score as number | undefined)
            .filter((f): f is number => f !== undefined);
        const fragilityProbeMean = probeFragilities.length > 0
            ? probeFragilities.reduce((s, v) => s + v, 0) / probeFragilities.length
            : 0;

        const precisions = queries.map((q) => q.metrics.precision as number);
        const recalls = queries.map((q) => q.metrics.recall as number);
        const latencies = queries.map((q) => q.metrics.latency_ms as number);
        const fragilityScores = queries
            .map((q) => q.metrics.fragility_score as number | undefined)
            .filter((f): f is number => f !== undefined);

        const misesIds = queries.map((q) => (q.metrics.mises_actual as string[]) ?? []);

        let misesJaccard = 1;
        if (baselineMisesIds.length > 0) {
            const jaccards = misesIds.map((ids, i) => jaccard(ids, baselineMisesIds[i] ?? []));
            misesJaccard = jaccards.reduce((s, v) => s + v, 0) / jaccards.length;
        } else {
            baselineMisesIds.push(...misesIds);
        }

        const point: ScalePoint = {
            corpusSize: allDocs.length,
            precision5: precisions.reduce((s, v) => s + v, 0) / precisions.length,
            recall5: recalls.reduce((s, v) => s + v, 0) / recalls.length,
            misesJaccard,
            fragilityMean: fragilityScores.length > 0
                ? fragilityScores.reduce((s, v) => s + v, 0) / fragilityScores.length
                : 0,
            fragilityProbeMean,
            fragilityProbeCount: probeFragilities.length,
            latencyP50: percentile(latencies, 50),
            latencyP95: percentile(latencies, 95),
        };

        scalePoints.push(point);
        console.log(`  precision@5=${point.precision5.toFixed(3)} recall@5=${point.recall5.toFixed(3)} mises_jaccard=${point.misesJaccard.toFixed(3)} latency_p50=${point.latencyP50}ms`);
    }

    const first = scalePoints[0];
    const last = scalePoints[scalePoints.length - 1];
    const slopePerK = (last.precision5 - first.precision5) / ((last.corpusSize - first.corpusSize) / 1000);

    return {
        category: "cat3",
        mode,
        passed: last.precision5 >= 0.1,
        metrics: {
            scale_points: JSON.stringify(scalePoints),
            degradation_slope_per_1k: slopePerK,
            baseline_precision5: first.precision5,
            final_precision5: last.precision5,
            baseline_recall5: first.recall5,
            final_recall5: last.recall5,
        },
        queries: [],
        notes: [
            `Degradation slope: ${slopePerK.toFixed(6)} precision@5 per 1K docs`,
            `Precision@5: ${first.precision5.toFixed(3)} (${first.corpusSize} docs) -> ${last.precision5.toFixed(3)} (${last.corpusSize} docs)`,
        ],
    };
}

async function runCat4(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Cat 4: Temporal Reconstruction [${mode}] ===`);

    if (mode === "V1") {
        console.log(`  Skipping — Cat 4 requires living objects.`);
        return {
            category: "cat4",
            mode,
            passed: true,
            metrics: { skipped: true },
            queries: [],
            notes: ["Skipped: V1 does not support temporal reconstruction"],
        };
    }

    await cleanAuditData(pool, TENANT_V2);
    const idMap = await ingestCorpusV2(pool, CAT4_DOCS, mode, CAT4_RELATIONS, CAT4_LIVING_STATES);

    // --- Phase 1: Living state reconstruction accuracy ---
    let totalCorrect = 0;
    let totalDocs = 0;
    const notes: string[] = [];

    for (const snapshot of CAT4_GROUND_TRUTH) {
        const allExpected = [
            ...snapshot.active.map((id) => ({ id, expected: "active" })),
            ...snapshot.superseded.map((id) => ({ id, expected: "superseded" })),
            ...snapshot.deprecated.map((id) => ({ id, expected: "deprecated" })),
            ...(snapshot.contested ?? []).map((id) => ({ id, expected: "contested" })),
        ];

        const t0 = new Date(Date.now() - 365 * 86400000);
        const snapshotDate = new Date(t0.getTime() + snapshot.atDaysFromT0 * 86400000).toISOString();

        const result = await pool.query(
            `SELECT ac.id AS chunk_id, als.living_status
             FROM engine.artifact_living_state als
             JOIN artifact_chunks ac ON ac.artifact_id = als.artifact_id
             WHERE als.tenant_id = $1
               AND ac.published_at <= $2::timestamptz`,
            [TENANT_V2, snapshotDate],
        );

        const actualMap = new Map<string, string>();
        for (const row of result.rows) {
            actualMap.set(row.chunk_id, row.living_status);
        }

        let correct = 0;
        for (const { id, expected } of allExpected) {
            const actual = actualMap.get(id);
            if (actual === expected) {
                correct++;
            } else {
                notes.push(`T0+${snapshot.atDaysFromT0}d: ${id} expected=${expected} actual=${actual ?? "missing"}`);
            }
        }

        totalCorrect += correct;
        totalDocs += allExpected.length;
        console.log(`  T0+${snapshot.atDaysFromT0}d: ${correct}/${allExpected.length} correct`);
    }

    const accuracy = totalDocs > 0 ? totalCorrect / totalDocs : 0;

    // --- Phase 2: Receipt verifiability ---
    console.log(`\n  --- Receipt verifiability ---`);
    const receiptQueries = [
        "What is the current API authentication standard?",
        "What is the current infrastructure cost optimization approach?",
        "What monitoring standards are in place?",
    ];

    let receiptsGenerated = 0;
    let chainsVerified = 0;
    let chainsIntact = 0;
    let receiptsSigned = 0;
    const receiptNotes: string[] = [];

    for (const q of receiptQueries) {
        try {
            const qr = await queryAnswers(q, { mode: "verified", topK: 5, tenantId: TENANT_V2 });
            if (qr.answerId) {
                receiptsGenerated++;
                console.log(`  Receipt: ${qr.crown.receiptId ?? "none"} (signed=${qr.crown.signed})`);
                if (qr.crown.signed) receiptsSigned++;

                const chain = await verifyReceiptChain(qr.answerId);
                chainsVerified++;
                if (chain.chainIntact) {
                    chainsIntact++;
                } else if (chain.error) {
                    receiptNotes.push(`Chain verification failed for ${qr.answerId}: ${chain.error}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            receiptNotes.push(`Receipt query failed: ${msg.slice(0, 120)}`);
        }
    }

    console.log(`  Receipts: ${receiptsGenerated}/${receiptQueries.length} generated, ${chainsIntact}/${chainsVerified} chains intact, ${receiptsSigned} signed`);

    // DB chain integrity check
    let dbChainIntact = false;
    try {
        const chainResult = await pool.query(
            `SELECT snap_id, parent_snap_id FROM crown_snapshots WHERE tenant_id = $1 ORDER BY generated_at ASC`,
            [TENANT_V2],
        );
        const rows = chainResult.rows;
        if (rows.length > 0) {
            const snapIds = new Set(rows.map((r: any) => r.snap_id));
            const brokenLinks = rows.filter((r: any) => r.parent_snap_id && !snapIds.has(r.parent_snap_id));
            dbChainIntact = brokenLinks.length === 0;
            console.log(`  DB chain: ${rows.length} receipts, ${brokenLinks.length} broken parent links`);
        }
    } catch (err) {
        receiptNotes.push(`DB chain query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
        category: "cat4",
        mode,
        passed: accuracy >= 0.5,
        metrics: {
            reconstruction_accuracy: accuracy,
            correct: totalCorrect,
            total: totalDocs,
            receipts_generated: receiptsGenerated,
            chains_verified: chainsVerified,
            chains_intact: chainsIntact,
            receipts_signed: receiptsSigned,
            db_chain_intact: dbChainIntact,
        },
        queries: [],
        notes: [...notes, ...receiptNotes],
    };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(report: AuditReport): string {
    const lines: string[] = [];
    lines.push(`# Retrieval Quality Audit v2 — Enterprise Corpus Report`);
    lines.push(``);
    lines.push(`**Run ID:** ${report.runId}`);
    lines.push(`**Started:** ${report.startedAt}`);
    lines.push(`**Finished:** ${report.finishedAt}`);
    lines.push(`**Host:** ${report.host}`);
    lines.push(`**Corpus:** Meridian Financial Services (enterprise, heterogeneous MIME)`);
    lines.push(``);

    for (const [mode, cats] of Object.entries(report.modes)) {
        lines.push(`## Mode: ${mode}`);
        lines.push(``);

        for (const [catId, cat] of Object.entries(cats!)) {
            const cm = cat as CategoryMetrics;
            const catNames: Record<string, string> = {
                cat1: "Supersession Accuracy (20 docs, 4 chains)",
                cat2: "Causal Chain Retrieval (25 docs, 5 chains)",
                cat3: "Corpus Degradation (550 base + noise to 25K)",
                cat4: "Temporal Reconstruction (60 docs, 6 lifecycles)",
            };
            lines.push(`### ${catNames[catId] ?? catId}`);
            lines.push(``);
            lines.push(`**Passed:** ${cm.passed ? "YES" : "NO"}`);
            lines.push(``);

            lines.push(`| Metric | Value |`);
            lines.push(`|--------|-------|`);
            for (const [k, v] of Object.entries(cm.metrics)) {
                if (k === "scale_points" || k === "chain_recalls") continue;
                const display = typeof v === "number" ? (Number.isInteger(v) ? v.toString() : v.toFixed(4)) : String(v);
                lines.push(`| ${k} | ${display} |`);
            }
            lines.push(``);

            if (cm.metrics.scale_points) {
                const points: ScalePoint[] = JSON.parse(cm.metrics.scale_points as string);
                lines.push(`#### Degradation Curve`);
                lines.push(``);
                lines.push(`| Corpus Size | Precision@5 | Recall@5 | MiSES Jaccard | Fragility Probe | Latency P50 | Latency P95 |`);
                lines.push(`|---:|---:|---:|---:|---:|---:|---:|`);
                for (const p of points) {
                    lines.push(`| ${p.corpusSize} | ${p.precision5.toFixed(3)} | ${p.recall5.toFixed(3)} | ${p.misesJaccard.toFixed(3)} | ${p.fragilityProbeMean?.toFixed(3) ?? "-"} | ${p.latencyP50}ms | ${p.latencyP95}ms |`);
                }
                lines.push(``);
            }

            if (cm.queries.length > 0) {
                lines.push(`#### Query Details`);
                lines.push(``);
                for (const q of cm.queries) {
                    lines.push(`**Query:** "${q.query}"`);
                    lines.push(``);
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

            if (cm.notes.length > 0) {
                lines.push(`#### Notes`);
                for (const n of cm.notes) lines.push(`- ${n}`);
                lines.push(``);
            }
        }
    }

    if (report.comparison) {
        lines.push(`## Cross-Mode Comparison`);
        lines.push(``);
        lines.push(`| Finding | Value |`);
        lines.push(`|---------|-------|`);
        for (const [k, v] of Object.entries(report.comparison)) {
            lines.push(`| ${k.replace(/_/g, " ")} | ${v} |`);
        }
        lines.push(``);
    }

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

    console.log(`Quality Audit v2 (Enterprise): modes=${modes.join(",")} categories=${cats.join(",")}`);

    const pool = createPool();
    const runId = randomUUID().slice(0, 8);
    const startedAt = new Date().toISOString();

    const report: AuditReport = {
        runId,
        startedAt,
        finishedAt: "",
        host: process.env.HOSTNAME ?? "unknown",
        modes: {},
    };

    const categoryRunners: Record<CategoryId, (pool: pg.Pool, mode: EngineMode) => Promise<CategoryMetrics>> = {
        cat1: runCat1,
        cat2: runCat2,
        cat3: runCat3,
        cat4: runCat4,
    };

    for (const mode of modes) {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`MODE: ${mode}`);
        console.log(`${"=".repeat(60)}`);

        report.modes[mode] = {};

        for (const cat of cats) {
            if (cat === "cat4" && mode === "V1") {
                console.log(`\n  Skipping Cat 4 for V1 (requires living objects).`);
                report.modes[mode]![cat] = {
                    category: cat,
                    mode,
                    passed: true,
                    metrics: { skipped: true },
                    queries: [],
                    notes: ["Skipped: V1 does not support temporal reconstruction"],
                };
                continue;
            }

            const runner = categoryRunners[cat];
            const result = await runner(pool, mode);
            report.modes[mode]![cat] = result;

            console.log(`\n  -> ${cat} [${mode}]: ${result.passed ? "PASSED" : "FAILED"}`);
        }
    }

    // Cross-mode comparison
    if (modes.length > 1) {
        const v1Cat1 = report.modes["V1"]?.cat1;
        const v41Cat1 = report.modes["V4.1"]?.cat1;
        const v1Cat2 = report.modes["V1"]?.cat2;
        const v41Cat2 = report.modes["V4.1"]?.cat2;
        const v1Cat3 = report.modes["V1"]?.cat3;
        const v41Cat3 = report.modes["V4.1"]?.cat3;

        report.comparison = {
            supersession_improvement_v41_vs_v1:
                v1Cat1 && v41Cat1
                    ? `recall ${(v1Cat1.metrics.avg_recall as number)?.toFixed(3)} -> ${(v41Cat1.metrics.avg_recall as number)?.toFixed(3)}`
                    : "N/A",
            causal_completeness_improvement:
                v1Cat2 && v41Cat2
                    ? `avg_recall ${(v1Cat2.metrics.avg_recall as number)?.toFixed(3)} -> ${(v41Cat2.metrics.avg_recall as number)?.toFixed(3)}`
                    : "N/A",
            degradation_slope_v1: (v1Cat3?.metrics.degradation_slope_per_1k as number) ?? 0,
            degradation_slope_v41: (v41Cat3?.metrics.degradation_slope_per_1k as number) ?? 0,
        };
    }

    report.finishedAt = new Date().toISOString();

    // Clean up
    console.log(`\nCleaning up audit data...`);
    await cleanAuditData(pool, TENANT_V2);
    await pool.end();

    // Write results
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = join(RESULTS_DIR, `audit-v2-${timestamp}.json`);
    const mdPath = join(RESULTS_DIR, `audit-v2-${timestamp}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(mdPath, generateMarkdownReport(report));

    console.log(`\n${"=".repeat(60)}`);
    console.log(`QUALITY AUDIT v2 COMPLETE`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  Duration: ${((new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()) / 1000).toFixed(1)}s`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Report: ${mdPath}`);
    console.log(`${"=".repeat(60)}`);

    for (const [mode, cats] of Object.entries(report.modes)) {
        const catResults = Object.values(cats!);
        const passed = catResults.filter((c) => (c as CategoryMetrics).passed).length;
        const total = catResults.length;
        console.log(`  ${mode}: ${passed}/${total} passed`);
    }
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
