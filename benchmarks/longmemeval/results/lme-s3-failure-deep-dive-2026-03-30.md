# LongMemEval s3 Re-Ingest — Failure Deep Dive

**Date:** 2026-03-30
**Run:** `lme-s3-sonnet-4-6-F1-202603301448-ba3ecd`
**Accuracy:** 75.6% (378/500)
**Progression:** Baseline 71.0% → Query-side 74.8% → Re-ingest 75.8% → Combined 75.6%

---

## Failure Distribution (122 failures)

| Category | Fails | Pass Rate |
|----------|-------|-----------|
| multi-session | 59/133 | 55.6% |
| temporal-reasoning | 38/133 | 71.4% |
| knowledge-update | 16/78 | 79.5% |
| single-session-user | 4/70 | 94.3% |
| single-session-preference | 4/30 | 86.7% |
| single-session-assistant | 1/56 | 98.2% |

## Sub-Cause Breakdown

| Sub-Cause | Count | % |
|-----------|-------|---|
| `retrieval_miss:aggregation_query` | 35 | 28.7% |
| `retrieval_miss:found_wrong_content` | 24 | 19.7% |
| `cross_session:aggregation_incomplete` | 14 | 11.5% |
| `temporal:date_arithmetic_wrong` | 10 | 8.2% |
| `stale:old_version_returned` | 10 | 8.2% |
| `retrieval_miss:temporal_event_not_found` | 7 | 5.7% |
| `temporal:ordering_wrong` | 6 | 4.9% |
| `retrieval_miss:single_fact_not_found` | 4 | 3.3% |
| `retrieval_miss:multi_session_not_found` | 4 | 3.3% |
| `wrong_answer:other` | 3 | 2.5% |
| `cross_session:synthesis_wrong` | 3 | 2.5% |
| `temporal:relative_time_wrong` | 2 | 1.6% |

## Analysis

### Aggregation (49 failures / 40.2%) — THE dominant problem
35 complete retrieval misses + 14 partial retrievals. Questions like 'how many books', 'total spent on X'.
Top-K retrieval cannot enumerate scattered facts. Entity graph is the fix.

### Temporal (25 failures / 20.5%)
Date resolution improved this from 57→72% but 25 remain: 10 arithmetic errors, 6 ordering errors, 7 event-not-found, 2 relative-time.
Timeline projection + date-diff enforcement needed.

### Stale Knowledge (10 / 8.2%)
Supersession at ingest uses ts_rank overlap which misses paraphrased updates.
Needs semantic similarity or entity-based supersession.

### Retrieval Vocabulary Mismatch (28 / 23.0%)
24 found wrong content + 4 found nothing. Proposition extraction would create fine-grained, independently retrievable claim chunks.

---

## Detailed Failure Inventory


### retrieval_miss:aggregation_query (35)

**545bd2b5** | `single-session-user`
- **Q:** How much screen time have I been averaging on Instagram per day?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about your Instagram screen time in your conversation history. It's possible this topic hasn't come up in any of your past conversations stored in memory.  If you'd like to track or discuss this, you could: - **C...

**0a995998** | `multi-session`
- **Q:** How many items of clothing do I need to pick up or return from a store?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information in your conversation history about clothing items you need to pick up or return from a store. This may not have been discussed in any of your past conversations.  Could you provide more details, or is it possible...

**6d550036** | `multi-session`
- **Q:** How many projects have I led or am currently leading?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about projects you've led or are currently leading in your conversation history. It's possible this topic hasn't come up in your past conversations, or it may have been discussed using different terminology.  Cou...

**b5ef892d** | `multi-session`
- **Q:** How many days did I spend on camping trips in the United States this year?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about personal camping trips in the United States this year. The search results returned general travel advice and unrelated topics, but nothing about your specific camping trips or their...

**3a704032** | `multi-session`
- **Q:** How many plants did I acquire in the last month?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about acquiring plants. It's possible this topic hasn't come up in your past conversations, or it may have been discussed in a way that wasn't captured in memory.  Could you provide more...

**c4a1ceb8** | `multi-session`
- **Q:** How many different types of citrus fruits have I used in my cocktail recipes?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any cocktail recipes in your conversation history. It doesn't appear that you've discussed or shared any cocktail recipes — including ones with citrus fruits — in your past conversations stored in memory.  If you'd like to share...

**gpt4_a56e767c** | `multi-session`
- **Q:** How many movie festivals that I attended?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about movie or film festivals in your conversation history. It doesn't appear that you've mentioned attending any movie/film festivals in your past conversations. If you have, could you provide more details so I...

**gpt4_2f8be40d** | `multi-session`
- **Q:** How many weddings have I attended in this year?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about weddings you attended in 2023. It's possible this topic was never discussed in your past conversations, or it may have been mentioned in a way that wasn't captured in memory.  Could...

**88432d0a** | `multi-session`
- **Q:** How many times did I bake something in the past two weeks?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of baking activities in your conversation history. It's possible that you didn't discuss any baking in your past conversations, or the details weren't saved to memory. Could you provide more context, or is it possibl...

**2e6d26dc** | `multi-session`
- **Q:** How many babies were born to friends and family members in the last few months?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about babies being born to friends or family members. This topic doesn't appear to have come up in your past conversations stored in memory.  If you'd like, you can share the details and...

