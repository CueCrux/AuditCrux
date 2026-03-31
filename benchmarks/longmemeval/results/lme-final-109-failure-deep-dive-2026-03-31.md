# LongMemEval 78.2%% — Final 109 Failure Deep Dive

**Date:** 2026-03-31
**Best confirmed:** 78.2%% (391/500)
**Failures:** 109
---

## Failure Taxonomy

| Cause | Count | %% | Fixable? | How |
|-------|-------|----|----------|-----|
| `abstained` | 40 | 36%% | YES | Sonnet extraction ($120) would find 60%%+ of these missing facts |
| `wrong_number` | 31 | 28%% | PARTIAL | LLM reasoning error — verification prompt helps some, not all |
| `wrong_temporal` | 11 | 10%% | PARTIAL | Date arithmetic errors — date_diff tool not always used |
| `stale_value` | 8 | 7%% | YES | Living object projections + Sonnet extraction for version chains |
| `incomplete_aggregation` | 7 | 6%% | PARTIAL | Entity index has items but model picks wrong one |
| `wrong_order` | 7 | 6%% | YES | CoreCrux timeline projection gives deterministic ordering |
| `wrong_answer` | 5 | 4%% | NO | LLM picks wrong entity from retrieved content — model quality limit |

## Realistic Recovery Estimates

| Intervention | Targets | Expected Recovery | Cost |
|-------------|---------|------------------|------|
| Sonnet extraction (all 500) | 40 abstained + 8 stale | 25-30 | $120 |
| CoreCrux timeline fix (entity_type resolution) | 7 wrong_order | 4-5 | $0 (code) |
| Verification prompt hardening | 31 wrong_number | 5-8 | $0 (prompt) |
| Bounded decomposition (reduce max_turns) | max_turns | 0-1 | $0 (config) |
| **Total recoverable** | | **34-44** | **~$120** |
| **Projected with all fixes** | | **85-87%%** | |
| **Irreducible (LLM reasoning)** | ~65 | 0 | — |

## By Question Type

- **multi-session**: 50/133 (62.4% pass) — wrong_number=22, abstained=21, incomplete_aggregation=7
- **temporal-reasoning**: 37/133 (72.2% pass) — abstained=15, wrong_temporal=11, wrong_order=7
- **knowledge-update**: 16/78 (79.5% pass) — stale_value=8, wrong_number=5, abstained=3
- **single-session-user**: 3/70 (95.7% pass) — wrong_answer=2, abstained=1
- **single-session-preference**: 3/30 (90.0% pass) — wrong_answer=3

---

## All 109 Failures


### abstained (40)

**6aeb4375** | knowledge-update | 47s/2a
- Q: How many Korean restaurants have I tried in my city?
- Gold: four
- Hyp: I wasn't able to find any records of Korean restaurants you've tried in your city within your conversation history. It's possible this topic hasn't come up in any of your past conversations. If you'd like, you can share some details and I can help ke

**b6019101** | knowledge-update | 49s/2a
- Q: How many MCU films did I watch in the last 3 months?
- Gold: 5
- Hyp: I wasn't able to find any records in your conversation history about watching MCU films in the last 3 months (March–June 2023). The search results returned unrelated topics and no specific mentions of you watching Marvel Cinematic Universe movies dur

**affe2881** | knowledge-update | 44s/2a
- Q: How many different species of birds have I seen in my local park?
- Gold: 32
- Hyp: I wasn't able to find any records in your conversation history about bird species you've spotted in your local park. It's possible this topic hasn't come up in any of your past conversations stored in memory.   If you'd like to start tracking your bi

**6d550036** | multi-session | 47s/4a
- Q: How many projects have I led or am currently leading?
- Gold: 2
- Hyp: I wasn't able to find any specific records in your conversation history about projects you have personally led or are currently leading. The search results returned general discussions about project management tools and advice, but nothing that speci

**b5ef892d** | multi-session | 52s/3a
- Q: How many days did I spend on camping trips in the United States this year?
- Gold: 8 days.
- Hyp: I wasn't able to find any information in your conversation history about camping trips in the United States this year. There are no records of you discussing camping trips, their durations, or any related travel plans in 2023.  If you'd like, you cou

**3a704032** | multi-session | 48s/3a
- Q: How many plants did I acquire in the last month?
- Gold: 3
- Hyp: I wasn't able to find any records in your conversation history about acquiring plants in the last month. It's possible this topic hasn't come up in your past conversations, or it may have been discussed using different terminology. Could you provide 

**gpt4_a56e767c** | multi-session | 48s/3a
- Q: How many movie festivals that I attended?
- Gold: I attended four movie festivals.
- Hyp: I wasn't able to find any information about movie festivals you attended in your conversation history. It's possible this topic hasn't come up in any of your past conversations. Could you provide more context, or is it possible you're thinking of a d

**d682f1a2** | multi-session | 47s/3a
- Q: How many different types of food delivery services have I used recently?
- Gold: 3
- Hyp: I wasn't able to find any information about food delivery services in your conversation history. It's possible this topic hasn't come up in your past conversations, or it may have been discussed in a way that wasn't captured in memory.  Could you giv

**7024f17c** | multi-session | 47s/3a
- Q: How many hours of jogging and yoga did I do last week?
- Gold: 0.5 hours
- Hyp: I wasn't able to find specific logged data about the exact hours of jogging and yoga you completed last week (May 22–28, 2023). Here's what the memory records do show:  - On **May 20**, you logged a **30-minute jog** around your neighborhood. - Aroun

