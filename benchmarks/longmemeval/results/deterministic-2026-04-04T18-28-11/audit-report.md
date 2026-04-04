# CoreCrux v5 Deterministic Pipeline — Full Audit Report

**Date:** 2026-04-04
**Run:** `deterministic-2026-04-04T18-28-11`
**Dataset:** LongMemEval 500/500 (longmemeval_s_cleaned.json)
**Architecture:** Zero LLM at query time — Haiku extraction (one-time) + rule-based parser + embedding-boosted scoring

---

## 1. Headline Results

| Metric | Value |
|---|---|
| **Overall Accuracy** | **278/500 (55.6%)** |
| Duration | 2.6s (cached extractions + embedding scoring) |
| Extraction time | ~70 min one-time (500 questions x Haiku) |
| LLM calls at query time | **0** |
| Embedding calls at query time | ~500 (nomic-embed-text-v1.5 via EmbedderCrux) |

## 2. Per-Type Breakdown

| Type | Correct | Total | Accuracy | Notes |
|---|---|---|---|---|
| single-session-user | 45 | 70 | **64.3%** | Best category — direct fact lookup |
| multi-session | 77 | 133 | **57.9%** | COUNT aggregation is main gap |
| single-session-preference | 17 | 30 | **56.7%** | Rich builder + meta-vocabulary |
| temporal-reasoning | 75 | 133 | **56.4%** | DATE_SPAN + ORDER + relative dates |
| single-session-assistant | 27 | 56 | **48.2%** | Date-vs-name confusion persists |
| knowledge-update | 36 | 78 | **46.2%** | Wrong answer selection |

## 3. Per-Operation Breakdown

| Operation | Correct | Total | Accuracy | Purpose |
|---|---|---|---|---|
| DATE_DIFF | 14 | 19 | **74%** | "How many days ago did I..." |
| PREFERENCE | 18 | 24 | **75%** | Recommendation/preference questions |
| PREVIOUS | 8 | 12 | **67%** | "What was my previous X" |
| COUNT | 99 | 153 | **65%** | "How many X" / "How much money" |
| TEMPORAL_ORDER | 39 | 65 | **60%** | "Which first" / chronological ordering |
| DATE_SPAN | 17 | 32 | **53%** | "How many days between X and Y" |
| LOOKUP | 72 | 165 | **44%** | General keyword/embedding search |
| LATEST | 6 | 21 | **29%** | "What is my current X" |
| EVENT_DATE | 0 | 5 | **0%** | "When did I..." (needs work) |
| LIST | 3 | 3 | 100% | "List all my..." |
| DIFF | 1 | 1 | 100% | "How much more..." |

## 4. Confidence Tier Distribution

| Tier | Count | Meaning |
|---|---|---|
| high | 262 | Structured op returned authoritative answer |
| medium | 227 | Fuzzy fallback / entity-group scoring |
| low | 11 | No facts extracted (insufficient) |

## 5. Failure Analysis (222 failures)

### 5.1 Failure Categories

| Category | Count | Description |
|---|---|---|
| wrong_answer | 169 | Facts exist but wrong fact/entity selected |
| returns_raw_date | 23 | Returns "2023-05-30" instead of content |
| partial_match | 23 | >30% keyword overlap but below pass threshold |
| insufficient | 8 | No facts extracted from sessions |

### 5.2 Failures by Type

**Temporal Reasoning (58 failures)**
- TEMPORAL_ORDER: 16 — wrong chronological ordering or entity matching
- DATE_SPAN: 10 — date extraction errors (wrong dates found for events)
- LOOKUP: 8 — temporal questions that fell through to generic lookup
- DATE_DIFF: 5 — wrong reference date or event date
- COUNT: 4 — temporal count misclassified
- Others: 15

**Multi-Session (56 failures)**
- COUNT: 24 — aggregation across sessions (sum money, count unique items)
- LOOKUP: 21 — wrong fact selected from large fact store
- TEMPORAL_ORDER: 5 — ordering questions across sessions
- Others: 6

**Knowledge-Update (42 failures)**
- COUNT: 12 — wrong count (off-by-N)
- LOOKUP: 20 — wrong answer selected (typically selects earlier value, not updated one)
- PREVIOUS: 4 — "what was my previous X" returns current instead of prior
- Others: 6

