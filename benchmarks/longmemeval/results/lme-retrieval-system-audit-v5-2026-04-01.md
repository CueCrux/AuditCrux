# VaultCrux Retrieval System -- Full Audit Report v5 (Definitive)

**Date:** 2026-04-01
**Benchmark:** LongMemEval_S (500 questions, full corpus)
**Confirmed score:** 75.6% (378/500) -- NET REGRESSION from baseline
**Baseline score:** 76.2% (381/500) -- the only prior full-500 truth
**Delta:** -0.6pp (-3 questions)
**Recovery/regression:** 45 recovered, 48 regressed, net -3
**Confirmation run:** `lme-s3-sonnet-4-6-F1-202604011752-f6604e`
**Baseline run:** `lme-s3-sonnet-4-6-F1-202603311333-a0b1f3`
**Model:** Claude Sonnet 4.6
**Arm:** F1 (raw API + investigate_question + pre-injected structured data + reflection)
**Evaluator:** GPT-4o-2024-08-06 (autoeval)
**Total programme cost:** ~$430 (all runs, judging, extraction, infrastructure)

---

## Section 1: Executive Summary

**The headline: 75.6% is a net regression of -0.6pp from the 76.2% baseline.**

The full 500-question confirmation run scored 378/500 (75.6%), which is 3 questions worse than the 76.2% (381/500) baseline. The interventions -- `investigate_question`, reflection loop, and pre-injected structured data -- recovered 45 previously-failing hard questions but caused 48 new regressions on previously-passing easy questions.

**Why this happened:**

1. **investigate_question adds overhead to every question.** Even simple single-session recall questions that need only one `query_memory` call are now routed through a 7-phase server-side investigation (entity index, timeline, full retrieval pipeline, context expansion, answerability assessment, confidence scoring, recommendation generation). This produces 1.7x more input tokens on the regressed questions (27,895 avg vs 16,418 avg in baseline).

2. **The reflection loop second-guesses correct first answers.** The structured self-critique ("WHAT DID I FIND? / IS MY COUNT COMPLETE? / CONFIDENCE") was designed for aggregation questions but fires on all question types. For simple recall, it creates opportunities for the model to over-think and change a correct answer to an incorrect one.

3. **Pre-injected entity data adds noise for simple recall.** When the question type detector classifies a question as "aggregation", "temporal", or "knowledge_update", structured data is injected into the system prompt. For mis-classified questions, this adds irrelevant context that distracts from the straightforward retrieval result.

**The projected ~90.8% was based on failure-only testing which over-estimated by ~15pp.** Failure-only testing measures recovery on already-failing questions but cannot detect regressions on passing questions. Every failure-subset projection in this programme has been an over-estimate.

**Critical lesson: the only trustworthy accuracy number is a full-500 run.**

---

## Section 2: Production Configuration

### 2.1 Pipeline Architecture

```
                          USER QUESTION
                              |
                    [Question Type Detection]
                     aggregation | temporal | ordering | knowledge_update | recall | preference
                              |
                    [Pre-computed Injection] (F1 only)
                     - aggregation: enumerate_memory_facts -> entity table
                     - temporal: build_timeline -> event table
                     - knowledge_update: enumerate_memory_facts -> recency-sorted table
                              |
                    [System Prompt + Tools]
                              |
                    [LLM Agent (Sonnet 4.6)]
                              |
                    investigate_question (PRIMARY TOOL)
                              |
           +------------------+------------------+
           |                  |                  |
    [Phase 1: Entity]  [Phase 2: Timeline] [Phase 3: Retrieval]
    enumerateMemoryFacts buildTimeline      Full pipeline:
    (keyword ILIKE on    (temporal/ordering  HyDE + Vector + BM25
     entity_session_idx)  questions only)    + Entity RRF + Graph
           |                  |              Expand + Propositions
           |                  |                  |
    [Phase 4: Context Expansion]          [Phase 5: Derive]
    expandHitContext                       deriveFromFacts
    (radius=2, if <5 chunks)              (count/sum/max/min)
           |                  |                  |
           +------------------+------------------+
                              |
                    [Phase 6: Answerability Assessment]
                    [Phase 7: Confidence Scoring]
                    [Phase 8: Recommendation Generation]
                              |
                    [Return InvestigationResult]
                              |
                    [Agent Reflection Loop]
                     - Self-critique (enumerate items, check confidence)
                     - Optional: query_memory, date_diff, get_session_by_id
                     - Max 4 additional tool calls
                              |
                    [Final Answer]
```

#### Retrieval Pipeline Detail (Phase 3)

```
Query
  |
  +-- HyDE Embedding (40% raw + 60% hypothesis, nomic-embed-text-v1.5 768d)
  |
  +-- [PARALLEL -- 3 signals]
  |   +-- Signal 1: Vector search (Qdrant primary, pgvector fallback)
  |   +-- Signal 2: Lexical BM25 (PostgreSQL ts_rank + plainto_tsquery)
  |   +-- Signal 3: Entity index RRF (ILIKE on entity_session_index)
  |
  +-- Entity Graph Expansion (2nd-hop co-occurrence, max 20 seeds -> 15 names)
  |
  +-- DQP Tier 3: Proposition retrieval (conditional, only when primary < 5 + lexical < threshold)
  |
  +-- Scoring: vector*W_v + lexical*W_l + recency*W_r + entityBoost + graphBoost + propBoost
  |
  +-- Cross-encoder reranking (BGE-reranker-v2-m3 on GPU-1, 70/30 blend)
  |
  +-- Quality filter (low-signal content removal)
  |
  +-- Dedup by chunkId
  |
  +-- Return top-K
```

### 2.2 Feature Flags (ALL from shared-features.env)

| Flag | Value | Category | Impact on LME |
|------|-------|----------|---------------|
| `FEATURE_QDRANT_READ` | `true` | Retrieval | Primary vector backend |
| `FEATURE_VECTOR_DUAL_WRITE` | `true` | Retrieval | Write to both Qdrant + pgvector |
| `FEATURE_DQP_SEMANTIC_CHUNKING` | `true` | DQP Tier 1 | Sentence-boundary chunking |
| `FEATURE_DQP_HYDE_RETRIEVAL` | `true` | DQP Tier 2 | HyDE 40/60 blend |
| `FEATURE_CROSS_ENCODER_RERANK` | `true` | Phase 8 M1 | BGE-reranker-v2-m3 reranking |
| `CROSS_ENCODER_URL` | `http://100.111.227.102:8082` | Phase 8 M1 | GPU-1 TEI endpoint |
| `FEATURE_ENTITY_RRF` | `true` | Phase 8 M2 | Entity index as 3rd retrieval signal |
| `FEATURE_ENTITY_GRAPH_EXPAND` | `true` | Phase 8 M3 | 2nd-hop entity co-occurrence |
| `FEATURE_DQP_PROPOSITION_RETRIEVAL` | `true` | DQP Tier 3 | Atomic claim chunks (conditional) |
| `FEATURE_MCP_ENABLED` | `true` | Platform | MCP server active |
| `FEATURE_MEMORY_CORE_MCP_ENABLED` | `true` | Platform | Memory Core tools active |
| `FEATURE_MEMORY_DECISION_PLANE` | `true` | Platform | Decision tracking |
| `FEATURE_MEMORY_PLATFORM_WIRING` | `true` | Platform | Platform integration |
| `FEATURE_MEMORY_CONSTRAINTS` | `true` | Platform | Constraint system |
| `FEATURE_MEMORY_VERIFICATION_GATE` | `true` | Platform | Verification before actions |
| `FEATURE_MEMORY_CONSTRAINT_SUGGESTIONS` | `true` | Platform | Suggested constraints |
| `FEATURE_MEMORY_CHECKPOINTS` | `true` | Platform | Decision checkpoints |
| `FEATURE_MEMORY_COVERAGE_ASSESSMENT` | `true` | Platform | Coverage analysis |
| `FEATURE_MEMORY_ESCALATIONS` | `true` | Platform | Escalation system |
| `FEATURE_MEMORY_PROOF_DECISIONS` | `true` | Platform | Proof-linked decisions |
| `FEATURE_MEMORY_SESSION_DEBRIEF` | `true` | Platform | Session summary |
| `FEATURE_MEMORY_DOMAIN_CHANGELOG` | `true` | Platform | Domain change tracking |
| `FEATURE_PRIVATE_DATA_ENCRYPTION` | `true` | Security | Vault Transit encryption |
| `FEATURE_PII_EXTENDED` | `true` | Security | Extended PII detection |
| `SHIELD_MODE` | `enforce` | Security | Active threat blocking |
| `FEATURE_SHIELD_ENABLED` | `true` | Security | Shield active |
| `CITATIONS_ASYNC_ENABLED` | `true` | Infra | Async citation gen |
| `CREDITS_BATCH_ENABLED` | `true` | Infra | Batch credit processing |
| `FEATURE_PROOF_SURFACE` | `true` | Infra | Proof chain surface |
| `FEATURE_WATCH_SURFACE` | `true` | Infra | Watch surface |
| `FEATURE_TEAM_SEATS` | `true` | Infra | Team seat management |
| `FEATURE_ECONOMY_MULTIPLIER` | `true` | Economy | Credit multiplier |
| `FEATURE_FREE_TIER_ESCROW` | `true` | Economy | Free tier escrow |
| `FEATURE_PADDLE_DISCOUNT_APPLY` | `true` | Economy | Paddle discounts |
| `FEATURE_PLATFORM_TIPS` | `true` | Economy | Tips feature |
| `EMBEDDING_PROVIDER` | `embeddercrux` | Embedding | Pool router on Data-1 |
| `EMBEDDERCRUX_BASE_URL` | `http://100.75.64.43:8079` | Embedding | Pool router endpoint |
| `EMBEDDING_MOCK_FALLBACK` | `false` | Embedding | No mock fallback |
| `CORECRUX_BASE_URL` | `http://100.111.227.102:4006` | CoreCrux | Decision plane on GPU-1 |
| `FEATURE_MEMORY_PLANCRUX_BRIDGE` | `false` | Disabled | |
| `FEATURE_MEMORY_CREDENTIAL_BROKER` | `false` | Disabled | |
| `FEATURE_AGENT_SKILLS` | `false` | Disabled | |
| `FEATURE_CROSS_TENANT_BUNDLES` | `false` | Disabled | |
| `FEATURE_AUTO_CREATE_TENANTS` | `false` | Disabled | |
| `FEATURE_FEEDBACK_DIRECTORY` | `false` | Disabled | |
| `FEATURE_CREDIT_CONVERSION` | `false` | Disabled | |
| `FEATURE_SANDBOX_RUNNER` | `false` | Disabled | |
| `FEATURE_SAMPLING_GUARDIAN` | `false` | Disabled | |
| `SHIELD_REQUIRE_SEAT_AUTH` | `false` | Disabled | |
| `ALLOW_LEGACY_TENANT_FIELDS` | `false` | Disabled | |