**gpt4_194be4b3** | multi-session | 44s/5a
- Q: How many musical instruments do I currently own?
- Gold: I currently own 4 musical instruments. I've had the Fender Stratocaster electric guitar for 5 years, the Yamaha FG800 acoustic guitar for 8 years, the
- Hyp: I wasn't able to find any information about musical instruments you own in your conversation history. It's possible this topic hasn't come up in any of your past conversations. Could you share more details, or is it possible you discussed this under 

**2b8f3739** | multi-session | 47s/3a
- Q: What is the total amount of money I earned from selling my products at the markets?
- Gold: $495
- Hyp: I'm sorry, but I wasn't able to find any information in your conversation history about selling products at markets or any related earnings. The search results returned are completely unrelated to your question.  It's possible that this topic was nev

**10d9b85a** | multi-session | 44s/2a
- Q: How many days did I spend attending workshops, lectures, and conferences in April?
- Gold: 3 days
- Hyp: Based on my thorough search of your conversation history, I found only **one** specific event you attended in April 2023:  - **April 10th** — A **lecture on sustainable development** at the public library.  That's the only workshop, lecture, or confe

**bf659f65** | multi-session | 52s/3a
- Q: How many music albums or EPs have I purchased or downloaded?
- Gold: 3
- Hyp: I wasn't able to find any records in your conversation history about purchasing or downloading specific music albums or EPs. The memory results returned are about general music discussions — topics like music podcasts, Spotify playlists, music blogs,

**81507db6** | multi-session | 50s/5a
- Q: How many graduation ceremonies have I attended in the past three months?
- Gold: 3
- Hyp: I wasn't able to find any records of graduation ceremonies in your conversation history. There's no mention of attending any graduation ceremonies in the past three months (April–July 2023). It's possible this topic simply hasn't come up in our past 

**cc06de0d** | multi-session | 42s/2a
- Q: For my daily commute, how much more expensive was the taxi ride compared to the train fare?
- Gold: $6
- Hyp: I wasn't able to find any information about a taxi ride or train fare for your daily commute in your conversation history. It's possible this topic hasn't been discussed in any of your past conversations stored in the memory system.  Could you provid

**9aaed6a3** | multi-session | 51s/2a
- Q: How much cashback did I earn at SaveMart last Thursday?
- Gold: $0.75
- Hyp: I wasn't able to find any specific information in your conversation history about cashback earned at **SaveMart last Thursday** (May 25, 2023). The memory results only contain general discussions about Walmart+ cashback programs, with no record of a 

**a1cc6108** | multi-session | 43s/2a
- Q: How old was I when Alex was born?
- Gold: 11
- Hyp: I found some relevant information. The memory shows that: - You mentioned you **just turned 32 last month** (around April 24, 2023) in a session dated May 24, 2023. - Alex is mentioned as a **21-year-old intern** you are mentoring.  However, Alex in 

**ba358f49** | multi-session | 41s/2a
- Q: How many years will I be when my friend Rachel gets married?
- Gold: 33
- Hyp: I found a relevant memory! In a past conversation (dated **2022-09-01**), you mentioned that **Rachel is getting married next year** — meaning her wedding would be in **2023**. However, I wasn't able to find your specific age or birth year in your co

**60159905** | multi-session | 44s/2a
- Q: How many dinner parties have I attended in the past month?
- Gold: three
- Hyp: I wasn't able to find any records of dinner parties in your conversation history. There's no mention of attending any dinner parties in the past month (April 30 – May 30, 2023). It's possible this simply wasn't discussed in any of your saved conversa

**61f8c8f8** | multi-session | 48s/2a
- Q: How much faster did I finish the 5K run compared to my previous year's time?
- Gold: 10 minutes
- Hyp: Based on the memory records, I can see your previous year's 5K time (around October 2022) was **45 minutes**. However, I was only able to find that you were **training** for a 5K run (as of October 2023) — there is no record in memory of you completi

**73d42213** | multi-session | 49s/2a
- Q: What time did I reach the clinic on Monday?
- Gold: 9:00 AM
- Hyp: I'm sorry, but I wasn't able to find any specific information in your conversation history about what time you arrived at the clinic on Monday. The records I found relate to discussions about finding and scheduling a clinic appointment, but don't men

**bc149d6b** | multi-session | 46s/2a
- Q: What is the total weight of the new feed I purchased in the past two months?
- Gold: 70 pounds
- Hyp: Based on my thorough search of your conversation history, the only feed purchase I can find a record of is a **50-pound batch of layer feed** mentioned in a session from May 22, 2023, for which you paid $120 (with a 10% discount applied).  However, I

**55241a1f** | multi-session | 49s/2a
- Q: What is the total number of comments on my recent Facebook Live session and my most popular YouTube video?
- Gold: 33
- Hyp: I found the information I needed! Here's a summary:  - **Facebook Live session** (about cooking vegan recipes): **12 comments** - **Most popular YouTube video** (a tutorial on social media analytics): described as having "quite a few comments," but t

**efc3f7c2** | multi-session | 48s/2a
- Q: How much earlier do I wake up on Fridays compared to other weekdays?
- Gold: 30 minutes
- Hyp: I can see two relevant data points from your conversations, but I don't find any specific mention of a **different** Friday wake-up time compared to other weekdays. Here's what the memory shows:  - **General weekday routine (Mon–Fri):** You mentioned

**d52b4f67** | single-session-user | 52s/1a
- Q: Where did I attend my cousin's wedding?
- Gold: The Grand Ballroom
- Hyp: I looked through your conversation history but unfortunately I wasn't able to find any specific details about the location of your cousin's wedding. The memory system doesn't appear to contain that information. Could you be thinking of a specific con

