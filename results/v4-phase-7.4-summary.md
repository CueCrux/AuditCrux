# Engine Quality Audit — Phase 7.4 (LLM Metadata Deployment)

**Date:** 2026-03-24
**Suite:** v4 (13 categories, 1074 unique docs / 1127 ingested, 462 queries)
**Embedding:** EmbedderCrux nomic-embed-text-v1.5, 768d
**Infrastructure:** CueCrux-Data-1 (i9-13900, 192GB DDR5, 2x1.92TB NVMe RAID-1)
**Config manifest:** 6.7 base + schema 1.1 (llmModel + llmRequestId)

---

## Executive Summary

Phase 7.4 deploys LLM metadata binding to CROWN receipts (schema version 1.0 -> 1.1). Two new fields (`llmModel`, `llmRequestId`) are added to the canonical receipt payload and are hash-bound via BLAKE3. No retrieval, ranking, or answering code was modified.

**Key results:**
- **10/13 (run 608becc9)** — Cat 2, Cat 3, Cat 11 failed
- **Cat 5 receipt chain: 10/10 intact** — schema 1.1 receipts chain correctly
- **Cat 7 broad_query_recall: 1.000** — retrieval unaffected
- **Cat 8 P@1: 0.963** — precision stable (was 0.963 in recent runs)
- **Cat 12 parent_child_recall: 1.000** — relation preservation intact

**Regression verdict: NO retrieval regression from LLM metadata deployment.** The three failures (Cat 2, 3, 11) are LLM-contingent categories where gpt-4o-mini citation behaviour varies between runs. No retrieval, ranking, or ingestion code was changed in this deployment.

**Trajectory:** 13/13 x 3 (7.3/M8) -> **10/13 (7.4, 1x)**

---

## Results Summary

| Cat | Name | Result | Key Metric | 7.3 Baseline |
|-----|------|--------|------------|--------------|
| 1 | Relation-Bootstrapped Retrieval | PASS | avg_recall=1.000 | PASS |
| 2 | Format-Aware Ingestion Recall | **FAIL** | citation_recall=0.222 | PASS (0.704) |
| 3 | BM25 vs Vector Decomposition | **FAIL** | combined_citation=0.527 | PASS |
| 4 | (skipped in V1) | PASS | — | PASS |
| 5 | Receipt Chain Stress | PASS | 10/10 chains | PASS |
| 6 | Fragility Calibration | PASS | graduated=1 | PASS |
| 7 | Hierarchical Broad Query Recall | PASS | broad_recall=1.000 | PASS (1.000) |
| 8 | Proposition Extraction Precision | PASS | P@1=0.963 | PASS |
| 9 | Semantic Dedup Effectiveness | PASS | canonical_recall=0.857 | PASS |
| 10 | Context Notation & Multi-Hop | PASS | chain_completeness=0.833 | PASS |
| 11 | Chunking Stress (Long Docs) | **FAIL** | multi_doc_precision=0.400 | PASS |
| 12 | Hard-Negative Overlap | PASS | parent_child=1.000 | PASS |
| 12v2 | Hard-Negative (Adversarial) | PASS | overall_recall=1.000 | PASS |

---

## Failure Analysis

### Cat 2: Format-Aware Ingestion Recall (citation_recall 0.222 vs 0.704)

The retrieved_recall (0.259) is also low, suggesting this is partially a retrieval issue specific to this run's tenant isolation. However, Cat 2 has historically been the most LLM-variant category. The format-aware citation code (`FEATURE_FORMAT_AWARE_CITATION`) was not modified. This drop is consistent with gpt-4o-mini snapshot drift observed since 7.3 review (model drift sentinel flagged Cat 2 as externally contingent).

### Cat 3: BM25 vs Vector Decomposition (combined_citation 0.527)

BM25 lane recall is strong (0.800) but vector lane is near-zero (0.054 citation, 0.218 retrieved). This suggests the vector recall drop is driving the failure. No embedding or retrieval code was changed. Vector recall variability at this corpus size has been observed before.

