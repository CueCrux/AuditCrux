permanent fix # LongMemEval Optimised F1 — Failure Audit Report

**Date:** 2026-03-29
**Run ID:** `lme-s-sonnet-4-6-F1-202603291148-898bc8`
**Benchmark:** LongMemEval_S (500 problems, ~48 sessions each, ~120K tokens/problem)
**Judge:** GPT-4o (gpt-4o-2024-08-06)
**Comparison baseline:** `lme-s-sonnet-4-6-F1-202603290118-d79887` (71.0%)

---

## System Configuration

### Embedding & Infrastructure
| Parameter | Value |
|-----------|-------|
| Embedding model | Nomic Embed v1.5 (768-dim) |
| Embedding provider | EmbedderCrux pool router (port 8079, CueCrux-Data-1) |
| GPU backend | RTX 4000 SFF Ada 20GB (CoreCrux-GPU-1, 10.80.0.2:8080) |
| Vector store | Qdrant (CueCrux-Data-1:6333) + Postgres pgvector |
| Database | Postgres 16 (pgvector, CueCrux-Data-1:5432) |
| VaultCrux build | SHA `73ebeb3` (deployed 2026-03-29 11:47 UTC) |

### DQP Configuration (all active)
| Feature | Setting | Detail |
|---------|---------|--------|
| Semantic chunking | `FEATURE_DQP_SEMANTIC_CHUNKING=true` | Sentence-boundary chunking via embedding similarity |
| Similarity threshold | 0.75 | Cosine sim below this = chunk break |
| Chunk max bytes | 3,800 | Hard cap per chunk |
| Context notation | Active (ingest-worker) | Title + date + topics prepended to embedding text |
| HyDE retrieval | `FEATURE_DQP_HYDE_RETRIEVAL=true` | 40/60 raw/hypothesis blend at query time |
| Top-K limit | 50 (MCP tools), API default 8 |

### Query-Side Optimisations (NEW in this run)
| Change | Detail |
|--------|--------|
| **Enhanced system prompt (M0)** | Question-type routing: aggregation decomposition, temporal date-awareness, knowledge-update recency preference, reformulation retry |
| **Lexical broadening (M1)** | When vector results < limit/2, merge FTS lexical results (was only on zero) |
| **Dynamic scoring profiles (M2)** | `balanced` (0.58/0.32/0.10), `recall` (0.45/0.40/0.15), `recency` (0.40/0.25/0.35) — selectable per query via `scoring_profile` param |

### Retrieval Scoring (default "balanced" profile)
```
score = vectorScore × 0.58 + lexicalScore × 0.32 + recency × 0.10
```

---

## Results Summary

### Accuracy by Question Type
| Type (N) | C0 | Baseline F1 | **Optimised F1** | Delta |
|----------|-----|-------------|-----------------|-------|
| **Overall (500)** | 8.4% | 71.0% | **74.8%** | **+3.8pp** |
| single-session-user (70) | 8.6% | 95.7% | 95.7% | 0 |
| single-session-assistant (56) | 21.4% | 94.6% | 94.6% | 0 |
| single-session-preference (30) | 0.0% | 80.0% | 73.3% | -6.7 |
| knowledge-update (78) | 7.7% | 75.6% | **83.3%** | **+7.7** |
| temporal-reasoning (133) | 4.5% | 57.1% | **59.4%** | **+2.3** |
| multi-session (133) | 9.0% | 57.1% | **66.2%** | **+9.1** |

### Cost & Performance
| Metric | Baseline F1 | Optimised F1 |
|--------|------------|-------------|
| Cost | $26.61 | $34.15 (+28%) |
| Duration | 1,274s | 1,836s (+44%) |
| Avg tool calls | 2.1 | 2.4 |

### Qwen 2.5-32B Local Baseline (for comparison)
| Metric | Value |
|--------|-------|
| Accuracy | 47.6% |
| Cost | $0.00 (local RTX 5090) |
| Duration | 16,125s (~4.5h) |

---

## Change Impact Analysis

### Movement Summary
| Category | Count |
|----------|-------|
| **Total failures** | **126** (was 145) |
| Fixed (was failing → now passing) | 43 |
| Regressed (was passing → now failing) | 24 |
| Persistent (still failing) | 102 |
| Net improvement | **+19 correct** |

### Fixes by Question Type (43 fixed)
| Type | Fixed | Primary mechanism |
|------|-------|------------------|
| multi-session | 23 | Decomposition + limit=30 + recall profile |
| temporal-reasoning | 10 | Date-awareness instructions |
| knowledge-update | 8 | Recency scoring profile |
| single-session-preference | 1 | Reformulation retry |
| single-session-user | 1 | Reformulation retry |

### Regressions by Question Type (24 regressed)
| Type | Regressed | Likely cause |
|------|-----------|-------------|
| multi-session | 11 | Over-decomposition: model now makes too many queries, sometimes confuses evidence from different queries |
| temporal-reasoning | 7 | Date-awareness instructions cause model to reject valid answers when it notices sessions are from 2023, not 2026 |
| single-session-preference | 3 | Longer prompt + decomposition strategy distracts from simple preference recall |
| knowledge-update | 2 | Recency bias over-corrects; prefers wrong recent mention |
| single-session-user | 1 | Noise |

---

## Root Cause Distribution (126 failures)

| Root Cause | Count | % | vs Baseline |
|-----------|-------|---|-------------|
| `retrieval_miss` | 55 | 43.7% | +4 (was 51) |
| `temporal_confusion` | 30 | 23.8% | -8 (was 38) |
| `cross_session_miss` | 24 | 19.0% | -13 (was 37) |
| `stale_knowledge` | 12 | 9.5% | -3 (was 15) |
| `wrong_retrieval_answer` | 5 | 4.0% | +1 (was 4) |

### Sub-Cause Breakdown

| Sub-Cause | Count | % | vs Baseline |
|-----------|-------|---|-------------|
| retrieval_miss:exhaustive_search_failed | 35 | 27.8% | +4 |
| temporal_confusion:relative_time_calculation | 20 | 15.9% | +2 |
| cross_session_miss:multi_doc_aggregation | 19 | 15.1% | -13 |
| retrieval_miss:relevant_chunk_not_returned | 16 | 12.7% | +4 |
| stale_knowledge:wrong_version_retrieved | 12 | 9.5% | 0 |
| temporal_confusion:event_ordering | 6 | 4.8% | -3 |
| wrong_retrieval_answer:unclassified | 5 | 4.0% | +1 |
| cross_session_miss:info_scattered | 5 | 4.0% | 0 |
| retrieval_miss:aggregation_needed | 4 | 3.2% | -4 |
| temporal_confusion:date_arithmetic | 3 | 2.4% | -5 |
| temporal_confusion:other | 1 | 0.8% | -2 |

---

## Root Cause Analysis & Remediation

### RC1: Retrieval Miss — Exhaustive Search Failed (35, +4 from baseline)

**Pattern:** Model issued 2-5 tool calls with different phrasings but still couldn't surface the relevant chunk. This is now the dominant failure mode (27.8% of all failures).

**Why it persists:** The enhanced prompt causes more aggressive searching (good), but the underlying vocabulary mismatch between queries and stored chunks is a retrieval-system limitation that prompt engineering alone cannot fix. Some failures are new regressions where the model's additional searches returned confusing or conflicting results.

**Remediation:**
1. **Proposition-level indexing (Tier 3 DQP)** — Extract atomic claims at ingest time. Each claim becomes its own mini-chunk, reducing the semantic gap between a question and its answer.
2. **Query expansion via LLM** — Before embedding, use the LLM to generate 3-4 query variants (not just rely on the answering model to reformulate).
3. **Semantic dedup at retrieval** — When the same doc appears in multiple searches with slightly different chunks, merge and rank rather than treating as separate hits.

### RC2: Temporal Confusion — Relative Time Calculation (20, +2)

**Pattern:** Model retrieves the correct event and its session date, but fails to compute the time difference correctly — OR the model now correctly identifies that sessions are from 2023 and rejects answers as "too old" when the benchmark expects answers relative to the session dates, not today's real date.

**Why it grew slightly:** The date-awareness instruction ("today is 2026-03-29") causes a new failure mode: the model sees sessions from May 2023 and says "I can't answer about 'last month' because these are from 3 years ago." This is technically correct from the model's perspective but wrong for the benchmark, which treats session dates as the reference frame.