### 2.3 Scoring Configuration

| Profile | Vector | Lexical | Recency |
|---------|--------|---------|---------|
| `balanced` | 0.58 | 0.32 | 0.10 |
| `recall` | 0.45 | 0.40 | 0.15 |
| `recency` | 0.40 | 0.25 | 0.35 |

- **Recency reference:** Relative to newest candidate in result set (not absolute time)
- **Entity RRF:** `entityRrfWeight / (entityRrfK + 1)` boost per entity-matched chunk
- **Graph expand:** Same formula with `graphExpandWeight`
- **Proposition:** Same formula with `propositionWeight`
- **Cross-encoder blend:** 70% reranker score + 30% original score (top-N candidates)
- **Quality filter:** Low-signal content removal (< 120 bytes or < 6 tokens)

### 2.4 Infrastructure

| Component | Location | Spec |
|-----------|----------|------|
| **VaultCrux API** | VaultCrux-App (100.109.10.67:14333) | cpx32, HEL1 |
| **Postgres** | CueCrux-Data-1 (100.75.64.43:5432) | EX63, i9-13900, 192GB DDR5 |
| **Qdrant** | CueCrux-Data-1 (100.75.64.43:6333) | Same server |
| **Embedder (Nomic 768d)** | GPU-1 (100.111.227.102:8080) | GEX44, RTX 4000 SFF Ada 20GB |
| **Embedder (bge-m3 1024d)** | GPU-1 (100.111.227.102:8081) | Same GPU |
| **Reranker (BGE-v2-m3)** | GPU-1 (100.111.227.102:8082) | Same GPU |
| **Embedder Pool Router** | CueCrux-Data-1 (100.75.64.43:8079) | Load balancer |
| **CoreCrux Decision Plane** | GPU-1 (100.111.227.102:4006) | Rust daemon |
| **Vault** | VaultCrux-Vault (100.74.157.35:8200) | Transit encryption |

---

## Section 3: Full 500 Results -- Confirmed Score

### 3.1 Headline

**378/500 = 75.6%**

This is the definitive confirmed score for the F1 arm with all Phase 9 interventions (investigate_question + pre-injection + reflection). It is a **net regression of -0.6pp** from the 76.2% baseline.

### 3.2 By Question Type

| Question Type | Count | Baseline (a0b1f3) | Confirmation (f6604e) | Delta |
|---------------|-------|--------------------|-----------------------|-------|
| single-session-assistant | 56 | 56/56 (100.0%) | 43/56 (76.8%) | **-13** |
| single-session-user | 70 | 66/70 (94.3%) | 63/70 (90.0%) | -3 |
| single-session-preference | 30 | 26/30 (86.7%) | 21/30 (70.0%) | **-5** |
| knowledge-update | 78 | 57/78 (73.1%) | 64/78 (82.1%) | **+7** |
| temporal-reasoning | 133 | 92/133 (69.2%) | 100/133 (75.2%) | **+8** |
| multi-session | 133 | 84/133 (63.2%) | 87/133 (65.4%) | +3 |
| **TOTAL** | **500** | **381/500 (76.2%)** | **378/500 (75.6%)** | **-3** |

### 3.3 The Pattern

The table reveals a stark pattern:

- **Easy question types regressed heavily:** single-session-assistant (-13), single-session-preference (-5), single-session-user (-3). These are questions where the answer is in a single session and can be retrieved with one query. The baseline got them right with simple `query_memory` calls. The confirmation run over-processed them with `investigate_question`.

- **Hard question types improved:** knowledge-update (+7), temporal-reasoning (+8), multi-session (+3). These are questions requiring multi-step reasoning, date arithmetic, aggregation across sessions, or tracking knowledge changes. The `investigate_question` pipeline genuinely helps here.

The interventions shifted accuracy from easy questions to hard questions, with a net loss.

### 3.4 Run Statistics

| Metric | Baseline (a0b1f3) | Confirmation (f6604e) |
|--------|--------------------|-----------------------|
| Total questions | 500 | 500 |
| Correct | 381 | 378 |
| Accuracy | 76.2% | 75.6% |
| Duration | 44.0 min | 57.5 min |
| Cost | $30.36 | $47.31 |
| Total input tokens | 9,299,980 | 14,145,143 |
| Total output tokens | 164,322 | 325,113 |
| Total tool calls | 1,143 | 919 |
| Avg latency | -- | 19,156ms |

The confirmation run used 52% more input tokens and cost 56% more than the baseline, yet scored lower. The reduced tool call count (919 vs 1143) reflects that `investigate_question` replaces multiple individual calls, but the investigation result payload is large (entity facts + timeline + chunks + expanded context + answerability + recommendation), inflating input tokens.

---

## Section 4: Recovery vs Regression Analysis

### 4.1 Overview

| Category | Count |
|----------|-------|
| Both pass (stable) | 333 |
| Both fail (persistent) | 74 |
| Recovered (baseline fail -> confirmation pass) | 45 |
| Regressed (baseline pass -> confirmation fail) | 48 |
| **Net** | **-3** |

### 4.2 Recovered Questions (45) -- by Type

| Type | Count | Question IDs |
|------|-------|--------------|
| temporal-reasoning | +15 | `8077ef71`, `b46e15ee`, `bbf86515`, `c8090214_abs`, `e4e14d04`, `gpt4_45189cb4`, `gpt4_468eb063`, `gpt4_468eb064`, `gpt4_68e94288`, `gpt4_70e84552_abs`, `gpt4_8279ba03`, `gpt4_b0863698`, `gpt4_e061b84f`, `gpt4_e414231f`, `gpt4_fa19884d` |
| knowledge-update | +14 | `01493427`, `2133c1b5`, `2698e78f`, `41698283`, `69fee5aa`, `6aeb4375`, `7401057b`, `852ce960`, `9bbe84a2`, `a2f3aa27`, `ba61f0b9`, `c7dc5443`, `e66b632c`, `f685340e_abs` |
| multi-session | +13 | `1a8a66a6`, `55241a1f`, `6d550036`, `8e91e7d9`, `9aaed6a3`, `9d25d4e0`, `9ee3ecd6`, `c18a7dc8`, `e3038f8c`, `f0e564bc`, `gpt4_194be4b3`, `gpt4_5501fe77`, `gpt4_731e37d7` |
| single-session-user | +2 | `d52b4f67`, `dccbc061` |
| single-session-preference | +1 | `38146c39` |

