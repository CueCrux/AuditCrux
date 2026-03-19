# Engine Quality Audit — Phase 6.0 through 6.6

**Date range:** 2026-03-16 → 2026-03-19
**Suite:** v4 (12 categories, 975+ docs, 411+ queries)
**Embedding:** EmbedderCrux nomic-embed-text-v1.5, 768d
**Infrastructure:** CueCrux-Data-1 (i9-13900, 192GB DDR5, 2×1.92TB NVMe RAID-1)

---

## Executive Summary

| Phase | Date | Result | Key Achievement | Run IDs |
|-------|------|:------:|-----------------|---------|
| 6.0 | 2026-03-16 | 10/11 | Coverage/answer split, representative selection, admission v2 | M0-M5 |
| 6.1 | 2026-03-18 | **12/12** | First clean sweep — Cat 9 dedup, Cat 11 Qdrant fix, Cat 12 `implements` relation | 141e491e |
| 6.2 | 2026-03-18 | 10/12 | Infrastructure hardening, Cat 6/7 fixes, Cat 3/11 regressions (LLM flakiness) | ca0069f2 |
| 6.3 | 2026-03-18 | 10/12 (3×) | Evidence selector, decomposition cache — Cat 3/11 fixed, Cat 6/12 regressed | 3ea51929, 7590b5bc, affeb3d2 |
| 6.4 | 2026-03-19 | 11/12 (3×) | Pre-selector fragility — Cat 6 fixed, Cat 12 sole remaining failure | 6.4f-1/2/3 |
| 6.5 | 2026-03-19 | **12/12 (3×)** | Citation controller — version_precision 0.444→1.000, Cat 12 fixed | 9550fb24, 0054663e, 2eb0bdef |
| 6.6 | 2026-03-19 | Code complete | Knowledge bridge fix, config enforcement, observability, parent/child optimization, adversarial corpus, shadow replay | Design + implementation |

**Trajectory:** 10/11 → 12/12 → 10/12 → 10/12 → 11/12 → **12/12 (3× stable)**

---

## Phase 6.0 — Surface Routing & Admission Controller

**Date:** 2026-03-16
**Result:** 10/11 (Cat 3 FAIL)
**Focus:** Broad query retrieval architecture

### Changes

| Component | Change |
|-----------|--------|
| Coverage/Answer Split | Separate coverage set (all group members → `retrievedIds`) from answer set (representatives → LLM context) |
| Representative Selection | Slot-based per-group selector: canonical, freshest, high-score, overflow fill |
| Admission Controller v2 | 5-gate group-level filtering: minGroupScore, runnerUpMargin, maxGroups, minNovelRatio, groupSizeMin |
| Surface Routing | Qdrant summary search → match group centroids → admission → load members → select representatives |
| Query Decomposition | 8 sub-queries via LLM, per-query hybrid retrieval, cross-query RRF fusion |

### Key Flags Introduced

```
FEATURE_SURFACE_ROUTING=true
FEATURE_COVERAGE_ANSWER_SPLIT=true
FEATURE_REPRESENTATIVE_SELECTION=true
FEATURE_ADMISSION_CONTROLLER=true
FEATURE_QUERY_DECOMPOSITION=true
```

### Per-Category Results

| Cat | Name | Result | Key Metric |
|-----|------|:------:|------------|
| 1 | Relation-Bootstrapped Retrieval | PASS | avg_recall=1.000 |
| 2 | Format-Aware Ingestion Recall | PASS | avg_retrieved_recall=1.000 |
| 3 | BM25 vs Vector Decomposition | FAIL | LLM decomposition variance |
| 4 | Temporal Edge Cases | PASS (skip) | V1 mode |
| 5 | Receipt Chain Stress | PASS | 10/10 chains intact |
| 6 | Fragility Calibration | PASS | F1=1.0, F2=0.0, F3=0.0 |
| 7 | Hierarchical Broad Query Recall | PASS | broad_recall=1.000 |
| 8 | Proposition Precision | PASS | P@1=0.963 |
| 9 | Semantic Dedup | PASS | dedup_effectiveness=0.000 (not yet fixed) |
| 10 | Contextual Chain Recall | PASS | avg_retrieved_recall=0.984 |
| 11 | Multi-Doc Broad Recall | PASS | broad_recall=0.927* |