**Remediation:**
1. **Inject question_date into system prompt** — LongMemEval provides a `question_date` per problem. Pass it as "the question was asked on {date}" so the model computes relative time from that date, not today.
2. **Date-diff tool** — Provide a calculator tool that accepts two dates and returns the difference, removing arithmetic errors.
3. **Session-date-relative framing** — Adjust the prompt to clarify that all sessions are the user's real history and temporal questions should be answered relative to the most recent session date.

### RC3: Cross-Session Miss — Multi-Doc Aggregation (19, -13)

**Pattern:** Still requires gathering facts from many sessions, but the decomposition strategy reduced this from 32 to 19 — a 41% reduction. Remaining failures are cases where even 3 queries with limit=30 don't cover all relevant sessions.

**Why 19 remain:** Some aggregation questions span 10+ sessions with varying vocabulary. The model's 3-query strategy captures most but not all. Also, some regressions where the model over-counts by including non-qualifying items.

**Remediation:**
1. **Exhaustive scan tool** — A dedicated "enumerate all X" tool that iterates through all chunks matching a broad filter, paginating through results.
2. **Living-state counters at ingest** — Maintain running tallies as living-state documents (e.g., "books read: 7, last updated session 42").
3. **Entity extraction at ingest** — Tag chunks with entity types (person, place, event, item) so aggregation queries can filter by entity type.

### RC4: Stale Knowledge — Wrong Version Retrieved (12, -3)

**Pattern:** A fact was updated across sessions but the model still retrieves and reports the older version. The recency scoring profile helps (8 fixed) but 12 persist.

**Why 12 remain:** The recency profile shifts weights but cannot prevent an older chunk from ranking higher when it has better lexical/vector match. Without explicit supersession markers, both old and new versions compete equally on content relevance.

**Remediation:**
1. **Supersession at ingest (P1)** — When a new session contradicts or updates a prior fact, mark the old chunk as superseded. Only current versions participate in retrieval.
2. **Contradiction detection** — At query time, when two retrieved chunks contradict, apply a "most recent wins" heuristic.
3. **Temporal metadata in chunk storage** — Store `source_timestamp` prominently and expose it in retrieval results so the model can always see which result is newer.

### RC5: Wrong Retrieval Answer (5, +1)

**Pattern:** Mostly preference questions where the model retrieves history but generates generic advice instead of grounding in specific past conversations.

**Remediation:**
1. **Prompt: always cite specific sessions** — Instruct the model to quote the session it's drawing from.
2. **Low priority** — Only 4% of failures.

---

## Regression Analysis (24 questions)

### Regression Category 1: Date-Awareness Over-Correction (7 temporal, 4 multi-session)

The model now sees "today is 2026-03-29" and notices sessions are from 2023. For questions like "how many dinner parties in the past month" it correctly notes the sessions are 3 years old and refuses to answer, when the benchmark expects it to answer relative to the session dates.

**Examples:**
- `60159905`: "how many dinner parties in the past month" → "sessions are from May 2023, well outside 'past month'"
- `7024f17c`: "how many hours of jogging last week" → "no records from the week of March 22-28, 2026"
- `9d25d4e0`: "how many pieces of jewelry in the last two months" → "today is March 29, 2026, conversations are from around May 2023"

**Fix:** Pass `question_date` from the dataset into the system prompt. This is a one-line change in `system-prompts.ts`.

### Regression Category 2: Over-Decomposition (6 multi-session)

The model now makes 4-6 tool calls for questions that previously needed only 1-2. The extra searches sometimes return conflicting information, leading to wrong counts or confused synthesis.

**Examples:**
- `d23cf73b`: "how many cuisines tried" → multiple queries returned overlapping results, counted 3 instead of correct answer
- `1a8a66a6`: "how many magazine subscriptions" → found partial list, missed some

**Fix:** Cap decomposition to 3 queries max. Add "stop searching once you have high-confidence evidence" instruction.

### Regression Category 3: Preference Over-Searching (3 single-session-preference)

The prompt's decomposition strategy causes the model to search aggressively for simple preference questions, then fail to find anything because preferences are implicit in conversation, not stated as facts.

**Examples:**
- `32260d93`: "recommend a show" → searched extensively, found nothing
- `57f827a0`: "tips for rearranging furniture" → searched, found unrelated results

**Fix:** Add "for recommendation/preference questions, one search is sufficient — draw on whatever you find" to the prompt.

---

## Detailed Failure Inventory


### retrieval_miss (55)

**9aaed6a3** | `multi-session` | `retrieval_miss:aggregation_needed` | 1tc (was 1) | PERSISTENT
- **Q:** How much cashback did I earn at SaveMart last Thursday?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any record in your conversation history of a specific SaveMart purchase or cashback amount from last Thursday (March 26, 2026). The results returned are about general cashback discussions (Walmart+, Ibotta, etc.) and don't include a SaveMart transaction with a specific cashback...

**e25c3b8d** | `multi-session` | `retrieval_miss:aggregation_needed` | 2tc (was 2) | PERSISTENT
- **Q:** How much did I save on the designer handbag at TK Maxx?
- **Gold:** 
- **Hypothesis:** The memory records show that you mentioned getting a designer handbag at TK Maxx for **$200**, but unfortunately there's no specific mention of the original retail price or the exact amount you saved. The conversations only reference the $200 purchase price as an example of a great deal you'd found...

**e56a43b9** | `multi-session` | `retrieval_miss:aggregation_needed` | 1tc (was 1) | PERSISTENT
- **Q:** How much discount will I get on my next purchase at FreshMart?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any information about a FreshMart discount in your conversation history. The search results returned unrelated content.  There are no records in your memory about a FreshMart discount or any associated promotion for your next purchase. It's possible this topic was never discuss...

**09ba9854_abs** | `multi-session` | `retrieval_miss:aggregation_needed` | 2tc (was 2) | PERSISTENT
- **Q:** How much will I save by taking the bus from the airport to my hotel instead of a taxi?
- **Gold:** 
- **Hypothesis:** I don't have a specific record of a conversation where you asked about bus vs. taxi costs for a particular trip you're planning. The results I found relate to general discussions about Tokyo airport transportation, but there's no specific saved conversation where you compared bus and taxi prices for...

**ce6d2d27** | `knowledge-update` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 3) | PERSISTENT
- **Q:** What day of the week do I take a cocktail-making class?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any information about a cocktail-making class in your conversation history. There's no record of you mentioning attending or scheduling a cocktail-making class, including what day of the week it takes place. Could you be thinking of a different activity, or is it possible this...

**28dc39ac** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 8tc (was 4) | PERSISTENT
- **Q:** How many hours have I spent playing games in total?
- **Gold:** 
- **Hypothesis:** Based on my thorough search of your conversation history, I found the following games you specifically mentioned **completing**, along with the hours you reported:  | Game | Hours Played | |------|-------------| | **The Last of Us Part II** (normal difficulty) | 25 hours | | **The Last of Us Part II...

**88432d0a** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 2) | PERSISTENT
- **Q:** How many times did I bake something in the past two weeks?
- **Gold:** 
- **Hypothesis:** The memory records found are all from sessions dated in **May 2023** — well outside the past two weeks (which would be March 15–29, 2026). None of the baking events mentioned fall within that timeframe.  Here's what was found in memory regarding baking, with their session dates: - **Sourdough bread*...

**gpt4_731e37d7** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 7tc (was 5) | PERSISTENT
- **Q:** How much total money did I spend on attending workshops in the last four months?
- **Gold:** 
- **Hypothesis:** Based on my thorough search across multiple queries, here's what I found regarding workshop costs mentioned in your conversations. However, I need to flag an important caveat about the timeframe:  The conversations found in memory are dated **February 2023**, which is over **3 years ago** — well out...

**10d9b85a** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 8tc (was 4) | PERSISTENT
- **Q:** How many days did I spend attending workshops, lectures, and conferences in April?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any records in your conversation history about attending workshops, lectures, or conferences in April. The memory searches returned no relevant results tracking such events or the number of days spent at them.  Could you clarify which **April** you're referring t...

**ef66a6e5** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 2) | PERSISTENT
- **Q:** How many sports have I played competitively in the past?
- **Gold:** 
- **Hypothesis:** Based on the search results, I can identify **3 sports** you mentioned playing competitively in the past:  1. **Tennis** – played competitively in **high school** 2. **Swimming** – swam competitively in **college** 3. **Soccer** – referenced alongside tennis and running as sports you actively play/t...