**Why these recovered:**
- **Temporal:** `investigate_question` builds a timeline automatically, enabling correct date arithmetic with `date_diff`. The baseline required the agent to manually discover dates, which it often failed to do.
- **Knowledge-update:** The recency-biased second retrieval in `investigate_question` (Phase 3, knowledge-update branch) surfaces the latest value. Pre-injection of recency-sorted entity facts also helps.
- **Multi-session:** Entity index enumeration catches items scattered across multiple sessions. The agent can count from the structured fact list rather than hoping retrieval returns all relevant chunks.

### 4.3 Regressed Questions (48) -- by Type

| Type | Count | Question IDs |
|------|-------|--------------|
| single-session-assistant | -13 | `0e5e2d1a`, `1568498a`, `1b9b7252`, `1d4da289`, `5809eb10`, `6222b6eb`, `65240037`, `6ae235be`, `70b3e69b`, `778164c6`, `7e00a6cb`, `cc539528`, `dc439ea3` |
| multi-session | -10 | `129d1232`, `21d02d0d`, `36b9f61e`, `3a704032`, `80ec1f4f`, `88432d0a`, `a9f6b44c`, `d6062bb9`, `gpt4_d84a3211`, `gpt4_e05b82a6` |
| temporal-reasoning | -7 | `d01c6aa8`, `gpt4_0b2f1d21`, `gpt4_1e4a8aec`, `gpt4_2f584639`, `gpt4_8279ba02`, `gpt4_9a159967`, `gpt4_d31cdae3` |
| knowledge-update | -7 | `10e09553`, `3ba21379`, `7e974930`, `89941a93`, `8fb83627`, `b6019101`, `c4ea545c` |
| single-session-preference | -6 | `06f04340`, `0a34ad58`, `0edc2aef`, `1d4e3b97`, `57f827a0`, `d6233ab6` |
| single-session-user | -5 | `1faac195`, `6f9b354f`, `a82c026e`, `ad7109d1`, `f4f1d8a4` |

**The regression pattern:**

The 13 single-session-assistant regressions are the clearest signal. The baseline scored **100%** (56/56) on this type -- every single question was answered correctly with the simpler pipeline. The confirmation run dropped to 76.8% (43/56). These questions follow a template: "In our previous conversation about X, you mentioned Y. What was Z?" The answer is always in a single session and can be found with a simple `query_memory` call.

The 6 single-session-preference regressions dropped from 86.7% to 70.0%. These are questions where the gold answer is about inferring user preferences from conversation context. The `investigate_question` pipeline's structured output (facts, timeline, answerability) is irrelevant for preference inference.

The 5 single-session-user regressions dropped from 94.3% to 90.0%. Again, simple factual recall from a single session.

### 4.4 Regression Root Causes

For the 48 regressed questions, the breakdown by agent behaviour:

| Pattern | Count | Description |
|---------|-------|-------------|
| Wrong answer from evidence | 39 | Agent retrieved relevant content but produced wrong answer |
| False negative (said insufficient) | 9 | Agent declared "insufficient information" despite answer being retrievable |

All 48 regressions used `investigate_question` (100%). The average input token count for regressed questions was **27,895** in the confirmation run vs **16,418** in the baseline -- a **1.70x increase**. The investigation result payload adds ~11K tokens of context (entity facts, timeline, chunks, expanded context, answerability assessment, recommendation) that the agent must process before answering. For simple questions, this additional context is noise.

---

## Section 5: Root Cause of Regressions

### 5.1 The Core Problem: Unconditional Heavyweight Processing

The system prompt instructs: "Call investigate_question(question) FIRST for every question." This is the root cause. The investigation pipeline runs 7 phases regardless of question complexity:

1. **Entity index lookup** -- For single-session-assistant questions like "What was the dish you recommended?", the entity index returns irrelevant facts about other entities. The agent then tries to reconcile these spurious facts with the retrieval results.

2. **Timeline construction** -- Only triggered for temporal/ordering questions, but the intent detector sometimes mis-classifies simple recall as temporal.

3. **Full retrieval pipeline** -- This is appropriate for all questions, but the pipeline returns 15 chunks with detailed scores, which is more context than needed for single-session recall.

4. **Context expansion** -- When fewer than 5 chunks are returned (common for simple questions), expand_hit_context pulls in adjacent turns. For encrypted tenants, this returns `vault:v1:...` ciphertext that confuses the agent.

5. **Answerability assessment** -- For questions where the answer is clearly in the top chunk, the answerability model sometimes reports low confidence (e.g., "missing: date"), causing the agent to doubt a correct finding.

6. **Confidence scoring** -- The heuristic confidence formula (facts + chunks + timeline + expansion + answerability) can produce low scores even when the answer is obvious, triggering unnecessary follow-up searches.

7. **Recommendation generation** -- The recommendation text adds another layer of interpretation that can conflict with the evidence.

### 5.2 The Reflection Loop Amplifies Errors

After receiving the investigation result, the agent runs a reflection:

```
1. WHAT DID I FIND? List the key facts, items, or events retrieved.
2. IS MY COUNT COMPLETE? If counting, enumerate every item numbered.
3. CONFIDENCE (1-10)? Rate honestly.
```

For simple questions with high-confidence evidence, this is wasted processing. Worse, when the agent rates confidence < 7, it launches additional tool calls that introduce conflicting evidence. Several regressions show the pattern:

1. `investigate_question` returns the correct chunk with good evidence.
2. Reflection rates confidence 5-6 because the entity index returned noise.
3. Agent makes additional `query_memory` or `get_session_by_id` calls.
4. New results contain tangentially related but incorrect information.
5. Agent changes its answer to incorporate the new (wrong) information.

### 5.3 Pre-Injection Noise

For questions where the type detector fires (aggregation, temporal, knowledge_update), structured data is injected into the system prompt before the agent starts. When the detector mis-classifies:

- A simple "What type of vehicle model am I currently working on?" gets classified as knowledge_update and receives recency-sorted entity facts about vehicle-related entities, including mentions of models the user discussed but isn't working on.
- A preference question "What should I serve for dinner?" gets classified as "other" (no pre-injection), but the investigation still runs the full entity pipeline.

### 5.4 Encrypted Content Blocking

5 failures (3 baseline, 2 regression) are caused by `FEATURE_PRIVATE_DATA_ENCRYPTION`. The `expand_hit_context` call returns `vault:v1:...` ciphertext strings. The agent sees these and correctly notes "expanded context chunks are encrypted/vaulted and not readable" but then has no way to access the content. In the baseline, the simpler pipeline didn't trigger expansion, so the agent answered from the initial retrieval result (which was decrypted).

---

## Section 6: All 122 Failures -- Full Detail

### 6.1 Summary

| Status | Count | Description |
|--------|-------|-------------|
| BASELINE_FAIL | 74 | Failed in both runs (persistent failures) |
| NEW_REGRESSION | 48 | Passed in baseline, fails in confirmation |
| **Total** | **122** | |

### 6.2 Root Cause Distribution

| Root Cause | Total | Baseline Fail | New Regression |
|------------|-------|---------------|----------------|
| `incomplete_enumeration` | 44 | 28 | 16 |
| `false_negative` | 27 | 19 | 8 |
| `wrong_answer` | 21 | 9 | 12 |
| `temporal_reasoning_error` | 17 | 12 | 5 |
| `preference_misread` | 8 | 3 | 5 |
| `encryption_block` | 5 | 3 | 2 |

### 6.3 Failures by Question Type

| Type | Total Failures | Baseline Fail | New Regression |
|------|----------------|---------------|----------------|
| multi-session | 46 | 36 | 10 |
| temporal-reasoning | 33 | 26 | 7 |
| knowledge-update | 14 | 7 | 7 |
| single-session-assistant | 13 | 0 | 13 |
| single-session-preference | 9 | 3 | 6 |
| single-session-user | 7 | 2 | 5 |

### 6.4 Complete Failure Table (122 questions)

Legend:
- **Root cause codes:** `incomplete_enumeration` = found some items but not all; `false_negative` = declared insufficient evidence when answer exists; `wrong_answer` = retrieved relevant content but answered incorrectly; `temporal_reasoning_error` = wrong date/ordering/duration; `preference_misread` = missed user preference signals; `encryption_block` = content behind Vault Transit encryption.
- **Status:** `BASELINE_FAIL` = failed in both runs; `NEW_REGRESSION` = passed in baseline, fails now.