**gpt4_15e38248** | `multi-session`
- **Q:** How many pieces of furniture did I buy, assemble, sell, or fix in the past few months?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history related to buying, assembling, selling, or fixing furniture. It's possible that those conversations weren't saved to memory, or they may have happened outside of the tracked sessions.  Co...

**d23cf73b** | `multi-session`
- **Q:** How many different cuisines have I learned to cook or tried out in the past few months?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about cooking or trying out different cuisines. It's possible that those conversations weren't saved to memory, or they may have happened outside of the tracked sessions.  Could you give...

**7024f17c** | `multi-session`
- **Q:** How many hours of jogging and yoga did I do last week?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of jogging or yoga sessions in your conversation history. It's possible that:  - You haven't logged or discussed these activities in your past conversations, or - The information was recorded under different terms or...

**2ce6a0f2** | `multi-session`
- **Q:** How many different art-related events did I attend in the past month?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of art-related events in your conversation history. There's no mention of galleries, exhibitions, museums, performances, or similar events in the past month (since approximately February 6, 2023).  It's possible that...

**00ca467f** | `multi-session`
- **Q:** How many doctor's appointments did I go to in March?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of doctor's appointments in March in your conversation history. The search results returned unrelated topics (social media, music events, astrology, etc.) with no mention of medical appointments.  It's possible that...

**gpt4_31ff4165** | `multi-session`
- **Q:** How many health-related devices do I use in a day?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about health-related devices you use in your past conversations. It's possible this topic hasn't come up before in your conversation history. Could you share more details? I'd be happy to help once I have more co...

**9d25d4e0** | `multi-session`
- **Q:** How many pieces of jewelry did I acquire in the last two months?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about acquiring or purchasing jewelry. It's possible this topic hasn't come up in your past conversations stored in memory.  Could you provide more context? For example, were you tracking...

**10d9b85a** | `multi-session`
- **Q:** How many days did I spend attending workshops, lectures, and conferences in April?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any specific records in your conversation history about attending workshops, lectures, or conferences in April 2023. The search results don't contain any relevant information about such events.  I'm sorry, but I don't have any r...

**2b8f3739** | `multi-session`
- **Q:** What is the total amount of money I earned from selling my products at the markets?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any information in your conversation history about selling products at markets or any related earnings. The search results returned unrelated content.  It's possible that this topic was never discussed in your pas...

**1a8a66a6** | `multi-session` **REGRESSED**
- **Q:** How many magazine subscriptions do I currently have?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about magazine subscriptions in your conversation history. It's possible this topic hasn't come up in any of your past conversations. Could you provide more context, or is it possible you discussed this under a d...

**bf659f65** | `multi-session`
- **Q:** How many music albums or EPs have I purchased or downloaded?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about purchasing or downloading music albums or EPs. It's possible this topic hasn't come up in any of your past conversations stored in memory. If you'd like to track this going forward,...

**81507db6** | `multi-session`
- **Q:** How many graduation ceremonies have I attended in the past three months?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of graduation ceremonies in your conversation history. There are no mentions of attending any graduation ceremonies in the past three months (or at any other time) stored in your memory.  If you'd like to track this...

**cc06de0d** | `multi-session`
- **Q:** For my daily commute, how much more expensive was the taxi ride compared to the train fare?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about your daily commute, taxi rides, or train fares in your conversation history. It's possible this topic hasn't been discussed in any of your past conversations stored in memory.  Could you provide more detail...

**ef66a6e5** | `multi-session`
- **Q:** How many sports have I played competitively in the past?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about competitive sports in your conversation history. It's possible this topic hasn't come up in any of your past conversations stored in memory. Could you share more details? I'd be happy to help once I have th...

**0ea62687** | `multi-session`
- **Q:** How much more miles per gallon was my car getting a few months ago compared to now?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about your car's miles per gallon (MPG) in your conversation history. It doesn't appear that this topic has been discussed in any of your past conversations stored in memory.  Could you share more details? For ex...

**ba358f49** | `multi-session`
- **Q:** How many years will I be when my friend Rachel gets married?
- **Gold:** (see dataset)
- **Hyp:** I can confirm that Rachel is getting married **next year** (2023), as mentioned in your conversation from 2022-09-01. However, I was unable to find your date of birth or current age anywhere in your conversation history.  To answer how old you'll be...

**60159905** | `multi-session`
- **Q:** How many dinner parties have I attended in the past month?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of dinner parties in your conversation history. It's possible this topic simply hasn't come up in your past conversations stored in memory. Could you provide more context, or is it possible you discussed this under a...

**c18a7dc8** | `multi-session`
- **Q:** How many years older am I than when I graduated from college?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I don't have any information in your conversation history about your college graduation year or your current age. To answer this question, I'd need to know:  1. **Your birth year (or current age)** 2. **The year you graduated from coll...

**87f22b4a** | `multi-session`
- **Q:** How much have I made from selling eggs this month?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about selling eggs or related income. It's possible this topic hasn't come up in your past conversations stored in memory.  Could you provide more context? For example: - Are you tracking...