**b46e15ed** | temporal-reasoning | 46s/4a
- Q: How many months have passed since I participated in two charity events in a row, on consecutive days?
- Gold: 2
- Hyp: Based on my research, I found one confirmed charity event — the **"Walk for Hunger"** on **2023-03-19** — but I was unable to find a record of a second charity event on a consecutive day (either March 18 or March 20, 2023) in your conversation histor

**gpt4_1916e0ea** | temporal-reasoning | 56s/2a
- Q: How many days passed between the day I cancelled my FarmFresh subscription and the day I did my online grocery shopping from Instacart?
- Gold: 54 days. 55 days (including the last day) is also acceptable.
- Hyp: I'm sorry, but I wasn't able to find any records in your conversation history about either:  1. **Cancelling a FarmFresh subscription**, or 2. **Placing an online grocery order through Instacart**  Neither event appears to be stored in your memory. I

**71017277** | temporal-reasoning | 51s/1a
- Q: I received a piece of jewelry last Saturday from whom?
- Gold: my aunt
- Hyp: I'm sorry, but I wasn't able to find any information in your conversation history about receiving a piece of jewelry last Saturday (March 4, 2023). This detail doesn't appear to be recorded in your past conversations. Could you provide more context, 

**gpt4_468eb064** | temporal-reasoning | 48s/1a
- Q: Who did I meet with during the lunch last Tuesday?
- Gold: Emma
- Hyp: I'm sorry, but I wasn't able to find any information in your conversation history about a lunch meeting last Tuesday (April 11, 2023). There's no record of who you met with during that lunch.  It's possible this wasn't discussed in any of your saved 

**gpt4_fa19884d** | temporal-reasoning | 50s/2a
- Q: What is the artist that I started to listen to last Friday?
- Gold: a bluegrass band that features a banjo player
- Hyp: I wasn't able to find a specific conversation from last Friday (March 31, 2023) where you mentioned starting to listen to a new artist. The memory records don't contain a session from that date with that information.  Could you give me a bit more con

**9a707b82** | temporal-reasoning | 53s/2a
- Q: I mentioned cooking something for my friend a couple of days ago. What was it?
- Gold: a chocolate cake
- Hyp: I wasn't able to find a specific mention of you cooking something for a friend in the memory records from around April 10, 2022 (a couple of days ago). The conversations from that period are about meal prepping, recipe ideas for a dinner party, and u

**gpt4_8279ba03** | temporal-reasoning | 43s/1a
- Q: What kitchen appliance did I buy 10 days ago?
- Gold: a smoker
- Hyp: I wasn't able to find a specific record in your conversation history about purchasing a kitchen appliance 10 days ago (around March 15, 2023). The search results don't contain any relevant information about such a purchase.  It's possible this wasn't

**6e984302** | temporal-reasoning | 43s/2a
- Q: I mentioned an investment for a competition four weeks ago? What did I buy?
- Gold: I got my own set of sculpting tools.
- Hyp: I'm sorry, but I wasn't able to find any record in your conversation history of you mentioning an investment made for a competition around four weeks ago (approximately early March 2023). The memory system doesn't appear to contain a conversation mat

**gpt4_68e94288** | temporal-reasoning | 44s/2a
- Q: What was the social media activity I participated 5 days ago?
- Gold: You participated in a social media challenge called #PlankChallenge.
- Hyp: I'm sorry, but I wasn't able to find any specific record of social media activity you personally participated in on **March 15, 2023** (5 days ago). The search results returned general information about social media platforms and posting tips, but no

**08f4fc43** | temporal-reasoning | 47s/2a
- Q: How many days had passed between the Sunday mass at St. Mary's Church and the Ash Wednesday service at the cathedral?
- Gold: 30 days. 31 days (including the last day) is also acceptable.
- Hyp: I found the Ash Wednesday service date (February 1st at the cathedral) from memory, but I couldn't find a specific date for the Sunday mass at St. Mary's Church. The memory records don't appear to contain a mention of a Sunday mass at St. Mary's Chur

**bbf86515** | temporal-reasoning | 45s/2a
- Q: How many days before the 'Rack Fest' did I participate in the 'Turbocharged Tuesdays' event?
- Gold: 4 days.
- Hyp: I was able to find the date for "Turbocharged Tuesdays" (June 14th), but there is no mention of a "Rack Fest" event anywhere in your conversation history. I can confirm that:  - **Turbocharged Tuesdays**: You participated on **June 14th** at your loc

**gpt4_93159ced** | temporal-reasoning | 42s/2a
- Q: How long have I been working before I started my current job at NovaTech?
- Gold: 4 years and 9 months
- Hyp: I found the key information. You mentioned that you've been working at NovaTech for **about 4 years and 3 months** and that you graduated with a Computer Science degree from UC Berkeley before entering the field. However, the memory doesn't contain d

**cc6d1ec1** | temporal-reasoning | 46s/2a
- Q: How long had I been bird watching when I attended the bird watching workshop?
- Gold: Two months
- Hyp: I'm sorry, but I wasn't able to find specific details in your conversation history about when you started bird watching or when you attended a bird watching workshop. The records I found relate to general bird watching discussions — such as bird feed

**gpt4_88806d6e** | temporal-reasoning | 49s/2a
- Q: Who did I meet first, Mark and Sarah or Tom?
- Gold: Tom
- Hyp: I wasn't able to find any information about a person named "Tom" in your conversation history. However, I do have records of you meeting **Mark and Sarah** — you mentioned meeting them on a **beach trip about a month ago** (as of May 28, 2023).  Unfo