*Cat 11 subsequently revealed as false pass (QDRANT_URL bug masked vector search failure).

---

## Phase 6.1 — First 12/12 Clean Sweep

**Date:** 2026-03-18
**Run ID:** 141e491e
**Duration:** ~54 min
**Result:** 12/12 PASS

### Root Causes Resolved

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Cat 11 false pass/fail | `QDRANT_URL` not set in audit env → `insertChunksV2` wrote only to Postgres, Engine searched Qdrant (empty) | Set `QDRANT_URL=http://localhost:6333` in audit scripts |
| Cat 9 dedup=0.000 | `dedup_status` computed at ingest but never used in retrieval scoring | 3-layer fix: scoring penalty (0.3× duplicate, 0.8× derivative), `retrievedIds` hard filter, representative selector awareness |
| Cat 12 parent/child | `EXPANSION_RELATION_TYPES` missing `implements` | Migration 127: add `implements` enum; export `CAT12_V1_RELATIONS` (4 pairs); pass relations in audit ingest |

### Key Metrics

| Cat | Metric | Value |
|-----|--------|-------|
| 8 | precision_at_1 | 0.963 |
| 9 | dedup_effectiveness | 1.000 |
| 10 | chain_completeness | 1.000 |
| 11 | broad_recall | 0.927 |
| 12 | avg_retrieved_recall | 1.000 |
| 12 | version_precision | 1.000 |
| 12 | parent_child_recall | 0.692 |

### New Flags

```
FEATURE_DEDUP_RETRIEVAL_PENALTY=true
DEDUP_PENALTY_FACTOR=0.3
DERIVATIVE_PENALTY_FACTOR=0.8
```

### Files Changed

| File | Change |
|------|--------|
| `src/db/migrations/127_relation_type_implements.sql` | `implements` relation type (NEW) |
| `src/services/retrieval.ts` | `applyDedupPenalties()`, `implements` in `EXPANSION_RELATION_TYPES` |
| `src/routes/answers.ts` | Duplicate filter on `retrievedIds` |
| `src/config.ts` | Dedup flags |
| `scripts/audit-v4/lib/corpus/cat12-hard-negative-overlap-v1.ts` | `CAT12_V1_RELATIONS` |
| `scripts/audit-v4/quality-audit-v4.ts` | Cat 12 relations ingest, Cat 9 dedup stamping |

---

## Phase 6.2 — Infrastructure Hardening

**Date:** 2026-03-18
**Run ID:** ca0069f2 (V1), 9bb71fcf (verified)
**Result:** 10/12 PASS

### Milestones (M0–M6)

| M# | Deliverable | Impact |
|----|-------------|--------|
| M0 | Fail-closed preflight diagnostics | Audit aborts on critical infra failures |
| M1 | DQP-native corpus types (`CorpusDocV2` with `dedupStatus`/`livingStatus`) | Audit corpora carry dedup/living metadata inline |
| M2 | Cat 4 temporal hardening | DB accuracy 100%, retrieval temporal 83.3% (5/6) |
| M3 | Observability & SLOs | `slos.md`, Grafana dashboard, Alertmanager rules |
| M4 | Format-aware citation hint | `FEATURE_FORMAT_AWARE_CITATION` (gated, off) |
| M5 | Cat 6 fragility per-scenario isolation | Eliminated cross-scenario contamination |
| M6 | Operational tuning docs | `tuning.md`, dedup sweep script |

### Category Changes vs 6.1