**92a0aa75** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 3) | PERSISTENT
- **Q:** How long have I been working in my current role?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any information in your conversation history about your current job role, job title, or when you started it. This detail doesn't appear to have been mentioned in any of your past conversations stored in memory.  Could you share more context about your role? Once you do, I'd be...

**61f8c8f8** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 2) | PERSISTENT
- **Q:** How much faster did I finish the 5K run compared to my previous year's time?
- **Gold:** 
- **Hypothesis:** I was only able to find your **previous year's 5K time of 45 minutes** in the memory records — this came up in a conversation from October 2023 where you mentioned, *"I've done a 5K run last year, but it took me 45 minutes to complete."*  However, I couldn't find any record of a **more recent 5K fin...

**c18a7dc8** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 8tc (was 4) | PERSISTENT
- **Q:** How many years older am I than when I graduated from college?
- **Gold:** 
- **Hypothesis:** I was able to find that you were **32 years old** in May 2023, but I could not find a specific mention of when you graduated from college (graduation year or age at graduation) anywhere in your conversation history.  Without knowing your college graduation year or the age at which you graduated, I'm...

**37f165cf** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 8tc (was 8) | PERSISTENT
- **Q:** What was the page count of the two novels I finished in January and March?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any records in your conversation history that specifically mention novels finished in **January** and **March** with their page counts.   The closest relevant information I found is from a session where you mentioned finishing a **416-page novel** (month not spec...

**f523d9fe** | `single-session-assistant` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 3) | PERSISTENT
- **Q:** I wanted to check back on our previous conversation about Netflix. I mentioned that I wanted to be able to access all seasons of old shows? Do you remember what show I used as an example, the one that
- **Gold:** 
- **Hypothesis:** Unfortunately, I'm not finding any records of that conversation in the memory system. It doesn't appear that the discussion about Netflix and accessing all seasons of old shows was saved or is retrievable.  Could you give me a bit more context, such as the genre of the show or any other details you...

**b759caee** | `single-session-assistant` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 2) | PERSISTENT
- **Q:** I was looking back at our previous conversation about buying unique engagement rings directly from designers. Can you remind me of the Instagram handle of the UK-based designer who works with unusual
- **Gold:** 
- **Hypothesis:** Unfortunately, I'm not able to find any record of that conversation in the memory system. There are no stored results related to engagement rings, UK-based designers, unusual gemstones, or Instagram handles from our previous discussions.  It's possible that the conversation wasn't saved to memory, o...

**gpt4_f49edff3** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 8tc (was 8) | PERSISTENT
- **Q:** Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a cust
- **Gold:** 
- **Hypothesis:** I'm sorry, but I was unable to find any records in your conversation history related to the three events you mentioned:  1. **Helping your friend prepare the nursery** 2. **Helping your cousin pick out stuff for her baby shower** 3. **Ordering a customized phone case for your friend's birthday**  Th...

**b46e15ed** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 6tc (was 17) | PERSISTENT
- **Q:** How many months have passed since I participated in two charity events in a row, on consecutive days?
- **Gold:** 
- **Hypothesis:** Now I have a thorough picture of all the charity events mentioned in your conversations. Let me check the key dates:  - **Charity gala** (Cancer Research Foundation): **January 30, 2023** - **24-Hour Bike Ride** charity event: **February 14, 2023** - **Walk for Hunger**: **March 19, 2023**  None of...

**gpt4_1916e0ea** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 5tc (was 4) | PERSISTENT
- **Q:** How many days passed between the day I cancelled my FarmFresh subscription and the day I did my online grocery shopping from Instacart?
- **Gold:** 
- **Hypothesis:** I'm not finding a specific Instacart shopping event in your memory. I can confirm that your **FarmFresh subscription cancellation** was mentioned in a session dated **January 5, 2023**, but I'm unable to find any record of you doing online grocery shopping via **Instacart** in your conversation hist...

**gpt4_468eb063** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 7) | PERSISTENT
- **Q:** How many days ago did I meet Emma?
- **Gold:** 
- **Hypothesis:** I found a relevant mention. In a session dated **April 11, 2023**, you mentioned: *"I met a freelance writer at a coffee shop near my office **last week**"* — meaning you met her approximately the week of April 4, 2023. However, the person you met is not explicitly named "Emma" in that passage.  The...

**gpt4_8e165409** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 6tc (was 4) | PERSISTENT
- **Q:** How many days passed between the day I repotted the previous spider plant and the day I gave my neighbor, Mrs. Johnson, a few cuttings from my spider plant?
- **Gold:** 
- **Hypothesis:** I was unable to find any records in your conversation history about repotting a spider plant or giving cuttings to a neighbor named Mrs. Johnson. These specific events do not appear to be stored in your memory system.  It's possible these conversations happened outside of what has been saved, or the...

**gpt4_68e94287** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 6tc (was 6) | PERSISTENT
- **Q:** Which event happened first, my participation in the #PlankChallenge or my post about vegan chili recipe?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I was unable to find any records in your conversation history related to either your participation in the **#PlankChallenge** or your **vegan chili recipe post**. These events don't appear to be stored in the memory system I have access to.  It's possible that these conversations happ...

**2ebe6c92** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 6) | PERSISTENT
- **Q:** Which book did I finish a week ago?
- **Gold:** 
- **Hypothesis:** I wasn't able to find a specific record of you mentioning finishing a book exactly one week ago. The memory records do show that you were **reading "The Song of Achilles" by Madeline Miller** — you mentioned being about halfway through it and hoping to finish it by the end of the month (as of late J...

**gpt4_d6585ce9** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 4) | PERSISTENT
- **Q:** Who did I go with to the music event last Saturday?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any specific record in your conversation history about who you went with to a music event last Saturday (March 22, 2026). The memory system does contain some references to music events you've attended — such as a music festival in Brooklyn with a group of friends and a Billie E...

**gpt4_1e4a8aec** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 3) | PERSISTENT
- **Q:** What gardening-related activity did I do two weeks ago?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any records in your conversation history about a gardening activity from two weeks ago (around March 15, 2026). The gardening-related conversations I found are from 2023 and involve topics like tomato plant care, pest control, and composting — but none are dated around two week...

**gpt4_59149c78** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 1) | PERSISTENT
- **Q:** I mentioned that I participated in an art-related event two weeks ago. Where was that event held at?
- **Gold:** 
- **Hypothesis:** I wasn't able to find a specific memory of you mentioning an art-related event that you participated in two weeks ago, along with its location. The search results returned conversations about museum visits and art exhibitions, but none that specifically reference an event described as happening "two...

**9a707b82** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 13) | PERSISTENT
- **Q:** I mentioned cooking something for my friend a couple of days ago. What was it?
- **Gold:** 
- **Hypothesis:** I wasn't able to find a specific memory of you mentioning cooking something for a friend a couple of days ago. The conversations in memory don't appear to contain that particular detail — the closest results relate to general meal prep, cooking for yourself, or dinner party planning, but nothing spe...

**6e984302** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 4) | PERSISTENT
- **Q:** I mentioned an investment for a competition four weeks ago? What did I buy?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any record in your conversation history of you mentioning an investment made for a competition around four weeks ago. The memory system doesn't appear to contain a conversation matching that description.  It's possible that: - The conversation wasn't saved to memory, or - The d...

**gpt4_68e94288** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 3) | PERSISTENT
- **Q:** What was the social media activity I participated 5 days ago?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any record of social media activity from 5 days ago (March 24, 2026) in your conversation history. The memory system does not contain any sessions or conversations from that date related to social media activity you personally participated in.  It's possible that...

**08f4fc43** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 5tc (was 4) | PERSISTENT
- **Q:** How many days had passed between the Sunday mass at St. Mary's Church and the Ash Wednesday service at the cathedral?
- **Gold:** 
- **Hypothesis:** I was able to find the **Ash Wednesday service at the cathedral**, which you mentioned took place on **February 1st**. However, I could not find any record in your memory of a **Sunday mass at St. Mary's Church** with a specific date attached.  Since the date of the St. Mary's Sunday mass is not rec...

**gpt4_93159ced** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 3) | PERSISTENT
- **Q:** How long have I been working before I started my current job at NovaTech?
- **Gold:** 
- **Hypothesis:** Based on the memory records, I can see what you shared, but the information available doesn't specify how long you worked **before** NovaTech. Here's what I found:  - You mentioned you've **been in the software engineering field since you graduated** with a Computer Science degree from UC Berkeley....