**b46e15ed** | `temporal-reasoning`
- **Q:** How many months have passed since I participated in two charity events in a row, on consecutive days?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records of you participating in charity events in my memory system — not even a single event, let alone two on consecutive days. It's possible this wasn't discussed in any of your past conversations that have been stored.  C...

**gpt4_1916e0ea** | `temporal-reasoning`
- **Q:** How many days passed between the day I cancelled my FarmFresh subscription and the day I did my online grocery shopping from Instacart?
- **Gold:** (see dataset)
- **Hyp:** I was unable to find specific records in your memory about the exact dates of your FarmFresh subscription cancellation or your Instacart grocery shopping. While there are mentions of a subscription cancellation (saving $100/month) and general grocery...

**6e984301** | `temporal-reasoning`
- **Q:** How many weeks have I been taking sculpting classes when I invested in my own set of sculpting tools?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about sculpting classes or a sculpting tools purchase in your conversation history. It's possible this topic hasn't been discussed in any of your past conversations that are stored in memory. Could you provide mo...

**gpt4_21adecb5** | `temporal-reasoning`
- **Q:** How many months passed between the completion of my undergraduate degree and the submission of my master's thesis?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any information in your conversation history about the completion of your undergraduate degree or the submission of your master's thesis. These dates don't appear to have been mentioned in any of your past convers...

**6aeb4375** | `knowledge-update`
- **Q:** How many Korean restaurants have I tried in my city?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about Korean restaurants you've tried in your city. It's possible this topic hasn't come up in any of your past conversations stored in memory.  If you'd like, you can share details about...

**affe2881** | `knowledge-update`
- **Q:** How many different species of birds have I seen in my local park?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about bird species you've seen in your local park. It's possible this topic hasn't come up in any of your past conversations stored in memory.  If you'd like, you could share your bird si...


### retrieval_miss:found_wrong_content (24)

**5d3d2817** | `single-session-user`
- **Q:** What was my previous occupation?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find specific information about your previous occupation in the memory system. The conversations stored don't appear to contain details about your personal work history or former job.  Could you provide more context? For example, if...

**28dc39ac** | `multi-session`
- **Q:** How many hours have I spent playing games in total?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversations, I can identify the specific games you mentioned completing and the hours you spent on them:  | Game | Hours | |---|---| | **The Last of Us Part II** (normal difficulty) | 25 hours | | **The Last of Us Part II** (hard diff...

**gpt4_731e37d7** | `multi-session`
- **Q:** How much total money did I spend on attending workshops in the last four months?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, I can now identify all the workshops you attended in the last four months (i.e., from approximately late October 2022 to February 26, 2023) along with their costs. Here's a breakdown of the ones with specific costs mentio...

**35a27287** | `single-session-preference`
- **Q:** Can you recommend some interesting cultural events happening around me this weekend?
- **Gold:** (see dataset)
- **Hyp:** Unfortunately, I don't have enough specific information from your conversation history to give you a fully tailored recommendation. Here's what I found and what's missing:  **What I know about you:** - You have a strong interest in **cultural diversi...

**4f54b7c9** | `multi-session`
- **Q:** How many antique items did I inherit or acquire from my family members?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any records in your conversation history about antique items inherited or acquired from family members. It's possible this topic hasn't come up in any of your past conversations stored in the memory system.  Could you provide mo...

**9aaed6a3** | `multi-session`
- **Q:** How much cashback did I earn at SaveMart last Thursday?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find a specific record of a SaveMart transaction from last Thursday (May 25, 2023) in your conversation history. While there are some past conversations mentioning SaveMart and a 1% cashback rate, there's no logged transaction showin...

**51c32626** | `multi-session` **REGRESSED**
- **Q:** When did I submit my research paper on sentiment analysis?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversation history, I don't find a specific record of you personally submitting a research paper on sentiment analysis. However, I did find a relevant detail from your conversations:  In a session from **May 30, 2023**, you mentioned...

**4bc144e2** | `multi-session` **REGRESSED**
- **Q:** How much did I spend on car wash and parking ticket?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I couldn't find any records in your conversation history related to **car wash** or **parking ticket** expenses. It's possible that these transactions were never discussed in your past conversations stored in the memory system.  Could...

**67e0d0f2** | `multi-session`
- **Q:** What is the total number of online courses I've completed?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory results, I found a clear and direct mention of the number of online courses you've completed. In a session from **May 27, 2023**, you stated:  > *"Since I've already completed **12 courses on Coursera**, I'm confident that I have...

**73d42213** | `multi-session`
- **Q:** What time did I reach the clinic on Monday?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I don't have any record in your conversation history of the specific time you arrived at the clinic on Monday. The related conversations I found are about rescheduling a doctor's appointment and finding nearby clinics, but none of them...

**8cf4d046** | `multi-session`
- **Q:** What is the average GPA of my undergraduate and graduate studies?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, here's what I found:  - **Graduate (Master's) GPA**: **3.8 / 4.0** — Master's degree in Data Science from the University of Illinois at Urbana-Champaign. - **Undergraduate GPA**: Your undergraduate studies at the **U...

**21d02d0d** | `multi-session`
- **Q:** How many fun runs did I miss in March due to work commitments?
- **Gold:** (see dataset)
- **Hyp:** Based on the search results, I found one relevant mention. In a conversation about your training schedule, it was noted that you missed the **5K fun run on March 26th**. However, the memory only explicitly references **one** fun run missed in March d...

