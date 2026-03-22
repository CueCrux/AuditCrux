# Engine Quality Audit — Phase 7.3 Citation Quality & Relation Recall

**Date:** 2026-03-22
**Suite:** v4 (13 categories, 1074 unique docs / 1127 ingested, 462 queries)
**Embedding:** EmbedderCrux nomic-embed-text-v1.5, 768d
**Infrastructure:** CueCrux-Data-1 (i9-13900, 192GB DDR5, 2×1.92TB NVMe RAID-1)
**Config manifest:** `Engine/docs/config-manifest-6.7.json` (6.6 base + 2 new flags)

---

## Executive Summary

Phase 7.3 addresses two secondary quality gaps identified by the M3 experiment and external audit review:

1. **Cat 2 citation recall (format-aware citation prompting):** M3 proved the structured-doc gap is LLM citation selection, not BM25 retrieval. Fix: enable dormant `FEATURE_FORMAT_AWARE_CITATION` and remove `text/plain` from `STRUCTURED_MIMES` (too broad — catches chat logs and notes, not just structured data).

2. **Cat 12 parent_child_recall (relation-pair preservation):** Two runbook docs found by relation expansion were dropped by `reranked.slice(0, topK)` cutoff. Fix: inject relation-expanded children when their parent survives the cutoff (capped at 2 injections).

**Key results:**
- **Cat 2 avg_citation_recall: 0.670 / 0.715 / 0.696** (up from ~0.626-0.696 M0+M1 baseline). Format-aware hint improves structured-doc citation without regressing prose.
- **Cat 12 parent_child_recall: 1.000 / 1.000 / 1.000** (up from 0.846 in 7.2). Relation-pair preservation recovers the 6.6/7.0 perfect score.
- **Cat 11 broad_recall: 0.927 (3/3)** — improved from 0.722 in 7.2. All other guard categories stable.
- **13/13 × 3 validated** (runs 16554101, ca505454, 5e5ccff5).

**Baseline status:** 7.3 is frozen as the **canonical quality baseline** (13/13, stable, with intended Cat 2 and Cat 12 gains preserved). The baseline is not downgraded because one improvement (Cat 11) turned out to be external — the practical system is still better.

**Trajectory:** ... → **13/13 (M0+M1, 3×)** → **13/13 (7.3: format-aware citation + relation-pair preservation, 3×)**

### Two-Layer Narrative (Third Audit Review)

**Layer 1 — Owned Engineering Delta:**
- **Relation-pair preservation** fixes the Cat 12 topK-drop problem and restores parent/child completeness (0.846→1.000).
- **Format-aware citation** improves Cat 2 citation behavior on structured formats (citation_recall 0.670-0.715).

**Layer 2 — Observed Environment Delta:**
- Cat 11 improved from 0.722 in 7.2 to 0.927 in 7.3, but **not because of either 7.3 flag** (full attribution matrix: runs f9b80070, b5f84195).
- Cat 11 is presently healthy, but its latest jump is not attributable to a specific product mechanism yet.
- Most likely cause: model/provider/runtime drift (gpt-4o-mini update between run windows).

**Canonical statement:** "7.3 is the best baseline. Cat 2 and Cat 12 improvements are product-owned. Cat 11 is currently excellent but not currently attributable to a shipped 7.3 mechanism."

**Standing guidance (three external audit reviews + attribution matrix):**
- Cat 2: substantially better and now useful, not fully solved. Still LLM-bounded.
- Cat 11: healthy but externally contingent. Not attributable to a shipped mechanism. Monitor via model-drift sentinel pack.
- Cat 12: product-owned fix. Relation-pair preservation is the mechanism.
- Model/provider drift is a first-class release variable. Model provenance pinned in config manifest. Model-drift sentinel pack (Cat 2, 11, 12) for model changes.
- Prompt text is a first-class quality artifact. Prompt hashes pinned in config manifest. Prompt-spillover regression suite (Cat 2, 10, 11) for prompt changes.
- M3/lexical shadow: keep as separate experiment, not part of baseline.
- Multi-lane retrieval / DQP Tier 3: do not reopen. Recent movement is dominated by answer-model behavior and control surfaces, not missing retrieval richness.

---

## What Changed in Phase 7.3

### M1: Format-Aware Citation Prompting (Cat 2, with Cat 11 spillover)

**File:** `Engine/src/services/llm.ts` L160-177

`FEATURE_FORMAT_AWARE_CITATION` was already implemented and gated — `buildFormatAwareCitationHint()` appends structured-data citation instructions to `evidence_selector` and `evidence_first` LLM prompts. Two changes:

1. **Removed `text/plain` from `STRUCTURED_MIMES`.** `text/plain` is ambiguous (catches chat logs, meeting notes) and shouldn't trigger the structured-data hint. Retained: `application/json`, `text/csv`, `text/yaml`, `application/yaml`.
2. **Enabled `FEATURE_FORMAT_AWARE_CITATION=true` in production.** The hint tells the LLM: "IMPORTANT: Some context snippets contain structured data... you MUST cite them explicitly... do not overlook them in favor of prose-formatted contexts."

**Attribution matrix finding:** Full attribution matrix (runs f9b80070, b5f84195) confirmed that **neither** 7.3 flag caused the Cat 11 broad_recall improvement (0.722→0.927). The improvement persists with this flag disabled. The initial "prompt spillover" hypothesis was disproven — the Cat 11 lift is an external factor (likely LLM behavior shift), not a code change.

**Operational implication:** Prompt text changes remain quality-sensitive for Cat 2 (the intended target). Prompt hash is pinned in `config-manifest-6.7.json`. Run `scripts/audit-v4/prompt-spillover-suite.sh` for prompt changes to guard against regressions.

**Rollback:** `FEATURE_FORMAT_AWARE_CITATION=false`

### M2: Relation-Pair Preservation (Cat 12)

**File:** `Engine/src/routes/answers.ts` (after L1254)

After `let final = reranked.slice(0, payload.topK)`, checks `retrieved.relationPairs` for parent-child relationships. If a parent chunk is in `final` but its relation-expanded child is in `reranked` (any rank) but not in `final`, injects the child.

```typescript
const MAX_RELATION_PAIR_INJECT = 2;
if (config.FEATURE_RELATION_PAIR_PRESERVATION && (retrieved.relationPairs ?? []).length > 0) {
    const finalIds = new Set(final.map((c) => c.id));
    let injected = 0;
    for (const pair of retrieved.relationPairs!) {
        if (injected >= MAX_RELATION_PAIR_INJECT) break;
        const parentInFinal = finalIds.has(pair.srcId) || finalIds.has(pair.dstId);
        const missingId = finalIds.has(pair.srcId) ? pair.dstId : pair.srcId;
        if (!parentInFinal || finalIds.has(missingId)) continue;
        const child = reranked.find((c) => c.id === missingId);
        if (child) {
            final.push(child);
            finalIds.add(child.id);
            injected++;
            req.log.info({ parentId: ..., childId: missingId, relationType: pair.relationType },
                "relation-pair-preservation-injected");
        }
    }
}
```

Key detail: `relationPairs` contains `{ srcId, dstId, relationType }` where srcId/dstId are **chunk IDs** (mapped from artifact IDs in `expandCandidatesViaRelations()`).

**Rollback:** `FEATURE_RELATION_PAIR_PRESERVATION=false`

### Config Manifest 6.7

**File:** `Engine/docs/config-manifest-6.7.json`

| Flag | Default | Purpose |
|------|---------|---------|
| `FEATURE_FORMAT_AWARE_CITATION` | `true` | LLM hint to cite structured data (JSON/YAML/CSV) |
| `FEATURE_RELATION_PAIR_PRESERVATION` | `true` | Inject relation-expanded children that survive rerank but miss topK cutoff (max 2) |

---

## Validation Results

### 3× Stability Runs (13/13 each)

| Run | ID | Date | Duration |
|-----|-----|------|----------|
| 1 | 16554101 | 2026-03-22 | 3881s (64m 41s) |
| 2 | ca505454 | 2026-03-22 | 4160s (69m 20s) |
| 3 | 5e5ccff5 | 2026-03-22 | 4083s (68m 03s) |

### Key Metrics (3× runs)

| Metric | Run 1 | Run 2 | Run 3 | Range | vs 7.2 |
|--------|:-----:|:-----:|:-----:|:-----:|:------:|
| Cat 2 citation_recall | 0.670 | **0.715** | 0.696 | ±0.023 | ↑ (was 0.626-0.696) |
| Cat 2 retrieved_recall | 0.933 | 0.933 | **0.956** | ±0.012 | ↑ (was 0.867-0.911) |
| Cat 6 graduated_score | — | **1.0** | **1.0** | — | ↑ (was 0.5) |
| Cat 8 P@1 | 0.963 | 0.963 | 0.963 | 0 | = |
| Cat 9 canonical_recall | — | **1.000** | **1.000** | — | ↑ (was 0.943) |
| Cat 10 chain_completeness | — | **0.967** | 0.933 | ±0.017 | = |
| Cat 11 broad_recall | **0.927** | **0.927** | **0.927** | 0 | ↑ (was 0.722) |
| Cat 12 parent_child_recall | **1.000** | **1.000** | **1.000** | 0 | ↑ (was 0.846) |
| Cat 12 version_precision | 1.000 | 1.000 | 1.000 | 0 | = |
| Cat 12 overall_recall | 1.000 | 1.000 | 1.000 | 0 | = |
| Cat 12v2 adversarial_recall | — | — | — | — | — |