**e4e14d04** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 4) | PERSISTENT
- **Q:** How long had I been a member of 'Book Lovers Unite' when I attended the meetup?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any specific details in your conversation history about when you joined 'Book Lovers Unite' or the exact date of the meetup you attended. The records show you were active in the "Book Lovers Unite" Facebook group and were planning a book club discussion of *Gone...

**73d42213** | `multi-session` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | PERSISTENT
- **Q:** What time did I reach the clinic on Monday?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any specific record in your conversation history about the exact time you arrived at the clinic on Monday. The related conversations I found are about searching for and scheduling a clinic appointment, but none mention a specific arrival time on Monday.  Could you provide more...

**8cf4d046** | `multi-session` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 3) | PERSISTENT
- **Q:** What is the average GPA of my undergraduate and graduate studies?
- **Gold:** 
- **Hypothesis:** Based on the memory records, here's what I found:  - **Graduate GPA**: **3.8 / 4.0** — Master's degree in Data Science from the University of Illinois at Urbana-Champaign. - **Undergraduate GPA**: Your undergraduate studies at the University of Mumbai were completed with a **First-Class distinction*...

**8cf51dda** | `single-session-assistant` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | PERSISTENT
- **Q:** I'm going back to our previous conversation about the grant aim page on molecular subtypes and endometrial cancer. Can you remind me what were the three objectives we outlined for the project?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any record of a previous conversation about a grant aim page on molecular subtypes and endometrial cancer in your memory. The search results returned unrelated content.  It's possible that: - The conversation may not have been saved or stored in the memory system...

**0edc2aef** | `single-session-preference` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | PERSISTENT
- **Q:** Can you suggest a hotel for my upcoming trip to Miami?
- **Gold:** 
- **Hypothesis:** Unfortunately, I don't have any specific details stored about your upcoming Miami trip — such as your travel dates, budget, preferred neighborhood, or what kind of experience you're looking for. My past records show travel-related conversations, but none specifically about a Miami trip.  To give you...

**35a27287** | `single-session-preference` | `retrieval_miss:relevant_chunk_not_returned` | 1tc (was 2) | PERSISTENT
- **Q:** Can you recommend some interesting cultural events happening around me this weekend?
- **Gold:** 
- **Hypothesis:** I wasn't able to find your location stored in my memory. I don't have access to your current location or real-time event listings, so I'm unable to recommend specific cultural events happening near you this weekend.  Here's how you can find great local cultural events on your own:  1. **Eventbrite**...

**5d3d2817** | `single-session-user` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 3) | PERSISTENT
- **Q:** What was my previous occupation?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any information about your previous occupation in the memory system. Your conversation history doesn't appear to contain details where you shared what your former job or profession was.  Could you provide more context? If you've mentioned it in a past conversation, I can try a...

**dccbc061** | `single-session-user` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | PERSISTENT
- **Q:** What was my previous stance on spirituality?
- **Gold:** 
- **Hypothesis:** The memory records don't appear to contain a direct, personal statement from you about your own stance on spirituality — the results mostly show conversations where you were asking about topics like the Baha'i faith, synchronicities, and the difference between truth and belief, rather than expressin...

**71017277** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 3) | PERSISTENT
- **Q:** I received a piece of jewelry last Saturday from whom?
- **Gold:** 
- **Hypothesis:** I'm sorry, but I wasn't able to find any record in your conversation history about receiving a piece of jewelry last Saturday (March 22, 2026). This information doesn't appear to be stored in your memory. Could you provide more details, or is it possible this was discussed outside of our conversatio...

**gpt4_468eb064** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 1tc (was 1) | PERSISTENT
- **Q:** Who did I meet with during the lunch last Tuesday?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any record of a lunch meeting last Tuesday in your conversation history. The search results don't contain any relevant information about a lunch or meeting from that time.  It's possible this event wasn't discussed in any of your past conversations stored in the memory system....

**eac54add** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 4) | PERSISTENT
- **Q:** What was the significant buisiness milestone I mentioned four weeks ago?
- **Gold:** 
- **Hypothesis:** I wasn't able to find a record of you mentioning a significant business milestone around four weeks ago (approximately late February/early March 2026). The search results returned general business-related conversations, but nothing matching a personal milestone you shared.  It's possible this conver...

**gpt4_8279ba03** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 3) | PERSISTENT
- **Q:** What kitchen appliance did I buy 10 days ago?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any record in your conversation history of you purchasing a kitchen appliance around 10 days ago (around March 19, 2026). This information doesn't appear to be stored in my memory system.  It's possible this purchase was mentioned in a conversation that wasn't saved, or it may...

**d01c6aa8** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | PERSISTENT
- **Q:** How old was I when I moved to the United States?
- **Gold:** 
- **Hypothesis:** The memory records don't contain specific information about when you moved to the United States or your age at that time. The conversations found relate to your green card/EB-2 visa application process and mention that you had been living in the US for five years on a work visa (as of May 2023), but...

**3a704032** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 5tc (was 2) | **REGRESSED**
- **Q:** How many plants did I acquire in the last month?
- **Gold:** 
- **Hypothesis:** Based on the conversations in memory, I can identify the plants you explicitly mentioned acquiring. However, I should note that **these sessions are from 2023** — well outside the "last month" window relative to today (March 29, 2026). There are no records of plant acquisitions within the past month...

**7024f17c** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 3) | **REGRESSED**
- **Q:** How many hours of jogging and yoga did I do last week?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any specific records of you logging actual jogging or yoga hours from last week (the week of March 22–28, 2026). The memory results I found are from conversations back in May 2023, where you were discussing *planning* to start a fitness routine and yoga practice — not logging c...

**9d25d4e0** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 5tc (was 4) | **REGRESSED**
- **Q:** How many pieces of jewelry did I acquire in the last two months?
- **Gold:** 
- **Hypothesis:** I found the relevant conversations, but I need to note an important detail: **today is March 29, 2026**, and the conversations in memory are all from **May 2023** — well over two years ago. These are far outside the "last two months" window (January 29 – March 29, 2026).  That said, based on what wa...

**60159905** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 1) | **REGRESSED**
- **Q:** How many dinner parties have I attended in the past month?
- **Gold:** 
- **Hypothesis:** Based on my search results, the conversations found are from **May 2023** — which is nearly 3 years ago, well outside the "past month" window (i.e., since approximately February 28, 2026).  The dinner parties mentioned in those older sessions were: - **Sarah's place** (Italian feast) — referenced in...

**ba358f49** | `multi-session` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 3) | **REGRESSED**
- **Q:** How many years will I be when my friend Rachel gets married?
- **Gold:** 
- **Hypothesis:** I found that Rachel is getting married "next year" relative to the session date of **2022-09-01**, meaning her wedding is in **2023**. However, your specific age or birth year was never mentioned in any of the conversations — the AI in that session even noted *"Since you didn't mention your specific...

**gpt4_fa19884d** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 4tc (was 5) | **REGRESSED**
- **Q:** What is the artist that I started to listen to last Friday?
- **Gold:** 
- **Hypothesis:** I wasn't able to find a specific conversation from last Friday (March 27, 2026) about you starting to listen to a new artist. The memory records I found are from 2023 and don't contain a reference to that specific event.  It's possible that this conversation wasn't captured in the memory system, or...

**4dfccbf8** | `temporal-reasoning` | `retrieval_miss:exhaustive_search_failed` | 3tc (was 5) | **REGRESSED**
- **Q:** What did I do with Rachel on the Wednesday two months ago?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any record in your conversation history about an activity with Rachel on a Wednesday two months ago (around late January 2026). The memory system doesn't appear to contain a conversation referencing that specific event.  It's possible that this wasn't discussed in a session tha...

**gpt4_5501fe77** | `multi-session` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 1) | **REGRESSED**
- **Q:** Which social media platform did I gain the most followers on over the past month?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, **Twitter** was the platform where you gained the most followers over the past month. You specifically mentioned that your Twitter follower count **jumped from 420 to 540** — a gain of **120 followers** in one month.  For context, here's what was noted about your ot...

**32260d93** | `single-session-preference` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | **REGRESSED**
- **Q:** Can you recommend a show or movie for me to watch tonight?
- **Gold:** 
- **Hypothesis:** I wasn't able to find any specific information in your conversation history about your movie or TV show preferences, favorite genres, or what you've been watching lately.  To give you a great recommendation, it would help to know a little more about you! Could you tell me:  - 🎭 **What genres do you...