**eac54add** | `temporal-reasoning`
- **Q:** What was the significant buisiness milestone I mentioned four weeks ago?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find a specific personal business milestone you mentioned around four weeks ago (approximately February 28, 2023) in the memory system. The search results from that time period relate to general business topics like ad campaigns, lea...

**9a707b82** | `temporal-reasoning`
- **Q:** I mentioned cooking something for my friend a couple of days ago. What was it?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find a specific mention of you cooking something for a friend in the memory records from around April 10, 2022 (a couple of days ago). The conversations I found from that period are about meal planning, recipe ideas, and dinner party...

**6e984302** | `temporal-reasoning`
- **Q:** I mentioned an investment for a competition four weeks ago? What did I buy?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any record in your conversation history of you mentioning an investment made for a competition around four weeks ago (approximately early March 2023). The memory system doesn't appear to contain a conversation mat...

**gpt4_8279ba03** | `temporal-reasoning`
- **Q:** What kitchen appliance did I buy 10 days ago?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find a specific mention of a kitchen appliance purchase in my searches. The memory system doesn't appear to contain a record of you buying a kitchen appliance around 10 days ago (around March 15, 2023). It's possible this wasn't disc...

**08f4fc43** | `temporal-reasoning`
- **Q:** How many days had passed between the Sunday mass at St. Mary's Church and the Ash Wednesday service at the cathedral?
- **Gold:** (see dataset)
- **Hyp:** I found that the Ash Wednesday service at the cathedral was on **February 1st**, but I wasn't able to find a specific date mentioned for the Sunday mass at St. Mary's Church in your conversation history. The memory records discuss church attendance a...

**gpt4_93159ced** | `temporal-reasoning`
- **Q:** How long have I been working before I started my current job at NovaTech?
- **Gold:** (see dataset)
- **Hyp:** Based on what you've shared in past conversations, here's what I found:  - You mentioned that you **"have been in this field since I graduated"** with a Computer Science degree from UC Berkeley. - You've been **working at NovaTech for about 4 years a...

**e4e14d04** | `temporal-reasoning` **REGRESSED**
- **Q:** How long had I been a member of 'Book Lovers Unite' when I attended the meetup?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find specific details about when you **joined** "Book Lovers Unite" or the exact date of the meetup you attended with that group in my memory records. The conversations I found reference you being active in the "Book Lovers Unite" Fa...

**gpt4_2f584639** | `temporal-reasoning` **REGRESSED**
- **Q:** Which gift did I buy first, the necklace for my sister or the photo album for my mom?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, I can see both gifts were mentioned in conversations dated **2023-05-30**, but with different timestamps:  - The **necklace for your sister** from Tiffany's was mentioned as having been bought **"last weekend"** (around 2...

**c8090214_abs** | `temporal-reasoning`
- **Q:** How many days before I bought my iPad did I attend the Holiday Market?
- **Gold:** (see dataset)
- **Hyp:** I have enough information to answer. Here's what the memory reveals:  - **Holiday Market**: You attended it **"a week before Black Friday"** (i.e., ~1 week before Black Friday). - **iPad purchase**: The memory mentions an iPhone 13 Pro bought on **Bl...

**01493427** | `knowledge-update`
- **Q:** How many new postcards have I added to my collection since I started collecting again?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I don't have any information about postcard collecting in your conversation history. The memory system doesn't contain any records of you discussing postcards, starting a postcard collection, or adding postcards to a collection. It's p...

**9bbe84a2** | `knowledge-update`
- **Q:** What was my previous goal for my Apex Legends level before I updated my goal?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, your **previous goal** for your Apex Legends level was **level 150**. This was clearly stated in a conversation from September 30, 2023, where you said: *"my current goal is to reach level 150, and I'm determined to get t...

**7161e7e2** | `single-session-assistant`
- **Q:** I'm checking our previous chat about the shift rotation sheet for GM social media agents. Can you remind me what was the rotation for Admon on a Sunday?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any record of a conversation about a **shift rotation sheet for GM social media agents** or specifically about **Admon's Sunday rotation** in your conversation history. The memory system only returned unrelated re...


### cross_session:aggregation_incomplete (14)

**gpt4_d84a3211** | `multi-session`
- **Q:** How much total money have I spent on bike-related expenses since the start of the year?
- **Gold:** (see dataset)
- **Hyp:** Based on the conversations in your memory, here's a breakdown of the bike-related expenses you've mentioned since the start of 2023:  | Date | Item | Cost | |------|------|------| | April 10 | Bell Zephyr helmet (from local bike shop) | Not specified...

**gpt4_7fce9456** | `multi-session`
- **Q:** How many properties did I view before making an offer on the townhouse in the Brookside neighborhood?
- **Gold:** (see dataset)
- **Hyp:** Now I have a clear picture from the memory results. Let me piece together the properties viewed before the offer on the Brookside townhouse:  From the conversations, here are the properties viewed **before** making an offer on the Brookside townhouse...