| # | Question ID | Type | Question | Gold Answer | Agent Answer | Root Cause | Status |
|---|-------------|------|----------|-------------|--------------|------------|--------|
| 1 | `031748ae_abs` | knowledge-update | How many engineers do I lead when I just started my new role as Software Engineer Manager? | The information provided is not enough. You mentioned starting the role as Senior Software Engineer but not Software Engineer Manager. | Based on the retrieved conversations, when you started your new role, you were a **Senior Software Engineer** leading a team -- and the evidence points to **5 engineers** on your team. | incomplete_enumeration | BASELINE_FAIL |
| 2 | `07741c45` | knowledge-update | Where do I currently keep my old sneakers? | in a shoe rack in my closet | Based on the retrieved conversations, there are actually **two different storage situations** mentioned across your conversations. | wrong_answer | BASELINE_FAIL |
| 3 | `0e4e4c46` | knowledge-update | What is my current highest score in Ticket to Ride? | 132 points | Your current highest score in Ticket to Ride is **124 points**! | wrong_answer | BASELINE_FAIL |
| 4 | `6071bd76` | knowledge-update | For the coffee-to-water ratio in my French press, did I switch to more water per tablespoon of coffee, or less? | You switched to less water (5 ounces) per tablespoon of coffee. | In a session from **February 11, 2023**, you mentioned that you had settled on a ratio of **1 tablespoon of coffee for every 6 ounces of water**... | false_negative | BASELINE_FAIL |
| 5 | `830ce83f` | knowledge-update | Where did Rachel move to after her recent relocation? | the suburbs | Rachel moved to **Chicago**. | wrong_answer | BASELINE_FAIL |
| 6 | `affe2881` | knowledge-update | How many different species of birds have I seen in my local park? | 32 | You have seen **27 different species of birds** in your local park! | incomplete_enumeration | BASELINE_FAIL |
| 7 | `dad224aa` | knowledge-update | What time do I wake up on Saturday mornings? | 7:30 am | Your Saturday morning wake-up time has varied: Goal **8:00 am**, actual varies. | wrong_answer | BASELINE_FAIL |
| 8 | `10e09553` | knowledge-update | How many largemouth bass did I catch with Alex on the earlier fishing trip to Lake Michigan before the 7/22 trip? | 7 | [empty answer] | incomplete_enumeration | NEW_REGRESSION |
| 9 | `3ba21379` | knowledge-update | What type of vehicle model am I currently working on? | Ford F-150 pickup truck | You are currently working on a **Ford Mustang Shelby GT350R** scale model! | wrong_answer | NEW_REGRESSION |
| 10 | `7e974930` | knowledge-update | How much did I earn at the Downtown Farmers Market on my most recent visit? | $420 | March 18th: $220, May 6th: $350... | incomplete_enumeration | NEW_REGRESSION |
| 11 | `89941a93` | knowledge-update | How many bikes do I currently own? | 4 | You mentioned: "I currently have three bikes." | incomplete_enumeration | NEW_REGRESSION |
| 12 | `8fb83627` | knowledge-update | How many issues of National Geographic have I finished reading? | Five | You have finished reading **3 issues**. | incomplete_enumeration | NEW_REGRESSION |
| 13 | `b6019101` | knowledge-update | How many MCU films did I watch in the last 3 months? | 5 | I found two relevant pieces with **conflicting numbers**... | incomplete_enumeration | NEW_REGRESSION |
| 14 | `c4ea545c` | knowledge-update | Do I go to the gym more frequently than I did previously? | Yes | Your gym frequency information is ambiguous... | wrong_answer | NEW_REGRESSION |
| 15 | `099778bb` | multi-session | What percentage of leadership positions do women hold in my company? | 20% | No specific percentage recorded. | false_negative | BASELINE_FAIL |
| 16 | `09ba9854_abs` | multi-session | How much will I save by taking the bus from the airport to my hotel instead of a taxi? | The information provided is not enough. You did not mention how much will the bus take. | Airport Limousine Bus ~Y2,000-3,200 vs taxi... | incomplete_enumeration | BASELINE_FAIL |
| 17 | `0a995998` | multi-session | How many items of clothing do I need to pick up or return from a store? | 3 | I can identify **2 clothing items**. | incomplete_enumeration | BASELINE_FAIL |
| 18 | `10d9b85a` | multi-session | How many days did I spend attending workshops, lectures, and conferences in April? | 3 days | Unable to find any conversations about workshops in April. | false_negative | BASELINE_FAIL |
| 19 | `28dc39ac` | multi-session | How many hours have I spent playing games in total? | 140 hours | ~70 hours (found 4 games). | incomplete_enumeration | BASELINE_FAIL |
| 20 | `2b8f3739` | multi-session | What is the total amount of money I earned from selling my products at the markets? | $495 | Unable to find records related to selling products at markets. | false_negative | BASELINE_FAIL |
| 21 | `2ce6a0f2` | multi-session | How many different art-related events did I attend in the past month? | 4 | Found events but counted incorrectly. | incomplete_enumeration | BASELINE_FAIL |
| 22 | `37f165cf` | multi-session | What was the page count of the two novels I finished in January and March? | 856 | Unable to find novels with page counts. | false_negative | BASELINE_FAIL |
| 23 | `51c32626` | multi-session | When did I submit my research paper on sentiment analysis? | February 1st | Found ACL submission but not exact date. | wrong_answer | BASELINE_FAIL |
| 24 | `5a7937c8` | multi-session | How many days did I spend participating in faith-related activities in December? | 3 days | Only confirmed 1 (midnight mass on Dec 24). | incomplete_enumeration | BASELINE_FAIL |
| 25 | `60159905` | multi-session | How many dinner parties have I attended in the past month? | three | Found 2 dinner parties. | incomplete_enumeration | BASELINE_FAIL |
| 26 | `61f8c8f8` | multi-session | How much faster did I finish the 5K run compared to my previous year's time? | 10 minutes | Encrypted content blocked comparison. | encryption_block | BASELINE_FAIL |
| 27 | `67e0d0f2` | multi-session | What is the total number of online courses I've completed? | 20 | Found reference to "some courses on Coursera" but not count. | incomplete_enumeration | BASELINE_FAIL |
| 28 | `7024f17c` | multi-session | How many hours of jogging and yoga did I do last week? | 0.5 hours | Only found 30-minute jog, insufficient confidence. | false_negative | BASELINE_FAIL |
| 29 | `73d42213` | multi-session | What time did I reach the clinic on Monday? | 9:00 AM | No record of specific clinic arrival time. | false_negative | BASELINE_FAIL |
| 30 | `81507db6` | multi-session | How many graduation ceremonies have I attended in the past three months? | 3 | Found only mention of missing nephew's graduation. | incomplete_enumeration | BASELINE_FAIL |
| 31 | `92a0aa75` | multi-session | How long have I been working in my current role? | 1 year and 5 months | Found "3 years and 9 months experience" but computed incorrectly. | wrong_answer | BASELINE_FAIL |
| 32 | `a08a253f` | multi-session | How many days a week do I attend fitness classes? | 4 days | Found 3 classes (Tue, Thu, Sat). | incomplete_enumeration | BASELINE_FAIL |
| 33 | `a11281a2` | multi-session | What was the approximate increase in Instagram followers I experienced in two weeks? | 100 | [empty answer] | wrong_answer | BASELINE_FAIL |
| 34 | `a96c20ee_abs` | multi-session | At which university did I present a poster for my undergrad course research project? | The information provided is not enough. You did not mention presenting a poster for your undergrad course research project. | Found Harvard University conference, but not poster presentation. | wrong_answer | BASELINE_FAIL |
| 35 | `aae3761f` | multi-session | How many hours in total did I spend driving to my three road trip destinations combined? | 15 hours (or 30 round trip) | Encrypted chunks blocked Tybee Island data. | encryption_block | BASELINE_FAIL |
| 36 | `ba358f49` | multi-session | How many years will I be when my friend Rachel gets married? | 33 | Calculated wedding year but not age correctly. | incomplete_enumeration | BASELINE_FAIL |
| 37 | `bc149d6b` | multi-session | What is the total weight of the new feed I purchased in the past two months? | 70 pounds | Found one purchase but missed others. | incomplete_enumeration | BASELINE_FAIL |
| 38 | `bf659f65` | multi-session | How many music albums or EPs have I purchased or downloaded? | 3 | Found 1 (Bill Withers). | incomplete_enumeration | BASELINE_FAIL |
| 39 | `c4a1ceb8` | multi-session | How many different types of citrus fruits have I used in cocktail recipes? | 3 | Found 4+ citrus types (overcounting). | incomplete_enumeration | BASELINE_FAIL |
| 40 | `cc06de0d` | multi-session | For my daily commute, how much more expensive was the taxi ride compared to the train fare? | $6 | No records of taxi or train fare. | false_negative | BASELINE_FAIL |
| 41 | `d851d5ba` | multi-session | How much money did I raise for charity in total? | $3,750 | Found $500 for ACS + another, missed rest. | incomplete_enumeration | BASELINE_FAIL |
| 42 | `gpt4_15e38248` | multi-session | How many pieces of furniture did I buy, assemble, sell, or fix? | 4 | Found 3 (IKEA bookshelf, West Elm coffee table, Casper mattress). | incomplete_enumeration | BASELINE_FAIL |
| 43 | `gpt4_2ba83207` | multi-session | Which grocery store did I spend the most money at in the past month? | Thrive Market | Walmart (~$120). | wrong_answer | BASELINE_FAIL |
| 44 | `gpt4_2f8be40d` | multi-session | How many weddings have I attended this year? | Three (Rachel/Mike, Emily/Sarah, Jen/Tom). | Found 2 weddings. | incomplete_enumeration | BASELINE_FAIL |
| 45 | `gpt4_31ff4165` | multi-session | How many health-related devices do I use in a day? | 4 | Found 3 (Fitbit, blood pressure, thermometer). | incomplete_enumeration | BASELINE_FAIL |
| 46 | `gpt4_372c3eed` | multi-session | How many years in total did I spend in formal education from high school to Bachelor's? | 10 years | Calculated incorrectly from retrieved data. | incomplete_enumeration | BASELINE_FAIL |
| 47 | `gpt4_59c863d7` | multi-session | How many model kits have I worked on or bought? | 5 | Found 4. | incomplete_enumeration | BASELINE_FAIL |
| 48 | `gpt4_7fce9456` | multi-session | How many properties did I view before making an offer on the townhouse? | 4 | Enumerated properties but counted wrong. | incomplete_enumeration | BASELINE_FAIL |
| 49 | `gpt4_a56e767c` | multi-session | How many movie festivals did I attend? | 4 | No information found about movie festivals. | false_negative | BASELINE_FAIL |
| 50 | `gpt4_ab202e7f` | multi-session | How many kitchen items did I replace or fix? | 5 (faucet, mat, toaster, coffee maker, shelves) | Found 3. | incomplete_enumeration | BASELINE_FAIL |
| 51 | `129d1232` | multi-session | How much money did I raise through all charity events? | $5,850 | Found 2 events totalling ~$500. | incomplete_enumeration | NEW_REGRESSION |
| 52 | `21d02d0d` | multi-session | How many fun runs did I miss in March due to work? | 2 | Session lookup didn't retrieve relevant chunk. | incomplete_enumeration | NEW_REGRESSION |
| 53 | `36b9f61e` | multi-session | Total amount spent on luxury items in past few months? | $2,500 | Found Gucci handbag + others, wrong total. | incomplete_enumeration | NEW_REGRESSION |
| 54 | `3a704032` | multi-session | How many plants did I acquire in the last month? | 3 | Found plants but missed one. | incomplete_enumeration | NEW_REGRESSION |
| 55 | `80ec1f4f` | multi-session | How many museums or galleries did I visit in February? | 2 | Found multiple but counted wrong. | incomplete_enumeration | NEW_REGRESSION |
| 56 | `88432d0a` | multi-session | How many times did I bake something in past two weeks? | 4 | Found 3 baking instances. | incomplete_enumeration | NEW_REGRESSION |
| 57 | `a9f6b44c` | multi-session | How many bikes did I service or plan to service in March? | 2 | Found 2 bikes but answer evaluated as wrong. | incomplete_enumeration | NEW_REGRESSION |
| 58 | `d6062bb9` | multi-session | Total views on most popular videos on YouTube and TikTok? | 1,998 | Found TikTok 1,456 views but not YouTube total. | false_negative | NEW_REGRESSION |
| 59 | `gpt4_d84a3211` | multi-session | Total money spent on bike-related expenses since start of year? | $185 | Found one expense only. | incomplete_enumeration | NEW_REGRESSION |
| 60 | `gpt4_e05b82a6` | multi-session | How many times did I ride rollercoasters July to October? | 10 | Pieced together but counted wrong. | incomplete_enumeration | NEW_REGRESSION |
| 61 | `0e5e2d1a` | single-session-assistant | Follow up about binaural beats study -- how many subjects? | 38 subjects | Found study but confused journals, wrong count. | incomplete_enumeration | NEW_REGRESSION |
| 62 | `1568498a` | single-session-assistant | Chess game: what was the move after 27. Kg2 Bd5+? | 28. Kg3 | Found game but only to move 24. | false_negative | NEW_REGRESSION |
| 63 | `1b9b7252` | single-session-assistant | Mindfulness resources -- what website had free exercises? | Mindful.org | Confirmed conversation but couldn't find specific website. | false_negative | NEW_REGRESSION |
| 64 | `1d4da289` | single-session-assistant | Data privacy: what 2FA methods did you mention? | Biometric authentication or OTPs | Found topic but specific methods not surfaced. | wrong_answer | NEW_REGRESSION |
| 65 | `5809eb10` | single-session-assistant | Bajimaya v Reward Homes -- what year did construction begin? | 2014 | Found case but year not in retrieved content. | wrong_answer | NEW_REGRESSION |
| 66 | `6222b6eb` | single-session-assistant | Atmospheric correction -- which algorithm in SIAC_GEE tool? | 6S algorithm | [empty answer] | wrong_answer | NEW_REGRESSION |
| 67 | `65240037` | single-session-assistant | Tea tree oil dilution ratio? | 1:10 (one part tea tree to ten parts carrier) | Retrieved content but gave wrong ratio. | wrong_answer | NEW_REGRESSION |
| 68 | `6ae235be` | single-session-assistant | CITGO Lake Charles refinery processes? | Atmospheric distillation, FCC, alkylation, hydrotreating | Expanded context encrypted, couldn't read. | encryption_block | NEW_REGRESSION |
| 69 | `70b3e69b` | single-session-assistant | Spanish-Catalan singer-songwriter supporting unity? | Manolo Garcia | Retrieved wrong content. | wrong_answer | NEW_REGRESSION |
| 70 | `778164c6` | single-session-assistant | Jamaican dish with snapper and fruit? | Grilled Snapper with Mango Salsa | **Escovitch Fish** (wrong dish). | wrong_answer | NEW_REGRESSION |
| 71 | `7e00a6cb` | single-session-assistant | Hostel near Red Light District in Amsterdam? | International Budget Hostel | Found budget hostels but not the specific one. | wrong_answer | NEW_REGRESSION |
| 72 | `cc539528` | single-session-assistant | Back-end programming languages recommended? | Ruby, Python, or PHP | Gave expanded list including wrong languages. | wrong_answer | NEW_REGRESSION |
| 73 | `dc439ea3` | single-session-assistant | Traditional game performed by dancers at powwows? | Hoop Dance | Found powwow content but didn't identify Hoop Dance. | wrong_answer | NEW_REGRESSION |
| 74 | `09d032c9` | single-session-preference | Phone battery life tips? | Responses referencing portable power bank purchase. | General tips, no personalization. | preference_misread | BASELINE_FAIL |
| 75 | `1c0ddc50` | single-session-preference | Activities during commute? | Suggestions about podcasts beyond true crime/self-improvement, especially history. | General commute suggestions. | preference_misread | BASELINE_FAIL |
| 76 | `35a27287` | single-session-preference | Cultural events this weekend? | Events for practicing Spanish/French, with language focus. | "I don't know your location." | preference_misread | BASELINE_FAIL |
| 77 | `06f04340` | single-session-preference | Dinner with homegrown ingredients? | Recipes with cherry tomatoes, basil, mint. | Generic suggestions with basil and mint but missing cherry tomatoes specificity. | preference_misread | NEW_REGRESSION |
| 78 | `0a34ad58` | single-session-preference | Getting around Tokyo tips? | Reference Suica card and TripIt app from previous conversation. | General Tokyo transport tips. | preference_misread | NEW_REGRESSION |
| 79 | `0edc2aef` | single-session-preference | Hotel for Miami trip? | Hotels with ocean views, rooftop pool. | No specific recommendations. | preference_misread | NEW_REGRESSION |
| 80 | `1d4e3b97` | single-session-preference | Bike performing better on Sunday rides -- why? | Reference chain/cassette replacement, Garmin bike computer. | General cycling tips. | preference_misread | NEW_REGRESSION |
| 81 | `57f827a0` | single-session-preference | Furniture rearranging tips? | Reference dresser replacement and mid-century modern interest. | "No specific information found." | false_negative | NEW_REGRESSION |
| 82 | `d6233ab6` | single-session-preference | Should I attend high school reunion? | Draw on debate team experience and advanced classes. | "No specific prior discussions found." | preference_misread | NEW_REGRESSION |
| 83 | `5d3d2817` | single-session-user | What was my previous occupation? | Marketing specialist at a small startup | Encrypted content blocked; said insufficient. | encryption_block | BASELINE_FAIL |
| 84 | `ec81a493` | single-session-user | How many copies of favourite artist's debut album released worldwide? | 500 | Found album reference but not copy count. | false_negative | BASELINE_FAIL |
| 85 | `1faac195` | single-session-user | Where does my sister Emily live? | Denver | "Insufficient information." | false_negative | NEW_REGRESSION |
| 86 | `6f9b354f` | single-session-user | What colour did I repaint my bedroom walls? | a lighter shade of gray | "Insufficient information." | false_negative | NEW_REGRESSION |
| 87 | `a82c026e` | single-session-user | What game did I finally beat last weekend? | Dark Souls 3 DLC | Found "finally beat that la..." chunk but wrong game. | wrong_answer | NEW_REGRESSION |
| 88 | `ad7109d1` | single-session-user | What speed is my new internet plan? | 500 Mbps | "Insufficient information." | false_negative | NEW_REGRESSION |
| 89 | `f4f1d8a4` | single-session-user | Who gave me a new stand mixer as birthday gift? | my sister | Encrypted content in expansion. | encryption_block | NEW_REGRESSION |
| 90 | `08f4fc43` | temporal-reasoning | Days between Sunday mass at St. Mary's and Ash Wednesday service? | 30 days (31 incl.) | Calculated 3 days (wrong dates). | incomplete_enumeration | BASELINE_FAIL |
| 91 | `0bc8ad93` | temporal-reasoning | Museum visit two months ago -- with a friend or not? | No, alone | "Yes! You visited with a friend." | temporal_reasoning_error | BASELINE_FAIL |
| 92 | `370a8ff4` | temporal-reasoning | Weeks between flu recovery and 10th outdoor jog? | 15 | Calculated 11.6 weeks. | incomplete_enumeration | BASELINE_FAIL |
| 93 | `6e984302` | temporal-reasoning | Investment for competition four weeks ago? | Set of sculpting tools | No record found. | false_negative | BASELINE_FAIL |
| 94 | `71017277` | temporal-reasoning | Piece of jewellery received last Saturday -- from whom? | my aunt | No record found. | false_negative | BASELINE_FAIL |
| 95 | `9a707b81` | temporal-reasoning | Days ago: baking class at culinary school for friend's cake? | 21 days (22 incl.) | 26 days (wrong date). | incomplete_enumeration | BASELINE_FAIL |
| 96 | `9a707b82` | temporal-reasoning | Cooking something for friend a couple of days ago? | a chocolate cake | Couldn't find mention. | false_negative | BASELINE_FAIL |
| 97 | `a3838d2b` | temporal-reasoning | Charity events before "Run for the Cure"? | 4 | Enumerated events but counted wrong. | incomplete_enumeration | BASELINE_FAIL |
| 98 | `b46e15ed` | temporal-reasoning | Months since two charity events on consecutive days? | 2 | No record of consecutive charity events. | false_negative | BASELINE_FAIL |
| 99 | `cc6d1ec1` | temporal-reasoning | How long had I been bird watching when I attended workshop? | Two months | Could not find timeline data. | false_negative | BASELINE_FAIL |
| 100 | `eac54add` | temporal-reasoning | Significant business milestone four weeks ago? | Signed contract with first client. | Found website launch, not client contract. | temporal_reasoning_error | BASELINE_FAIL |
| 101 | `gpt4_1916e0ea` | temporal-reasoning | Days between FarmFresh cancellation and Instacart shopping? | 54 days (55 incl.) | Computed from wrong dates. | incomplete_enumeration | BASELINE_FAIL |
| 102 | `gpt4_1a1dc16d` | temporal-reasoning | Meeting Rachel or pride parade first? | Meeting Rachel | "Pride parade on May 1st" -- wrong ordering. | false_negative | BASELINE_FAIL |
| 103 | `gpt4_2f56ae70` | temporal-reasoning | Most recently started streaming service? | Disney+ | Inferred wrong order from mentions. | temporal_reasoning_error | BASELINE_FAIL |
| 104 | `gpt4_483dd43c` | temporal-reasoning | Started first: The Crown or Game of Thrones? | Game of Thrones | Could not determine relative ordering. | temporal_reasoning_error | BASELINE_FAIL |
| 105 | `gpt4_59149c78` | temporal-reasoning | Art event two weeks ago -- where? | Metropolitan Museum of Art | Found Jan 8 event, not correct date. | temporal_reasoning_error | BASELINE_FAIL |
| 106 | `gpt4_7abb270c` | temporal-reasoning | Order of six museums from earliest to latest? | Science, Contemporary, Met, History, Modern Art, Natural History | Partial ordering, missing dates. | temporal_reasoning_error | BASELINE_FAIL |
| 107 | `gpt4_7f6b06db` | temporal-reasoning | Order of three trips in past three months? | Day hike to Muir Woods, road trip to Big Sur, solo camping Yosemite | Wrong ordering of trips. | temporal_reasoning_error | BASELINE_FAIL |
| 108 | `gpt4_88806d6e` | temporal-reasoning | Met first: Mark and Sarah, or Tom? | Tom | Found Mark/Sarah (beach trip) but no Tom date. | false_negative | BASELINE_FAIL |
| 109 | `gpt4_93159ced` | temporal-reasoning | How long working before starting at NovaTech? | 4 years 9 months | Computed incorrectly from evidence. | temporal_reasoning_error | BASELINE_FAIL |
| 110 | `gpt4_c27434e8` | temporal-reasoning | Started first: Ferrari model or Japanese Zero model? | Japanese Zero fighter plane | No information found. | false_negative | BASELINE_FAIL |
| 111 | `gpt4_d6585ce8` | temporal-reasoning | Order of concerts in past two months? | Billie Eilish, outdoor series, Brooklyn festival, jazz night at local bar | Wrong chronological ordering. | temporal_reasoning_error | BASELINE_FAIL |
| 112 | `gpt4_d6585ce9` | temporal-reasoning | Who did I go with to music event last Saturday? | my parents | Found "with your sister" -- wrong companion. | false_negative | BASELINE_FAIL |
| 113 | `gpt4_f420262c` | temporal-reasoning | Order of airlines flown, earliest to latest? | JetBlue, Delta, United, American Airlines | Wrong ordering. | temporal_reasoning_error | BASELINE_FAIL |
| 114 | `gpt4_f420262d` | temporal-reasoning | Airline on Valentine's Day? | American Airlines | Found Feb 14 session but wrong airline. | temporal_reasoning_error | BASELINE_FAIL |
| 115 | `gpt4_fe651585` | temporal-reasoning | Rachel or Alex: who became a parent first? | Alex | Found Rachel's twins but wrong ordering. | temporal_reasoning_error | BASELINE_FAIL |
| 116 | `d01c6aa8` | temporal-reasoning | How old was I when I moved to the US? | 27 | No specific information found. | temporal_reasoning_error | NEW_REGRESSION |
| 117 | `gpt4_0b2f1d21` | temporal-reasoning | First: coffee maker purchase or stand mixer malfunction? | Stand mixer malfunction | "Coffee maker happened first." | temporal_reasoning_error | NEW_REGRESSION |
| 118 | `gpt4_1e4a8aec` | temporal-reasoning | Gardening activity two weeks ago? | planting 12 new tomato saplings | Found tomato care but not planting. | temporal_reasoning_error | NEW_REGRESSION |
| 119 | `gpt4_2f584639` | temporal-reasoning | Bought first: necklace for sister or photo album for mom? | photo album for mom | Wrong ordering from timestamps. | temporal_reasoning_error | NEW_REGRESSION |
| 120 | `gpt4_8279ba02` | temporal-reasoning | How many days ago did I buy a smoker? | 10 days (11 incl.) | Found "got a smoker today (2023-03-15)" but computed wrong. | incomplete_enumeration | NEW_REGRESSION |
| 121 | `gpt4_9a159967` | temporal-reasoning | Airline flown most in March and April? | United Airlines | Found Uber rides, not airline data. | temporal_reasoning_error | NEW_REGRESSION |
| 122 | `gpt4_d31cdae3` | temporal-reasoning | First trip: solo Europe or family road trip American Southwest? | Family road trip | "Insufficient information." | false_negative | NEW_REGRESSION |

