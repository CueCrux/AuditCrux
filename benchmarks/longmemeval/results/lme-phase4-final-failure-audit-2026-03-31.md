# LongMemEval Phase 4+5 Final Failure Audit

**Date:** 2026-03-31
**Config:** Aggregation-only entity router + propositions + all enrichments
**Projected accuracy:** 82.6% (413/500)
**Remaining failures:** 87
**Progression:** 71.0% → 75.8% → 78.0% → **82.6% (projected)**

---

## System Architecture — What's Active in This Run

### Ingest Pipeline

```
Raw session text
  │
  ├─ Semantic chunking (DQP Tier 1)
  │    Sentence embeddings → cosine breakpoints → variable-size chunks
  │    SIMILARITY_THRESHOLD=0.75, CHUNK_MAX_BYTES=3800
  │
  ├─ Relative date resolution (M2.1)
  │    "yesterday" + session_date → "yesterday (2023-05-19)"
  │    Patterns: yesterday, today, last week/month/year, N days/weeks ago
  │
  ├─ Context notation (M2.3)
  │    [Title | Date: 2023-05-20 | Topics: cooking, recipes | Mentions: Rachel]
  │    Prepended to embedding text only (not stored text)
  │
  ├─ source_timestamp (M2.2)
  │    True session date stored on chunks.source_timestamp column
  │    Recency scoring uses this, not created_at (ingest time)
  │
  ├─ Vault Transit encryption
  │    All chunk content encrypted via Vault Transit (AES-256-GCM)
  │    Vault Agent auto-renews tokens via AppRole
  │
  ├─ Embedding (dual GPU pool)
  │    Pool router on Data-1:8079 → GPU-1 (RTX 4000 SFF, 6ms) + 5090 (Blackwell, 106ms)
  │    Nomic Embed v1.5, 768-dim, normalised
  │
  ├─ Vector storage (dual-write)
  │    Qdrant (Data-1:6333) + Postgres pgvector
  │
  ├─ Supersession check (M3.1)
  │    New chunk vs existing: ts_rank overlap > 0.3 + older source_timestamp → mark superseded
  │    Superseded chunks excluded from retrieval (WHERE superseded_by IS NULL)
  │
  └─ Proposition extraction (Phase 4, post-ingest)
       Haiku extracts atomic (subject, predicate, object, timestamp) claims
       Stored as additional memory imports → embedded as mini-chunks
       60K propositions across 500 problems ($5.97 Haiku)
```

### Entity Extraction Pipeline (Phase 4)

```
Existing chunks (via retrieval API, decrypted)
  │
  ├─ Haiku extraction
  │    Structured entities: (subject, subject_type, predicate, object, object_type, timestamp)
  │    Types: Person, Place, Item, Activity, Event, Organization, Creative_Work
  │    Predicates: owns, read, visited, attended, bought, changed, moved_to, sees, ...
  │    Negative assertions: NOT_owns, NOT_visited, stopped
  │
  └─ Entity session index (Postgres)
       vaultcrux.entity_session_index table
       Indexes: forward (type+predicate), backward (type+session), latest-state
       31,183 entities across 500 problems ($1.56 Haiku)
```

### Query Pipeline (Bidirectional Matrix)

```
Question
  │
  ├─ Intent detection
  │    aggregation → structured_query (entity index)
  │    temporal/knowledge-update/simple → query_memory (vector search)
  │
  ├─ [aggregation only] Structured Query (Tiered)
  │    Tier 0: Confidence check — any entities on this topic? No → skip to vector
  │    Tier 1: Entity index COUNT/TIMELINE query
  │    Tier 2: Backward session verification (forward count vs backward session count)
  │    Tier 3: Fall back to VaultCrux vector + BM25
  │    Answer includes completeness disclaimer for counts
  │
  ├─ query_memory (VaultCrux retrieval)
  │    HyDE embedding (40% raw + 60% hypothesis blend)
  │    Scoring: vectorScore × W_v + lexicalScore × W_l + recency × W_r
  │    Profiles: balanced (0.58/0.32/0.10), recall (0.45/0.40/0.15), recency (0.40/0.25/0.35)
  │    source_timestamp for recency (not created_at)
  │    Superseded chunks excluded
  │    Lexical broadening when vector results < limit/2
  │
  ├─ research_memory (iterative search)
  │    Plan → search → assess → retry loop
  │    Multiple reformulated queries, deduplication
  │
  ├─ date_diff (local calculator)
  │    from_date, to_date → difference in days/weeks/months/years
  │
  └─ question_date injection
       LongMemEval question_date passed to system prompt
       Temporal calculations relative to question date, not real-world today
```

### Infrastructure

| Component | Location | Detail |
|-----------|----------|--------|
| VaultCrux API | VaultCrux-App (HEL1) | Fastify, port 14333 |
| VaultCrux Worker | VaultCrux-App | Advisory lock removed, pre-flight checks, pool registration |
| Embedder pool | Data-1:8079 | GPU-1 + RTX 5090 Blackwell, latency-band routing |
| Postgres | Data-1:5432 | pgvector, entity_session_index, worker_pool |
| Qdrant | Data-1:6333 | Vector dual-write |
| Vault Agent | VaultCrux-App + Data-1 | AppRole auto-renewal, systemd |
| TEI (GPU-1) | 10.80.0.2:8080 | Nomic Embed v1.5, sm_80 |
| TEI (5090) | 100.92.27.92:8085 | Nomic Embed v1.5, sm_120 (Blackwell :120-1.9) |
| Benchmark runner | Data-1 | Runs from /srv/cuecrux/AuditCrux |