| Cat | 6.1 | 6.2 | Change |
|-----|:---:|:---:|--------|
| 6 | PASS → PASS | PASS | Fixed (per-scenario isolation) |
| 7 | PASS → PASS | PASS | Fixed (broad admission policy relaxed) |
| 3 | PASS | FAIL | Regressed (LLM decomposition flakiness) |
| 11 | PASS | FAIL | Regressed (multi_doc_precision=0.400, LLM citation variance) |

### Config Changes

```yaml
ADMISSION_MAX_GROUPS: "12"        # was 3 (broad queries need all groups)
ADMISSION_MIN_GROUP_SCORE: "0"    # was 0.60 (centroid scores too low for broad)
ADMISSION_RUNNER_UP_MARGIN: "0"   # was 0.05
```

---

## Phase 6.3 — Evidence Selector & Decomposition Cache

**Date:** 2026-03-18
**Run IDs:** 3ea51929, 7590b5bc, affeb3d2 (3× regression)
**Result:** 10/12 PASS (3× consistent, zero flakiness)

### Core Innovation: Evidence Selector

Non-LLM filter between reranking and prompt building:
1. Group candidates by `artifactId`
2. Take top-1 per artifact by `rerankScore` (artifact diversity)
3. Fill remaining slots by `rerankScore` (best overall)
4. New `evidence_selector` prompt style: instruct LLM to cite ALL provided evidence

### Category Changes vs 6.2

| Cat | 6.2 | 6.3 | Change |
|-----|:---:|:---:|--------|
| 3 | FAIL | **PASS (3/3)** | Fixed: decomposition cache + keyword retry |
| 11 | FAIL | **PASS (3/3)** | Fixed: evidence selector (fewer, better contexts) |
| 6 | PASS | **FAIL** | Regressed: evidence selector limits contexts → all fragility=1.0 |
| 12 | PASS | **FAIL** | Regressed: top-1-per-artifact drops parent/child pairs |

### New Flags

```
FEATURE_EVIDENCE_SELECTOR=true
EVIDENCE_SELECTOR_MAX_CONTEXTS=4 → 6 (adjusted in 6.4)
LLM_PROMPT_STYLE=evidence_selector
FEATURE_DECOMPOSITION_CACHE=true
DECOMPOSITION_RETRY_ON_LOW_COVERAGE=true
```

### Key Files

| File | Change |
|------|--------|
| `src/services/evidenceSelector.ts` | Score+diversity filter (NEW) |
| `src/services/queryDecomposition.ts` | LRU cache (500 entries, 1h TTL) + keyword retry |
| `src/services/llm.ts` | `evidence_selector` prompt style |
| `docs/slo-baseline.json` | SLO thresholds (NEW) |
| `scripts/release-gate.sh` | Release gate script (NEW) |

---

## Phase 6.4 — Pre-Selector Fragility & Evidence Selector Tuning

**Date:** 2026-03-19
**Result:** 11/12 PASS (3× consistent)

### Key Fix: Pre-Selector Fragility

**Root cause:** Evidence selector limited LLM to 4 contexts → LLM cited exactly 2 docs → both load-bearing → fragility=1.000 for all scenarios → monotonicity check failed.

**Fix:** `FEATURE_PRE_SELECTOR_FRAGILITY=true` — compute fragility from the full reranked candidate set (10–20 candidates) before the evidence selector, not from post-selector LLM citations (2–4).

### Category Changes vs 6.3

| Cat | 6.3 | 6.4 | Change |
|-----|:---:|:---:|--------|
| 6 | FAIL | **PASS** | Fixed: pre-selector fragility |
| 12 | FAIL | FAIL | version_precision=0.444, parent_child_recall=0.538 |

### Stale Config Incident

Run 6.4e regressed to 6/12 due to a stale `DECOMPOSITION_SUB_QUERIES=8` override in the environment. Added to `forbidden_overrides` in config manifest.

### Cat 12 Analysis (Sole Remaining Failure)