**gpt4_c27434e8** | temporal-reasoning | 51s/2a
- Q: Which project did I start first, the Ferrari model or the Japanese Zero fighter plane model?
- Gold: Japanese Zero fighter plane model
- Hyp: I wasn't able to find any information in your conversation history about a Ferrari model or a Japanese Zero fighter plane model project. There are no records in your memory related to these hobbies or projects.  It's possible these projects were disc


### incomplete_aggregation (7)

**gpt4_5501fe77** | multi-session | 45s/3a
- Q: Which social media platform did I gain the most followers on over the past month?
- Gold: TikTok
- Hyp: Based on your past conversations, **Twitter** was the platform where you gained the most followers over the past month. You mentioned that your Twitter follower count jumped from **420 to 540** — a gain of **120 followers**.  For context, your other 

**gpt4_2ba83207** | multi-session | 53s/4a
- Q: Which grocery store did I spend the most money at in the past month?
- Gold: Thrive Market
- Hyp: Based on your past conversations, here's a summary of your grocery spending in the past month (from approximately late April to May 30, 2023):  | Store | Amount | Date | |---|---|---| | **Walmart** | **~$120** | ~May 19, 2023 | | Trader Joe's | ~$80 

**d851d5ba** | multi-session | 46s/4a
- Q: How much money did I raise for charity in total?
- Gold: $3,750
- Hyp: Based on the memory records, I can identify the specific amounts you've raised for charity:  1. **$250** — raised for a local food bank at the "Run for Hunger" charity event (5K run on March 12th) 2. **$500** — raised for the American Cancer Society 

**gpt4_ab202e7f** | multi-session | 46s/5a
- Q: How many kitchen items did I replace or fix?
- Gold: I replaced or fixed five items: the kitchen faucet, the kitchen mat, the toaster, the coffee maker, and the kitchen shelves.
- Hyp: Based on the research, I found **3 kitchen items** that you replaced or fixed across your conversations:  1. **Toaster → Toaster Oven** — You got rid of your old toaster and replaced it with a toaster oven (mentioned across multiple sessions). 2. **K

**92a0aa75** | multi-session | 42s/2a
- Q: How long have I been working in my current role?
- Gold: 1 year and 5 months
- Hyp: I found a relevant clue in your conversation history. In a session from May 29, 2023, you mentioned: *"I've been thinking about my 3 years and 9 months experience in the company."* However, this appears to refer to your time at the **company**, not n

**a96c20ee_abs** | multi-session | 53s/2a
- Q: At which university did I present a poster for my undergrad course research project?
- Gold: The information provided is not enough. You did not mention presenting a poster for your undergrad course research project.
- Hyp: Based on your conversation history, you attended your first research conference at **Harvard University**, where you presented a poster on your research. You mentioned visiting Harvard University to attend the conference and seeing interesting projec

**09ba9854_abs** | multi-session | 50s/2a
- Q: How much will I save by taking the bus from the airport to my hotel instead of a taxi?
- Gold: The information provided is not enough. You did not mention how much will the bus take.
- Hyp: Based on your past conversations, you were discussing transportation from the airport to your hotel in **Tokyo (Shinjuku)**. Here's the savings breakdown based on the figures discussed:  - **Taxi** from the airport: ~**$60** (as mentioned by you), or


### stale_value (8)

**830ce83f** | knowledge-update | 47s/2a
- Q: Where did Rachel move to after her recent relocation?
- Gold: the suburbs
- Hyp: Based on the conversation history, Rachel recently moved to a new apartment in **Chicago**. The conversations reference visiting Rachel in Chicago and discuss neighborhoods in the city where she lives.

**852ce960** | knowledge-update | 39s/2a
- Q: What was the amount I was pre-approved for when I got my mortgage from Wells Fargo?
- Gold: $400,000
- Hyp: You were pre-approved for **$350,000** from Wells Fargo. This came up in a conversation where you were buying a $325,000 home and discussing closing costs and monthly payment estimates.

**2698e78f** | knowledge-update | 48s/2a
- Q: How often do I see my therapist, Dr. Smith?
- Gold: every week
- Hyp: Based on your past conversations, you see Dr. Smith **every two weeks (bi-weekly)**. You mentioned this yourself in a session, noting: *"I have a therapy session with Dr. Smith coming up soon - it's every two weeks, so I'm looking forward to discussi

**e66b632c** | knowledge-update | 47s/2a
- Q: What was my previous personal best time for the charity 5K run?
- Gold: 27 minutes and 45 seconds
- Hyp: Based on your conversation history, your **previous personal best time for the charity 5K run was 28 minutes** — and you then beat it by shaving off about a minute and a half, setting a **new personal best of 26 minutes and 30 seconds**.  Specificall

**7401057b** | knowledge-update | 47s/2a
- Q: How many free night's stays can I redeem at any Hilton property with my accumulated points?
- Gold: Two
- Hyp: Based on your past conversation history, you mentioned that you have accumulated enough points for **1 free night's stay** at any Hilton property.  Specifically, you confirmed: *"I've accumulated enough points for a single free night's stay at any Hi

**c7dc5443** | knowledge-update | 46s/2a
- Q: What is my current record in the recreational volleyball league?
- Gold: 5-2
- Hyp: Based on your conversation history, as of **June 16, 2023**, your recreational volleyball league record was **3 wins and 2 losses (3-2)**. That's the most recent record mentioned in your conversations. If more games have been played since then, I don

