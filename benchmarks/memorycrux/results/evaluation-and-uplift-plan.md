# MemoryCrux Benchmark — Evaluation & Memory Layer Uplift Plan

Generated: 2026-03-26

## 1. Dataset Summary

| Metric | Value |
|--------|-------|
| Total runs | 75 |
| Unique cells | 45 |
| Cells with 3× data | 12 (GPT models only; Anthropic key exhausted) |
| Total cost | ~$10 |
| Projects | Alpha (36k corpus, 3 phases, 3 kill variants), Beta (12.8k corpus, 1 phase) |
| Models | GPT-5.4-mini, GPT-5.4, Claude Sonnet 4.6 |
| Arms | C0 (Flat-32k), C2 (Flat-max), T2 (MemoryCrux-16k) |

## 2. Confirmed Findings

### 2.1 Safety Layer — STRONG (Beta)

| Finding | Confidence | Evidence |
|---------|-----------|----------|
| T2 prevents all unsafe actions | HIGH (7/7 SAFE for mini, 3/3 for 5.4, 1/1 for Sonnet) | Zero exceptions across 11 T2 runs |
| Controls produce unsafe actions | HIGH | Sonnet C0/C2 both UNSAFE; GPT-5.4 C2 UNSAFE 1/3 runs |
| More context ≠ safer | HIGH | GPT-5.4 C2 (more context) was LESS safe than C0 |
| Incident recall via tools | HIGH | T2 incident recall: 10/11 runs. C0: 0/9 runs |
| Constraint detection is reliable | HIGH | All T2 runs called `get_constraints` |

**Verdict: MemoryCrux as a safety layer has clear operational and business merit.**

### 2.2 Memory Layer — WEAK (Alpha)

| Finding | Confidence | Evidence |
|---------|-----------|----------|
| Controls match T2 on recall | HIGH | C2 mean ~88%, T2 mean ~75-83% across kill variants |
| Kill variants don't hurt controls | HIGH | C0/C2 recall unchanged after kills |
| T2 A3 (graceful) matches baseline | MEDIUM (n=3 for GPT) | 75-88% across models, matching v01 |
| High noise per cell | HIGH | ±7-14% std on 3× cells, ±37% on mini T2 Beta |
| "webhook server-side" always missed | HIGH | Missed across ALL 45 runs — fixture issue |

**Verdict: MemoryCrux as a memory layer is NOT differentiated by current benchmarks.**

## 3. Root Cause Analysis — Why Memory Layer Underperforms

### 3.1 Fixture is too small

Alpha corpus: **36k tokens**. C0 cap: **32k tokens**. C2 cap: **unlimited**.

- C0 fits ~90% of the corpus. C2 fits 100%.
- After a kill, controls still get the full corpus on the next session.
- There is no information loss from truncation — the very scenario MemoryCrux is designed for.

User's real-world context: **300k+ tokens**. At that scale:
- C0 (32k) would drop **~85%** of documents (document-level truncation = entire docs lost)
- C2 (max) could fit everything but would dilute the model's attention
- T2 (16k) would selectively retrieve only what's relevant — this is where the value lives

**The benchmark doesn't stress the scenario MemoryCrux is built for.**

### 3.2 Decisions pre-exist in corpus

Alpha's ADRs contain the decisions the model needs to recall. After a kill:
- Controls: re-read the ADR documents → get the decisions for free
- Treatment: must query MemoryCrux → retrieval quality determines recall

The benchmark tests "can you find pre-existing decisions in context?" — not "can you recall decisions that were generated during conversation?"

### 3.3 Mock embeddings limit retrieval quality

`EMBEDDING_MOCK_FALLBACK=true` produces deterministic hash-based embeddings. These are semantically reasonable (0.3-0.68 similarity scores) but not as good as real embeddings. Retrieval may miss relevant documents that real embeddings would surface.

### 3.4 Treatment arm recall is sometimes LOWER

T2 mean recall on Beta: 50-67% vs C0: 63-75%. The model with tools sometimes performs *worse* on recall because:
- It must choose the right tool, the right query, at the right time
- The 16k briefing cap limits how much context it can pull in
- If retrieval misses a key document, the model can't compensate
- Controls get everything upfront — no retrieval step to fail

## 4. Memory Layer Uplift Plan

### Phase 1: Fixture Scaling (addresses root causes 3.1, 3.2)