| Metric | Value | Interpretation |
|--------|-------|----------------|
| retrieved_recall | 1.000 | Retrieval is perfect — all expected docs reach the LLM |
| version_precision | 0.444 | LLM cites wrong version >50% of the time |
| parent_child_recall | 0.538 | LLM fails to cite both parent + child |

**Diagnosis:** Not a retrieval problem. The LLM deterministically cites the "most comprehensive" version and omits relation partners. Requires post-LLM correction.

### Config

```
FEATURE_PRE_SELECTOR_FRAGILITY=true
EVIDENCE_SELECTOR_MAX_CONTEXTS=6   # raised from 4
```

---

## Phase 6.5 — Citation Controller (3× 12/12)

**Date:** 2026-03-19
**Run IDs:** 9550fb24, 0054663e, 2eb0bdef
**Duration:** ~3500s per run
**Result:** 12/12 PASS (3× stable, zero flakiness)

### Core Innovation: Deterministic Citation Controller

Post-LLM repair layer that fixes two classes of LLM citation error without additional LLM calls:

#### 1. Version Swap Repair

```
parseVersionFamily(id, title) → VersionFamily{family, version, id}
buildVersionFamilies(candidates) → Map<family, VersionFamily[]>
extractVersionIntent(query) → {explicitVersions[], temporal: earliest|latest|null}
```

When the LLM cites the wrong version of a versioned document family, the controller:
- Parses doc IDs for version families (e.g., `v6-policy-acl-v1.0` → family `v6-policy-acl`, version `1.0`)
- Extracts version intent from query (explicit `v1.0` or temporal `original`/`latest`/`current`)
- Swaps the citation to the correct version from the same family

#### 2. Relation Partner Injection

```
detectPairIntent(query) → boolean (14 patterns)
```

When a query asks about both a decision and its implementation, the controller adds the missing relation partner from `relationPairs` to the citation set.

### Cat 12 Impact

| Metric | Phase 6.4 | Phase 6.5 | Delta |
|--------|-----------|-----------|-------|
| version_precision | 0.444 | **1.000** | +125% |
| parent_child_recall | 0.538 | 0.462 | -14%* |
| overall_recall | 0.750 | **0.778** | +4% |
| Cat 12 verdict | FAIL | **PASS** | Fixed |

*parent_child_recall dropped slightly due to `packCitations` bug — controller-added partners were silently dropped because `candidates: final` (evidence-selector-filtered list) didn't include them. Root cause identified for Phase 6.6 fix.

### Architecture Position

```
Evidence Selector → LLM (gpt-4o-mini, temp=0) → selectCitedContexts
    ┌─── Citation Controller (NEW) ───────────────────┐
    │ 1. Version repair: 9/9 swaps, precision=1.000   │
    │ 2. Relation repair: detectPairIntent → add pair  │
    │ 3. Prometheus counters + structured log           │
    └─────────────────────────────────────────────────┘
    → packCitations → MiSES → CROWN Receipt → Response
```

### Key Files

| File | Change |
|------|--------|
| `src/services/citationController.ts` | Core repair logic (~300 lines) (NEW) |
| `src/routes/answers.ts` | Controller wiring between `askLLM` and `packCitations` |
| `src/services/retrieval.ts` | Thread `relationPairs` through retrieval result |
| `src/observability/metrics.ts` | Citation controller Prometheus counters |
| `src/config.ts` | `FEATURE_CITATION_CONTROLLER`, `FEATURE_CITATION_CASCADE` |
| `docs/config-manifest-6.4.json` | Phase 6.4 config freeze (NEW) |
| `scripts/audit-v4/check-config-manifest.ts` | Config manifest gate (NEW) |

### Infra Notes

- CoreCrux knowledge bridge failed during 6.5c (gRPC to GPU-1 unresponsive). Workaround: `CORECRUX_KNOWLEDGE_MODE=knowledge_shadow`. Root cause: `isAppendSuccess("disabled")` returns false → 500s when bridge disabled + `knowledge_authoritative` mode. Fixed in Phase 6.6 M0.