**gpt4_194be4b3** | `multi-session`
- **Q:** How many musical instruments do I currently own?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversation history, here's what I can piece together about your instruments:  **Instruments you currently own (2):** 1. **Guitar** — You mentioned you've been playing guitar for a while and recently started taking guitar lessons. 2. *...

**a9f6b44c** | `multi-session`
- **Q:** How many bikes did I service or plan to service in March?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversations, I found the following bike-related service activities in March:  1. **March 2nd** — You cleaned and lubricated the chain on your road bike yourself (mentioned in a session on March 20th). 2. **March 10th** — You had your...

**d851d5ba** | `multi-session`
- **Q:** How much money did I raise for charity in total?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversations, I can identify the following specific amounts you've raised for charity:  1. **$250** — raised for a local food bank by running 5km in the "Run for Hunger" charity event on March 12th. 2. **$500** — raised for the America...

**gpt4_ab202e7f** | `multi-session`
- **Q:** How many kitchen items did I replace or fix?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, I found **3 kitchen items** that you replaced or fixed:  1. **Toaster → Toaster Oven** *(replaced)* — You got rid of your old toaster and replaced it with a toaster oven. 2. **Kitchen mat** *(replaced)* — You replace...

**5a7937c8** | `multi-session`
- **Q:** How many days did I spend participating in faith-related activities in December?
- **Gold:** (see dataset)
- **Hyp:** Based on my search through your conversation history, I can identify **2 days** of faith-related activities in December that you mentioned:  1. **December 24th** – Midnight Mass at **St. Mary's Church** (Christmas Eve), attended with your family. 2....

**gpt4_e05b82a6** | `multi-session`
- **Q:** How many times did I ride rollercoasters across all the events I attended from July to October?
- **Gold:** (see dataset)
- **Hyp:** I now have a clear and complete picture. Here's the full tally of rollercoaster rides across your events from July to October:  | Event | Date | Rollercoasters Ridden | Count | |---|---|---|---| | **SeaWorld San Diego** (Summer Nights) | July | Mako,...

**e3038f8c** | `multi-session`
- **Q:** How many rare items do I have in total?
- **Gold:** (see dataset)
- **Hyp:** Based on the information found in your conversations, here's a breakdown of the specific rare item counts mentioned:  - **Rare vinyl records**: **57** (you mentioned having a collection of 57 rare records) - **Rare coins**: **25**  These are the only...

**9ee3ecd6** | `multi-session`
- **Q:** How many points do I need to earn to redeem a free skincare product at Sephora?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you need **300 points** to redeem a free skincare product at Sephora. In a previous session, you mentioned that you just needed a total of 300 points to redeem your free skincare product through Sephora's Beauty Insi...

**61f8c8f8** | `multi-session`
- **Q:** How much faster did I finish the 5K run compared to my previous year's time?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, I can only find your **previous year's 5K time of 45 minutes** (from around October 2022), which was mentioned when you were building a training plan. However, there is **no record of a current/recent 5K finish time** sto...

**bc149d6b** | `multi-session`
- **Q:** What is the total weight of the new feed I purchased in the past two months?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversation history, you purchased a **50-pound batch of layer feed** on **May 22, 2023** — just 8 days ago, well within the past two months. That appears to be the only feed purchase recorded in your conversations.  So the total weigh...

**a08a253f** | `multi-session`
- **Q:** How many days a week do I attend fitness classes?
- **Gold:** (see dataset)
- **Hyp:** You attend fitness classes **3 days a week**:  - **Tuesday** – Zumba class at 6:30 pm - **Thursday** – Zumba class at 6:30 pm - **Saturday** – Weightlifting class at 10:00 am

**09ba9854_abs** | `multi-session`
- **Q:** How much will I save by taking the bus from the airport to my hotel instead of a taxi?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you discussed transportation from the airport to your hotel in **Tokyo**. Here's what was mentioned:  - **Taxi**: ~**$60** (the price you were quoted) - **Airport Limousine Bus**: ~**$10–$20**, depending on the route...


### stale:old_version_returned (10)

**830ce83f** | `knowledge-update`
- **Q:** Where did Rachel move to after her recent relocation?
- **Gold:** (see dataset)
- **Hyp:** Rachel moved to **Chicago**. Based on your past conversations, you mentioned that she recently moved to a new apartment in the city, and when asked which city, you confirmed it was Chicago (also known as "The Windy City").

**2698e78f** | `knowledge-update`
- **Q:** How often do I see my therapist, Dr. Smith?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you see Dr. Smith **every two weeks (bi-weekly)**. You mentioned this yourself in a session, noting: *"I have a therapy session with Dr. Smith coming up soon - it's every two weeks, so I'm looking forward to discussi...

**6071bd76** | `knowledge-update`
- **Q:** For the coffee-to-water ratio in my French press, did I switch to more water per tablespoon of coffee, or less?
- **Gold:** (see dataset)
- **Hyp:** I only found one mention of your French press ratio in memory — from a session on **February 11, 2023**, where you mentioned using **1 tablespoon of coffee for every 6 ounces of water**. However, there's no record of you switching to a different rati...

**2133c1b5** | `knowledge-update`
- **Q:** How long have I been living in my current apartment in Harajuku?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversations, you moved into your Harajuku studio apartment around **mid-March 2023** (you mentioned it had been "a month" in a session dated April 11, 2023). As of today (October 15, 2023), you've been living there for approximately *...