---

## Results Progression

| Step | Accuracy | Key Change |
|------|----------|-----------|
| Baseline (DQP) | 71.0% | Semantic chunking + HyDE + context notation |
| + Re-ingest enrichments | 75.8% | Date resolution + source_timestamp + richer context |
| + Entity router (untuned) | 78.0% | Entity index for all intents (+40 fixed, -28 regressed) |
| + Aggregation-only router | **82.6%** | Entity index for aggregation only (avoids temporal/KU regressions) |

---

## Sub-Causes

- retrieval_miss: 27 (31%)
- multi_session_wrong: 25 (29%)
- temporal_wrong: 16 (18%)
- stale_knowledge: 14 (16%)
- other_wrong: 5 (6%)

## By Type

- multi-session: 35/133 (73.7% pass)
- temporal-reasoning: 28/133 (78.9% pass)
- knowledge-update: 17/78 (78.2% pass)
- single-session-user: 3/70 (95.7% pass)
- single-session-preference: 3/30 (90.0% pass)

## Remediation Map (Phase 5 Targets)

| Cause | Count | Phase 5 Technique | Expected Recovery |
|-------|-------|------------------|------------------|
| retrieval_miss (27) | 27 | **QA Inversion (M6):** pre-compute "what questions can this chunk answer?" at ingest. Matches questions by template, not vocabulary. | 12-18 |
| multi_session_wrong (25) | 25 | **Answer Verification (M3):** entity index provides candidate, LLM verifies against raw chunks. Catches partial counts. | 8-12 |
| temporal_wrong (16) | 16 | **Temporal Calendar (M2):** date→events inverted index. **Date-diff enforcement:** tool already exists, needs stricter prompt. | 8-12 |
| stale_knowledge (14) | 14 | **Living Objects (CoreCrux):** entity-state projections with version chains. Latest value is deterministic. **Negative Knowledge (M5):** capture "I stopped" / "I changed from". | 8-10 |
| other_wrong (5) | 5 | Prompt tuning or irreducible. | 1-2 |

**Projected recovery with Phase 5:** 37-54 of 87 → **90-93%**

## Key Architectural Observations

### What the Entity Router Proved
- **Aggregation questions are solvable with structured data.** Multi-session went from 55.6% → 73.7% pass rate — the biggest single-category improvement in the programme.
- **The bidirectional matrix (forward count + backward session verify) catches false positives.** When the entity index is wrong, the cross-check demotes confidence and falls through to vector search.
- **Restricting to aggregation-only was critical.** Applying entity routing to temporal and knowledge-update caused 28 regressions. The entity index has incomplete temporal data and stale state values that the model trusted over vector search. Lesson: use structured data where it's strong (counting), not where it's weak (dates, state changes).

### What Still Needs CoreCrux (Not Yet Integrated)
- **Timeline projections** — entities have `occurred_at` timestamps but no sorted projection. CoreCrux `ReadStream` with time ordering would give deterministic timelines.
- **Living object projections** — entity-state version chains. CoreCrux event sourcing naturally models "attribute changed from X to Y" as successive events. A `CURRENT_STATE` projection reads the latest.
- **Graph-expand for cross-references** — when the model finds "luxury boots cost $800", the entity graph links to "budget boots cost $200" via shared entity type. Not yet wired.

### What Needs QA Inversion (Not Yet Built)
- **27 retrieval misses** where the information exists in the corpus but no query finds it. The question uses different vocabulary than the chunk. Pre-computing "what questions can this chunk answer?" at ingest creates a question-template index that bridges the vocabulary gap.

---

## All Failures


### multi_session_wrong (25)

**gpt4_d84a3211** | multi-session | 48s/4a
- Q: How much total money have I spent on bike-related expenses since the start of the year?
- Gold: $185
- Hyp: Based on my search through your conversation history, I found only **one specific bike-related expense** mentioned:  - 🚲 **Bike lights**: **$40** (a new set of bike lights installed for early morning rides)  That's the only concrete dollar amount rec

**c4a1ceb8** | multi-session | 49s/4a
- Q: How many different types of citrus fruits have I used in my cocktail recipes?
- Gold: 3
- Hyp: Based on your cocktail recipe conversations, I can identify the following citrus fruits that appeared across your recipes and discussions:  1. **Lemon** – used in Whiskey Sour recipes (fresh lemon juice) and Collins-style cocktails 2. **Lime** – feat

**28dc39ac** | multi-session | 38s/5a
- Q: How many hours have I spent playing games in total?
- Gold: 140 hours
- Hyp: Based on my research through your conversation history, I can identify the following games you've mentioned completing with specific playtimes:  | Game | Hours | |---|---| | **The Last of Us Part II** (normal difficulty) | 25 hours | | **The Last of 

**gpt4_15e38248** | multi-session | 46s/4a
- Q: How many pieces of furniture did I buy, assemble, sell, or fix in the past few months?
- Gold: 4
- Hyp: Based on the memory results, here's a clear summary of the furniture-related activities found in your conversations over the past few months:  | Action | Item | When | |--------|------|-------| | **Bought** | Coffee table (West Elm, wooden with metal

