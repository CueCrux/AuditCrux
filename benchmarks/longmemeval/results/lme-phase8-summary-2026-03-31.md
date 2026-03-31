# Phase 8: Retrieval Parity — Results Summary

**Date:** 2026-03-31
**Baseline:** 76.2% (381/500) — full 500 confirmed run
**Projected after Phase 8:** 87.2% (436/500) — failure-only, needs full 500 confirmation
**Realistic confirmed estimate:** 83-85% (accounting for 2-4pp regression)

---

## Milestone Results

| Milestone | What | Commit | Failures Tested | Recovered | Projected Score | Incremental | Cost |
|-----------|------|--------|-----------------|-----------|----------------|-------------|------|
| M1 | Cross-encoder reranking (BGE-reranker-v2-m3) | 2544cfa | 119 | 40 (33.6%) | 84.2% | +8.0pp | $9.49 |
| M2 | Entity RRF fusion (3rd retrieval signal) | cefca1d | 79 | 11 (13.9%) | 86.4% | +2.2pp | $5.81 |
| M3 | Entity graph expansion (co-occurrence) | 5cd76a2 | 68 | 2 (2.9%) | 86.8% | +0.4pp | $4.88 |
| Sonnet extraction | Re-extract entities with Sonnet on 26 abstained | — | 26 | 2 (7.7%) | 87.2% | +0.4pp | ~$15 |
| **Total** | | | **119** | **55 (46.2%)** | **87.2%** | **+11.0pp** | **~$35** |

## Recovery by Question Type (M1 only, largest impact)

| Type | Tested | Recovered | Rate |
|------|--------|-----------|------|
| knowledge-update | 21 | 13 | 62% |
| single-session-user | 4 | 2 | 50% |
| temporal-reasoning | 41 | 15 | 37% |
| single-session-preference | 4 | 1 | 25% |
| multi-session | 49 | 9 | 18% |

## Key Findings

1. **Cross-encoder reranking was the dominant intervention** (+8.0pp, 73% of total gain). BGE-reranker-v2-m3 at 70/30 blend with original scores dramatically improves ranking quality.

2. **Entity RRF provided meaningful incremental lift** (+2.2pp). Adding entity index as a third retrieval signal helps surface chunks that vector/lexical alone misses.

3. **Graph expansion and Sonnet extraction showed diminishing returns** (+0.4pp each). The remaining failures are structurally limited by either missing chunks in retrieval or LLM reasoning errors.

4. **Extraction quality is NOT the binding constraint** (contrary to prior hypothesis). Sonnet extraction added 868 high-quality entities but only recovered 2/26 abstained questions. The bottleneck is that relevant chunks are not being retrieved by any signal — the answers exist in the corpus but no retrieval path reaches them.

5. **Remaining 64 failures are dominated by LLM reasoning ceiling**: wrong counts, wrong date arithmetic, wrong entity selection from correct context.

## Architecture Deployed (Production)

All three retrieval enhancements are live on VaultCrux-App (100.109.10.67):
- `FEATURE_CROSS_ENCODER_RERANK=true` — BGE-reranker-v2-m3 at GPU-1:8082
- `FEATURE_ENTITY_RRF=true` — Entity index as 3rd retrieval signal (weight 0.15)
- `FEATURE_ENTITY_GRAPH_EXPAND=true` — Co-occurrence expansion (weight 0.10)

## Run IDs

| Milestone | Run ID |
|-----------|--------|
| M1 | lme-s3-sonnet-4-6-F1-202603311823-77933e |
| M2 | lme-s3-sonnet-4-6-F1-202603312006-023907 |
| M3 | lme-s3-sonnet-4-6-F1-202603312113-9a3f9e |
| Sonnet extraction test | lme-s3-sonnet-4-6-F1-202603312200-249248 |

## Next Steps

1. **Full 500-question confirmation run** (~$30) to get verified score
2. **M4-M7 deferred** — diminishing returns from retrieval improvements; remaining failures need LLM reasoning improvements
3. **Model upgrade** (Opus 4.6) would likely give +5-8pp based on Hindsight's model scaling data