**Perfectly stable (zero variance):** Cat 8, 11, 12 (all sub-metrics).

### Per-Category Full Results (Run 16554101)

| Cat | Name | Result | Key Metric |
|-----|------|:------:|------------|
| 1 | Relation-Bootstrapped Retrieval | PASS | avg_recall=1.000 |
| 2 | Format-Aware Ingestion Recall | PASS | citation_recall=0.670, retrieved_recall=0.933 |
| 3 | BM25 vs Vector Decomposition | PASS | — |
| 4 | Temporal Edge Cases | PASS | V1 mode skip |
| 5 | Receipt Chain Stress | PASS | chains intact |
| 6 | Fragility Calibration | PASS | graduated_score varies (1.0 in runs 2/3) |
| 7 | Hierarchical Broad Query Recall | PASS | — |
| 8 | Proposition Precision | PASS | P@1=0.963 (77/80) |
| 9 | Semantic Dedup | PASS | canonical_recall=1.000 (runs 2/3) |
| 10 | Contextual Chain Recall | PASS | chain_completeness=0.933-0.967 |
| 11 | Multi-Doc Broad Recall | PASS | **broad_recall=0.927 (3/3)** |
| 12 | Hard-Negative Overlap | PASS | **parent_child_recall=1.000 (3/3)** |
| 12v2 | Adversarial Expansion | PASS | — |

---

## Impact Assessment

### Cat 2: Format-Aware Citation (M1 target)

| Metric | 7.1 (4×) | 7.2 M0+M1 (3×) | 7.3 (3×) | Change |
|--------|:--------:|:---------------:|:--------:|:------:|
| avg_citation_recall | 0.659-0.704 | 0.626-0.696 | **0.670-0.715** | Stabilized at upper range |
| avg_retrieved_recall | — | 0.867-0.911 | **0.933-0.956** | ↑ improved |

The format-aware citation hint nudges the LLM to cite structured docs (JSON/YAML/CSV) that it previously overlooked. Retrieved_recall was already high — confirming M3's finding that this is a citation selection problem, not retrieval.

### Cat 12: Relation-Pair Preservation (M2 target)

| Metric | 6.6 (3×) | 7.0 (3×) | 7.1 (3×) | 7.2 (3×) | 7.3 (3×) | Change |
|--------|:--------:|:--------:|:--------:|:--------:|:--------:|:------:|
| parent_child_recall | 1.000 | 1.000 | 0.846 | 0.846 | **1.000** | Recovered to 6.6/7.0 level |

Root cause was structural: relation-expanded runbook docs ranked 6+ after reranking, dropped by `topK=5` cutoff. The injection logic recovers them without expanding the general topK (which would dilute precision for non-relation queries).

### Cat 11: Broad Recall (unexpected improvement)

| Metric | 7.1 (3×) | 7.2 M0+M1 (3×) | 7.3 (3×) | Change |
|--------|:--------:|:---------------:|:--------:|:------:|
| broad_recall | 0.597-0.722 | 0.722 | **0.927** | ↑ significant |

Cat 11 broad_recall jumped from 0.722 (7.2) to 0.927 (7.3, 3/3 stable). This was not directly targeted. Full attribution matrix ruled out **both** 7.3 flags: broad_recall = 0.927 with `FEATURE_RELATION_PAIR_PRESERVATION=false` (run f9b80070) and with `FEATURE_FORMAT_AWARE_CITATION=false` (run b5f84195). The improvement is an **external factor** — most likely an LLM behavior shift (gpt-4o-mini model update) between the 7.2 and 7.3 run windows. The 0.927 value is perfectly stable across 5 runs (3× baseline + 2× attribution), making it a durable operating point rather than variance.

---

## Deployment Notes

### Circuit Breaker Interaction

During initial audit runs, the circuit breaker tripped. `insufficient_evidence` 503 responses count toward the error rate threshold (20% in 60s window, min 50 requests). Parallel multi-category audit runs with many no-result queries cross this threshold.