**57f827a0** | `single-session-preference` | `retrieval_miss:relevant_chunk_not_returned` | 1tc (was 2) | **REGRESSED**
- **Q:** I was thinking about rearranging the furniture in my bedroom this weekend. Any tips?
- **Gold:** 
- **Hypothesis:** I don't have any specific details from your past conversations about your bedroom layout, furniture, or preferences. The memory results returned some related home décor discussions, but nothing specific to your bedroom setup.  That said, here are some general tips for rearranging bedroom furniture:...

**gpt4_e414231f** | `temporal-reasoning` | `retrieval_miss:relevant_chunk_not_returned` | 2tc (was 2) | **REGRESSED**
- **Q:** Which bike did I fixed or serviced the past weekend?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you mentioned that you got your **mountain bike** fixed and it was running smoothly. This came up in a session where you also discussed taking your **road bike** in for a maintenance check (due to spongy brakes).  However, I don't have a specific record of a bike se...


### temporal_confusion (30)

**gpt4_4929293b** | `temporal-reasoning` | `temporal_confusion:date_arithmetic` | 2tc (was 2) | PERSISTENT
- **Q:** What was the the life event of one of my relatives that I participated in a week ago?
- **Gold:** 
- **Hypothesis:** Based on the memory records, the life event you participated in a week ago (relative to your session dated **April 15, 2023**) was your **niece's kindergarten graduation ceremony**. Your sister also held a small reception afterwards with cupcakes and juice boxes for the kids, and you got to spend ti...

**0bc8ad93** | `temporal-reasoning` | `temporal_confusion:date_arithmetic` | 1tc (was 1) | PERSISTENT
- **Q:** I mentioned visiting a museum two months ago. Did I visit with a friend or not?
- **Gold:** 
- **Hypothesis:** Yes! You mentioned visiting the **Science Museum** for a **behind-the-scenes tour**, and you went **with a friend** — specifically, a friend who is a **chemistry professor**. You described having a great time exploring the museum's collection of rare minerals and participating in a hands-on experime...

**993da5e2** | `temporal-reasoning` | `temporal_confusion:date_arithmetic` | 4tc (was 2) | PERSISTENT
- **Q:** How long had I been using the new area rug when I rearranged my living room furniture?
- **Gold:** 
- **Hypothesis:** I found the key information. In one session (dated 2023-05-26, Session answer_54f0d6f9_1), you mentioned: *"I recently got a new area rug for my living room **a month ago**."*  Then in a later session (also dated 2023-05-26, Session answer_54f0d6f9_2), you mentioned: *"I recently rearranged the furn...

**gpt4_7abb270c** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 5tc (was 14) | PERSISTENT
- **Q:** What is the order of the six museums I visited from earliest to latest?
- **Gold:** 
- **Hypothesis:** I now have enough information to compile the full list. Let me piece together all the museums you actually visited (not just recommended ones), with their dates:  1. **Science Museum** – "Space Exploration" exhibition (with colleague David) → Session date: **January 15, 2023** 2. **Modern Art Galler...

**gpt4_45189cb4** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 5tc (was 4) | PERSISTENT
- **Q:** What is the order of the sports events I watched in January?
- **Gold:** 
- **Hypothesis:** Based on the memory records, here is the chronological order of the sports events you watched in January:  1. **January 5** — **Lakers vs. Chicago Bulls (NBA game)** at the Staples Center in LA, which you attended in person with your coworkers.  2. **January 14** — **College Football National Champi...

**gpt4_f420262c** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 4tc (was 2) | PERSISTENT
- **Q:** What is the order of airlines I flew with from earliest to latest before today?
- **Gold:** 
- **Hypothesis:** Now I have a clear picture. Let me compile the flights you actually took, with their session dates:  Here is the chronological order of airlines you flew with, from earliest to latest:  1. **American Airlines** — New York (JFK) to Los Angeles (LAX) — mentioned as a past flight in sessions dating bac...

**a3838d2b** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 4tc (was 4) | PERSISTENT
- **Q:** How many charity events did I participate in before the 'Run for the Cure' event?
- **Gold:** 
- **Hypothesis:** Based on my research, I can now piece together the charity events you participated in. The "Run for the Cure" took place on **October 15th**. Here are the events I found that occurred **before** it:  1. **"Food for Thought" charity gala** – volunteered on **September 25th**  That's the only charity...

**gpt4_f420262d** | `temporal-reasoning` | `temporal_confusion:other` | 2tc (was 1) | PERSISTENT
- **Q:** What was the airline that I flied with on Valentine's day?
- **Gold:** 
- **Hypothesis:** Based on the memory records, on **Valentine's Day (February 14, 2023)**, you flew with **JetBlue** — specifically on flight **B6 1018** from Boston Logan (BOS) to Fort Lauderdale (FLL), departing at 7:00 AM and arriving at 10:35 AM.

**71017276** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many weeks ago did I meet up with my aunt and receive the crystal chandelier?
- **Gold:** 
- **Hypothesis:** I found the relevant session. According to the memory, you mentioned receiving the crystal chandelier from your aunt on **2023-03-04** (the session date, and you said "today" in that conversation).  Let me calculate how long ago that was from today (2026-03-29):  - From **March 4, 2023** to **March...

**0bc8ad92** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 1) | PERSISTENT
- **Q:** How many months have passed since I last visited a museum with a friend?
- **Gold:** 
- **Hypothesis:** The most recent record of you visiting a museum with a friend is from the session dated **October 22, 2022**, when you went on a behind-the-scenes tour of the **Science Museum** with a friend who is a chemistry professor. You explored a collection of rare minerals and participated in a hands-on expe...

**af082822** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many weeks ago did I attend the friends and family sale at Nordstrom?
- **Gold:** 
- **Hypothesis:** I found the relevant information. In that session (dated **2022-11-18**), you mentioned that *"yesterday"* you attended the friends and family sale at Nordstrom. That means the sale took place on **November 17, 2022**.  Now let me calculate how long ago that was from today (March 29, 2026):  - From...

**gpt4_b5700ca9** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I attend the Maundy Thursday service at the Episcopal Church?
- **Gold:** 
- **Hypothesis:** The session where you mentioned attending the Maundy Thursday service at the Episcopal Church is dated **April 6, 2023**. You said: *"I'm glad I got to attend the Maundy Thursday service at the Episcopal Church today."*  From April 6, 2023 to today, March 29, 2026, is **1,087 days ago**.

**gpt4_e072b769** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many weeks ago did I start using the cashback app 'Ibotta'?
- **Gold:** 
- **Hypothesis:** The memory shows that on **2023-04-16**, you mentioned: *"I've just downloaded Ibotta, a cashback app that gives you rebates on certain grocery items."*  Now let me calculate how many weeks ago that was from today (2026-03-29):  - From **2023-04-16** to **2026-03-29**:   - 2023-04-16 → 2026-04-16 =...

**9a707b81** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 1) | PERSISTENT
- **Q:** How many days ago did I attend a baking class at a local culinary school when I made my friend's birthday cake?
- **Gold:** 
- **Hypothesis:** I found the relevant information! Here's what the memory shows:  - In a session dated **2022-03-21**, you mentioned: *"I've been obsessed with strawberries lately, especially after that amazing baking class I took at a local culinary school **yesterday**."* — meaning the baking class took place on *...

**gpt4_8279ba02** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I buy a smoker?
- **Gold:** 
- **Hypothesis:** Based on the memory records, you mentioned **"I just got a smoker today"** during a conversation session dated **March 15, 2023**.  From today's date (March 29, 2026), that was **1,110 days ago**.

**gpt4_6dc9b45b** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 2) | PERSISTENT
- **Q:** How many months ago did I attend the Seattle International Film Festival?
- **Gold:** 
- **Hypothesis:** The memory records confirm you mentioned attending SIFF (Seattle International Film Festival), but the session timestamp is **June 1, 2021**. The conversations reference you attending SIFF and having a great time there, with no more specific date mentioned beyond that session.  From today's date (Ma...

**370a8ff4** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 2) | PERSISTENT
- **Q:** How many weeks had passed since I recovered from the flu when I went on my 10th jog outdoors?
- **Gold:** 
- **Hypothesis:** I found both events clearly. Here's the breakdown:  - **Flu recovery date:** January 19, 2023 - **10th outdoor jog date:** April 10, 2023  **Calculating the difference:** - From January 19 to April 10, 2023 = **81 days** - 81 ÷ 7 = **11.57 weeks**, or approximately **11 weeks and 4 days**  So roughl...