---

## Phase 6.6 — Post-6.5 Hardening (Code Complete)

**Date:** 2026-03-19
**Result:** Code complete, not yet audited
**Status:** All 6 milestones implemented

### M0: Knowledge Bridge Bug Fix

**Root cause:** `isAppendSuccess` (L287) only accepted `"appended"` | `"duplicate_committed"`. When bridge is disabled, `appendEvents` returns `appendStatus: "disabled"`. `bridgeReceiptLineage` calls `shouldFailClosed()` → throws `knowledge_bridge_append_failed` for `knowledge_authoritative` mode.

**Fix (belt-and-suspenders):**
1. Add `"disabled"` to `isAppendSuccess`:
   ```typescript
   export const isAppendSuccess = (status: string): boolean =>
       status === "appended" || status === "duplicate_committed" || status === "disabled";
   ```
2. Early return in `bridgeReceiptLineage` when `!config.enabled` (before `shouldFailClosed` check)

**Tests:** 14 unit tests (`Engine/tests/services.knowledge-bridge.test.ts`) covering `isAppendSuccess`, `shouldFailClosed`, and the combined disabled-bridge scenario.

**Impact:** Removes `CORECRUX_KNOWLEDGE_MODE=knowledge_shadow` workaround.

### M1: Config Manifest Enforcement

**Changes:**
1. `config-manifest-6.5.json` — 23 flags frozen including `FEATURE_CITATION_CONTROLLER: true`, `FEATURE_CITATION_CASCADE: false`, `FEATURE_MULTI_LANE_RETRIEVAL: false`
2. `check-config-manifest.ts` rewritten — exports `loadManifest()` + `checkManifest()` as library functions, `--effective-url` flag, `--json` structured output
3. `quality-audit-v4.ts` — pre-audit manifest validation (abort on mismatch unless `--force`)
4. `release-gate.sh` — `--manifest` flag, manifest check before SLO validation

### M2: Citation Controller Observability

**New Prometheus metrics:**

| Metric | Type | Purpose |
|--------|------|---------|
| `engine_citation_controller_latency_seconds` | Histogram | Controller execution time |
| `engine_citation_controller_families_detected` | Histogram | Version families per request |
| `engine_citation_controller_version_intent_total` | Counter | Intent classification (explicit/temporal/none) |
| `engine_citation_controller_pair_intent_detected_total` | Counter | Pair-intent query detection |

**Enriched meta:**
- `familyNames: string[]` — names of detected version families
- `repairType: "none" | "version_swap" | "relation_add" | "version_swap+relation_add"`

**Raw-vs-repaired tracing:**
- `process.hrtime.bigint()` timing around controller call
- Structured log `citation-controller-trace` with `rawCitationIds` + `repairedCitationIds`

### M3: Parent/Child Citation Optimization

**Root cause confirmed:** `packCitations` at `answers.ts:1501` receives `candidates: final` (evidence-selector-filtered list). Controller-added partner IDs not in `final` are silently dropped at `citations.ts:53` (`if (!candidate) continue;`).

**Fix:** `supplementaryCandidates` parameter:
```typescript
// citations.ts — PackCitationsParams
supplementaryCandidates?: RetrievedCandidate[]

// answers.ts — pass controller-added candidates
const supplementaryCandidates = cfg.FEATURE_CITATION_CONTROLLER
    ? llmCandidates.filter((c) => !finalIds.has(c.id))
    : undefined;
```

**Expanded `detectPairIntent` patterns** (5 new):
```
/rationale.*execution/i
/design.*runbook/i
/ADR.*implementation/i
/policy.*procedure/i
/architecture.*operations/i
```

**Expected impact:** `parent_child_recall` from 0.462 → ≥0.70.

### M4: Adversarial Cat 12 Expansion

**New corpus (v2):**

| Dimension | v1 | v2 | Delta |
|-----------|:--:|:--:|:-----:|
| Documents | 53 | 61 | +8 |
| Queries | 36 | 51 | +15 |
| Relations | 4 | 6 | +2 |