**0e4e4c46** | `knowledge-update`
- **Q:** What is my current highest score in Ticket to Ride?
- **Gold:** (see dataset)
- **Hyp:** Your current highest score in Ticket to Ride is **124 points**! You mentioned this in a conversation on May 23, 2023, where you said you'd been "crushing it" lately and were eager to keep improving. Great job! 🎉

**e66b632c** | `knowledge-update`
- **Q:** What was my previous personal best time for the charity 5K run?
- **Gold:** (see dataset)
- **Hyp:** Your previous personal best time for the charity 5K run was **26 minutes and 30 seconds**. This was mentioned in a past conversation where you noted you had beaten that record by shaving off about a minute and a half from your previous time.

**69fee5aa** | `knowledge-update`
- **Q:** How many pre-1920 American coins do I have in my collection?
- **Gold:** (see dataset)
- **Hyp:** You have **37 pre-1920 American coins** in your collection. This was confirmed directly from your past conversations, where you mentioned: *"I was thinking of organizing my pre-1920 American coins by denomination and mint mark. I have a total of 37 c...

**dad224aa** | `knowledge-update`
- **Q:** What time do I wake up on Saturday mornings?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned that you wake up at **8:30 am on Saturday mornings**. This came up in a discussion about your weekend morning routine, where you referenced your existing Saturday wake-up time of 8:30 am.

**031748ae_abs** | `knowledge-update`
- **Q:** How many engineers do I lead when I just started my new role as Software Engineer Manager?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, when you first started your new role, you mentioned leading a team of **4 engineers**. This was noted in an earlier session (May 25, 2023), where you clarified: *"I lead a team of 4 engineers in my new role as Senior...

**07741c45** | `knowledge-update`
- **Q:** Where do I currently keep my old sneakers?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned keeping your old sneakers **under your bed** for storage. You noted at the time that they were starting to smell as a result. You were given tips on better storage options, but that was the location you...


### temporal:date_arithmetic_wrong (10)

**b46e15ee** | `temporal-reasoning`
- **Q:** What charity event did I participate in a month ago?
- **Gold:** (see dataset)
- **Hyp:** About a month ago (exactly 30 days ago, on **March 19, 2023**), you participated in a **charity walk**! You were asking for tips on staying hydrated during the walk. You also mentioned you had been participating in multiple charity events and were lo...

**gpt4_f420262d** | `temporal-reasoning`
- **Q:** What was the airline that I flied with on Valentine's day?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory results, I can see that on **February 14, 2023 (Valentine's Day)**, you flew with **Delta Airlines**. The flight details were:  - **Flight Numbers:** DL 1242 (FLL to ATL) + DL 2166 (ATL to BOS) - **Route:** Fort Lauderdale (FLL) →...

**gpt4_1e4a8aec** | `temporal-reasoning`
- **Q:** What gardening-related activity did I do two weeks ago?
- **Gold:** (see dataset)
- **Hyp:** The session from **April 21, 2023** is exactly two weeks ago. Based on that session, the gardening-related activity you were doing was **watering your tomato plants** — specifically, you were trying to figure out how often to water them during a **dr...

**gpt4_e414231f** | `temporal-reasoning`
- **Q:** Which bike did I fixed or serviced the past weekend?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned that your **mountain bike** had been fixed and was running smoothly. This was referenced in a session from **March 15, 2023**, where it was noted:  > *"It's great to hear that you got it fixed and it's...

**gpt4_59149c78** | `temporal-reasoning`
- **Q:** I mentioned that I participated in an art-related event two weeks ago. Where was that event held at?
- **Gold:** (see dataset)
- **Hyp:** Based on the search results, I found a session from **January 14, 2023** (which is about 2.5 weeks before today, February 1, 2023) where you mentioned participating in a guided tour. Specifically, you mentioned attending the **"Impressionist Masterpi...

**gpt4_fa19884d** | `temporal-reasoning` **REGRESSED**
- **Q:** What is the artist that I started to listen to last Friday?
- **Gold:** (see dataset)
- **Hyp:** Based on the session from **March 31, 2023** (last Friday), I can see that you were exploring new music genres. In that session, you were discussing **jazz** musicians and albums, and the conversation also touched on **bluegrass** artists. However, t...

**0bc8ad93** | `temporal-reasoning` **REGRESSED**
- **Q:** I mentioned visiting a museum two months ago. Did I visit with a friend or not?
- **Gold:** (see dataset)
- **Hyp:** The closest match to "two months ago" is the session from **October 22, 2022** (about 4–5 months ago), where you mentioned a **behind-the-scenes tour of the Science Museum**. In that conversation, you said you went **with a friend who is a chemistry...

**gpt4_68e94288** | `temporal-reasoning`
- **Q:** What was the social media activity I participated 5 days ago?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory results, I can see that on **March 15, 2023** (5 days ago), your conversation was not specifically about social media activity you personally participated in. Instead, the session (Session `answer_9793daa4_1`) was focused on **fit...

**993da5e2** | `temporal-reasoning`
- **Q:** How long had I been using the new area rug when I rearranged my living room furniture?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, here's what I found:  - In a session dated **2023-05-26**, you mentioned that you **rearranged your living room furniture three weeks ago** (from that date, so around May 5, 2023). - In a separate session also dated **202...