**Single-Session-Assistant (29 failures)**
- LOOKUP: 18 — returns date instead of content, or wrong entity
- PREVIOUS: 3 — date confusion
- Others: 8

**Single-Session-User (25 failures)**
- LOOKUP: 14 — wrong fact selected
- COUNT: 5 — wrong count
- EVENT_DATE: 3 — format mismatch ("2023-02-14" vs "February 14th")
- Others: 3

**Single-Session-Preference (13 failures)**
- PREFERENCE: 7 — vocabulary gap between extraction and gold meta-description
- LOOKUP: 4 — preference question fell through to generic lookup
- Others: 2

## 6. Architecture Overview

```
Question (500)
  |
  v
[Rule-based Parser]
  |-- TEMPORAL_ORDER (65)  -- chronological sort + "A or B" comparison + relative dates
  |-- DATE_SPAN (32)       -- date arithmetic between two events
  |-- DATE_DIFF (19)       -- "how many days ago"
  |-- COUNT (153)           -- counting + SUM money/time
  |-- PREFERENCE (24)       -- rich builder (aggregated prefs + facts)
  |-- LATEST (21)           -- most recent value
  |-- PREVIOUS (12)         -- second-most recent
  |-- EVENT_DATE (5)        -- "when did I..."
  |-- EXISTS (0)            -- "did I ever..."
  |-- LIST (3)              -- "list all my..."
  |-- LOOKUP (165)           -- fuzzy fallback
  |
  v
[Structured Op Handler]  ───> answer if found
  |
  v (if null)
[Preference-Like Detector]  ───> rich preference builder
  |
  v (if null)  
[Embedding Scoring]  ───> EmbedderCrux (nomic-embed-text-v1.5)
  |                        cosine similarity as entity-group boost
  v
[Entity-Group Keyword Scoring]  ───> interrogative-aware answer selection
  |
  v
Deterministic Answer (no LLM)
```

## 7. Session 3 Progression

| Version | Accuracy | Key Change |
|---|---|---|
| Session 2 end (v0.3g) | 240/500 (48.0%) | Baseline |
| + Strategy A (question-aware extraction) | 244/500 est. | Better extraction focus |
| + Preference fix + eval punctuation | 252/500 est. | Rich builder, 0%→56.7% prefs |
| + DATE_SPAN + TEMPORAL_ORDER | 254/500 (50.8%) | New temporal ops |
| + Expanded temporal parser | 269/500 (53.8%) | Broader pattern matching |
| + Improved COUNT (SUM, entity counting) | **278/500 (55.6%)** | Money/time aggregation |

## 8. Comparison to Published Systems

| System | LME Accuracy | LLM at Query | Architecture |
|---|---|---|---|
| GPT-4 + RAG (baseline) | ~35% | Yes | Dense retrieval + generation |
| Hindsight (SOTA, 2024) | ~72% | Yes | Temporal indexing + generation |
| **CoreCrux Deterministic** | **55.6%** | **No** | Extraction + rule-based |
| Theoretical ceiling (hybrid) | ~70-80% est. | Partial | Deterministic + LLM fallback |

## 9. Recommendations for >60%

1. **Hybrid fallback** — Haiku at query time for the ~150 LOOKUP questions with low keyword score. Estimated +20-30 correct.
2. **Knowledge-update temporal awareness** — "What is my current X" needs to prefer the LATEST value, not any matching value. LATEST op accuracy is only 29%.
3. **Multi-session aggregation** — SUM handler works for explicit dollar amounts but many multi-session counts need entity deduplication across sessions.
4. **EVENT_DATE format normalization** — "2023-02-14" should also match "February 14th".
5. **Better extraction prompts** — 8 questions have no extraction at all; targeted re-extraction could help.

## 10. Key Files

- Pipeline: `AuditCrux/benchmarks/longmemeval/lib/deterministic-pipeline.ts`
- Runner: `AuditCrux/benchmarks/longmemeval/run-deterministic.ts`
- Results: `AuditCrux/benchmarks/longmemeval/results/deterministic-2026-04-04T18-28-11/`
- Caches: `AuditCrux/benchmarks/longmemeval/results/_deterministic_cache/` (500 files)
- Journal: `PlanCrux/docs/journal/2026-04-04-deterministic-pipeline-session3.md`