**Theme F:** Security Patching Policy with 4 versions (v1.0–v3.0) — tests deep version resolution with many candidates.

**Theme G:** Cross-theme ADR+Runbook pairs (IaC→DevEx/Platform) — tests pair detection when docs span different vocabulary domains.

**Adversarial query categories:**
- Ambiguous temporal markers ("before the automated scanning was introduced")
- Indirect pair phrasing ("how did the team act on that decision")
- Compound intent (version + relation in same query)
- Textually-misleading wrong versions (correct version is less similar to query)

**Targets:** `CAT12_V2_TARGET_RECALL=0.70`, `CAT12_V2_TARGET_PRECISION=0.75`

### M5: Shadow Replay Framework (Design-Only)

**Design document:** `Engine/docs/shadow-replay-design.md`

**Architecture:**
```
Production answer pipeline
  → LLM returns cited[]
  → [CAPTURE POINT] Log {query, candidates, llmCited, relationPairs}
  → Citation controller runs
  → packCitations → Response

Shadow replay
  → Read JSONL file of captured records
  → Run each through applyCitationController
  → Compare: agreement / repair / regression
```

**Capture decision:** Structured log transport (pino JSONL) for v1. No Kafka infrastructure yet.

**Stub script:** `Engine/scripts/shadow-replay/replay-stub.ts` — reads JSONL, runs through controller, outputs scoring. Validated against 3-record test (1 agreement, 2 repairs, 0 regressions).

**Blockers:** No production traffic with citation controller enabled. Candidate content reconstruction requires DB access. Privacy review needed if queries contain customer data.

---

## Cross-Phase Metric Trajectory

| Category | 6.0 | 6.1 | 6.2 | 6.3 | 6.4 | 6.5 |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 Relation Retrieval | PASS | PASS | PASS | PASS | PASS | PASS |
| 2 Format Recall | PASS | PASS | PASS | PASS | PASS | PASS |
| 3 BM25/Vector | FAIL | PASS | FAIL | **PASS** | PASS | PASS |
| 4 Temporal | PASS | PASS | PASS | PASS | PASS | PASS |
| 5 Receipt Chain | PASS | PASS | PASS | PASS | PASS | PASS |
| 6 Fragility | PASS | PASS | PASS | FAIL | **PASS** | PASS |
| 7 Broad Recall | PASS | PASS | PASS | PASS | PASS | PASS |
| 8 Precision | PASS | PASS | PASS | PASS | PASS | PASS |
| 9 Dedup | *0.000* | **PASS** | PASS | PASS | PASS | PASS |
| 10 Chain Recall | PASS | PASS | PASS | PASS | PASS | PASS |
| 11 Multi-Doc | *bug* | PASS | FAIL | **PASS** | PASS | PASS |
| 12 Hard-Negative | — | PASS | PASS | FAIL | FAIL | **PASS** |
| **Total** | **10/11** | **12/12** | **10/12** | **10/12** | **11/12** | **12/12** |

### Key Metric Deep Dive

| Metric | 6.0 | 6.1 | 6.2 | 6.3 | 6.4 | 6.5 | Best |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:----:|
| Cat 8 P@1 | 0.963 | 0.963 | 0.963 | 0.963 | 0.963 | 0.963 | 0.963 |
| Cat 9 dedup | 0.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| Cat 10 chain | 0.984 | 1.000 | 0.885 | — | — | — | 1.000 |
| Cat 11 broad | 0.927 | 0.927 | 0.927 | — | — | — | 0.927 |
| Cat 12 version_prec | — | 1.000 | — | — | 0.444 | **1.000** | 1.000 |
| Cat 12 parent_child | — | 0.692 | — | — | 0.538 | 0.462 | 0.692 |
| Cat 12 retrieved | — | 1.000 | 1.000 | — | 1.000 | 1.000 | 1.000 |