**gpt4_2f56ae70** | `temporal-reasoning`
- **Q:** Which streaming service did I start using most recently?
- **Gold:** (see dataset)
- **Hyp:** Based on your conversation history, the most relevant information I found is from a session on **2023-05-26** where you mentioned: *"I've been using Netflix, Hulu, and Amazon Prime for the past 6 months."* Later in that same day, you decided to add t...


### retrieval_miss:temporal_event_not_found (7)

**gpt4_7f6b06db** | `temporal-reasoning`
- **Q:** What is the order of the three trips I took in the past three months, from earliest to latest?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any information about trips you've taken in my memory system. There are no records of travel or trips from the past three months (March–June 2023) stored in your conversation history.  Could you provide more detai...

**gpt4_7abb270c** | `temporal-reasoning`
- **Q:** What is the order of the six museums I visited from earliest to latest?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any records of museum visits in your conversation history. There doesn't appear to be any stored information about museums you've visited. It's possible this was discussed outside of the sessions saved in memory....

**gpt4_f420262c** | `temporal-reasoning`
- **Q:** What is the order of airlines I flew with from earliest to latest before today?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but there's no information in your conversation history about any flights or airlines you've flown with. It's possible this was never discussed in your past conversations. Could you provide more details or confirm if you've mentioned your...

**71017277** | `temporal-reasoning`
- **Q:** I received a piece of jewelry last Saturday from whom?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any information in your conversation history about receiving a piece of jewelry last Saturday (March 4, 2023). This detail doesn't appear to be recorded in your past conversations. Could you provide more context,...

**gpt4_d6585ce9** | `temporal-reasoning`
- **Q:** Who did I go with to the music event last Saturday?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find a specific record in your conversation history about who you went with to a music event last Saturday (April 15, 2023). While your history does mention attending various music events — such as a music festival in Brooklyn with a...

**gpt4_468eb064** | `temporal-reasoning`
- **Q:** Who did I meet with during the lunch last Tuesday?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any record of a lunch meeting last Tuesday (April 11, 2023) in your conversation history. There's no mention of who you may have met with during a lunch on that day.  It's possible this event wasn't discussed in a...