**8077ef71** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I attend a networking event?
- **Gold:** 
- **Hypothesis:** I found the relevant record. On **2022-03-09**, you mentioned you had just returned from a networking event that ran from 6 PM to 8 PM that day.  From today's date (2026-03-29) back to 2022-03-09, that is **1,481 days ago**.

**bcbe585f** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many weeks ago did I attend a bird watching workshop at the local Audubon society?
- **Gold:** 
- **Hypothesis:** The session records show that you attended the bird watching workshop at the local Audubon society on **April 1, 2023** (you mentioned it was "today" during that conversation).  Here's the time calculation: - **Workshop date:** April 1, 2023 - **Today's date:** March 29, 2026 - **Total days:** appro...

**5e1b23de** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 2) | PERSISTENT
- **Q:** How many months ago did I attend the photography workshop?
- **Gold:** 
- **Hypothesis:** I found the relevant information. You mentioned attending a **3-day photography workshop in a nearby city** in a session dated **2023-11-01**.  Here's the calculation: - Workshop date: **November 1, 2023** - Today: **March 29, 2026**  That's approximately **29 months ago** (from November 2023 to Mar...

**gpt4_7ddcf75f** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I go on a whitewater rafting trip in the Oregon mountains?
- **Gold:** 
- **Hypothesis:** Your whitewater rafting trip in the Oregon mountains took place on **June 17, 2023**. From today's date of March 29, 2026, that was **1,015 days ago**.

**gpt4_af6db32f** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 3tc (was 2) | PERSISTENT
- **Q:** How many days ago did I watch the Super Bowl?
- **Gold:** 
- **Hypothesis:** I found the relevant session. In a conversation dated **February 12, 2023**, you mentioned watching the Super Bowl that day at a friend's house ("we watched the Super Bowl today").  From **February 12, 2023** to today, **March 29, 2026**: - That's approximately **1,141 days** ago.  You watched the S...

**gpt4_85da3956** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many weeks ago did I attend the 'Summer Nights' festival at Universal Studios Hollywood?
- **Gold:** 
- **Hypothesis:** The session is dated **2023-07-15**, and in that conversation you mentioned you had **just got back** from the "Summer Nights" festival at Universal Studios Hollywood.  Now let me calculate how many weeks ago that was from today (2026-03-29):  - From **2023-07-15** to **2026-03-29**:   - That's appr...

**gpt4_a2d1d1f6** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I harvest my first batch of fresh herbs from the herb garden kit?
- **Gold:** 
- **Hypothesis:** I found the relevant session. You mentioned harvesting your first batch of fresh herbs from the herb garden kit on **April 15, 2023** (the session timestamp is 2023-04-15, and you said "I just harvested my first batch of fresh herbs from the herb garden kit **today**").  From April 15, 2023 to today...

**gpt4_b0863698** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 2) | PERSISTENT
- **Q:** How many days ago did I participate in the 5K charity run?
- **Gold:** 
- **Hypothesis:** I found it! According to your conversation history, you mentioned doing a **5K charity run on March 19, 2023**, finishing in 27 minutes and 12 seconds.  From today's date (March 29, 2026) back to March 19, 2023, that is approximately **1,106 days ago**.

**gpt4_7bc6cf22** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days ago did I read the March 15th issue of The New Yorker?
- **Gold:** 
- **Hypothesis:** I found the relevant session. You mentioned reading the March 15th issue of The New Yorker on **March 20, 2023** (the session timestamp is 2023-03-20), stating *"I finally got around to reading the March 15th issue of The New Yorker today."*  From that date to today (March 29, 2026):  - March 20, 20...

**gpt4_483dd43c** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 2tc (was 2) | **REGRESSED**
- **Q:** Which show did I start watching first, 'The Crown' or 'Game of Thrones'?
- **Gold:** 
- **Hypothesis:** Now I need to determine the timing of when each show was started. From the memory results:  - **Game of Thrones**: In a session dated **2023-05-29 at 04:31**, you mentioned you "finally started it about a month ago" — meaning you began watching it around **late April 2023**. - **The Crown**: In a se...

**gpt4_1a1dc16d** | `temporal-reasoning` | `temporal_confusion:event_ordering` | 2tc (was 2) | **REGRESSED**
- **Q:** Which event happened first, the meeting with Rachel or the pride parade?
- **Gold:** 
- **Hypothesis:** The **pride parade** happened first.  - **Pride parade**: attended on **May 1st**, mentioned in a session timestamped **2023-05-09 at 12:07**. - **Meeting with Rachel**: discussed in a session timestamped **2023-05-09 at 07:55**, but this session was about *preparing* for the upcoming meeting with R...

**6e984301** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 2) | **REGRESSED**
- **Q:** How many weeks have I been taking sculpting classes when I invested in my own set of sculpting tools?
- **Gold:** 
- **Hypothesis:** Here's what I found from your conversation history:  - **Sculpting classes started:** On **February 11, 2023** — you mentioned it was your very first day of classes. - **Sculpting tools purchased:** On **March 4, 2023** — you mentioned getting your own set of sculpting tools (a modeling tool set, a...

**982b5123** | `temporal-reasoning` | `temporal_confusion:relative_time_calculation` | 2tc (was 2) | **REGRESSED**
- **Q:** How many months ago did I book the Airbnb in San Francisco?
- **Gold:** 
- **Hypothesis:** The memory records don't contain a specific instance of you *booking* an Airbnb in San Francisco with a clear booking date. What I did find is a session from **May 21, 2023**, where you mentioned having previously stayed in an Airbnb in **Haight-Ashbury, San Francisco** for your best friend's weddin...


### cross_session_miss (24)

**a11281a2** | `multi-session` | `cross_session_miss:info_scattered` | 2tc (was 1) | PERSISTENT
- **Q:** What was the approximate increase in Instagram followers I experienced in two weeks?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you mentioned that after **two weeks of posting regularly**, you gained approximately **350 followers** on Instagram. That was noted as a great start to your growth journey!

**e6041065** | `multi-session` | `cross_session_miss:info_scattered` | 1tc (was 1) | PERSISTENT
- **Q:** What percentage of packed shoes did I wear on my last trip?
- **Gold:** 
- **Hypothesis:** Based on the memory results, I found the relevant information. You mentioned that on your last trip, you **packed a lot of shoes but only ended up wearing two** — your **sneakers and sandals**.  However, the exact total number of shoes you packed wasn't specified — only that it was "a lot." Without...

**a1cc6108** | `multi-session` | `cross_session_miss:info_scattered` | 4tc (was 2) | PERSISTENT
- **Q:** How old was I when Alex was born?
- **Gold:** 
- **Hypothesis:** I'm not finding any information about an "Alex" being born (as a child). The Alex in your conversations appears to be a 21-year-old intern you were mentoring, not a newborn. There's no record in your conversation history of someone named Alex being born or of your age at that time.  Could you clarif...

**a96c20ee** | `multi-session` | `cross_session_miss:info_scattered` | 4tc (was 5) | PERSISTENT
- **Q:** At which university did I present a poster on my thesis research?
- **Gold:** 
- **Hypothesis:** Based on the memory records, I can see that you mentioned attending a research conference at **Harvard University**, where you saw interesting projects on AI in education. However, the records specifically mention attending a conference there — not explicitly presenting a poster on your thesis.  The...

**0a995998** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 2) | PERSISTENT
- **Q:** How many items of clothing do I need to pick up or return from a store?
- **Gold:** 
- **Hypothesis:** Based on the memory results, I can identify **2 clothing items** you need to pick up or return from a store:  1. **Pick up** – A new pair of boots from **Zara** (you exchanged the original pair you got on February 5th for a larger size, but hadn't picked up the new pair yet). 2. **Pick up** – Your *...

**gpt4_59c863d7** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 5tc (was 2) | PERSISTENT
- **Q:** How many model kits have I worked on or bought?
- **Gold:** 
- **Hypothesis:** Based on my search through your conversation history, I can identify the following model kits you've mentioned:  **Completed/Worked On:** 1. **Revell F-15 Eagle** – picked up on a whim at a hobby store in late April, described as finished 2. **Tamiya 1/48 scale Spitfire Mk.V** – recently finished (m...

**aae3761f** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 3) | PERSISTENT
- **Q:** How many hours in total did I spend driving to my three road trip destinations combined?
- **Gold:** 
- **Hypothesis:** I now have enough information to answer. From your conversations, three road trip destinations were mentioned with specific driving times you personally noted:  1. **Outer Banks, North Carolina** — **4 hours** (you mentioned this yourself: *"my recent trip to Outer Banks in North Carolina - it only...

**c4a1ceb8** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 2) | PERSISTENT
- **Q:** How many different types of citrus fruits have I used in my cocktail recipes?
- **Gold:** 
- **Hypothesis:** Based on my thorough search across your cocktail recipe conversations, I can identify the following distinct types of citrus fruits that appeared in your cocktail recipes and discussions:  1. **Lemon** – used in Whiskey Sour recipes, Cava Cocktail, Citrus-Herb Collins, Tinto de Verano, and more 2. *...