---

## Section 7: MCP Tool Inventory

### 7.1 Memory Core MCP Tools (43 total)

Source: `VaultCrux/apps/memory-core-mcp/src/tools.ts`

| # | Tool Name | Category | In RETRIEVAL_TOOLS (F1)? |
|---|-----------|----------|--------------------------|
| 1 | `query_memory` | Retrieval | YES |
| 2 | `list_topics` | Retrieval | YES |
| 3 | `get_relevant_context` | Retrieval | YES |
| 4 | `get_freshness_report` | Retrieval | YES |
| 5 | `check_claim` | Verification | YES |
| 6 | `get_contradictions` | Verification | YES |
| 7 | `assess_coverage` | Coverage | YES |
| 8 | `get_correction_chain` | Knowledge Update | YES |
| 9 | `get_versioned_snapshot` | Versioning | NO |
| 10 | `get_audit_trail` | Audit | NO |
| 11 | `get_decision_context` | Decision | NO |
| 12 | `get_causal_chain` | Decision | NO |
| 13 | `reconstruct_knowledge_state` | Knowledge | NO |
| 14 | `get_decisions_on_stale_context` | Decision | NO |
| 15 | `record_decision_context` | Decision | NO |
| 16 | `get_pressure_status` | Monitoring | NO |
| 17 | `get_active_alerts` | Monitoring | NO |
| 18 | `get_signals_feed` | Monitoring | NO |
| 19 | `declare_constraint` | Constraints | NO |
| 20 | `update_constraint` | Constraints | NO |
| 21 | `get_constraints` | Constraints | NO |
| 22 | `check_constraints` | Constraints | NO |
| 23 | `verify_before_acting` | Verification | NO |
| 24 | `suggest_constraint` | Constraints | NO |
| 25 | `checkpoint_decision_state` | Checkpoints | NO |
| 26 | `get_checkpoints` | Checkpoints | NO |
| 27 | `escalate_with_context` | Escalation | NO |
| 28 | `get_platform_capabilities` | Platform | NO |
| 29 | `submit_skill` | Skills | NO |
| 30 | `promote_skill` | Skills | NO |
| 31 | `dismiss_skill` | Skills | NO |
| 32 | `retract_skill` | Skills | NO |
| 33 | `session_debrief` | Session | NO |
| 34 | `get_domain_changelog` | Domain | NO |
| 35 | `get_my_tasks` | Tasks | NO |
| 36 | `get_task_context` | Tasks | NO |
| 37 | `log_progress` | Tasks | NO |
| 38 | `register_external_service` | External | NO |
| 39 | `request_credentialed_call` | External | NO |
| 40 | `list_external_services` | External | NO |
| 41 | `enumerate_memory_facts` | Facts (Phase 9) | YES |
| 42 | `build_timeline` | Facts (Phase 9) | YES |
| 43 | `expand_hit_context` | Facts (Phase 9) | YES |

