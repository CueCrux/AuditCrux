# Phase 8 M1: Cross-Encoder Reranking Results

**Date:** 2026-03-31
**Run ID:** lme-s3-sonnet-4-6-F1-202603311823-77933e
**Commit:** 2544cfa (feat(retrieval): Phase 8 M1 — cross-encoder reranking via BGE-reranker-v2-m3)
**Cost:** $9.49 (119 questions) + ~$0.50 (GPT-4o judge)

---

## Configuration

- **Reranker:** BGE-reranker-v2-m3 at GPU-1:8082
- **Score blend:** 70% reranker + 30% original
- **Top-N candidates:** 50 (CROSS_ENCODER_TOP_N)
- **Timeout:** 5000ms per request
- **Fallback:** Non-fatal — if reranker fails, original ordering preserved

## Results

| Metric | Value |
|--------|-------|
| Failure questions tested | 119 |
| Recovered (now passing) | 40 |
| Still failing | 79 |
| Recovery rate | 33.6% |
| Projected score | 84.2% (421/500) |
| Projected gain | +8.0pp from 76.2% baseline |
| Realistic confirmed estimate | ~80-82% (accounting for 4-6pp regression on full 500) |

## Recovery by Question Type

| Type | Tested | Recovered | Rate |
|------|--------|-----------|------|
| knowledge-update | 21 | 13 | 62% |
| single-session-user | 4 | 2 | 50% |
| temporal-reasoning | 41 | 15 | 37% |
| single-session-preference | 4 | 1 | 25% |
| multi-session | 49 | 9 | 18% |

## Analysis

Cross-encoder reranking had a much larger impact than the expected +3-5pp, with the strongest effect on knowledge-update questions (62% recovery). The reranker's ability to re-score passage relevance using cross-attention (rather than independent embeddings) significantly improves ranking for questions where the correct answer is present but buried below the retrieval cutoff.

**Knowledge-update** benefited most because superseded facts often have similar embeddings to current facts — the cross-encoder distinguishes them by attending to both query and passage jointly, promoting the current-state passage above the stale one.

**Temporal-reasoning** saw 37% recovery, suggesting the reranker better identifies passages containing date-relevant evidence when the query mentions specific time periods.

**Multi-session** had the lowest recovery (18%), consistent with the extraction quality ceiling — if the entities aren't in the index, better ranking can't help.

## Caveat

This is a failure-only test. Prior experience shows failure-only testing over-estimates accuracy by 4-6pp due to regressions on previously passing questions. A full 500-question confirmation run is required before publishing this result. Per the Phase 8 testing protocol, the full 500 run is scheduled after M1+M2.

## Remaining 79 Failures

These 79 questions will be the input for M2 (four-way RRF fusion).