**d01c6aa8** | `temporal-reasoning`
- **Q:** How old was I when I moved to the United States?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find specific information in your memory about when you moved to the United States or your date of birth/age at that time. While there are conversations about living in the US (such as being on a work visa for five years and applying...


### temporal:ordering_wrong (6)

**gpt4_45189cb4** | `temporal-reasoning`
- **Q:** What is the order of the sports events I watched in January?
- **Gold:** (see dataset)
- **Hyp:** I now have enough information to answer. Here are the two sports events you watched in January, in chronological order:  1. **January 5, 2023 — Lakers vs. Chicago Bulls (NBA game)** at the Staples Center in LA, which you attended in person with your...

**gpt4_d6585ce8** | `temporal-reasoning` **REGRESSED**
- **Q:** What is the order of the concerts and musical events I attended in the past two months, starting from the earliest?
- **Gold:** (see dataset)
- **Hyp:** Based on my research, I have clear evidence of the concerts and musical events you attended. The Brooklyn music festival was mentioned in the April 1st session as a past event, and the April 15th session also references it as "recently." Let me now c...

**a3838d2b** | `temporal-reasoning`
- **Q:** How many charity events did I participate in before the 'Run for the Cure' event?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory records, the conversations clearly show that the **"Run for the Cure"** event (a 5km run on October 15th to raise money for breast cancer research) appears to be your **first** charity event. In the sessions, you mentioned:  - You...

**gpt4_4edbafa2** | `temporal-reasoning`
- **Q:** What was the date on which I attended the first BBQ event in June?
- **Gold:** (see dataset)
- **Hyp:** Based on the memory results, I can see two BBQ events mentioned in June:  1. **June 10th** — You made Korean-style BBQ dishes (referenced as "the one I made on the 10th of June"). 2. **June 17th** — You attended a BBQ at a friend's place (referenced...

**gpt4_88806d6e** | `temporal-reasoning`
- **Q:** Who did I meet first, Mark and Sarah or Tom?
- **Gold:** (see dataset)
- **Hyp:** I was able to find information about **Mark and Sarah** — you mentioned meeting them on a beach trip about a month ago. However, my searches did not return any records about you meeting someone named **Tom**.  Without any memory of when you met Tom,...

**gpt4_1a1dc16d** | `temporal-reasoning`
- **Q:** Which event happened first, the meeting with Rachel or the pride parade?
- **Gold:** (see dataset)
- **Hyp:** I found both events clearly in your conversation history. Here's what the records show:  - **Pride Parade**: You attended it on **May 1st**. This was mentioned in a session timestamped **2023-05-09 at 12:07**. - **Meeting with Rachel**: This was disc...


### retrieval_miss:single_fact_not_found (4)

**d52b4f67** | `single-session-user` **REGRESSED**
- **Q:** Where did I attend my cousin's wedding?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find the specific location of your cousin's wedding in my memory records. While your cousin's wedding is briefly mentioned in a past conversation, the location or venue was not recorded. Could you be thinking of a spec...

**8a2466db** | `single-session-preference`
- **Q:** Can you recommend some resources where I can learn more about video editing?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any prior conversations in your history related to video editing, so I don't have personalized context to tailor my recommendations. That said, here are some great general resources for learning video editing:  ---  ### 🎬 Online...

**18bc8abd** | `knowledge-update`
- **Q:** What brand of BBQ sauce am I currently obsessed with?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about a BBQ sauce brand in your conversation history. This topic doesn't appear to have come up in any of your past conversations that I have access to. Could you be thinking of a different conversation, or is th...

**89941a94** | `knowledge-update`
- **Q:** Before I purchased the gravel bike, do I have other bikes in addition to my mountain bike and my commuter bike?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information in your conversation history about your bikes or a gravel bike purchase. There's no record of discussions about your bike collection — including whether you owned any bikes beyond a mountain bike and a commuter b...


### retrieval_miss:multi_session_not_found (4)

**dd2973ad** | `multi-session`
- **Q:** What time did I go to bed on the day before I had a doctor's appointment?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I wasn't able to find any information in your conversation history about a doctor's appointment or what time you went to bed. There are no records in your memory that mention either of these details. It's possible this information was...

**gpt4_2ba83207** | `multi-session`
- **Q:** Which grocery store did I spend the most money at in the past month?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find any information about grocery store spending in your conversation history. It's possible that:  - You haven't logged or discussed grocery purchases in any past conversations. - The spending data may be stored in a separate app o...

**a1cc6108** | `multi-session`
- **Q:** How old was I when Alex was born?
- **Gold:** (see dataset)
- **Hyp:** I'm sorry, but I don't have any information in your conversation history about an "Alex" being born (as in, a child of yours). The only "Alex" mentioned in your past conversations is a **21-year-old intern** you are mentoring at work — not a newborn...

**92a0aa75** | `multi-session`
- **Q:** How long have I been working in my current role?
- **Gold:** (see dataset)
- **Hyp:** I wasn't able to find specific details about when you started your current role in my memory. While I can see from a past conversation that you mentioned being a **Senior Marketing Specialist**, there's no record of a specific start date for that pos...


### cross_session:synthesis_wrong (3)

**a11281a2** | `multi-session`
- **Q:** What was the approximate increase in Instagram followers I experienced in two weeks?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned that after **two weeks of posting regularly on Instagram**, you had gained approximately **350 followers**. That was the approximate increase in Instagram followers you experienced during that two-week...

**1f2b8d4f** | `multi-session` **REGRESSED**
- **Q:** What is the difference in price between my luxury boots and the similar pair found at the budget store?
- **Gold:** (see dataset)
- **Hyp:** I found the key details from your conversation. You mentioned paying **$800** for your luxury boots, and when discussing budget alternatives, you were looking in the **$50–$100** range, with the budget store options (like those at Forever 21, H&M, Ta...

**a96c20ee_abs** | `multi-session`
- **Q:** At which university did I present a poster for my undergrad course research project?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned attending your **first research conference over the summer** where you presented a poster on your thesis/research project. In a later session, you specified that this conference was held at **Harvard Un...


### wrong_answer:other (3)

**ec81a493** | `single-session-user`
- **Q:** How many copies of my favorite artist's debut album were released worldwide?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, you mentioned that the signed poster that came with your **favorite artist's debut album** was a **limited edition of only 500 copies worldwide**. 🎶  You noted it was a special, rare item you were considering display...

**75832dbd** | `single-session-preference` **REGRESSED**
- **Q:** Can you recommend some recent publications or conferences that I might find interesting?
- **Gold:** (see dataset)
- **Hyp:** Based on your past conversations, I can see you have a rich set of research interests spanning several areas. Here are tailored recommendations:  ---  ### 🧠 Neuroscience & Brain-Computer Interfaces Given your background in **functional neural interfa...

**09d032c9** | `single-session-preference` **REGRESSED**
- **Q:** I've been having trouble with the battery life on my phone lately. Any tips?
- **Gold:** (see dataset)
- **Hyp:** I don't see any specific conversations about your phone's battery life in your history, but I do notice you've previously discussed tech accessories like portable power banks — which is actually relevant here! Based on that context and general best p...


### temporal:relative_time_wrong (2)

**9a707b81** | `temporal-reasoning`
- **Q:** How many days ago did I attend a baking class at a local culinary school when I made my friend's birthday cake?
- **Gold:** (see dataset)
- **Hyp:** It looks like these were actually two separate events in your memory:  1. **Baking class at a local culinary school** — took place on **March 20, 2022**, which was **26 days ago**. 2. **Friend's birthday cake** (a chocolate cake with espresso powder)...

**370a8ff4** | `temporal-reasoning`
- **Q:** How many weeks had passed since I recovered from the flu when I went on my 10th jog outdoors?
- **Gold:** (see dataset)
- **Hyp:** Here's the breakdown:  - **Flu recovery date:** January 19, 2023 - **10th outdoor jog date:** April 10, 2023  That's **81 days**, or approximately **11.6 weeks** (roughly **11 weeks and 4 days**) between your flu recovery and your 10th jog outdoors.


---
*Generated 2026-03-30*