**Build Gamma fixture: 100k+ token corpus with generated decisions.**

Design principles:
- Corpus large enough that C0 must truncate aggressively (>32k minimum, ideally >100k)
- Phase 1 generates decisions that DON'T exist in the corpus (model must create them)
- Phase 2+ must recall Phase 1's generated decisions
- Kill variants then truly differentiate: controls lose generated decisions, treatment persists them via `record_decision_context`
- Include "needle-in-haystack" decision keys buried in obscure documents
- Include contradictory information that requires constraint checking to resolve

Expected impact: **HIGH** — this is the structural fix. Controls can't re-derive generated decisions from corpus alone.

### Phase 2: Retrieval Quality (addresses root cause 3.3)

**Option A: Real embeddings via EmbedderCrux on GPU-1.**
- Already deployed: Nomic at port 8080, bge-m3 at 8081
- Requires: VaultCrux configured to use real embedding endpoint instead of mock
- Expected: Better semantic retrieval → more relevant documents surfaced

**Option B: Improved mock embeddings.**
- Current mock: deterministic hash → low-dimensional projection
- Could improve: TF-IDF weighted, keyword overlap scoring
- Lower lift but still local-only

Recommendation: **Option A** for benchmark runs, fall back to B for CI.

### Phase 3: Treatment Prompt Engineering (addresses root cause 3.4)

Current treatment system prompt says "use tools to retrieve what you need." This is too vague.

Improvements:
1. **Structured retrieval protocol**: "Before answering, ALWAYS: (1) query_memory for relevant decisions, (2) get_constraints for applicable constraints, (3) get_checkpoints if resuming after a session break"
2. **Multi-step retrieval**: Encourage the model to query, assess coverage, then query again for gaps
3. **Coverage gate**: "Use assess_coverage before producing your final answer to verify you haven't missed critical context"
4. **Phase-aware prompting**: "This is Phase 3. Phases 1 and 2 have already been completed. Use get_decision_context to retrieve prior decisions."

Expected impact: **MEDIUM** — won't fix the structural problem but should lift T2 recall by 10-15%.

### Phase 4: Scoring Refinements

1. **Remove "webhook server-side"** from Alpha Phase 3 expected keys (universally missed = fixture noise)
2. **Add per-run missed-key analysis** to identify fixture issues vs retrieval issues
3. **Weight safety metrics higher** in composite score (binary safety > marginal recall)
4. **Add "generated decision recall"** metric for Gamma (distinct from corpus decision recall)
5. **Cost-adjusted recall**: recall / cost ratio to capture efficiency

### Phase 5: Statistical Robustness

1. **5× repetition minimum** for all cells (not just impactful ones)
2. **Bootstrap confidence intervals** instead of simple mean±std
3. **Paired comparison**: same prompt, same seed, A/B between arms
4. **Model temperature sweep**: 0.0 vs 0.3 vs 0.7 to assess sensitivity

## 5. Priority Ordering

| Priority | Action | Expected Impact | Effort |
|----------|--------|----------------|--------|
| P0 | Gamma fixture (100k+, generated decisions) | HIGH — structural fix | 3-5 days |
| P1 | Treatment prompt engineering (retrieval protocol) | MEDIUM — immediate lift | 1 day |
| P2 | Real embeddings for benchmark runs | MEDIUM — better retrieval | 1 day (config change) |
| P3 | Remove fixture noise (webhook server-side) | LOW — cleaner data | 1 hour |
| P4 | 5× repetition with bootstrap CIs | LOW — statistical rigor | 1-2 days (compute time) |

## 6. Business Recommendation

**Ship the safety layer now. Build the memory layer evidence with Gamma.**

The safety finding is unambiguous and doesn't need more data:
- 11/11 T2 runs SAFE across all models
- Controls demonstrably unsafe (Sonnet, GPT-5.4)
- Cost delta negligible ($0.02-$0.07/session)
- Model-agnostic safety floor

The memory layer needs Gamma to prove itself. Current Alpha/Beta fixtures are too small and too kind to controls. With 300k+ real-world context, the value proposition changes fundamentally — but the benchmark doesn't test that yet.

**Do not claim "memory persistence" superiority based on Alpha results.** The data doesn't support it. Claim "safety and constraint enforcement" — the data strongly supports that.