**Mitigation:** Disabled `CIRCUIT_BREAKER_ENABLED` during audit runs, re-enabled after validation completed.

### Production State (Post-7.3)

```yaml
# Phase 7.2 (frozen)
ABLATION_PINNED_IDS_POLICY: "profile_scoped"
FEATURE_CITATION_CASCADE: "true"
FEATURE_CITATION_CASCADE_PROFILE: "broad_only"
LLM_CASCADE_MODEL: "gpt-4o-mini"

# Phase 7.3 (new)
FEATURE_FORMAT_AWARE_CITATION: "true"
FEATURE_RELATION_PAIR_PRESERVATION: "true"

# Re-enabled
CIRCUIT_BREAKER_ENABLED: "true"
```

---

## Files Changed (Phase 7.3)

| Milestone | File | Change |
|-----------|------|--------|
| M1 | `Engine/src/services/llm.ts` L160 | Removed `text/plain` from `STRUCTURED_MIMES` |
| M1 | `Engine/src/config.ts` L660 | Added `FEATURE_FORMAT_AWARE_CITATION` flag |
| M2 | `Engine/src/routes/answers.ts` (after L1254) | Relation-pair preservation after topK cutoff |
| M2 | `Engine/src/config.ts` L661 | Added `FEATURE_RELATION_PAIR_PRESERVATION` flag |
| Config | `Engine/docs/config-manifest-6.7.json` | Manifest 6.7 with 2 new flags (NEW) |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-22 | Removed text/plain from STRUCTURED_MIMES | Too broad — catches chat logs and notes, not just structured data. JSON/YAML/CSV are the relevant formats for Cat 2 |
| 2026-03-22 | Enabled FEATURE_FORMAT_AWARE_CITATION | Dormant code from Phase 6.2. M3 experiment proved Cat 2 gap is LLM citation selection. The hint is the surgical fix |
| 2026-03-22 | Relation-pair injection capped at 2 | Prevents unbounded expansion. Only injects docs that survived reranking (quality floor maintained) |
| 2026-03-22 | Circuit breaker disabled during audit runs | insufficient_evidence 503s count toward error rate — trips circuit breaker during audit's many no-result queries. Re-enabled after validation |
| 2026-03-22 | 13/13 × 3 confirmed | Cat 2 citation_recall improved (0.670-0.715), Cat 12 parent_child_recall recovered to 1.000, Cat 11 broad_recall at 0.927. Phase 7.3 success conditions met |
| 2026-03-22 | **7.3 frozen as canonical quality baseline** | External audit review: "publication-grade, production-credible results. The most important thing is not just that 7.3 passed. It is that it passed by making the system more precise and more deterministic, not more complicated." slo-baseline.json bumped to v1.2.0 |
| 2026-03-22 | Cat 2 framed as "substantially better, not fully solved" | External audit: real improvement, proves gap was citation behavior not retrieval. But still LLM-bounded — prompt/control nudge, not fundamental representation change |
| 2026-03-22 | Cat 11 — genuine win, attribution replay recommended | External audit: treat 0.927 recovery as genuine, but avoid inventing causal theory until small attribution replay confirms. Not blocking for baseline freeze |
| 2026-03-22 | M3/lexical shadow stays separate experiment | External audit: 7.2 already marked A/B inconclusive and reverted. 7.3 improved Cat 2 without needing it. Do not fold into baseline |
| 2026-03-22 | Multi-lane / DQP Tier 3 stays parked | External audit: current results point to control-layer and selection-layer gains, not embedding insufficiency. Do not reopen before needed |
| 2026-03-22 | **Cat 11 attribution replay: relation-pair preservation ruled out** | Run f9b80070 with `FEATURE_RELATION_PAIR_PRESERVATION=false`: broad_recall = 0.927 (identical to baseline). The 0.722→0.927 lift is NOT from relation-pair preservation. Likely cause: `FEATURE_FORMAT_AWARE_CITATION` prompt change or LLM variance stabilization |
| 2026-03-22 | **Prompt-as-quality-artifact (second audit review)** | Actioned: (1) prompt hashes pinned in config-manifest-6.7.json, (2) prompt drift check added to release-gate.sh, (3) prompt-spillover regression suite created for Cat 2/10/11 |
| 2026-03-22 | **Full attribution matrix completed** | Run b5f84195 with `FEATURE_FORMAT_AWARE_CITATION=false`: broad_recall = 0.927. **Neither 7.3 flag caused the Cat 11 improvement.** The 0.722→0.927 lift is an external factor (likely LLM behavior shift). Earlier "prompt spillover" hypothesis disproven |
| 2026-03-22 | **Third audit review — two-layer narrative + model drift** | Actioned: (1) 7.3 narrative split into owned engineering delta (Cat 2, Cat 12) and observed environment delta (Cat 11), (2) model/provider drift promoted to first-class release variable with provenance in config manifest, (3) model provenance captured in audit JSON output, (4) model provenance check added to release-gate.sh, (5) model-drift sentinel pack created (Cat 2, 11, 12), (6) Cat 11 reframed as "healthy but externally contingent" |