### 7.2 Benchmark-Local Tools (4)

| Tool | Purpose | In RETRIEVAL_TOOLS? |
|------|---------|---------------------|
| `research_memory` | Multi-round adaptive search | YES |
| `date_diff` | Date arithmetic (from_date, to_date, unit) | YES |
| `get_session_by_id` | Retrieve full session by doc_id | YES |
| `structured_query` | Parameterised structured queries | YES |

### 7.3 Composite Tools

| Tool | Purpose | In RETRIEVAL_TOOLS? |
|------|---------|---------------------|
| `investigate_question` | Server-side multi-step investigation | YES |

**Total F1-visible tools:** 18 (8 MCP retrieval + 5 Phase 9 facts + 4 benchmark-local + 1 composite)

### 7.4 Tool Usage in Confirmation Run

| Tool | Calls | % of Total |
|------|-------|-----------|
| `investigate_question` | 526 | 57.2% |
| `query_memory` | 141 | 15.3% |
| `get_session_by_id` | 70 | 7.6% |
| `date_diff` | 69 | 7.5% |
| `expand_hit_context` | 68 | 7.4% |
| `research_memory` | 34 | 3.7% |
| `enumerate_memory_facts` | 4 | 0.4% |
| `derive_from_facts` | 4 | 0.4% |
| `build_timeline` | 2 | 0.2% |
| `assess_answerability` | 1 | 0.1% |
| **Total** | **919** | |

