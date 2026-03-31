# Phase 8 M2: Entity RRF Fusion Results

**Date:** 2026-03-31
**Run ID:** lme-s3-sonnet-4-6-F1-202603312006-023907
**Commit:** cefca1d (feat(retrieval): Phase 8 M2 — entity index RRF fusion as third retrieval signal)
**Cost:** $5.81 (79 questions) + ~$0.30 (GPT-4o judge)

---

## Configuration

- **Entity RRF:** FEATURE_ENTITY_RRF=true
- **RRF constant K:** 60 (ENTITY_RRF_K)
- **Entity weight:** 0.15 (ENTITY_RRF_WEIGHT)
- **Entity matching:** ILIKE on entity_name and object_value with 3+ char query words
- **Cross-encoder also active:** M1 reranking still applied after RRF scoring

## Results

| Metric | Value |
|--------|-------|
| Failure questions tested | 79 (remaining from M1) |
| Recovered (now passing) | 11 |
| Still failing | 68 |
| Recovery rate | 13.9% |

## Cumulative Impact (M1 + M2)

| Milestone | Projected Score | Gain |
|-----------|----------------|------|
| Baseline (76.2% full run) | 381/500 | — |
| + M1 cross-encoder | 421/500 (84.2%) | +8.0pp |
| + M2 entity RRF | 432/500 (86.4%) | +2.2pp |
| **Cumulative projected** | **86.4%** | **+10.2pp** |
| Realistic confirmed estimate | ~82-84% | accounting for regressions |

## Recovery by Question Type

| Type | Tested | Recovered | Rate |
|------|--------|-----------|------|
| multi-session | 40 | 6 | 15% |
| temporal-reasoning | 26 | 4 | 15% |
| knowledge-update | 8 | 1 | 12% |
| single-session-preference | 3 | 0 | 0% |
| single-session-user | 2 | 0 | 0% |

## Analysis

Entity RRF fusion provides a modest but consistent lift across multi-session (6) and temporal (4) questions. The entity index helps surface chunks that contain mentioned entities but rank low in vector/lexical search — the RRF boost lifts them above the retrieval cutoff.

The 15% recovery rate on multi-session questions is meaningful given these are the hardest category (extraction quality ceiling). The entity index provides a complementary signal that pure embedding similarity misses.

## Remaining 68 Failures

These 68 questions are the input for M3 (entity graph edges).

## Testing Protocol Note

Per the Phase 8 plan, a full 500-question confirmation run is scheduled after M1+M2. The cumulative projected 86.4% will likely be 82-84% confirmed, accounting for 2-4pp regression on previously passing questions.