---

## Cat 11 Attribution Matrix (2026-03-22)

**Goal:** Determine whether the Cat 11 broad_recall improvement (0.722 in 7.2 → 0.927 in 7.3) is caused by either of the two 7.3 flags.

**Method:** Two attribution replays — each disabling one 7.3 flag while keeping everything else at 7.3 production config. Cat 11 isolation audit each time.

**Results:**

| Config | Run ID | broad_recall | within_chunk | cross_chunk | multi_doc_precision |
|--------|--------|:---:|:---:|:---:|:---:|
| 7.2 M0+M1 (3×) | various | 0.722 | 0.975 | 1.0 | 1.0 |
| 7.3 full (3×) | 16554101 etc | **0.927** | 0.975 | 1.0 | 1.0 |
| 7.3 minus relation-pair (1×) | f9b80070 | **0.927** | 0.975 | 1.0 | 1.0 |
| 7.3 minus format-aware citation (1×) | b5f84195 | **0.927** | 0.975 | 1.0 | 1.0 |

**Conclusion:** **Neither 7.3 flag caused the Cat 11 improvement.** broad_recall = 0.927 with both flags individually disabled. The lift from 0.722→0.927 is attributable to an **external factor** — most likely an LLM behavior shift (gpt-4o-mini model update between the 7.2 and 7.3 run windows) or a subtle Engine restart artifact that stabilized at a higher operating point.

**Significance:** This is good news operationally. The 0.927 broad_recall is robust — it persists regardless of which 7.3 flags are active. It also means the format-aware citation prompt does NOT have the "spillover" effect initially hypothesized. The prompt is correctly scoped to its intended purpose (structured-doc citation in Cat 2).

**Causal narrative correction:** Earlier documentation attributed the Cat 11 lift to "likely format-aware citation prompt spillover." This is now disproven. The correct statement is: "Cat 11 broad_recall improved from 0.722 to 0.927 between 7.2 and 7.3, but neither 7.3 flag is the cause. The improvement correlates with the 7.3 deployment window but is independent of the 7.3 code changes."

---

## Open Follow-Ups

| Item | Priority | Blocking? | Description |
|------|----------|:---------:|-------------|
| ~~Cat 11 attribution replay~~ | ~~Medium~~ | ~~No~~ | **COMPLETED (2026-03-22).** Run f9b80070 with `FEATURE_RELATION_PAIR_PRESERVATION=false`: broad_recall = 0.927. **Relation-pair preservation is NOT the cause.** The lift from 0.722→0.927 is attributable to `FEATURE_FORMAT_AWARE_CITATION` or to LLM variance stabilizing at a higher level once the prompt changed. See "Cat 11 Attribution Replay" section below. |
| Cat 2 deeper investigation | Low | No | Cat 2 is improved (0.670-0.715) but still LLM-bounded. Next lever would be context presentation changes or model-level improvements, not retrieval changes. |
| Cat 11 format-aware attribution | Low | No | Confirm whether `FEATURE_FORMAT_AWARE_CITATION=false` drops broad_recall back to 0.722, which would prove the format hint is the causal factor. |
| Cat 12v2 adversarial promotion | Low | No | adversarial_recall=0.818 stable across phases. Promote to `required` when ready. |
| ~~Prompt attribution matrix~~ | ~~Low~~ | ~~No~~ | **COMPLETED (2026-03-22).** Run b5f84195 with `FEATURE_FORMAT_AWARE_CITATION=false`: broad_recall = 0.927. **Neither 7.3 flag is the cause.** The 0.722→0.927 lift is an external factor (likely LLM behavior shift). "Prompt spillover" hypothesis disproven. |
| Prompt-as-quality-artifact tracking | Done | No | Prompt hashes pinned in config-manifest-6.7.json. Prompt drift check added to release-gate.sh. Prompt-spillover regression suite created (Cat 2, 10, 11). |