**gpt4_7fce9456** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 5) | PERSISTENT
- **Q:** How many properties did I view before making an offer on the townhouse in the Brookside neighborhood?
- **Gold:** 
- **Hypothesis:** Based on my thorough search of your conversation history, here is what I found about the properties you viewed during your house hunt before making an offer on the Brookside townhouse:  1. **Cedar Creek property** – viewed around **February 1st** (was out of budget) 2. **1-bedroom condo (downtown ar...

**gpt4_31ff4165** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 5tc (was 4) | PERSISTENT
- **Q:** How many health-related devices do I use in a day?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, I can identify **3 health-related devices** you use in a day:  1. **Fitbit Versa 3** – You wear it non-stop and use it daily for activity tracking (steps), sleep pattern monitoring, guided breathing sessions, and setting reminders. 2. **Phonak BTE (Behind-the-Ear) H...

**gpt4_194be4b3** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 6tc (was 4) | PERSISTENT
- **Q:** How many musical instruments do I currently own?
- **Gold:** 
- **Hypothesis:** Based on my research across your conversation history, here's what I found regarding the instruments you own or were considering:  **Confirmed instruments you own:** 1. **Guitar** – you mentioned you've been playing guitar for a while 2. **Korg B1 digital piano** – owned for about 3 years (as of the...

**d851d5ba** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 6tc (was 3) | PERSISTENT
- **Q:** How much money did I raise for charity in total?
- **Gold:** 
- **Hypothesis:** Based on my search through your conversation history, the only specific amount mentioned is from one of your past conversations where you stated:  > *"I've had some experience with fundraising in the past, like when I helped raise **over $1,000** for the local children's hospital at a charity bake s...

**gpt4_ab202e7f** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 5tc (was 2) | PERSISTENT
- **Q:** How many kitchen items did I replace or fix?
- **Gold:** 
- **Hypothesis:** Based on my search across your conversations, I found **4 kitchen items** that you replaced or fixed:  1. **Kitchen faucet** — Replaced your old one with a new Moen touchless sensor faucet (mentioned May 28, 2023). 2. **Toaster → Toaster oven** — Got rid of the old toaster and replaced it with a toa...

**2b8f3739** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 5tc (was 2) | PERSISTENT
- **Q:** What is the total amount of money I earned from selling my products at the markets?
- **Gold:** 
- **Hypothesis:** Based on my searches, I found two market sales recorded in your conversations:  | Date | Market | Product | Amount Earned | |------|--------|---------|--------------| | May 15th | Farmers' Market | 12 bunches of fresh organic herbs | $120 | | May 29th | Homemade and Handmade Market | 15 jars of home...

**bf659f65** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 5tc (was 2) | PERSISTENT
- **Q:** How many music albums or EPs have I purchased or downloaded?
- **Gold:** 
- **Hypothesis:** Based on my thorough search across your conversation history, I found only **2** specific music albums/EPs mentioned as personally purchased or downloaded by you:  1. **Billie Eilish – *Happier Than Ever*** — downloaded on Spotify (mentioned in a session from May 2023) 2. **The Whiskey Wanderers – *...

**81507db6** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 3) | PERSISTENT
- **Q:** How many graduation ceremonies have I attended in the past three months?
- **Gold:** 
- **Hypothesis:** Based on my search through your conversation history, I can identify the graduation ceremonies mentioned, but I need to flag an important caveat about timing.  All the relevant sessions are dated **July 21, 2023** — which is well over **2 years ago**, far outside the past three months (roughly Janua...

**9ee3ecd6** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 1tc (was 1) | PERSISTENT
- **Q:** How many points do I need to earn to redeem a free skincare product at Sephora?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you mentioned that you need a total of **300 points** to redeem a free skincare product at Sephora through their Beauty Insider loyalty program. At the time of those conversations, you had already accumulated 200 points and were close to reaching that 300-point goal...

**bb7c3b45** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 1tc (was 1) | PERSISTENT
- **Q:** How much did I save on the Jimmy Choo heels?
- **Gold:** 
- **Hypothesis:** Based on your conversation history, you purchased Jimmy Choo heels at an **outlet mall for $200**. The assistant at the time noted it was "a steal," but the original retail price wasn't mentioned in your conversation — only the $200 outlet price you paid.  Unfortunately, there's no record of the ori...

**a08a253f** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 1tc (was 1) | PERSISTENT
- **Q:** How many days a week do I attend fitness classes?
- **Gold:** 
- **Hypothesis:** You attend fitness classes **3 days a week**:  - **Tuesdays** – Zumba class at 6:30 PM - **Thursdays** – Zumba class at 6:30 PM - **Saturdays** – Weightlifting class at 10:00 AM

**gpt4_d12ceb0e** | `multi-session` | `cross_session_miss:info_scattered` | 3tc (was 3) | **REGRESSED**
- **Q:** What is the average age of me, my parents, and my grandparents?
- **Gold:** 
- **Hypothesis:** Here's what I found from your past conversations. Note that the ages mentioned were as of those sessions (around May 2023), so I'll account for the time elapsed to today (March 29, 2026 — roughly 3 years later).  ---  **Ages as mentioned in conversations (May 2023):** - **You:** 32 (turned 32 on Feb...

**d23cf73b** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 6tc (was 4) | **REGRESSED**
- **Q:** How many different cuisines have I learned to cook or tried out in the past few months?
- **Gold:** 
- **Hypothesis:** Based on my thorough search of your conversation history, here's what I found across your sessions from around May 2023:  You explored **3 distinct cuisines** through cooking classes, workshops, and personal experimentation:  1. **Ethiopian** – You tried out a new Ethiopian restaurant and then cooke...

**1a8a66a6** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 4tc (was 1) | **REGRESSED**
- **Q:** How many magazine subscriptions do I currently have?
- **Gold:** 
- **Hypothesis:** Based on the search results, I can identify the following magazine subscriptions mentioned in your conversations:  1. **The New Yorker** – subscribed in early February (still active and enjoying it) 2. **The New York Times** (print edition) – mentioned as an active subscription 3. **Architectural Di...

**gpt4_372c3eed** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 2tc (was 2) | **REGRESSED**
- **Q:** How many years in total did I spend in formal education from high school to the completion of my Bachelor's degree?
- **Gold:** 
- **Hypothesis:** Based on the memory records, I have all the information needed to answer your question:  - **High school:** You attended **Arcadia High School from 2010 to 2014** — that's **4 years**. - **Bachelor's degree:** You graduated with a **Bachelor's in Computer Science from UCLA in 2020**, which you state...

**09ba9854** | `multi-session` | `cross_session_miss:multi_doc_aggregation` | 2tc (was 2) | **REGRESSED**
- **Q:** How much will I save by taking the train from the airport to my hotel instead of a taxi?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you discussed this exact topic! You mentioned being told that a **taxi from the airport to your hotel would cost around $60**.  The train (such as the Narita Express or Keisei Skyliner) to your hotel area in Tokyo was estimated at around **$20–$30**.  That means you...


### stale_knowledge (12)

**830ce83f** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** Where did Rachel move to after her recent relocation?
- **Gold:** 
- **Hypothesis:** Based on the memory results, Rachel recently moved to a new apartment in **Chicago**. The conversations reference visiting Rachel in Chicago and discuss various Chicago neighborhoods to stay in when visiting her.

**852ce960** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** What was the amount I was pre-approved for when I got my mortgage from Wells Fargo?
- **Gold:** 
- **Hypothesis:** You were pre-approved for **$350,000** from Wells Fargo. This was in the context of purchasing a $325,000 home.

**2698e78f** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 2tc (was 2) | PERSISTENT
- **Q:** How often do I see my therapist, Dr. Smith?
- **Gold:** 
- **Hypothesis:** You see Dr. Smith **every two weeks (bi-weekly)**. You mentioned this directly in a past conversation, saying: *"I have a therapy session with Dr. Smith coming up soon - it's every two weeks, so I'm looking forward to discussing my progress with her."*

**41698283** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 2tc (was 3) | PERSISTENT
- **Q:** What type of camera lens did I purchase most recently?
- **Gold:** 
- **Hypothesis:** Based on your conversation history, the most recent lens purchase mentioned was a **Canon EF lens** (used for portrait and general photography), which you mentioned in a session from May 2023. You noted you were "really loving the bokeh and image stabilization" from it.  Prior to that, in a later se...

**0e4e4c46** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** What is my current highest score in Ticket to Ride?
- **Gold:** 
- **Hypothesis:** Your current highest score in Ticket to Ride is **124 points**. You mentioned this in a conversation from May 23, 2023, where you said you'd been "crushing it in Ticket to Ride lately" with a highest score of 124 points and were eager to keep improving!

**e66b632c** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** What was my previous personal best time for the charity 5K run?
- **Gold:** 
- **Hypothesis:** Your previous personal best time for the charity 5K run was **26 minutes and 30 seconds**. You then mentioned that in a more recent charity 5K, you beat that record by shaving off about a minute and a half, bringing your new personal best to approximately **25 minutes**.

**a2f3aa27** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** How many followers do I have on Instagram now?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, the most recent mention of your Instagram follower count was from a session on **May 25, 2023**, where you mentioned you were **close to 1,300 followers** (up from 1,250 earlier that same day).  That said, this information is from back in 2023, so your actual curren...

**3ba21379** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** What type of vehicle model am I currently working on?
- **Gold:** 
- **Hypothesis:** You are currently working on a **Ford Mustang Shelby GT350R** scale model. Your conversations have covered various detailing aspects of the build, including realistic seatbelts, a dashboard, wheels with metallic finishes, and an engine and transmission.

**dad224aa** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | PERSISTENT
- **Q:** What time do I wake up on Saturday mornings?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you mentioned that you wake up at **8:30 am on Saturday mornings**. This was confirmed when you noted your existing Saturday morning routine and used it as a reference point for planning your Sunday schedule as well.  You had also expressed a goal of waking up at **...

**031748ae_abs** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 2tc (was 1) | PERSISTENT
- **Q:** How many engineers do I lead when I just started my new role as Software Engineer Manager?
- **Gold:** 
- **Hypothesis:** When you first started your new role, you mentioned leading a team of **4 engineers**. This was noted in an earlier session where you clarified: *"I lead a team of 4 engineers in my new role as Senior Software Engineer."*  (Note: In a later session, the number had grown to 5 engineers, suggesting yo...

**18bc8abd** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 1tc (was 1) | **REGRESSED**
- **Q:** What brand of BBQ sauce am I currently obsessed with?
- **Gold:** 
- **Hypothesis:** Your current BBQ sauce obsession is **Sweet Baby Ray's**! It came up in your conversations as your go-to sauce, which you mentioned stocking up on to serve with ribs.

**69fee5aa** | `knowledge-update` | `stale_knowledge:wrong_version_retrieved` | 4tc (was 2) | **REGRESSED**
- **Q:** How many pre-1920 American coins do I have in my collection?
- **Gold:** 
- **Hypothesis:** You have **37** pre-1920 American coins in your collection. You mentioned this yourself in a past conversation (May 27, 2023), stating: *"I have a total of 37 coins in that collection, and I think it would be cool to see them all displayed together."* You were also planning to organize them by denom...


### wrong_retrieval_answer (5)

**75832dbd** | `single-session-preference` | `wrong_retrieval_answer:unclassified` | 4tc (was 4) | PERSISTENT
- **Q:** Can you recommend some recent publications or conferences that I might find interesting?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, I can see you have interests spanning two distinct areas. Here are tailored recommendations for each:  ---  ### 🧠 For Your Interest in Neuroscience & Brain-Computer Interfaces (BCIs)  Based on your research into **functional neural interfaces, nanotransducers, and B...

**09d032c9** | `single-session-preference` | `wrong_retrieval_answer:unclassified` | 2tc (was 2) | PERSISTENT
- **Q:** I've been having trouble with the battery life on my phone lately. Any tips?
- **Gold:** 
- **Hypothesis:** I didn't find any previous conversations specifically about your phone's battery life issues. However, I can absolutely offer you some helpful general tips! Here are some proven ways to improve phone battery life:  ---  ### 🔋 Tips to Improve Phone Battery Life  **Screen & Display** - **Lower screen...

**d24813b1** | `single-session-preference` | `wrong_retrieval_answer:unclassified` | 2tc (was 2) | PERSISTENT
- **Q:** I'm thinking of inviting my colleagues over for a small gathering. Any tips on what to bake?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, I can see you have some great baking experience to draw from! Here are some personalized tips for your colleague gathering:  ### 🍪 Baked Goods You've Already Explored Your memory shows you've worked on several recipes that would be **perfect for a group setting**:...

**1c0ddc50** | `single-session-preference` | `wrong_retrieval_answer:unclassified` | 2tc (was 2) | **REGRESSED**
- **Q:** Can you suggest some activities I can do during my commute to work?
- **Gold:** 
- **Hypothesis:** Great news — I found some relevant context from your past conversations! Based on your history, I can see that you've been commuting by **bike** and were previously taking the **bus**, and you mentioned enjoying podcasts (like *How I Built This*) during your rides. Here are some tailored activity su...

**15745da0** | `single-session-user` | `wrong_retrieval_answer:unclassified` | 2tc (was 1) | **REGRESSED**
- **Q:** How long have I been collecting vintage cameras?
- **Gold:** 
- **Hypothesis:** Based on your past conversations, you mentioned in a session dated **May 21, 2023** that you had *"been collecting vintage cameras for three months."*  That session was about **2 years and 10 months ago** from today (March 29, 2026), meaning you've now been collecting for roughly **3 years** in tota...


---

## Remediation Priority Matrix

| Priority | Issue | Impact | Effort | Re-ingest? |
|----------|-------|--------|--------|-----------|
| **P0** | Pass `question_date` to system prompt | +11 (regression fix) | Trivial | No |
| **P0** | Cap decomposition, soften preference search | +6 (regression fix) | Low | No |
| **P1** | Proposition-level indexing (Tier 3 DQP) | ~35 retrieval misses | High | **Yes** |
| **P1** | Supersession / living-state mechanism | ~12 stale knowledge | High | **Yes** |
| **P1** | Date-diff tool + session-relative framing | ~20 temporal failures | Medium | No |
| **P2** | Exhaustive scan / pagination tool | ~19 aggregation misses | Medium | No |
| **P2** | Query expansion via LLM before embedding | ~35 retrieval misses | Medium | No |
| **P3** | Entity extraction at ingest | ~19 aggregation | High | **Yes** |

### Projected Impact

**Immediate (P0 regression fixes only):**
- Fix 11 temporal + 6 decomposition + 3 preference regressions = recover ~17 of 24 regressions
- Projected: **78.2%** (from 74.8% + 17 recovered)

**P0 + P1 (no re-ingest items):**
- Date-diff tool + session-relative framing: recover ~12 of 20 temporal failures
- Exhaustive scan tool: recover ~10 of 19 aggregation failures
- Projected: **82-84%**

**P0 + P1 + re-ingest:**
- Proposition indexing: recover ~20 of 35 retrieval misses
- Supersession: recover ~8 of 12 stale knowledge
- Projected: **87-90%**

**Ceiling estimate (all remediations):** **90-93%**

---

## Comparison: Three-Run Progression

| Metric | Baseline F1 | Optimised F1 | Delta |
|--------|------------|-------------|-------|
| Overall | 71.0% | 74.8% | +3.8pp |
| multi-session | 57.1% | 66.2% | +9.1pp |
| knowledge-update | 75.6% | 83.3% | +7.7pp |
| temporal-reasoning | 57.1% | 59.4% | +2.3pp |
| single-session-preference | 80.0% | 73.3% | -6.7pp |
| Failures | 145 | 126 | -19 |
| Fixed | — | 43 | — |
| Regressed | — | 24 | — |
| Cost | $26.61 | $34.15 | +28% |

The optimisation produced a net +19 correct answers. The 24 regressions are concentrated and fixable: 11 are date-awareness over-corrections (trivial prompt fix), 6 are over-decomposition (cap tool calls), and 3 are preference over-searching (soften prompt). Fixing the P0 regressions alone would yield ~78%.

---

*Generated by AuditCrux LongMemEval failure analysis pipeline, 2026-03-29.*
