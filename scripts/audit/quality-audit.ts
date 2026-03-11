#!/usr/bin/env npx tsx
/**
 * Retrieval Quality Audit Suite
 *
 * Tests retrieval quality (not throughput) across V1, V3.1, V4.1 modes.
 *   Cat 1: Supersession accuracy
 *   Cat 2: Causal chain retrieval
 *   Cat 3: Corpus degradation under scale
 *   Cat 4: Temporal reconstruction (V4.1 only)
 *
 * Usage:
 *   npx tsx scripts/audit/quality-audit.ts --mode V1 --cat 1
 *   npx tsx scripts/audit/quality-audit.ts --mode all --cat all
 *
 * Env:
 *   DATABASE_URL, OPENAI_API_KEY, API_KEY, BENCH_TARGET
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import {
    CAT1_DOCS, CAT1_GROUND_TRUTH, CAT1_RELATIONS, CAT1_LIVING_STATE,
    CAT2_DOCS, CAT2_GROUND_TRUTH, CAT2_RELATIONS, CAT2_LIVING_STATE,
    CAT3_SIGNAL_DOCS, CAT3_QUERIES, CAT3_FRAGILITY_PROBES, generateCat3ContextDocs, generateNoiseDocs,
    CAT4_DOCS, CAT4_GROUND_TRUTH, CAT4_RELATIONS, CAT4_LIVING_STATES,
    AUDIT_TENANT,
} from "./lib/corpus.js";
import type {
    EngineMode, CategoryId, CategoryMetrics, AuditReport, ScalePoint, GroundTruth, CorpusDoc,
} from "./lib/types.js";
import { createPool, cleanAuditData, insertChunks, insertRelations, insertLivingStates, refreshMaterializedViews, type ChunkIdMap } from "./lib/db.js";
import { embedTexts } from "./lib/embed.js";
import { queryAnswers, verifyReceiptChain } from "./lib/query.js";
import { scoreQuery, jaccard, percentile } from "./lib/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { modes: EngineMode[]; cats: CategoryId[] } {
    const args = process.argv.slice(2);
    let modeArg = "all";
    let catArg = "all";

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--mode" && args[i + 1]) modeArg = args[++i];
        if (args[i] === "--cat" && args[i + 1]) catArg = args[++i];
    }

    const allModes: EngineMode[] = ["V1", "V3.1", "V4.1"];
    const modes: EngineMode[] = modeArg === "all" ? allModes : [modeArg as EngineMode];

    const allCats: CategoryId[] = ["cat1", "cat2", "cat3", "cat4"];
    const cats: CategoryId[] = catArg === "all"
        ? allCats
        : [(`cat${catArg}`) as CategoryId];

    return { modes, cats };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ingestCorpus(
    pool: pg.Pool,
    docs: CorpusDoc[],
    mode: EngineMode,
    relations: typeof CAT1_RELATIONS,
    livingStates: typeof CAT1_LIVING_STATE,
): Promise<ChunkIdMap> {
    console.log(`  Embedding ${docs.length} documents...`);
    const embeddings = await embedTexts(docs.map((d) => d.content));

    console.log(`  Inserting ${docs.length} chunks...`);
    const idMap = await insertChunks(pool, docs, embeddings);

    if (mode !== "V1" && relations.length > 0) {
        console.log(`  Inserting ${relations.length} relations (${mode})...`);
        await insertRelations(pool, relations, AUDIT_TENANT, idMap);
    }

    if (mode !== "V1" && livingStates.length > 0) {
        console.log(`  Inserting ${livingStates.length} living states (${mode})...`);
        await insertLivingStates(pool, livingStates, AUDIT_TENANT, idMap);
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
                for (const n of scored.notes) console.log(`    ⚠ ${n}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`    ✕ Query failed: ${msg.slice(0, 120)}`);
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
    console.log(`\n=== Category 1: Supersession Accuracy [${mode}] ===`);

    await cleanAuditData(pool, AUDIT_TENANT);
    await ingestCorpus(pool, CAT1_DOCS, mode, CAT1_RELATIONS, CAT1_LIVING_STATE);

    const queries = await runQueries(CAT1_GROUND_TRUTH, AUDIT_TENANT);

    const q = queries[0];
    const passed =
        (q.metrics.recall as number) >= 0.5 &&
        (q.metrics.ranking_accuracy === undefined || (q.metrics.ranking_accuracy as number) >= 0.5);

    return {
        category: "cat1",
        mode,
        passed,
        metrics: {
            recall: q.metrics.recall as number,
            precision: q.metrics.precision as number,
            ranking_accuracy: (q.metrics.ranking_accuracy as number) ?? -1,
            mises_accuracy: (q.metrics.mises_accuracy as number) ?? -1,
            fragility_in_range: (q.metrics.fragility_in_range as boolean) ?? false,
            latency_ms: q.metrics.latency_ms as number,
        },
        queries,
        notes: queries.flatMap((q) => q.notes),
    };
}

async function runCat2(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Category 2: Causal Chain Retrieval [${mode}] ===`);

    await cleanAuditData(pool, AUDIT_TENANT);
    await ingestCorpus(pool, CAT2_DOCS, mode, CAT2_RELATIONS, CAT2_LIVING_STATE);

    const queries = await runQueries(CAT2_GROUND_TRUTH, AUDIT_TENANT);

    // Pass if at least the primary expected doc (incident report) is found
    const q1 = queries[0];
    const passed = (q1.metrics.recall as number) >= 1.0;

    // Aggregate
    const avgRecall = queries.reduce((s, q) => s + (q.metrics.recall as number), 0) / queries.length;
    const avgPrecision = queries.reduce((s, q) => s + (q.metrics.precision as number), 0) / queries.length;

    return {
        category: "cat2",
        mode,
        passed,
        metrics: {
            avg_recall: avgRecall,
            avg_precision: avgPrecision,
            causal_chain_query_recall: queries[1]?.metrics.recall as number ?? -1,
            latency_ms: queries.reduce((s, q) => s + (q.metrics.latency_ms as number), 0) / queries.length,
        },
        queries,
        notes: queries.flatMap((q) => q.notes),
    };
}

async function runCat3(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Category 3: Corpus Degradation Under Scale [${mode}] ===`);

    const scalePoints: ScalePoint[] = [];
    const baselineMisesIds: string[][] = [];

    const scales = [100, 1000, 5000, 10000];

    for (const scale of scales) {
        console.log(`\n  --- Scale point: ${scale} docs ---`);

        await cleanAuditData(pool, AUDIT_TENANT);

        // Build corpus: signal + context + noise
        const contextDocs = generateCat3ContextDocs();
        const noiseCount = Math.max(0, scale - CAT3_SIGNAL_DOCS.length - contextDocs.length);
        const noiseDocs = noiseCount > 0 ? generateNoiseDocs(0, noiseCount) : [];
        const allDocs = [...CAT3_SIGNAL_DOCS, ...contextDocs, ...noiseDocs];

        await ingestCorpus(pool, allDocs, mode, [], []);

        // Query all 10 benchmarks (light mode — precision/recall measurement)
        const queries = await runQueries(CAT3_QUERIES, AUDIT_TENANT);

        // Run fragility probes (verified mode — meaningful domain-diversity fragility)
        console.log(`  Running ${CAT3_FRAGILITY_PROBES.length} fragility probes (verified mode)...`);
        const fragilityProbes = await runQueries(CAT3_FRAGILITY_PROBES, AUDIT_TENANT);
        const probeFragilities = fragilityProbes
            .map((q) => q.metrics.fragility_score as number | undefined)
            .filter((f): f is number => f !== undefined);
        const fragilityProbeMean = probeFragilities.length > 0
            ? probeFragilities.reduce((s, v) => s + v, 0) / probeFragilities.length
            : 0;
        if (probeFragilities.length > 0) {
            console.log(`  fragility_probe_mean=${fragilityProbeMean.toFixed(3)} (${probeFragilities.length} probes, scores: ${probeFragilities.map(f => f.toFixed(2)).join(", ")})`);
        }

        // Compute aggregate metrics from light-mode queries
        const precisions = queries.map((q) => q.metrics.precision as number);
        const recalls = queries.map((q) => q.metrics.recall as number);
        const latencies = queries.map((q) => q.metrics.latency_ms as number);
        const fragilityScores = queries
            .map((q) => q.metrics.fragility_score as number | undefined)
            .filter((f): f is number => f !== undefined);

        const misesIds = queries.map((q) => (q.metrics.mises_actual as string[]) ?? []);

        let misesJaccard = 1;
        if (baselineMisesIds.length > 0) {
            const jaccards = misesIds.map((ids, i) =>
                jaccard(ids, baselineMisesIds[i] ?? [])
            );
            misesJaccard = jaccards.reduce((s, v) => s + v, 0) / jaccards.length;
        } else {
            // Store baseline for Jaccard comparison
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
        console.log(`  precision@5=${point.precision5.toFixed(3)} recall@5=${point.recall5.toFixed(3)} mises_jaccard=${point.misesJaccard.toFixed(3)} fragility_probe=${point.fragilityProbeMean.toFixed(3)} latency_p50=${point.latencyP50}ms`);
    }

    // Compute degradation slope (precision drop per 1K docs)
    const first = scalePoints[0];
    const last = scalePoints[scalePoints.length - 1];
    const slopePerK = (last.precision5 - first.precision5) / ((last.corpusSize - first.corpusSize) / 1000);

    const fragilityNotes: string[] = [
        `Degradation slope: ${slopePerK.toFixed(6)} precision@5 per 1K docs`,
        `Precision@5: ${first.precision5.toFixed(3)} (100 docs) → ${last.precision5.toFixed(3)} (${last.corpusSize} docs)`,
    ];

    // Fragility trend analysis
    const baselineFragility = first.fragilityProbeMean;
    const finalFragility = last.fragilityProbeMean;
    if (baselineFragility > 0 || finalFragility > 0) {
        const fragilityDelta = finalFragility - baselineFragility;
        const direction = fragilityDelta > 0.05 ? "increases" : fragilityDelta < -0.05 ? "decreases" : "stable";
        fragilityNotes.push(`Fragility probe mean: ${baselineFragility.toFixed(3)} (${first.corpusSize} docs) → ${finalFragility.toFixed(3)} (${last.corpusSize} docs) — ${direction} with scale`);
    }

    return {
        category: "cat3",
        mode,
        passed: last.precision5 >= 0.1, // some signal should survive
        metrics: {
            scale_points: JSON.stringify(scalePoints),
            degradation_slope_per_1k: slopePerK,
            baseline_precision5: first.precision5,
            final_precision5: last.precision5,
            baseline_recall5: first.recall5,
            final_recall5: last.recall5,
            baseline_fragility_probe: baselineFragility,
            final_fragility_probe: finalFragility,
        },
        queries: [],
        notes: fragilityNotes,
    };
}

async function runCat4(pool: pg.Pool, mode: EngineMode): Promise<CategoryMetrics> {
    console.log(`\n=== Category 4: Temporal Reconstruction [${mode}] ===`);

    if (mode === "V1") {
        console.log(`  Skipping — Cat 4 requires V4.1 (living objects).`);
        return {
            category: "cat4",
            mode,
            passed: true,
            metrics: { skipped: true },
            queries: [],
            notes: ["Skipped: V1 does not support temporal reconstruction"],
        };
    }

    await cleanAuditData(pool, AUDIT_TENANT);
    const idMap = await ingestCorpus(pool, CAT4_DOCS, mode, CAT4_RELATIONS, CAT4_LIVING_STATES);

    // Build reverse map: artifact integer id -> chunk string id
    const reverseMap = new Map<number, string>();
    for (const [chunkId, artifactId] of idMap) {
        reverseMap.set(artifactId, chunkId);
    }

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

        // Query actual living_state from DB, joining through artifact_chunks for published_at filter
        const result = await pool.query(
            `SELECT ac.id AS chunk_id, als.living_status
             FROM engine.artifact_living_state als
             JOIN artifact_chunks ac ON ac.artifact_id = als.artifact_id
             WHERE als.tenant_id = $1
               AND ac.published_at <= $2::timestamptz`,
            [AUDIT_TENANT, t0PlusDays(snapshot.atDaysFromT0)]
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
    // Run queries via /v1/answers to generate CROWN receipts, then verify chain integrity
    console.log(`\n  --- Receipt verifiability ---`);
    const receiptQueries = [
        "What are the current API design standards?",
        "What authentication framework is in use?",
        "What are the logging standards?",
    ];

    let receiptsGenerated = 0;
    let chainsVerified = 0;
    let chainsIntact = 0;
    let receiptsSigned = 0;
    let hasKnowledgeCursor = 0;
    const receiptNotes: string[] = [];

    for (const q of receiptQueries) {
        try {
            const qr = await queryAnswers(q, { mode: "verified", topK: 5, tenantId: AUDIT_TENANT });
            if (qr.answerId) {
                receiptsGenerated++;
                console.log(`  Receipt: ${qr.crown.receiptId ?? "none"} (signed=${qr.crown.signed})`);

                if (qr.crown.signed) receiptsSigned++;
                if (qr.crown.knowledgeStateCursor) hasKnowledgeCursor++;

                // Verify chain via Engine endpoint
                const chain = await verifyReceiptChain(qr.answerId);
                chainsVerified++;
                if (chain.chainIntact) {
                    chainsIntact++;
                } else if (chain.error) {
                    receiptNotes.push(`Chain verification failed for ${qr.answerId}: ${chain.error}`);
                } else {
                    receiptNotes.push(`Chain broken for ${qr.answerId}`);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            receiptNotes.push(`Receipt query failed: ${msg.slice(0, 120)}`);
        }
    }

    console.log(`  Receipts: ${receiptsGenerated}/${receiptQueries.length} generated, ${chainsIntact}/${chainsVerified} chains intact, ${receiptsSigned} signed`);

    // Check receipt chain in DB directly (parent_snap_id linkage)
    let dbChainIntact = false;
    try {
        const chainResult = await pool.query(
            `SELECT snap_id, parent_snap_id, signature IS NOT NULL AS signed, knowledge_state_cursor IS NOT NULL AS has_cursor
             FROM crown_snapshots
             WHERE tenant_id = $1
             ORDER BY generated_at ASC`,
            [AUDIT_TENANT]
        );
        const rows = chainResult.rows;
        if (rows.length > 0) {
            // Verify parent_snap_id chain: each receipt (after the first per answer) should
            // reference a previous snap_id as parent
            const snapIds = new Set(rows.map((r: any) => r.snap_id));
            const brokenLinks = rows.filter((r: any) => r.parent_snap_id && !snapIds.has(r.parent_snap_id));
            dbChainIntact = brokenLinks.length === 0;
            console.log(`  DB chain: ${rows.length} receipts, ${brokenLinks.length} broken parent links`);
        }
    } catch (err) {
        receiptNotes.push(`DB chain query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- Phase 3: V4.1 vs V3.1 differentiation ---
    const v41Differentiation: string[] = [];
    if (mode === "V4.1") {
        // Check for knowledge_state_cursor presence (V4.1 CoreCrux integration)
        if (hasKnowledgeCursor > 0) {
            v41Differentiation.push(`knowledge_state_cursor present in ${hasKnowledgeCursor}/${receiptsGenerated} receipts (CoreCrux event lineage active)`);
        } else {
            v41Differentiation.push("knowledge_state_cursor absent — CoreCrux event lineage not yet producing cursors");
        }

        // Probe for V4.1-specific reconstruction endpoint (future-ready)
        try {
            const probeResp = await fetch(`${process.env.BENCH_TARGET ?? "http://127.0.0.1:3333"}/v1/reconstruction/probe`, {
                method: "GET",
                headers: { "x-api-key": process.env.API_KEY ?? "" },
            });
            if (probeResp.ok) {
                v41Differentiation.push("Temporal reconstruction endpoint available");
            } else {
                v41Differentiation.push(`Temporal reconstruction endpoint not yet deployed (${probeResp.status}) — Cat 4 uses artifact_living_state DB query as proxy`);
            }
        } catch {
            v41Differentiation.push("Temporal reconstruction endpoint not yet deployed — Cat 4 uses artifact_living_state DB query as proxy");
        }
    } else if (mode === "V3.1") {
        v41Differentiation.push("V3.1 and V4.1 produce identical Cat 4 results: both query artifact_living_state directly. V4.1 differentiation will come from decision_causal_chain projection and temporal reconstruction API when deployed.");
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
            knowledge_cursor_present: hasKnowledgeCursor,
        },
        queries: [],
        notes: [...notes, ...receiptNotes, ...v41Differentiation],
    };
}

function t0PlusDays(days: number): string {
    const t0 = new Date(Date.now() - 180 * 86400000);
    return new Date(t0.getTime() + days * 86400000).toISOString();
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(report: AuditReport): string {
    const lines: string[] = [];
    lines.push(`# Retrieval Quality Audit Report`);
    lines.push(``);
    lines.push(`**Run ID:** ${report.runId}`);
    lines.push(`**Started:** ${report.startedAt}`);
    lines.push(`**Finished:** ${report.finishedAt}`);
    lines.push(`**Host:** ${report.host}`);
    lines.push(``);

    for (const [mode, cats] of Object.entries(report.modes)) {
        lines.push(`## Mode: ${mode}`);
        lines.push(``);

        for (const [catId, cat] of Object.entries(cats!)) {
            const cm = cat as CategoryMetrics;
            const catNames: Record<string, string> = {
                cat1: "Supersession Accuracy",
                cat2: "Causal Chain Retrieval",
                cat3: "Corpus Degradation",
                cat4: "Temporal Reconstruction",
            };
            lines.push(`### ${catNames[catId] ?? catId}`);
            lines.push(``);
            lines.push(`**Passed:** ${cm.passed ? "YES" : "NO"}`);
            lines.push(``);

            // Metrics table
            lines.push(`| Metric | Value |`);
            lines.push(`|--------|-------|`);
            for (const [k, v] of Object.entries(cm.metrics)) {
                if (k === "scale_points") continue; // too large for table
                const display = typeof v === "number" ? (Number.isInteger(v) ? v.toString() : v.toFixed(4)) : String(v);
                lines.push(`| ${k} | ${display} |`);
            }
            lines.push(``);

            // Scale points for Cat 3
            if (cm.metrics.scale_points) {
                const points: ScalePoint[] = JSON.parse(cm.metrics.scale_points as string);
                lines.push(`#### Degradation Curve`);
                lines.push(``);
                lines.push(`| Corpus Size | Precision@5 | Recall@5 | MiSES Jaccard | Fragility (light) | Fragility Probe (verified) | Latency P50 | Latency P95 |`);
                lines.push(`|---:|---:|---:|---:|---:|---:|---:|---:|`);
                for (const p of points) {
                    lines.push(`| ${p.corpusSize} | ${p.precision5.toFixed(3)} | ${p.recall5.toFixed(3)} | ${p.misesJaccard.toFixed(3)} | ${p.fragilityMean.toFixed(3)} | ${p.fragilityProbeMean?.toFixed(3) ?? "—"} | ${p.latencyP50}ms | ${p.latencyP95}ms |`);
                }
                lines.push(``);
            }

            // Query details
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

            // Notes
            if (cm.notes.length > 0) {
                lines.push(`#### Notes`);
                for (const n of cm.notes) lines.push(`- ${n}`);
                lines.push(``);
            }
        }
    }

    // Cross-mode comparison
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
    const { modes, cats } = parseArgs();
    console.log(`Quality Audit: modes=${modes.join(",")} categories=${cats.join(",")}`);

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

            console.log(`\n  → ${cat} [${mode}]: ${result.passed ? "PASSED" : "FAILED"}`);
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
                    ? `recall ${(v1Cat1.metrics.recall as number)?.toFixed(3)} → ${(v41Cat1.metrics.recall as number)?.toFixed(3)}, ranking ${(v1Cat1.metrics.ranking_accuracy as number)?.toFixed(3)} → ${(v41Cat1.metrics.ranking_accuracy as number)?.toFixed(3)}`
                    : "N/A",
            causal_completeness_improvement:
                v1Cat2 && v41Cat2
                    ? `avg_recall ${(v1Cat2.metrics.avg_recall as number)?.toFixed(3)} → ${(v41Cat2.metrics.avg_recall as number)?.toFixed(3)}`
                    : "N/A",
            degradation_slope_v1: (v1Cat3?.metrics.degradation_slope_per_1k as number) ?? 0,
            degradation_slope_v41: (v41Cat3?.metrics.degradation_slope_per_1k as number) ?? 0,
        };
    }

    report.finishedAt = new Date().toISOString();

    // Clean up
    console.log(`\nCleaning up audit data...`);
    await cleanAuditData(pool, AUDIT_TENANT);
    await pool.end();

    // Write results
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonPath = join(RESULTS_DIR, `quality-audit-${timestamp}.json`);
    const mdPath = join(RESULTS_DIR, `quality-audit-${timestamp}.md`);

    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(mdPath, generateMarkdownReport(report));

    console.log(`\n${"=".repeat(60)}`);
    console.log(`QUALITY AUDIT COMPLETE`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  Duration: ${((new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()) / 1000).toFixed(1)}s`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Report: ${mdPath}`);
    console.log(`${"=".repeat(60)}`);

    // Summary
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