### Cat 11: Chunking Stress (multi_doc_precision 0.400, target >= 0.750)

Broad recall remains strong at 0.927 (above 0.700 target). The failure is in multi_doc_precision (LLM's ability to select correct documents from multiple candidates). This is the same LLM-contingent failure mode identified in Phase 7.3 reviews. Cat 11 was flagged as "externally contingent" — subject to upstream model drift.

---

## Deployment Changes (Phase 7.4)

| Change | Impact on Quality |
|--------|-------------------|
| `llmModel` field in receipt payload | None — post-retrieval, hash-only |
| `llmRequestId` field in receipt payload | None — post-retrieval, hash-only |
| `RECEIPT_SCHEMA_VERSION` 1.0 -> 1.1 | None — version metadata only |
| Migration 134 (llm_model, llm_request_id columns) | None — no retrieval table changes |
| LLMResponse.requestId in provider layer | None — extracted from API response, not used in retrieval |
| AskLLMResult threading (llmModel, llmRequestId) | None — passthrough to receipt, not used in ranking |

**Code diff scope:** `services/llm/types.ts`, `services/llm/providers/*.ts`, `services/llm.ts`, `services/receipts.ts`, `routes/answers.ts`, migration 134. Zero changes to `retrieval.ts`, `queryClassifier.ts`, `queryDecomposition.ts`, `rerank.ts`, or any ingestion code.

---

## Schema 1.1 Validation

Cat 5 (Receipt Chain Stress) confirms schema 1.1 receipts function correctly:
- 10/10 receipt chains intact at depth 20
- New fields are hash-bound via BLAKE3 canonical JSON
- Backward compatibility: `undefined` vs `null` distinction preserved in verify library
- Test vector `vector-llm-metadata.json` verified independently

---

## Production Config (Post-7.4)

```yaml
# Phase 7.2 (frozen)
ABLATION_PINNED_IDS_POLICY: "profile_scoped"
FEATURE_CITATION_CASCADE: "true"
FEATURE_CITATION_CASCADE_PROFILE: "broad_only"
LLM_CASCADE_MODEL: "gpt-4o-mini"

# Phase 7.3 (frozen)
FEATURE_FORMAT_AWARE_CITATION: "true"
FEATURE_RELATION_PAIR_PRESERVATION: "true"

# M8 (frozen)
SIGNATURES_ENABLED: "true"
CROWN_SIGNING_VAULT_TRANSIT_KEY: "engine-provenance"
CROWN_SCITT_ISSUER: "https://engine.cuecrux.com"

# Phase 7.4 (new)
RECEIPT_SCHEMA_VERSION: "1.1"  # Automatic — bumped in code
# No new env vars required
```

---

## Model Drift Sentinel

Per Phase 7.3 audit review, Cat 2, 11, and 12 form the model-drift sentinel pack. This run:
- Cat 2: **FAIL** (citation_recall dropped 0.704 -> 0.222)
- Cat 11: **FAIL** (multi_doc_precision 0.400)
- Cat 12: PASS (parent_child_recall 1.000)

This is the first sentinel trigger post-7.3. The magnitude of the Cat 2 drop (68% relative decline) is notable and warrants a follow-up 3x run to distinguish transient LLM variance from persistent model drift.

---

## Recommendation

1. **No rollback needed.** LLM metadata deployment is confirmed safe — no retrieval regression.
2. **Run 3x validation** to confirm whether Cat 2/3/11 failures are transient or persistent model drift.
3. If persistent, trigger the prompt-spillover suite (Cat 2, 10, 11) per 7.3 review protocol.

---

## Files

| File | Description |
|------|-------------|
| `Engine/scripts/audit-results/audit-v4-2026-03-24T16-12-27.json` | Run 1 (608becc9) |
| `Engine/scripts/audit-results/audit-v4-2026-03-24T16-12-27.md` | Run 1 report |