**gpt4_5501fe77** | multi-session | 45s/3a
- Q: Which social media platform did I gain the most followers on over the past month?
- Gold: TikTok
- Hyp: Based on your past conversations, your **Twitter** account saw the most follower growth over the past month. You mentioned that your Twitter follower count jumped from **420 to 540** — a gain of **120 followers** in one month.  For context, your othe

**7024f17c** | multi-session | 47s/3a
- Q: How many hours of jogging and yoga did I do last week?
- Gold: 0.5 hours
- Hyp: Based on the memory records, here's what I found for **last week (May 22–28, 2023)**:  - **Jogging**: You logged a **30-minute jog** on Saturday, May 20 — but that was the week *before* last week (the week of May 14–20). There is no record of a jog s

**gpt4_2ba83207** | multi-session | 53s/4a
- Q: Which grocery store did I spend the most money at in the past month?
- Gold: Thrive Market
- Hyp: Based on your past conversations, here's a summary of your grocery spending in the past month (since ~May 1, 2023):  | Store | Amount | Date | |-------|--------|------| | **Walmart** | **~$120** | ~May 19, 2023 | | Trader Joe's | ~$80 (split with sis

**gpt4_31ff4165** | multi-session | 42s/5a
- Q: How many health-related devices do I use in a day?
- Gold: 4
- Hyp: Based on your conversation history, I can identify **2 health-related devices** you use daily:  1. **Fitbit Versa 3** — You use it daily to track activity levels, sleep patterns, step count, and do guided breathing sessions. You mentioned wearing it 

**gpt4_194be4b3** | multi-session | 44s/5a
- Q: How many musical instruments do I currently own?
- Gold: I currently own 4 musical instruments. I've had the Fender Stratocaster electric guitar for 5 years, the Yamaha FG800 acoustic guitar for 8 years, the
- Hyp: Based on your conversation history, here's what I can piece together about the instruments you currently own:  1. **Guitar** – You've been playing guitar for a while. 2. **Korg B1 digital piano** – You own this and have discussed its maintenance. 3. 

**gpt4_ab202e7f** | multi-session | 46s/5a
- Q: How many kitchen items did I replace or fix?
- Gold: I replaced or fixed five items: the kitchen faucet, the kitchen mat, the toaster, the coffee maker, and the kitchen shelves.
- Hyp: Based on your conversation history, I found **3 kitchen items** that you replaced or fixed:  1. **Toaster → Toaster Oven** *(replaced)* — You got rid of your old toaster and replaced it with a toaster oven. 2. **Kitchen mat** *(replaced)* — You repla

**d851d5ba** | multi-session | 46s/4a
- Q: How much money did I raise for charity in total?
- Gold: $3,750
- Hyp: Based on your conversation history, I can identify the specific amounts you've raised for charity:  1. **$250** — raised for a local food bank by running 5km in the "Run for Hunger" charity event on March 12th. 2. **$500** — raised for the American C

**e3038f8c** | multi-session | 45s/4a
- Q: How many rare items do I have in total?
- Gold: 99
- Hyp: Based on the memory records, here's a breakdown of your rare items:  | Category | Count | |---|---| | 🎵 Rare Records | **57** | | 🗿 Rare Figurines | **12** | | 📚 Rare Books | Collection (unspecified count) | | 🪙 Rare Coins | Collection (unspecified c

**10d9b85a** | multi-session | 44s/2a
- Q: How many days did I spend attending workshops, lectures, and conferences in April?
- Gold: 3 days
- Hyp: Based on my thorough search of your conversation history, I found one relevant mention: in a session from May 1, 2023, you mentioned that you **"recently attended a lecture on sustainable development at the public library on the 10th of April."**  Th

**81507db6** | multi-session | 50s/5a
- Q: How many graduation ceremonies have I attended in the past three months?
- Gold: 3
- Hyp: Based on the memory results, I can see a relevant mention: in a session from July 21, 2023, you mentioned **missing your nephew Jack's eighth grade graduation ceremony last month** (~June 21, 2023). There's no record of you actually *attending* any g

**bf659f65** | multi-session | 52s/3a
- Q: How many music albums or EPs have I purchased or downloaded?
- Gold: 3
- Hyp: Based on my search through your conversation history, I can find a reference to **Billie Eilish's "Happier Than Ever"** album, which you mentioned downloading on Spotify. However, there is no broader record in your conversation history of a list of m

**a11281a2** | multi-session | 50s/2a
- Q: What was the approximate increase in Instagram followers I experienced in two weeks?
- Gold: 100
- Hyp: Based on your past conversations, you mentioned that after **two weeks of posting regularly on Instagram**, you gained approximately **350 followers**. That was noted in a session from May 23, 2023, where it was described as a great start to your Ins

**9ee3ecd6** | multi-session | 50s/2a
- Q: How many points do I need to earn to redeem a free skincare product at Sephora?
- Gold: 100
- Hyp: Based on your past conversations, you mentioned that you need a total of **300 points** to redeem a free skincare product at Sephora. You were already at 200 points after earning 50 points from purchasing an eyeshadow palette, and you noted you just 

**1f2b8d4f** | multi-session | 51s/2a
- Q: What is the difference in price between my luxury boots and the similar pair found at the budget store?
- Gold: $750
- Hyp: From the memory records, I can see that your **luxury boots** cost **$800**. However, the conversations in memory discuss various suggested alternatives at different price ranges — they don't record a specific instance of you actually finding and not

**67e0d0f2** | multi-session | 52s/2a
- Q: What is the total number of online courses I've completed?
- Gold: 20
- Hyp: Based on the search results, I found a clear mention in your conversation history. In a session from **May 27, 2023**, you stated:  > *"Since I've already completed **12 courses on Coursera**, I'm confident that I have a solid foundation in data anal

**ba358f49** | multi-session | 41s/2a
- Q: How many years will I be when my friend Rachel gets married?
- Gold: 33
- Hyp: I found a relevant memory! In a past conversation (dated 2022-09-01), you mentioned that **"my friend Rachel's getting married next year"** — meaning Rachel's wedding would be in **2023**. However, your age was not mentioned in that conversation (the

**61f8c8f8** | multi-session | 48s/2a
- Q: How much faster did I finish the 5K run compared to my previous year's time?
- Gold: 10 minutes
- Hyp: Based on your conversation history, I can see your **previous year's 5K time (around October 2022) was 45 minutes**, and you were training for an upcoming 5K. However, I don't have a record of your **most recent 5K race result** — there's no logged f

**bc149d6b** | multi-session | 46s/2a
- Q: What is the total weight of the new feed I purchased in the past two months?
- Gold: 70 pounds
- Hyp: Based on my thorough search of your conversation history, the only feed purchase I can find a record of is a **50-pound batch of layer feed** purchased on May 22, 2023, for $120 (with a 10% discount applied).  That is the only feed purchase documente

**a08a253f** | multi-session | 53s/2a
- Q: How many days a week do I attend fitness classes?
- Gold: 4 days.
- Hyp: You attend fitness classes **3 days a week**:  - **Tuesday** – Zumba class at 6:30 PM - **Thursday** – Zumba class at 6:30 PM - **Saturday** – Weightlifting class at 10:00 AM

**a96c20ee_abs** | multi-session | 53s/2a
- Q: At which university did I present a poster for my undergrad course research project?
- Gold: The information provided is not enough. You did not mention presenting a poster for your undergrad course research project.
- Hyp: Based on your conversation history, you presented a poster on your research at your first research conference at **Harvard University**. You mentioned attending the conference there and seeing interesting projects on AI in education, which aligned wi

**09ba9854_abs** | multi-session | 50s/2a
- Q: How much will I save by taking the bus from the airport to my hotel instead of a taxi?
- Gold: The information provided is not enough. You did not mention how much will the bus take.
- Hyp: Based on your past conversations, I can see you were discussing transportation from the airport to your hotel in **Tokyo**. Here's what was mentioned:  - **Taxi** from the airport to your hotel: ~**$60** (as you mentioned in a prior conversation) - *


### other_wrong (5)

**c7cf7dfd** | single-session-assistant | 51s/1a
- Q: I'm going back to our previous conversation about traditional Indian embroidery and tailoring techniques. Can you remind me of the name of that online store based in India that sel
- Gold: Nostalgia
- Hyp: Based on our previous conversation, the online store based in India that was recommended for traditional Indian fabrics, threads, and embellishments is **Fabriclore**. It was highlighted as a store that sells a wide range of fabrics like cotton, silk

**09d032c9** | single-session-preference | 43s/1a
- Q: I've been having trouble with the battery life on my phone lately. Any tips?
- Gold: The user would prefer responses that build upon their previous mention of purchasing a portable power bank, such as suggestions on how to optimize its
- Hyp: I don't have any specific past conversations about your phone's battery issues, but I can offer some solid general tips to help improve battery life! Here are some of the most effective strategies:  ### 🔋 Tips to Improve Phone Battery Life  **Reduce 

**1c0ddc50** | single-session-preference | 51s/1a
- Q: Can you suggest some activities I can do during my commute to work?
- Gold: The user would prefer suggestions related to listening to new podcasts or audiobooks, especially the genre beyond true crime or self-improvement, such
- Hyp: Great news — I can see from your past conversations that you **commute by bike** to work! Since you're cycling, here are some tailored activity suggestions for your ride:  ---  ### 🎧 Audio-Based Activities *(hands-free & safe for cycling)*  1. **Podc

**75832dbd** | single-session-preference | 48s/1a
- Q: Can you recommend some recent publications or conferences that I might find interesting?
- Gold: The user would prefer suggestions related to recent research papers, articles, or conferences that focus on artificial intelligence in healthcare, par
- Hyp: Based on your conversation history, I can see a few areas of interest that have come up — including **neuroscience/brain-computer interfaces**, **deep learning for medical imaging**, **explainable AI (XAI)**, and **AI/robotics** more broadly. Here ar

**ec81a493** | single-session-user | 51s/1a
- Q: How many copies of my favorite artist's debut album were released worldwide?
- Gold: 500
- Hyp: I found the answer in your conversation history! You mentioned that the signed poster from your **favorite artist's debut album** is a **limited edition of only 500 copies worldwide**. 🎶  This came up in a conversation where you were discussing how t


### retrieval_miss (27)

**830ce83f** | knowledge-update | 47s/2a
- Q: Where did Rachel move to after her recent relocation?
- Gold: the suburbs
- Hyp: Rachel moved to **Chicago**. Specifically, she relocated to a new apartment in the city, though the exact neighborhood within Chicago wasn't specified in the conversation — you mentioned you'd ask her directly which neighborhood she was living in.

**6071bd76** | knowledge-update | 46s/2a
- Q: For the coffee-to-water ratio in my French press, did I switch to more water per tablespoon of coffee, or less?
- Gold: You switched to less water (5 ounces) per tablespoon of coffee.
- Hyp: I only found one mention of your French press ratio — from a session on **February 11, 2023**, where you stated that **1 tablespoon of coffee for every 6 ounces of water** was your preferred ratio. However, I don't see any record of you switching to 

**affe2881** | knowledge-update | 44s/2a
- Q: How many different species of birds have I seen in my local park?
- Gold: 32
- Hyp: I wasn't able to find any records in your conversation history about bird species spotted in a local park. It's possible this topic hasn't come up in any of your past conversations stored in memory.  If you'd like to start tracking your bird sighting

**gpt4_a56e767c** | multi-session | 48s/3a
- Q: How many movie festivals that I attended?
- Gold: I attended four movie festivals.
- Hyp: I wasn't able to find any information about movie festivals you attended in your conversation history. The search results returned unrelated content about mergers and acquisitions.  It's possible that this topic hasn't come up in any of your past con

**2ce6a0f2** | multi-session | 47s/4a
- Q: How many different art-related events did I attend in the past month?
- Gold: 4
- Hyp: Based on my search through your conversation history, I can identify **2 art-related events** you attended in the past month (February 8 – March 8, 2023):  1. **"Women in Art" Exhibition** – Attended on **February 10th** at what appears to be the Mod

**2b8f3739** | multi-session | 47s/3a
- Q: What is the total amount of money I earned from selling my products at the markets?
- Gold: $495
- Hyp: I'm sorry, but I wasn't able to find any information in your conversation history about selling products at markets or any related earnings. The search results returned unrelated content and nothing about market sales or income.  It's possible that t

**cc06de0d** | multi-session | 42s/2a
- Q: For my daily commute, how much more expensive was the taxi ride compared to the train fare?
- Gold: $6
- Hyp: I wasn't able to find any information about a taxi ride or train fare for your daily commute in your conversation history. It's possible this topic hasn't been discussed in any of your past conversations stored in memory.  Could you provide more deta

**9aaed6a3** | multi-session | 51s/2a
- Q: How much cashback did I earn at SaveMart last Thursday?
- Gold: $0.75
- Hyp: I wasn't able to find any record of a SaveMart transaction or cashback earned at SaveMart in your conversation history. The results returned are about Walmart+ cashback discussions, which don't appear to be related to your question.  It's possible th

**92a0aa75** | multi-session | 42s/2a
- Q: How long have I been working in my current role?
- Gold: 1 year and 5 months
- Hyp: I wasn't able to find any information in your conversation history about your current job role or when you started it. Could you share more details about your role or when you began it? That way I can either look it up more specifically or help you c

**73d42213** | multi-session | 49s/2a
- Q: What time did I reach the clinic on Monday?
- Gold: 9:00 AM
- Hyp: I'm sorry, but I wasn't able to find any record in your conversation history of a specific time you arrived at the clinic on Monday. The conversations I found relate to you searching for a new clinic and rescheduling a follow-up appointment, but ther

**c18a7dc8** | multi-session | 49s/2a
- Q: How many years older am I than when I graduated from college?
- Gold: 7
- Hyp: I wasn't able to find information about your personal college graduation year or your date of birth/age in your conversation history. Without knowing both your birth year and your college graduation year, I can't calculate how many years older you ar

**55241a1f** | multi-session | 49s/2a
- Q: What is the total number of comments on my recent Facebook Live session and my most popular YouTube video?
- Gold: 33
- Hyp: I found the information from your past conversations. Here's the breakdown:  - **Recent Facebook Live session** (about cooking vegan recipes): **12 comments** - **Most popular YouTube video** (a tutorial on social media analytics): The exact comment 

**efc3f7c2** | multi-session | 48s/2a
- Q: How much earlier do I wake up on Fridays compared to other weekdays?
- Gold: 30 minutes
- Hyp: I wasn't able to find any specific mention of a different Friday wake-up time in your conversations. Here's what your memory records show:  - **General weekday (Mon–Fri) wake-up: 6:30 AM** — as stated in your morning routine planning session (May 24,

**5d3d2817** | single-session-user | 53s/1a
- Q: What was my previous occupation?
- Gold: Marketing specialist at a small startup
- Hyp: I wasn't able to find any information about your previous occupation in the memory system. There are no records in your conversation history where you mentioned your past job or career. Could you share more context, or is it possible you discussed th

**d52b4f67** | single-session-user | 52s/1a
- Q: Where did I attend my cousin's wedding?
- Gold: The Grand Ballroom
- Hyp: I wasn't able to find the specific location of your cousin's wedding in the memory records. The search results mention your cousin's wedding only in passing (e.g., a reference to your mom looking stunning at it), but no location details are stored. C

**71017277** | temporal-reasoning | 51s/1a
- Q: I received a piece of jewelry last Saturday from whom?
- Gold: my aunt
- Hyp: I'm sorry, but I wasn't able to find any record in your conversation history of you receiving a piece of jewelry last Saturday (March 4, 2023). This specific event doesn't appear to be stored in your memory. Could you provide more context, or is it p

**gpt4_d6585ce9** | temporal-reasoning | 42s/5a
- Q: Who did I go with to the music event last Saturday?
- Gold: my parents
- Hyp: I wasn't able to find a specific record in your conversation history about who you went with to a music event last Saturday (April 15, 2023). The memory results mention various music events you've attended — such as a music festival in Brooklyn with 

**gpt4_59149c78** | temporal-reasoning | 51s/2a
- Q: I mentioned that I participated in an art-related event two weeks ago. Where was that event held at?
- Gold: The Metropolitan Museum of Art.
- Hyp: Based on the memory results, the session from **January 14, 2023** (which is approximately 2.5 weeks ago from today, February 1, 2023) mentions you participated in a guided tour of the **Natural History Museum's** newest exhibit, "Dinosaurs of the An

**gpt4_468eb064** | temporal-reasoning | 48s/1a
- Q: Who did I meet with during the lunch last Tuesday?
- Gold: Emma
- Hyp: I'm sorry, but I wasn't able to find any information in your conversation history about a lunch meeting last Tuesday (April 11, 2023). There are no records of you mentioning meeting someone for lunch on that date. It's possible this wasn't discussed 

**9a707b82** | temporal-reasoning | 53s/2a
- Q: I mentioned cooking something for my friend a couple of days ago. What was it?
- Gold: a chocolate cake
- Hyp: I wasn't able to find a specific mention in memory of you cooking something for a friend a couple of days ago (around April 10, 2022). The searches returned various cooking-related conversations, but none specifically mentioned preparing a dish *for 

**eac54add** | temporal-reasoning | 43s/2a
- Q: What was the significant buisiness milestone I mentioned four weeks ago?
- Gold: I signed a contract with my first client.
- Hyp: I wasn't able to find a specific business milestone you mentioned approximately four weeks ago (around **February 28, 2023**). The closest relevant item I found was from a session on **February 10, 2023**, where you mentioned **launching your website

**gpt4_8279ba03** | temporal-reasoning | 43s/1a
- Q: What kitchen appliance did I buy 10 days ago?
- Gold: a smoker
- Hyp: I wasn't able to find any record of a kitchen appliance purchase in your conversation history. There's no mention of buying a kitchen appliance around March 15, 2023 (10 days ago) or at any other time in the memory I have access to. It's possible thi

**6e984302** | temporal-reasoning | 43s/2a
- Q: I mentioned an investment for a competition four weeks ago? What did I buy?
- Gold: I got my own set of sculpting tools.
- Hyp: I'm sorry, but I wasn't able to find any record in your conversation history of you mentioning an investment purchase related to a competition around four weeks ago (approximately early March 2023). The searches didn't return any relevant matches for

**gpt4_68e94288** | temporal-reasoning | 44s/2a
- Q: What was the social media activity I participated 5 days ago?
- Gold: You participated in a social media challenge called #PlankChallenge.
- Hyp: I'm sorry, but I wasn't able to find any specific records of social media activity you personally participated in on **March 15, 2023** (5 days ago). The memory system doesn't appear to contain a conversation or log from that date related to your per

**08f4fc43** | temporal-reasoning | 47s/2a
- Q: How many days had passed between the Sunday mass at St. Mary's Church and the Ash Wednesday service at the cathedral?
- Gold: 30 days. 31 days (including the last day) is also acceptable.
- Hyp: I found the Ash Wednesday service date (February 1st at the cathedral) from memory, but I couldn't find a specific date for the Sunday mass at St. Mary's Church. The memory system does not appear to contain a record of a Sunday mass at St. Mary's Chu

**gpt4_88806d6e** | temporal-reasoning | 49s/2a
- Q: Who did I meet first, Mark and Sarah or Tom?
- Gold: Tom
- Hyp: I wasn't able to find any information about when you met **Tom** in my memory records. While I do have records of you meeting **Mark and Sarah on a beach trip about a month ago**, there's no mention of a "Tom" that I can find to compare against.  Cou

**gpt4_c27434e8** | temporal-reasoning | 51s/2a
- Q: Which project did I start first, the Ferrari model or the Japanese Zero fighter plane model?
- Gold: Japanese Zero fighter plane model
- Hyp: I wasn't able to find any information about a Ferrari model or a Japanese Zero fighter plane model in your conversation history. Neither project appears to be recorded in your memory. It's possible these were discussed outside of the conversations st


### stale_knowledge (14)

**852ce960** | knowledge-update | 39s/2a
- Q: What was the amount I was pre-approved for when I got my mortgage from Wells Fargo?
- Gold: $400,000
- Hyp: You were pre-approved for **$350,000** from Wells Fargo. This came up in a conversation where you were buying a $325,000 home and discussing closing costs and monthly payment estimates.

**2698e78f** | knowledge-update | 48s/2a
- Q: How often do I see my therapist, Dr. Smith?
- Gold: every week
- Hyp: Based on your past conversations, you see Dr. Smith **every two weeks (bi-weekly)**. You mentioned this yourself in a session, noting: *"I have a therapy session with Dr. Smith coming up soon - it's every two weeks, so I'm looking forward to discussi

**41698283** | knowledge-update | 45s/2a
- Q: What type of camera lens did I purchase most recently?
- Gold: a 70-200mm zoom lens
- Hyp: Based on your conversation history, the most recently mentioned lens purchase was a **Canon EF lens** (noted in a session from May 2023), which you were using for portrait and general photography and loving for its bokeh and image stabilization.  Pri

**01493427** | knowledge-update | 47s/2a
- Q: How many new postcards have I added to my collection since I started collecting again?
- Gold: 25
- Hyp: You've added **17 new postcards** to your collection since you started collecting again. This came up in a past conversation where you mentioned it directly: *"I've added 17 new ones since I started collecting again."*

**0e4e4c46** | knowledge-update | 49s/2a
- Q: What is my current highest score in Ticket to Ride?
- Gold: 132 points
- Hyp: Your current highest score in **Ticket to Ride** is **124 points**! You mentioned this in a conversation on May 23, 2023, where you said you'd been "crushing it" lately and were eager to keep improving. Great job! 🎉

**e66b632c** | knowledge-update | 47s/2a
- Q: What was my previous personal best time for the charity 5K run?
- Gold: 27 minutes and 45 seconds
- Hyp: Your previous personal best time for the charity 5K run was **26 minutes and 30 seconds**. This was mentioned in a conversation where you noted you had just beaten that record by shaving off about a minute and a half from your previous time.

**c7dc5443** | knowledge-update | 46s/2a
- Q: What is my current record in the recreational volleyball league?
- Gold: 5-2
- Hyp: Based on your conversation history, as of **June 16, 2023**, your recreational volleyball league record was **3 wins and 2 losses (3-2)**. That's the most recent record I have on file. If more games have been played since then, I wouldn't have the up

**7401057b** | knowledge-update | 47s/2a
- Q: How many free night's stays can I redeem at any Hilton property with my accumulated points?
- Gold: Two
- Hyp: Based on your past conversation history, you mentioned that you have accumulated enough points for **1 free night's stay** at any Hilton property.  Specifically, you noted that since the **Hilton Lake Las Vegas Resort is a Category 5 hotel** (requiri

**a2f3aa27** | knowledge-update | 44s/2a
- Q: How many followers do I have on Instagram now?
- Gold: 1300
- Hyp: Based on your past conversations, the most recent mention of your Instagram follower count was from a session on **May 25, 2023**, where you mentioned you were **close to 1,300 followers**. Before that, in an earlier session the same day, you had not

**9bbe84a2** | knowledge-update | 48s/2a
- Q: What was my previous goal for my Apex Legends level before I updated my goal?
- Gold: level 100
- Hyp: Based on the memory records, I can see that your previous goal for your Apex Legends level was **level 150**. This was mentioned across multiple conversations where you stated, *"my current goal is to reach level 150, and I'm determined to get there 

**dad224aa** | knowledge-update | 48s/2a
- Q: What time do I wake up on Saturday mornings?
- Gold: 7:30 am
- Hyp: Based on your past conversations, you wake up at **8:30 am on Saturday mornings**. This was mentioned when you noted your existing Saturday morning routine, and it was also your target wake-up time for weekends that you were working toward as part of

**ba61f0b9** | knowledge-update | 45s/2a
- Q: How many women are on the team led by my former manager Rachel?
- Gold: 6
- Hyp: Based on your past conversations, **Rachel's team has 5 women** out of a total team of 10 people — that's a 50% representation. The five women on her team are:  1. **Sarah** – Project Manager 2. **Emily** – Software Developer (front-end) 3. **Maya** 

**07741c45** | knowledge-update | 49s/2a
- Q: Where do I currently keep my old sneakers?
- Gold: in a shoe rack in my closet
- Hyp: Based on your past conversations, you mentioned that you've been keeping your old sneakers **under your bed** for storage. You noted at the time that they were starting to smell as a result.

**031748ae_abs** | knowledge-update | 52s/2a
- Q: How many engineers do I lead when I just started my new role as Software Engineer Manager?
- Gold: The information provided is not enough. You mentioned starting the role as Senior Software Engineer but not Software Engineer Manager.
- Hyp: Based on your past conversations, when you started your new role, you mentioned leading a team of **4 engineers**. This was clarified in a session where you noted: *"I lead a team of 4 engineers in my new role as Senior Software Engineer."*  (Note: I


### temporal_wrong (16)

**9a707b81** | temporal-reasoning | 54s/2a
- Q: How many days ago did I attend a baking class at a local culinary school when I made my friend's birthday cake?
- Gold: 21 days. 22 days (including the last day) is also acceptable.
- Hyp: Based on the memory records, your baking class at the local culinary school took place on **March 20, 2022** — that's **26 days ago** from today (April 15, 2022).  It's worth noting that the birthday cake you baked for your friend (a chocolate cake w

**b46e15ed** | temporal-reasoning | 46s/4a
- Q: How many months have passed since I participated in two charity events in a row, on consecutive days?
- Gold: 2
- Hyp: Based on your conversation history, your two consecutive charity events were:  1. **March 18, 2023** — A charity walk (for which you sought hydration tips) 2. **March 19, 2023** — The **"Walk for Hunger"** event with your work colleagues, walking 5 k

**gpt4_468eb063** | temporal-reasoning | 44s/1a
- Q: How many days ago did I meet Emma?
- Gold: 9 days ago. 10 days (including the last day) is also acceptable.
- Hyp: Based on your conversation history, you met a **freelance writer at a coffee shop near your office** around **April 4, 2023** — which was **16 days ago**. You mentioned exchanging numbers with her to grab lunch sometime.  > ⚠️ *Note: The memory recor

**gpt4_7abb270c** | temporal-reasoning | 48s/6a
- Q: What is the order of the six museums I visited from earliest to latest?
- Gold: Science Museum, Museum of Contemporary Art, Metropolitan Museum of Art, Museum of History, Modern Art Museum, Natural History Museum
- Hyp: Based on my research, I can now piece together all six museum visits with their dates. Here they are from **earliest to latest**:  1. **Science Museum** *(Jan 15, 2023)* — Visited the "Space Exploration" exhibition with your colleague David. 2. **Mod

**gpt4_45189cb4** | temporal-reasoning | 45s/3a
- Q: What is the order of the sports events I watched in January?
- Gold: First, I attended a NBA game at the Staples Center, then I watched the College Football National Championship game, and finally, I watched the NFL pla
- Hyp: Based on my research, I found two sports events you watched in January 2023, in this order:  1. **January 5 — NBA Game: Lakers vs. Chicago Bulls** (at the Staples Center, LA)    You attended this in person with your coworkers and had a blast.  2. **J

**370a8ff4** | temporal-reasoning | 46s/2a
- Q: How many weeks had passed since I recovered from the flu when I went on my 10th jog outdoors?
- Gold: 15
- Hyp: **11 weeks** (approximately 11.6 weeks, or 81 days) had passed between when you recovered from the flu (January 19, 2023) and when you went on your 10th outdoor jog (April 10, 2023).

**gpt4_f420262c** | temporal-reasoning | 47s/5a
- Q: What is the order of airlines I flew with from earliest to latest before today?
- Gold: JetBlue, Delta, United, American Airlines
- Hyp: I now have a clear picture of all the airlines you actually flew with and their confirmed dates. Here is the order from earliest to latest:  1. **Spirit Airlines** — *November 17, 2022* (trip to Fort Lauderdale) 2. **Delta** — *January 15, 2023* (rou

**gpt4_b0863698** | temporal-reasoning | 42s/1a
- Q: How many days ago did I participate in the 5K charity run?
- Gold: 7 days ago. 8 days (including the last day) is also acceptable.
- Hyp: You participated in the **5K charity run 14 days ago**, on **Saturday, March 12, 2023**. It was the *Run for Hope: Charity 5K Run/Walk* held at Downtown Park, starting at 8:00 AM. 🏃‍♂️

**gpt4_f420262d** | temporal-reasoning | 43s/5a
- Q: What was the airline that I flied with on Valentine's day?
- Gold: American Airlines
- Hyp: Based on the memory records, I can see that the session dated **February 14, 2023** (Valentine's Day) references a flight with **JetBlue** — specifically a flight from **BOS (Boston) to FLL (Fort Lauderdale)**. The session also mentions a return trip

**gpt4_1e4a8aec** | temporal-reasoning | 50s/2a
- Q: What gardening-related activity did I do two weeks ago?
- Gold: planting 12 new tomato saplings
- Hyp: Two weeks ago from today (May 5, 2023) was around **April 21, 2023**. On that date, you had a conversation about **watering your tomato plants** during a dry spell. Specifically, you were trying to figure out how often you should water them given the

**0bc8ad93** | temporal-reasoning | 47s/3a
- Q: I mentioned visiting a museum two months ago. Did I visit with a friend or not?
- Gold: No, you did not visit with a friend.
- Hyp: I found a session from **February 18, 2023** — which is about two months ago from today (March 11, 2023). That session mentions visiting the **Natural History Museum**. The closest museum visit to two months ago was mentioned in that session. However

**a3838d2b** | temporal-reasoning | 47s/6a
- Q: How many charity events did I participate in before the 'Run for the Cure' event?
- Gold: 4
- Hyp: Based on the memory results, I can identify the charity events you participated in and their dates:  1. **"Food for Thought" charity gala** — September 25, 2023 (volunteered) 2. **"Run for the Cure"** — October 15, 2023 (the reference event)  The "Da

**gpt4_483dd43c** | temporal-reasoning | 52s/2a
- Q: Which show did I start watching first, 'The Crown' or 'Game of Thrones'?
- Gold: 'Game of Thrones'
- Hyp: Based on the memory records, here's what I found:  - **Game of Thrones**: You mentioned you *"finally started it about a month ago"* (from a session dated 2023-05-29 at 04:31). - **The Crown**: In a separate session (2023-05-29 at 09:49), you said yo

**gpt4_93159ced** | temporal-reasoning | 42s/2a
- Q: How long have I been working before I started my current job at NovaTech?
- Gold: 4 years and 9 months
- Hyp: Based on your conversation history, here's what I found:  You mentioned that you've **been in the software engineering field since you graduated** with a Computer Science degree from UC Berkeley, and that you've **been working at NovaTech for about 4

**gpt4_1a1dc16d** | temporal-reasoning | 46s/2a
- Q: Which event happened first, the meeting with Rachel or the pride parade?
- Gold: The meeting with Rachel
- Hyp: The memory records make this clear:  - **Pride parade**: You attended it on **May 1st**, mentioned in a session timestamped **2023-05-09 at 12:07**. - **Meeting with Rachel**: This was discussed in a session timestamped **2023-05-09 at 07:55**, but t

**gpt4_2f56ae70** | temporal-reasoning | 45s/3a
- Q: Which streaming service did I start using most recently?
- Gold: Disney+
- Hyp: Based on my search of your conversation history, I can see that you mentioned using **Netflix, Hulu, and Amazon Prime** for the past 6 months (as of May 2023). In a later conversation, you decided to add the **HBO add-on via Amazon Prime Video** to w


---
*Generated 2026-03-31*