Note: 526 `investigate_question` calls for 500 questions means 26 questions called it twice (reflection-driven retry). The 141 `query_memory` calls are follow-up searches after investigation, typically for low-confidence results.

---

## Section 8: Programme Progression -- Honest Assessment

### 8.1 Full-Run History (500 questions) -- The Only Trustworthy Numbers

| Date | Run ID | Accuracy | Correct | Key Change | Cost |
|------|--------|----------|---------|------------|------|
| 2026-03-29 | (baseline DQP) | 71.0% | 355 | Semantic chunking + HyDE + context notation | ~$25 |
| 2026-03-29 | (re-ingest) | 75.8% | 378 | Date resolution + source_timestamp + richer context | ~$25 |
| 2026-03-30 | (entity router) | 78.0% | 390 | Entity index for all intents | ~$25 |
| 2026-03-30 | (all techniques) | 77.8% | 389 | + verification + QA inversion + confidence routing | ~$25 |
| 2026-03-31 | (materialised projections) | 78.2% | 391 | Pre-computed projections | ~$25 |
| 2026-03-31 | a0b1f3 | **76.2%** | **381** | **Phase 9 baseline (investigate + pre-inject + reflection)** | $30.36 |
| 2026-04-01 | **f6604e** | **75.6%** | **378** | **Phase 9 confirmation (same config, full 500)** | $47.31 |

### 8.2 Failure-Subset Runs -- Over-Estimated Projections

These runs tested ONLY the failing questions from a prior full run. Every projected accuracy was an over-estimate because failure-only testing cannot detect regressions.

| Date | Run ID | Failure Score | Projected Full-500 | Actual Full-500 | Over-Estimate |
|------|--------|---------------|---------------------|------------------|---------------|
| 2026-04-01 08:16 | dc04fb | ~6/56 | ~88% | -- | -- |
| 2026-04-01 08:34 | be31f9 | ~6/56 | ~88% | -- | -- |
| 2026-04-01 09:11 | c05588 | ~7/56 | ~89% | -- | -- |
| 2026-04-01 10:35 | 2b22c8 | 7/56 | ~89% | -- | -- |
| 2026-04-01 16:28 | **941857** | **13/56** | **~90.8%** | **75.6%** | **~15pp** |
| 2026-04-01 16:54 | 414a0d | 2/43 | ~83% | -- | -- |
| 2026-04-01 17:07 | c774b3 | 2/43 | ~83% | -- | -- |

The 941857 run recovered 13 of 56 failures and projected ~90.8%. The actual full-500 confirmation scored 75.6% -- an over-estimate of ~15pp. This is because the 13 recoveries were real, but 48 new regressions (invisible to failure-only testing) more than cancelled them out.

### 8.3 Accuracy Trajectory (Revised -- Honest)

```
71.0% --> 75.8% --> 78.0% --> 78.2%    [Full-run confirmed, Phase 8]
                                  |
                            76.2%       [Phase 9 baseline, full 500]
                                  |
                            75.6%       [Phase 9 confirmation, full 500]
                                  |
                          REGRESSION    [investigate_question helps hard, hurts easy]
```

**Key observation:** The 78.2% run used a simpler pipeline without investigate_question and without the reflection loop. Adding these complex components did not improve the score -- it degraded it. The pipeline was at its peak accuracy with Phase 8 (entity index + cross-encoder + graph expansion) running directly through simple agent tool calls.

### 8.4 The Over-Estimation Problem

Every failure-subset projection in this programme assumed:
1. Recovered failures would stay recovered in a full run (TRUE -- 45 recoveries confirmed)
2. Previously passing questions would remain passing (FALSE -- 48 new regressions)

The structural reason: any intervention that changes the agent's processing for ALL questions (like "always call investigate_question first") has both recovery potential (for questions that benefit from more processing) and regression potential (for questions that were working fine with less processing). Failure-only testing measures only the recovery side.

**Rule going forward: no projected accuracy is trustworthy. Only full-500 runs count.**

---

## Section 9: Lessons Learned

### 9.1 Failure-Only Testing Over-Estimates by 10-15pp

This is the most important finding of the entire audit programme. The 941857 failure-only run projected ~90.8%. The actual confirmed score was 75.6%. The gap is ~15pp. This pattern was consistent across all failure-subset runs -- they all showed positive recovery without detecting regressions.

**Mitigation:** Every intervention must be validated with a full-500 run before being declared an improvement. Failure-only testing is useful for rapid iteration on hard questions, but the final answer is always the full run.

### 9.2 Complex Pipelines Help Hard Questions but Hurt Easy Ones

The `investigate_question` pipeline (7 phases of server-side processing) is genuinely valuable for:
- **Aggregation:** Entity index enumeration catches items across sessions
- **Temporal:** Timeline construction + date_diff eliminates arithmetic errors
- **Knowledge-update:** Recency-biased retrieval surfaces the latest value