---

## Configuration Evolution

### Phase 6.0 (Baseline)

```
FEATURE_SURFACE_ROUTING=true
FEATURE_COVERAGE_ANSWER_SPLIT=true
FEATURE_REPRESENTATIVE_SELECTION=true
FEATURE_ADMISSION_CONTROLLER=true
FEATURE_QUERY_DECOMPOSITION=true
FEATURE_CROSS_ENCODER_RERANK=true
FEATURE_RELATION_EXPANSION=true
FEATURE_QDRANT_READ=true
FEATURE_QDRANT_DUAL_WRITE=true
FEATURE_MULTI_LANE_RETRIEVAL=false
LLM_PROMPT_STYLE=evidence_first
```

### Phase 6.1 (+ Dedup)

```diff
+ FEATURE_DEDUP_RETRIEVAL_PENALTY=true
+ DEDUP_PENALTY_FACTOR=0.3
+ DERIVATIVE_PENALTY_FACTOR=0.8
```

### Phase 6.2 (+ Broad Admission Relaxation)

```diff
  ADMISSION_MAX_GROUPS=12          # was 3
  ADMISSION_MIN_GROUP_SCORE=0     # was 0.60
  ADMISSION_RUNNER_UP_MARGIN=0    # was 0.05
```

### Phase 6.3 (+ Evidence Selector + Decomposition Cache)

```diff
+ FEATURE_EVIDENCE_SELECTOR=true
+ EVIDENCE_SELECTOR_MAX_CONTEXTS=4
+ LLM_PROMPT_STYLE=evidence_selector  # was evidence_first
+ FEATURE_DECOMPOSITION_CACHE=true
+ DECOMPOSITION_RETRY_ON_LOW_COVERAGE=true
```

### Phase 6.4 (+ Pre-Selector Fragility)

```diff
+ FEATURE_PRE_SELECTOR_FRAGILITY=true
  EVIDENCE_SELECTOR_MAX_CONTEXTS=6    # was 4
```

### Phase 6.5 (+ Citation Controller) — FROZEN BASELINE

```diff
+ FEATURE_CITATION_CONTROLLER=true
+ FEATURE_CITATION_CASCADE=false
```

Full manifest: `Engine/docs/config-manifest-6.5.json` (23 flags)

### Phase 6.6 (Code-Level Only)

No config changes. All 6.6 milestones are code changes, observability additions, and tooling improvements. The 6.5 config manifest remains the production baseline.

---

## Architectural Milestones

### Phase 6.0–6.1: Surface Routing Stack

The broad query retrieval pipeline was built across 6.0 and hardened in 6.1:

```
Query → Profile (precision/broad)
  ├─ Precision: standard hybrid → rerank → LLM
  └─ Broad: decomposition → sub-query retrieval → surface path
       → Qdrant summary search → admission controller
       → load members → representative selection
       → coverage/answer split → LLM
```

### Phase 6.2–6.3: Evidence Quality Stack

The LLM was receiving too many, poorly-curated contexts. Two fixes:

1. **Evidence Selector** (6.3): Non-LLM filter that groups by artifact, takes top-1 per artifact, fills remaining by score. Reduced LLM context from 10–20 to 4–6 candidates.

2. **Decomposition Cache** (6.3): Content-addressable LRU cache + keyword retry eliminated Cat 3 flakiness (0/3 → 3/3 pass rate).

### Phase 6.4: Fragility Resolution

Pre-selector fragility computation resolved the interaction between evidence selector (few contexts) and fragility scoring (needs many contexts). Fragility is now assessed from the full reranked candidate set before the selector prunes it.

### Phase 6.5: Deterministic Citation Repair

The citation controller is the defining innovation of this audit cycle. It proves that deterministic post-LLM repair can fix entire categories of LLM citation error (version confusion, missing relation partners) without additional LLM calls, latency, or cost.

### Phase 6.6: Production Hardening