**dad224aa** | knowledge-update | 48s/2a
- Q: What time do I wake up on Saturday mornings?
- Gold: 7:30 am
- Hyp: Based on your past conversations, you mentioned that you wake up at **8:30 am on Saturday mornings**. This came up when you were discussing your weekend morning routine and planning Sunday activities around your existing Saturday schedule.

**07741c45** | knowledge-update | 49s/2a
- Q: Where do I currently keep my old sneakers?
- Gold: in a shoe rack in my closet
- Hyp: You mentioned keeping your old sneakers **under your bed** for storage. In a past conversation (from May 25, 2023), you noted they had been stored there and were starting to smell as a result.


### wrong_answer (5)

**35a27287** | single-session-preference | 51s/1a
- Q: Can you recommend some interesting cultural events happening around me this weekend?
- Gold: The user would prefer responses that suggest cultural events where they can practice their language skills, particularly Spanish and French. They woul
- Hyp: Unfortunately, I don't have enough information from your conversation history to give you a truly personalised recommendation. Specifically, I'm missing two key things:  1. **Your location** — I don't have a record of where you live or are based, so 

**09d032c9** | single-session-preference | 43s/1a
- Q: I've been having trouble with the battery life on my phone lately. Any tips?
- Gold: The user would prefer responses that build upon their previous mention of purchasing a portable power bank, such as suggestions on how to optimize its
- Hyp: I don't have any specific past conversations about your phone's battery issues, but I can offer some well-rounded tips to help improve your battery life! Here are some of the most effective strategies:  ---  ### 🔋 Tips to Improve Phone Battery Life  

**1c0ddc50** | single-session-preference | 51s/1a
- Q: Can you suggest some activities I can do during my commute to work?
- Gold: The user would prefer suggestions related to listening to new podcasts or audiobooks, especially the genre beyond true crime or self-improvement, such
- Hyp: Based on your past conversations, I can see that you **commute by bike** to work! Here are some activity suggestions tailored to a bike commute:  Since you're cycling, your hands and eyes need to stay focused on the road, so the best activities are *

**5d3d2817** | single-session-user | 53s/1a
- Q: What was my previous occupation?
- Gold: Marketing specialist at a small startup
- Hyp: Based on your conversation history, it appears you were previously a **Senior Marketing Analyst**. This is referenced in a past session where you were discussing automating marketing analytics tasks and tracking marketing campaign progress in your ro

**ec81a493** | single-session-user | 51s/1a
- Q: How many copies of my favorite artist's debut album were released worldwide?
- Gold: 500
- Hyp: I found the answer! In a past conversation, you mentioned that the signed poster that came with your favorite artist's debut album is a **limited edition of only 500 copies worldwide**. 🎶


### wrong_number (31)

**6071bd76** | knowledge-update | 46s/2a
- Q: For the coffee-to-water ratio in my French press, did I switch to more water per tablespoon of coffee, or less?
- Gold: You switched to less water (5 ounces) per tablespoon of coffee.
- Hyp: I only found one mention of your French press ratio in memory — from a session on **February 11, 2023**, where you mentioned that **1 tablespoon of coffee for every 6 ounces of water** was your preferred ratio. However, I don't see any record of you 

**01493427** | knowledge-update | 47s/2a
- Q: How many new postcards have I added to my collection since I started collecting again?
- Gold: 25
- Hyp: You've added **17 new postcards** to your collection since you started collecting again. You mentioned this yourself in a past conversation, where you said *"I've added 17 new ones since I started collecting again"* and then provided a list of them t

**0e4e4c46** | knowledge-update | 49s/2a
- Q: What is my current highest score in Ticket to Ride?
- Gold: 132 points
- Hyp: Your current highest score in Ticket to Ride is **124 points**! You mentioned this in a conversation on May 23, 2023, where you said you'd been "crushing it" lately and were eager to keep improving. Great job! 🎉

**69fee5aa** | knowledge-update | 49s/2a
- Q: How many pre-1920 American coins do I have in my collection?
- Gold: 38
- Hyp: You have **37 pre-1920 American coins** in your collection. This was mentioned directly in a past conversation where you said:  > *"I was thinking of organizing my pre-1920 American coins by denomination and mint mark. I have a total of 37 coins in t

**ba61f0b9** | knowledge-update | 45s/2a
- Q: How many women are on the team led by my former manager Rachel?
- Gold: 6
- Hyp: Based on your past conversations, **Rachel's team has 5 women** out of a total of 10 people — making it **50% women**. The five women on her team are:  1. **Sarah** – Project Manager 2. **Emily** – Software Developer (front-end) 3. **Maya** – Data An

**0a995998** | multi-session | 44s/3a
- Q: How many items of clothing do I need to pick up or return from a store?
- Gold: 3
- Hyp: Based on your past conversations, there is **1 clothing item** you need to pick up from a store:  - **A new pair of boots from Zara** — You exchanged your original boots (which were too small) on **February 5th** and still needed to pick up the repla

**gpt4_d84a3211** | multi-session | 48s/4a
- Q: How much total money have I spent on bike-related expenses since the start of the year?
- Gold: $185
- Hyp: Based on your conversation history, here's a breakdown of the bike-related expenses you've mentioned since the start of 2023:  | Item | Cost | |---|---| | Chain replacement (April 20th tune-up) | $25 | | New bike lights (installed same visit) | $40 |

