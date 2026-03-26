# MemoryCrux Benchmark — Evaluation & Memory Layer Uplift Plan

Generated: 2026-03-26
Updated: 2026-03-26 (v2 — cross-referenced against CoreCrux/VaultCrux capabilities, revised priorities, metric standard)

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

User's real-world context: **3.7M tokens** (knowledge artifacts) + **16M tokens** (source code). At that scale:
- C0 (32k) would drop **>99%** of documents
- C2 (max, 1M) would fit ~27% of knowledge artifacts but miss source code entirely
- T2 (16k) would selectively retrieve only what's relevant — this is where the value lives

**The benchmark doesn't stress the scenario MemoryCrux is built for. The gap is 100x larger than modelled.**

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

### 3.5 Wrong comparison (NEW — v2)

The benchmark compares MemoryCrux against **flat-context injection**. But the real alternative is **file-based memory + code search tools** — which is how Claude Code agents actually work today. The agent already has Glob, Grep, Read, and Agent tools for on-demand retrieval against live files. The benchmark does not test whether MemoryCrux improves on this.

### 3.6 Available tools not exercised (NEW — v2)

Cross-referencing against VaultCrux's 32 MCP tools and CoreCrux's decision plane reveals that the benchmark only exercises 4 of 32 tools:

| Tool Category | Available | Benchmarked | Gap |
|---|---|---|---|
| Query & Retrieval | 7 tools | 1 (query_memory) | check_claim, get_freshness_report, get_contradictions untested |
| Decision Plane | 7 tools | 1 (checkpoint_decision_state, partial) | get_causal_chain, reconstruct_knowledge_state, get_decisions_on_stale_context untested |
| Safety & Governance | 8 tools | 2 (get_constraints, check_constraints) | verify_before_acting (composite gate) untested |
| Reasoning Support | 10 tools | 0 | assess_coverage, get_relevant_context, escalate_with_context all untested |

The strongest tools for session effectiveness — `get_relevant_context` (task-scoped briefing), `assess_coverage` (gap detection), `get_causal_chain` (decision reasoning) — have never been benchmarked.

### 3.7 Wrong metrics (NEW — v2)

The benchmark measures **keyword recall** (did the agent mention "RS256"?). It does not measure:

| Missing Metric | Why It Matters |
|---|---|
| **Orient time** (T_orient) | How many seconds/turns before the agent is productive. The real cost of poor memory is cold-boot waste. |
| **User corrections** (N_corrections) | How often the user must re-state known context. This is the lived experience of memory failure. |
| **Context precision** (P_context) | Of the tokens loaded, how many were relevant? Flat context loads everything; tool-mediated loads selectively. |
| **Decision preservation** (K_decision) | After a kill, can the agent act on prior decisions — not just recite keywords? |
| **Causal chain integrity** (K_causal) | Can the agent explain *why* a decision was made, not just *what* was decided? |
| **Time compression** (V_time) | How much human time did the agent replace, quality-adjusted? |

See [METRICS.md](../../../METRICS.md) for the full metric standard (v1.0).

## 4. Available Capabilities Not Yet Leveraged

### 4.1 VaultCrux — Untested Tools That Address Root Causes

| Tool | What It Does | Root Cause It Addresses |
|---|---|---|
| `get_relevant_context` | Task-scoped, risk-ranked briefing within token budget. Constraints and alerts rank above general knowledge. | 3.5 — replaces static MEMORY.md with dynamic, task-aware context |
| `assess_coverage` | Knowledge gap analysis: what the system knows/doesn't know for a given task. | 3.7 — enables the agent to detect its own ignorance before acting |
| `get_freshness_report` | Staleness metrics across all topics. | 3.7 — prevents acting on outdated information |
| `check_claim` | Validates a statement against memory records with supporting/contradicting evidence. | 3.2 — fact-checks generated decisions against corpus |
| `get_contradictions` | Cross-source contradiction detection. | New — surfaces conflicting information the agent should resolve |
| `verify_before_acting` | Composite safety gate: Shield + constraints + alerts + pressure + freshness. | 3.4 — multi-layer pre-action validation beyond just constraint checking |
| `escalate_with_context` | Packages uncertainty with full reasoning state for human review. | 3.7 — structured handoff when the agent is uncertain |

### 4.2 CoreCrux — Decision Plane Capabilities

| Capability | What It Does | What It Enables |
|---|---|---|
| `get_causal_chain` | DAG of receipts → cursors → decisions → actions → artifacts. | Reconstructing *why* a decision was made, not just *what* was decided. |
| `reconstruct_knowledge_state` | Time-travel: what was known at decision time, including superseded artifacts. | Answering "was this decision informed by X?" without guessing from timestamps. |
| `get_decisions_on_stale_context` | Flags decisions made on outdated memory. | Identifying risky decisions that should be re-evaluated. |
| `get_correction_chain` | How a decision was revised/superseded over time. | Understanding decision evolution without reading git log. |
| `graph_expand` (v4.2 query) | Multi-hop BFS over artifact relations with confidence scoring. | "What depends on this decision?" — impact analysis before changing anything. |
| `time_range` (v4.2 query) | Temporal slice queries over artifacts. | "What changed since my last session?" — delta briefing. |