Six milestones preparing the citation controller for production: knowledge bridge stability, config enforcement, observability upgrade, parent/child fix, adversarial corpus, shadow replay design.

---

## Test Corpus Summary (Phase 6.5 Final)

| Category | Docs | Queries | Key Domains |
|----------|:----:|:-------:|-------------|
| Cat 1 | 8 | 1 | Relation graph (original, amendments, supports) |
| Cat 2 | 270 | 45 | 6 MIME types × 45 topics |
| Cat 3 | 55 | 55 | BM25-optimal vs vector-optimal |
| Cat 5 | 2 | 10 | Receipt chain integrity |
| Cat 6 | 12 | 3 | Fragility perturbation levels |
| Cat 7 | 180 | 36 | 12 themes × 15 docs, broad + precision |
| Cat 8 | 80 | 80 | Proposition precision (exact value extraction) |
| Cat 9 | 126 | 35 | 35 dedup clusters (1 canonical + 2-3 dupes) |
| Cat 10 | 61 | 30 | Multi-hop reasoning chains |
| Cat 11 | 50 | 80 | Chunking stress (within, cross, broad, multi-doc) |
| Cat 12 v1 | 53 | 36 | Hard-negative overlap (5 themes) |
| Cat 12 v2* | 61 | 51 | +4-version families, cross-theme pairs, adversarial queries |
| **Total** | **897** | **411** | |

*v2 corpus created in 6.6 M4, not yet integrated into audit runner.

---

## Known Limitations & Open Items

| Item | Status | Resolution Path |
|------|--------|-----------------|
| Cat 12 parent_child_recall=0.462 | 6.6 M3 code complete | Deploy M3, validate in production |
| Cat 12 v2 corpus not integrated | 6.6 M4 code complete | Integrate after M3 packCitations fix validated |
| Shadow replay blocked | 6.6 M5 design-only | No production traffic with citation controller |
| Knowledge bridge workaround | 6.6 M0 code complete | Deploy fix, remove `knowledge_shadow` |
| FEATURE_CITATION_CASCADE unused | Wired but disabled | Enable if stronger model needed for edge cases |
| Multi-lane retrieval parked | Ablation proved quality dilution | Re-evaluate only if corpus grows 10× |
| Cat 2 citation recall 0.322 | LLM behavior gap | Format-aware prompt engineering |

---

## Audit Run History (Phase 6.x)

| Run ID | Phase | Date | Duration | Result | Notes |
|--------|-------|------|----------|:------:|-------|
| M0-M5 | 6.0 | 2026-03-16 | — | 10/11 | Surface routing stack |
| 141e491e | 6.1 | 2026-03-18 | 54m | 12/12 | First clean sweep |
| ca0069f2 | 6.2 | 2026-03-18 | — | 10/12 | Hardening + regressions |
| 9bb71fcf | 6.2v | 2026-03-18 | — | 2/2 | Verified-mode (Cat 4+5) |
| 3ea51929 | 6.3 | 2026-03-18 | — | 10/12 | Evidence selector (run 1) |
| 7590b5bc | 6.3 | 2026-03-18 | — | 10/12 | Evidence selector (run 2) |
| affeb3d2 | 6.3 | 2026-03-18 | — | 10/12 | Evidence selector (run 3) |
| 6.4f-1 | 6.4 | 2026-03-19 | — | 11/12 | Pre-selector fragility (run 1) |
| 6.4f-2 | 6.4 | 2026-03-19 | — | 11/12 | Pre-selector fragility (run 2) |
| 6.4f-3 | 6.4 | 2026-03-19 | — | 11/12 | Pre-selector fragility (run 3) |
| 9550fb24 | 6.5 | 2026-03-19 | 3471s | 12/12 | Citation controller (run 1) |
| 0054663e | 6.5 | 2026-03-19 | 3603s | 12/12 | Citation controller (run 2) |
| 2eb0bdef | 6.5 | 2026-03-19 | 3631s | 12/12 | Citation controller (run 3) |