**c4a1ceb8** | multi-session | 49s/4a
- Q: How many different types of citrus fruits have I used in my cocktail recipes?
- Gold: 3
- Hyp: Based on your cocktail recipe conversations, I can identify the following distinct types of citrus fruits that appeared in your recipes:  1. **Lime** – used extensively (fresh lime juice in Daiquiris, Cucumber Lime Refresher, Lime-Ginger Fizz, Waterm

**46a3abf7** | multi-session | 50s/3a
- Q: How many tanks do I currently have, including the one I set up for my friend's kid?
- Gold: 3
- Hyp: Based on the memory records, I can piece together your tanks:  1. **"Amazonia"** — your 20-gallon freshwater community tank (with neon tetras, harlequin rasboras, and platies) 2. **The 1-gallon tank** — set up for a friend's kid, with a few guppies a

**28dc39ac** | multi-session | 38s/5a
- Q: How many hours have I spent playing games in total?
- Gold: 140 hours
- Hyp: Based on the memory records, I can identify the specific game completion times you've mentioned across your conversations:  | Game | Hours | |---|---| | The Last of Us Part II (normal difficulty) | 25 hours | | The Last of Us Part II (hard difficulty

**2e6d26dc** | multi-session | 54s/4a
- Q: How many babies were born to friends and family members in the last few months?
- Gold: 5
- Hyp: Based on your past conversations, I can identify **4 babies** born to friends and family members in the last few months:  1. **Max** (boy) – Born in **March** to your cousin **Rachel**. 2. **Charlotte** (girl) – Born around the same time (March) to y

**gpt4_15e38248** | multi-session | 46s/4a
- Q: How many pieces of furniture did I buy, assemble, sell, or fix in the past few months?
- Gold: 4
- Hyp: Based on my research, here's what I found across your conversations from the past few months:  You interacted with **3 pieces of furniture**:  1. **☕ Coffee table (bought)** — Purchased from **West Elm** about 3 weeks before May 26, 2023. 2. **📚 IKEA

**2ce6a0f2** | multi-session | 47s/4a
- Q: How many different art-related events did I attend in the past month?
- Gold: 4
- Hyp: Based on the memory results, I can identify the following art-related events you attended in the past month (February 8 – March 8, 2023):  1. **"Women in Art" exhibition** – attended on **February 10th**, where you were drawn to local artist Rachel L

**gpt4_31ff4165** | multi-session | 42s/5a
- Q: How many health-related devices do I use in a day?
- Gold: 4
- Hyp: Based on your conversation history, I can identify **2 health-related devices** that you use daily:  1. **Fitbit Versa 3** – You've been wearing it non-stop since you got it (about three weeks before May 2023). You use it daily to track activity/step

**9d25d4e0** | multi-session | 44s/3a
- Q: How many pieces of jewelry did I acquire in the last two months?
- Gold: 3
- Hyp: Based on the memory records, I can identify **2 specific pieces of jewelry** you acquired in the last two months (from approximately March 30 to May 30, 2023):  1. **Emerald earrings** – purchased at a flea market the weekend before May 21, 2023. 2. 

**gpt4_731e37d7** | multi-session | 48s/4a
- Q: How much total money did I spend on attending workshops in the last four months?
- Gold: $720
- Hyp: Based on the memory records, I found specific workshop costs mentioned in your conversations. Here's a breakdown of the workshops with prices recorded within the last four months (roughly October 2022 – February 2023):  | Workshop | Date | Cost | |--

**e3038f8c** | multi-session | 45s/4a
- Q: How many rare items do I have in total?
- Gold: 99
- Hyp: Based on the evidence from your conversations, here's a breakdown of your rare items:  | Category | Count | |---|---| | 🎵 Rare records (vinyl) | **57** | | 🗿 Rare figurines | **12** | | 📚 Rare books | collection (unspecified count) | | 🪙 Rare coins |

**1a8a66a6** | multi-session | 51s/4a
- Q: How many magazine subscriptions do I currently have?
- Gold: 2
- Hyp: Based on my search through your conversation history, I can identify **2 magazine subscriptions** mentioned:  1. **The New Yorker** – You mentioned enjoying your weekly issues, including one on April 10th with an article on technology and art. 2. **T

**gpt4_372c3eed** | multi-session | 45s/3a
- Q: How many years in total did I spend in formal education from high school to the completion of my Bachelor's degree?
- Gold: 10 years
- Hyp: Here's the breakdown of your formal education:  | Stage | Duration | |---|---| | **Arcadia High School** (2010–2014) | 4 years | | **UCLA – Bachelor's in Computer Science** (2016–2020) | 4 years | | **Total** | **8 years** |  You spent a total of **8

**a11281a2** | multi-session | 50s/2a
- Q: What was the approximate increase in Instagram followers I experienced in two weeks?
- Gold: 100
- Hyp: Based on your past conversations, you mentioned that after **two weeks of posting regularly on Instagram**, you gained approximately **350 followers**. That was the approximate increase in your Instagram follower count over that two-week period. 🎉

**1f2b8d4f** | multi-session | 51s/2a
- Q: What is the difference in price between my luxury boots and the similar pair found at the budget store?
- Gold: $750
- Hyp: Based on your past conversations, I can see that your luxury boots cost **$800**. However, the memory records don't show a specific "budget store" where you found a single comparable pair at a confirmed price. Instead, the conversation involved explo

**9ee3ecd6** | multi-session | 50s/2a
- Q: How many points do I need to earn to redeem a free skincare product at Sephora?
- Gold: 100
- Hyp: Based on your past conversations, you mentioned that you need a total of **300 points** to redeem a free skincare product at Sephora. You were previously at 200 points (after earning 50 points from an eyeshadow palette purchase) and noted you were cl

**67e0d0f2** | multi-session | 52s/2a
- Q: What is the total number of online courses I've completed?
- Gold: 20
- Hyp: Based on the memory search, I found a relevant mention. In one of your conversations (Session answer_3a5010af_1, dated 2023-05-27), you stated:  > *"Since I've already completed **12 courses on Coursera**, I'm confident that I have a solid foundation

**c18a7dc8** | multi-session | 49s/2a
- Q: How many years older am I than when I graduated from college?
- Gold: 7
- Hyp: I found the key information. In a past conversation, you mentioned that you completed your Bachelor's degree from UC Berkeley **at the age of 25**. However, I don't have a record of your current age stored in memory.  To answer your question, I would

**a08a253f** | multi-session | 53s/2a
- Q: How many days a week do I attend fitness classes?
- Gold: 4 days.
- Hyp: You attend fitness classes **3 days a week**:  - **Tuesdays** – Zumba at 6:30 pm - **Thursdays** – Zumba at 6:30 pm - **Saturdays** – Weightlifting at 10:00 am

**37f165cf** | multi-session | 45s/2a
- Q: What was the page count of the two novels I finished in January and March?
- Gold: 856
- Hyp: The memory doesn't contain specific details about novels finished in January and March with their page counts. However, from the conversations I found, here's what I can piece together about your reading history:  - **"The Power" by Naomi Alderman** 

**8e91e7d9** | multi-session | 47s/2a
- Q: What is the total number of siblings I have?
- Gold: 4
- Hyp: Based on your past conversations, you mentioned coming from a family with **3 sisters**. That means you have a total of **3 siblings**.

**370a8ff4** | temporal-reasoning | 46s/2a
- Q: How many weeks had passed since I recovered from the flu when I went on my 10th jog outdoors?
- Gold: 15
- Hyp: **11 weeks** had passed between your flu recovery and your 10th outdoor jog (81 days to be precise).  - You recovered from the flu on **January 19, 2023** - You completed your 10th outdoor jog on **April 10, 2023** - That's **81 days**, or approximat

**gpt4_e061b84f** | temporal-reasoning | 46s/3a
- Q: What is the order of the three sports events I participated in during the past month, from earliest to latest?
- Gold: I first completed the Spring Sprint Triathlon, then took part in the Midsummer 5K Run, and finally participated in the company's annual charity soccer
- Hyp: I now have all three sports events. Here's the chronological order from earliest to latest:  1. **Spring Sprint Triathlon** — **June 2, 2023** (included a 20K bike ride; you mentioned completing it that day) 2. **Volleyball League Game** — **June 2, 

**gpt4_1e4a8aec** | temporal-reasoning | 50s/2a
- Q: What gardening-related activity did I do two weeks ago?
- Gold: planting 12 new tomato saplings
- Hyp: Two weeks ago from today (May 5, 2023) would be **April 21, 2023**. The session from that date (answer_16bd5ea6_2, timestamped 2023-04-21) touched on gardening. Based on the earlier search results, on that date you were discussing **watering your tom

**a3838d2b** | temporal-reasoning | 47s/6a
- Q: How many charity events did I participate in before the 'Run for the Cure' event?
- Gold: 4
- Hyp: Based on the evidence from your conversations, I can identify the charity events you participated in **before** the "Run for the Cure" event (October 15, 2023):  1. **"Food for Thought" charity gala** — volunteered on **September 25, 2023**  That's t


### wrong_order (7)

**gpt4_7f6b06db** | temporal-reasoning | 52s/3a
- Q: What is the order of the three trips I took in the past three months, from earliest to latest?
- Gold: I went on a day hike to Muir Woods National Monument with my family, then I went on a road trip with friends to Big Sur and Monterey, and finally I st
- Hyp: I found the three trips clearly mentioned in the memory results. Here they are from **earliest to latest**:  1. **Day hike to Muir Woods National Monument** (with family) — **March 10, 2023** 2. **Solo camping trip to Yosemite National Park** — somet

**gpt4_7abb270c** | temporal-reasoning | 48s/6a
- Q: What is the order of the six museums I visited from earliest to latest?
- Gold: Science Museum, Museum of Contemporary Art, Metropolitan Museum of Art, Museum of History, Modern Art Museum, Natural History Museum
- Hyp: I now have all the information needed. Here is a summary of the six museum visits with their confirmed dates:  | # | Museum | Date | |---|--------|------| | 1 | **Science Museum** – "Space Exploration" exhibition (with colleague David) | **2023-01-15

**gpt4_45189cb4** | temporal-reasoning | 45s/3a
- Q: What is the order of the sports events I watched in January?
- Gold: First, I attended a NBA game at the Staples Center, then I watched the College Football National Championship game, and finally, I watched the NFL pla
- Hyp: Based on my search through your conversation history, I found only **one sports event** you mentioned watching in January 2023:  1. **January 5 – Lakers vs. Chicago Bulls (NBA)** at the Staples Center in LA, which you attended in person with your cow

**gpt4_d6585ce8** | temporal-reasoning | 50s/5a
- Q: What is the order of the concerts and musical events I attended in the past two months, starting from the earliest?
- Gold: The order of the concerts I attended is: 1. Billie Eilish concert at the Wells Fargo Center in Philly, 2. Free outdoor concert series in the park, 3. 
- Hyp: Based on the memory records, here are the concerts and musical events you attended in the past two months (from approximately **February 22 to April 22, 2023**), ordered from earliest to latest:  1. **🎵 Free Outdoor Concert Series in the Park** — *Ma

**gpt4_f420262c** | temporal-reasoning | 47s/5a
- Q: What is the order of airlines I flew with from earliest to latest before today?
- Gold: JetBlue, Delta, United, American Airlines
- Hyp: Now I have enough information to piece together the flights you actually took. Let me compile the timeline from the session data:  From your conversation history, here are the airlines you actually flew with, ordered from **earliest to latest**:  1. 

**gpt4_93f6379c** | temporal-reasoning | 42s/3a
- Q: Which group did I join first, 'Page Turners' or 'Marketing Professionals'?
- Gold: Page Turners
- Hyp: Based on the memory records, I can piece together the timeline:  - **Page Turners** – You joined this book club group around **~May 18, 2023** ("last week" as mentioned in a session dated May 25, 2023). - **Marketing Professionals** – This is a Linke

**gpt4_1a1dc16d** | temporal-reasoning | 46s/2a
- Q: Which event happened first, the meeting with Rachel or the pride parade?
- Gold: The meeting with Rachel
- Hyp: Based on the memory records, I can clearly identify the dates of both events:  - **Pride parade**: Attended on **May 1st** (mentioned in the session dated 2023-05-09 as a recent past event). - **Meeting with Rachel**: Discussed in a session timestamp


### wrong_temporal (11)

**9a707b81** | temporal-reasoning | 54s/2a
- Q: How many days ago did I attend a baking class at a local culinary school when I made my friend's birthday cake?
- Gold: 21 days. 22 days (including the last day) is also acceptable.
- Hyp: You attended the baking class at a local culinary school on **March 20, 2022** — that was **26 days ago**. You mentioned it during a conversation on March 21st, referring to it as something you did "yesterday." The class inspired your interest in bak

**gpt4_468eb063** | temporal-reasoning | 44s/1a
- Q: How many days ago did I meet Emma?
- Gold: 9 days ago. 10 days (including the last day) is also acceptable.
- Hyp: Based on your conversation history, you met a freelance writer at a coffee shop near your office around **April 4, 2023**, which was **16 days ago** (as of today, April 20, 2023). You two exchanged numbers to grab lunch sometime.  > ⚠️ Note: The memo

**4dfccbf7** | temporal-reasoning | 47s/2a
- Q: How many days had passed since I started taking ukulele lessons when I decided to take my acoustic guitar to the guitar tech for servicing?
- Gold: 24 days. 25 days (including the last day) is also acceptable.
- Hyp: The decision to take the guitar to the tech was made in the **same session** (2023-02-01) as when you started ukulele lessons. Here's what the records show:  - **Ukulele lessons started:** 2023-02-01 — *"I just started taking ukulele lessons with my 

**gpt4_b0863698** | temporal-reasoning | 42s/1a
- Q: How many days ago did I participate in the 5K charity run?
- Gold: 7 days ago. 8 days (including the last day) is also acceptable.
- Hyp: Your **5K charity run ("Run for Hope")** took place on **March 12, 2023** — that was **14 days ago** (two weeks ago today). The event was held at Downtown Park and supported cancer research and awareness. 🏃‍♂️

**gpt4_d6585ce9** | temporal-reasoning | 42s/5a
- Q: Who did I go with to the music event last Saturday?
- Gold: my parents
- Hyp: I found a reference to a music event in your conversations. Based on your memory, you mentioned attending **a music festival in Brooklyn with a group of friends**, featuring a lineup of your favorite indie bands. However, the specific names of the fr

**gpt4_f420262d** | temporal-reasoning | 43s/5a
- Q: What was the airline that I flied with on Valentine's day?
- Gold: American Airlines
- Hyp: Based on the memory results, I can see a session from **February 14, 2023** (Valentine's Day) that references your flight details. The flight was with **Delta Airlines** — specifically flight numbers **DL 1242** (FLL to ATL) and **DL 2166** (ATL to B

**gpt4_59149c78** | temporal-reasoning | 51s/2a
- Q: I mentioned that I participated in an art-related event two weeks ago. Where was that event held at?
- Gold: The Metropolitan Museum of Art.
- Hyp: Based on the memory results, I can see that the session was from **January 14, 2023** (two weeks before today, February 1, 2023). In that conversation, you mentioned participating in a guided tour of the **"Dinosaurs of the Ancient World"** exhibit —

**gpt4_e414231f** | temporal-reasoning | 46s/2a
- Q: Which bike did I fixed or serviced the past weekend?
- Gold: road bike
- Hyp: Based on your conversation history, it was your **mountain bike** that you got fixed! A session from around **March 15, 2023** references: *"it's great to hear that you got it fixed and it's running smoothly!"* in relation to your mountain bike.  Mea

**eac54add** | temporal-reasoning | 43s/2a
- Q: What was the significant buisiness milestone I mentioned four weeks ago?
- Gold: I signed a contract with my first client.
- Hyp: Based on a session from around four weeks ago (2023-02-28), I found a relevant mention. In a conversation dated **February 28, 2023**, you referenced launching your **website** and creating a **business plan outline** as significant business mileston

**0bc8ad93** | temporal-reasoning | 47s/3a
- Q: I mentioned visiting a museum two months ago. Did I visit with a friend or not?
- Gold: No, you did not visit with a friend.
- Hyp: Yes, you visited with a friend! Specifically, you mentioned taking a **behind-the-scenes tour of the Science Museum** with a **friend who is a chemistry professor**. You described having a great time exploring the museum's collection of rare minerals

**gpt4_2f56ae70** | temporal-reasoning | 45s/3a
- Q: Which streaming service did I start using most recently?
- Gold: Disney+
- Hyp: Based on your conversations, the most recently mentioned streaming service you started using was **HBO** (via the Amazon Prime Video HBO add-on). In a session, you already had Netflix, Hulu, and Amazon Prime for the past 6 months, and you then decide


---
*Generated 2026-03-31*