### 4.3 PlanCrux — Feature Registry

| Capability | What It Enables |
|---|---|
| Gap analysis (`/capabilities/analysis/gaps`) | Before starting work, know what's untested/unaudited in the area you're changing. |
| Dependency tree (`/capabilities/:id/tree`) | Before changing capability X, know what depends on it. |

## 5. Revised Priority Ordering

Priorities revised to reflect: (a) what the real working context looks like (3.7M tokens, not 36K), (b) what tools already exist but aren't wired in, (c) what metrics actually capture agent effectiveness.

| Priority | Action | Root Cause | Expected Impact | Effort | New Metrics Enabled |
|---|---|---|---|---|---|
| **P0** | **Adopt metric standard ([METRICS.md](../METRICS.md))** | 3.7 | Foundation for all subsequent measurement | 2 days (instrument harness) | All 16 fundamentals + 7 derived + Cx composite |
| **P1** | **Add C3 arm: file-based memory + code search** | 3.5 | Tests the *real alternative* (Glob/Grep/Read), not just flat context | 2 days | Same metrics, new comparison baseline |
| **P2** | **Wire `get_relevant_context` into T2 session boot** | 3.5, 3.7 | Task-scoped briefing replaces static context. Directly measurable via T_orient and P_context. | 1 day | T_orient, P_context |
| **P3** | **Wire `assess_coverage` + `get_freshness_report` into T2 pre-action** | 3.7 | Agent knows what it doesn't know. Measurable via A_coverage and S_stale. | 1 day | A_coverage, S_stale |
| **P4** | **Wire `checkpoint_decision_state` into T2 session end** | 3.2 | Benchmark proved A3 works (88% match). Auto-checkpoint on session end. | 1 day | K_decision, K_checkpoint |
| **P5** | **Wire `get_causal_chain` + `record_decision_context` into T2** | 3.2, 3.6 | Decision graph instead of flat list. Measurable via K_causal. | 2 days | K_causal |
| **P6** | **Gamma fixture (100K+ corpus, generated decisions)** | 3.1, 3.2 | Structural fix. Forces real truncation. Tests generated decision persistence. | 3-5 days | All metrics at realistic scale |
| **P7** | **Real embeddings via EmbedderCrux** | 3.3 | Better retrieval quality. Already deployed (Nomic 8080, bge-m3 8081). | 1 day (config) | R_decision improvement |
| **P8** | **Treatment prompt engineering** | 3.4 | Structured retrieval protocol. Lower priority now that tools are being wired properly. | 1 day | Q_info improvement |
| **P9** | **Remove fixture noise ("webhook server-side")** | N/A | Cleaner data. | 1 hour | Noise reduction |
| **P10** | **5× repetition with bootstrap CIs** | N/A | Statistical rigor. | 1-2 days (compute) | Confidence intervals |
| **P11** | **Ship constraint enforcement to production** | N/A | Already proven. 11/11 SAFE. | Deployment task | S_gate, S_detect in production |

## 6. What Changed from v1

| v1 Recommendation | v2 Change | Why |
|---|---|---|
| P0: Gamma fixture | → P6 | Need metrics and arms right before building a new fixture |
| P1: Prompt engineering | → P8 | Lower priority — tool wiring matters more than prompt phrasing |
| P2: Real embeddings | → P7 | Still valuable but not the primary blocker |
| Not in v1: Metric standard | → P0 | Can't improve what you can't measure. Time and context precision were unmeasured. |
| Not in v1: C3 arm (file-based) | → P1 | The real comparison. Flat context is a strawman — nobody uses it. |
| Not in v1: Tool wiring (P2-P5) | → P2-P5 | 28 of 32 tools are untested. The strongest tools for effectiveness are unwired. |
| Not in v1: Ship safety to prod | → P11 | Was implicit in "ship the safety layer now" — made explicit with deployment priority. |

## 7. Business Recommendation (Updated)

### Ship now (proven)
- **Constraint enforcement in production agent workflows.** 11/11 SAFE. Model-agnostic. $0.02-$0.07 overhead. No further evidence needed.

### Measure next (prerequisite for everything else)
- **Adopt the Crux Score (Effective Minutes).** Without time-based measurement, every improvement is "recall went from 75% to 83%" — which is noise-level and unpersuasive. With Cx, an improvement is "the agent saved 23 effective minutes vs 14" — which is concrete and defensible.

### Build evidence (memory layer)
- **Wire the tools that already exist.** VaultCrux has 32 MCP tools. CoreCrux has a decision plane with causal chains. The benchmark uses 4 tools. Before building Gamma, wire `get_relevant_context`, `assess_coverage`, `checkpoint_decision_state`, and `get_causal_chain` into the treatment arm and measure the difference.
- **Test the real alternative.** Add a C3 arm that uses file-based memory + Glob/Grep/Read. This is what agents actually do today. If T2 can't beat C3, the memory layer has a product problem, not a benchmark problem.

### Do not claim (yet)
- "Memory persistence superiority" — still unproven at realistic scale.
- "Better recall than flat context" — T2 recall is equal or worse on current fixtures.
- "Decision continuity across sessions" — Alpha is structurally kind to controls; need Gamma with generated decisions.
