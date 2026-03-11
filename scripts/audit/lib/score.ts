import type { GroundTruth, QueryResult } from "./types.js";

export type ScoreResult = {
    query: string;
    metrics: Record<string, number | boolean | string | string[]>;
    notes: string[];
};

export function scoreQuery(result: QueryResult, truth: GroundTruth): ScoreResult {
    const notes: string[] = [];
    const metrics: Record<string, number | boolean | string | string[]> = {};

    const citationIds = result.citations.map((c) => c.id);

    // Presence: which expected docs appeared?
    const found = truth.expectedDocIds.filter((id) => citationIds.includes(id));
    const missing = truth.expectedDocIds.filter((id) => !citationIds.includes(id));
    metrics.expected_found = found.length;
    metrics.expected_total = truth.expectedDocIds.length;
    metrics.precision = truth.expectedDocIds.length > 0 ? found.length / Math.min(truth.topK, citationIds.length || 1) : 0;
    metrics.recall = truth.expectedDocIds.length > 0 ? found.length / truth.expectedDocIds.length : 0;
    metrics.found_ids = found;
    metrics.missing_ids = missing;

    // Retrieved recall: measures pipeline recall before LLM citation selection
    const retrievedIds = result.retrievedIds ?? [];
    const retrievedFound = truth.expectedDocIds.filter((id) => retrievedIds.includes(id));
    metrics.retrieved_found = retrievedFound.length;
    metrics.retrieved_recall = truth.expectedDocIds.length > 0
        ? retrievedFound.length / truth.expectedDocIds.length : 0;
    metrics.retrieved_ids = retrievedIds;

    if (missing.length > 0) {
        notes.push(`Missing expected docs: ${missing.join(", ")}`);
    }

    // Ranking: check [higher, lower] pairs
    if (truth.expectedRanking) {
        let rankingCorrect = 0;
        let rankingTotal = 0;
        for (const [higher, lower] of truth.expectedRanking) {
            rankingTotal++;
            const higherIdx = citationIds.indexOf(higher);
            const lowerIdx = citationIds.indexOf(lower);
            if (higherIdx === -1) {
                notes.push(`Ranking: ${higher} not in citations (expected above ${lower})`);
            } else if (lowerIdx === -1) {
                rankingCorrect++; // higher present, lower absent = correct ordering
            } else if (higherIdx < lowerIdx) {
                rankingCorrect++;
            } else {
                notes.push(`Ranking violation: ${higher} (pos ${higherIdx}) should rank above ${lower} (pos ${lowerIdx})`);
            }
        }
        metrics.ranking_correct = rankingCorrect;
        metrics.ranking_total = rankingTotal;
        metrics.ranking_accuracy = rankingTotal > 0 ? rankingCorrect / rankingTotal : 1;
    }

    // MiSES composition
    if (truth.expectedMiSES) {
        const misesIds = result.crown.citationIds;
        const misesExpectedFound = truth.expectedMiSES.filter((id) => misesIds.includes(id));
        metrics.mises_expected_found = misesExpectedFound.length;
        metrics.mises_expected_total = truth.expectedMiSES.length;
        metrics.mises_accuracy = truth.expectedMiSES.length > 0 ? misesExpectedFound.length / truth.expectedMiSES.length : 1;
        metrics.mises_actual = misesIds;

        const misesMissing = truth.expectedMiSES.filter((id) => !misesIds.includes(id));
        if (misesMissing.length > 0) {
            notes.push(`MiSES missing: ${misesMissing.join(", ")}`);
        }
    }

    // Fragility — always record the score when available
    if (result.crown.fragilityScore !== undefined) {
        metrics.fragility_score = result.crown.fragilityScore;
    }
    if (truth.expectedFragilityRange && result.crown.fragilityScore !== undefined) {
        const [min, max] = truth.expectedFragilityRange;
        metrics.fragility_in_range = result.crown.fragilityScore >= min && result.crown.fragilityScore <= max;
        if (!metrics.fragility_in_range) {
            notes.push(`Fragility ${result.crown.fragilityScore} outside expected range [${min}, ${max}]`);
        }
    }

    // Domain diversity
    const domains = new Set(result.citations.map((c) => c.domain));
    metrics.distinct_domains = domains.size;

    // Timings
    metrics.latency_ms = result.timings.totalMs;

    return { query: result.query, metrics, notes };
}

export function jaccard(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 1 : intersection / union;
}

export function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