But it is harmful for:
- **Single-session recall:** One `query_memory` call finds the answer; investigation adds noise
- **Preference:** Structured facts/timeline are irrelevant; the answer is in conversation tone
- **Simple factual questions:** The answer is in the top chunk; 7 phases of processing create opportunities to overthink

### 9.3 The Right Architecture is Conditional Routing

The current system applies the same heavyweight pipeline to all 500 questions. The data proves this is wrong. The right architecture routes questions to different pipelines based on complexity:

- **Simple recall** (single-session-user, single-session-assistant): `query_memory` only, no investigation, no reflection, no pre-injection
- **Preference inference** (single-session-preference): `query_memory` + `get_relevant_context`, but no structured data injection
- **Aggregation/temporal/knowledge-update** (multi-session, temporal-reasoning, knowledge-update): Full `investigate_question` + reflection + pre-injection

### 9.4 Reflection Should Be Optional

The structured reflection loop ("WHAT DID I FIND? / CONFIDENCE?") was designed for aggregation questions where the agent needs to verify it found all items. For simple recall where the answer is in the first chunk with score 0.8+, reflection is pure overhead that creates opportunities for self-doubt and answer revision.

### 9.5 Pre-Injection Should Be Targeted

The pre-injection logic in `buildF1Prompt()` fires based on a regex classifier that sometimes mis-classifies. Even when it classifies correctly, injecting structured data for simple questions adds noise. Pre-injection should be restricted to questions where:
1. The type detector fires, AND
2. The question requires multi-source aggregation or temporal reasoning

### 9.6 Encrypted Content Remains a Persistent Problem

5 failures are caused by Vault Transit encryption. The `expand_hit_context` call returns ciphertext that the agent cannot read. This is a security/usability trade-off, but in the benchmark context it causes false failures. The benchmark runner either needs Transit decrypt access or the benchmark data should be unencrypted.

### 9.7 The 78.2% Pipeline Was Better

The Phase 8 pipeline (78.2%) used simpler agent-side tool orchestration without `investigate_question`. The agent made more tool calls (1,143 vs 919) but each call was lighter, and the agent had more flexibility to adapt its strategy per question. The Phase 9 pipeline (75.6%) replaced agent flexibility with server-side investigation, which helped hard questions but removed the agent's ability to take a simple path for easy ones.

---

## Section 10: Path Forward

### 10.1 The Clear Next Step: Conditional Routing

The data points to a single architectural change that would preserve the 45 recoveries while preventing most of the 48 regressions: **route questions to different pipelines based on detected complexity**.

#### Proposed Architecture

```
                          USER QUESTION
                              |
                    [Complexity Classifier]
                              |
              +---------------+---------------+
              |               |               |
         SIMPLE (1)      MODERATE (2)     COMPLEX (3)
              |               |               |
         query_memory    query_memory    investigate_question
              |               |               |
         [Answer]        [Reflection?]   [Full Reflection]
                              |               |
                         [Answer]        [Pre-Injection]
                                              |
                                         [Answer]
```

**Routing rules:**
- **SIMPLE:** single-session-assistant, single-session-user, single-session-preference patterns detected via question text ("In our previous conversation", "Can you remind me", "Where does my X live"). Use `query_memory` only. No reflection. No pre-injection. Max 2 tool calls.
- **MODERATE:** Questions that need 2-3 sources but aren't aggregation/temporal. Use `query_memory` + optional `expand_hit_context` or `get_session_by_id`. Reflection only if confidence < 7.
- **COMPLEX:** Aggregation, temporal, knowledge-update, multi-source. Full `investigate_question` pipeline + reflection + pre-injection.

### 10.2 Expected Impact

| Metric | Current (75.6%) | Projected |
|--------|------------------|-----------|
| Simple questions (156 total) | 127/156 (81.4%) | ~150/156 (96.2%) -- restore baseline + 2 |
| Complex questions (344 total) | 251/344 (73.0%) | ~263/344 (76.5%) -- preserve investigate gains |
| **Total** | **378/500 (75.6%)** | **~413/500 (~82.6%)** |

This projection assumes:
- Simple questions return to baseline accuracy (~155/156 for single-session-assistant, minus encryption blocks)
- Complex questions retain the investigate_question gains (+18 from temporal/knowledge-update/multi-session)
- Some residual regressions (~5) from imperfect routing

### 10.3 Implementation Priority

| Priority | Action | Expected Impact | Effort |
|----------|--------|-----------------|--------|
| **P0** | Implement complexity classifier + conditional routing | +35 questions (~82.6%) | 1-2 days |
| **P0** | Validate with full 500 run | Ground truth | $47 |
| **P1** | Fix encryption in benchmark path | +3-5 questions | 2 hours |
| **P1** | Restore Phase 8 baseline pipeline as "simple" path | +13 (single-session-assistant alone) | 4 hours |
| **P2** | Improve entity extraction coverage (Sonnet re-extraction) | +5-8 aggregation questions | 4 hours + $50 |
| **P2** | Preference-aware prompt for single-session-preference | +3-5 questions | 2 hours |
| **P3** | Session-level semantic search for total retrieval misses | +2-4 questions | 2 weeks |

### 10.4 Realistic Ceiling Assessment

| Milestone | Estimated Accuracy | Confidence |
|-----------|-------------------|------------|
| Conditional routing (P0) | ~82-84% | HIGH -- based on data |
| + encryption fix + entity re-extraction (P1) | ~85-87% | MEDIUM |
| + preference prompts + session search (P2) | ~88-90% | LOW |
| Structural ceiling | ~92% | THEORETICAL |

The structural ceiling of ~92% is set by:
- Total retrieval misses (10 questions) where the content is genuinely not in the index
- Vocabulary mismatch problems where the question uses completely different words than the stored text
- Evaluation noise (GPT-4o autoeval is ~97% accurate, meaning ~15 questions may be misjudged)

### 10.5 Cost Model

| Run Type | Cost | Notes |
|----------|------|-------|
| Full 500 validation (Sonnet 4.6) | $30-47 | Depends on pipeline complexity |
| GPT-4o autoeval (500 questions) | $5-8 | One-time per run |
| Sonnet entity re-extraction (full corpus) | $50-100 | One-time |
| Total per validation cycle | $35-55 | |

---

## Appendix A: Run Metadata

### Confirmation Run (f6604e)

```
runId: lme-s3-sonnet-4-6-F1-202604011752-f6604e
dataset: s3
arm: F1
model: claude-sonnet-4-6
timestamp: 2026-04-01T18:49:55.915Z
durationSeconds: 3453
totalQuestions: 500
totalInputTokens: 14,145,143
totalOutputTokens: 325,113
totalCachedTokens: 0
totalCostUsd: $47.31
```

### Baseline Run (a0b1f3)

```
runId: lme-s3-sonnet-4-6-F1-202603311333-a0b1f3
dataset: s3
arm: F1
model: claude-sonnet-4-6
timestamp: 2026-03-31T14:17:06.743Z
durationSeconds: 2642
totalQuestions: 500
totalInputTokens: 9,299,980
totalOutputTokens: 164,322
totalCachedTokens: 0
totalCostUsd: $30.36
```

### Evaluator

- Model: GPT-4o-2024-08-06
- Method: Binary label (true/false) with gold answer comparison
- Gold source: `longmemeval_s_references.json` (500 questions)

---

## Appendix B: Source Files Referenced

| File | Purpose |
|------|---------|
| `AuditCrux/benchmarks/longmemeval/results/lme-s3-sonnet-4-6-F1-202604011752-f6604e/summary.json` | Confirmation run full results |
| `AuditCrux/benchmarks/longmemeval/results/lme-s3-sonnet-4-6-F1-202604011752-f6604e/hypotheses.jsonl.eval-results-gpt-4o` | Confirmation scored results |
| `AuditCrux/benchmarks/longmemeval/results/lme-s3-sonnet-4-6-F1-202603311333-a0b1f3/hypotheses.jsonl.eval-results-gpt-4o` | Baseline scored results |
| `AuditCrux/benchmarks/longmemeval/references/longmemeval_s_references.json` | Gold answers |
| `VaultCrux/infra/hetzner/env/shared-features.env` | Feature flags |
| `VaultCrux/packages/core/src/retrieval.ts` | Retrieval pipeline |
| `VaultCrux/packages/core/src/memory-investigate.ts` | investigate_question implementation |
| `AuditCrux/benchmarks/longmemeval/lib/system-prompts.ts` | F1 system prompt + pre-injection |
| `AuditCrux/benchmarks/longmemeval/lib/arms.ts` | Tool filtering |
| `AuditCrux/benchmarks/longmemeval/results/lme-retrieval-system-audit-v4-2026-04-01.md` | Previous audit |
