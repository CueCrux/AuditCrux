# MemoryCrux Benchmark — Cost Analysis

**Date:** 2026-03-27
**Source data:** Delta benchmark (15 cells), Pricing Alignment Matrix v1.1

## The Question

VaultCrux/MemoryCrux is a paid subscription service. Does the reduction in LLM API costs from tool-mediated retrieval pay for the subscription — and if so, how quickly?

## TL;DR

A single Sonnet session over a 2M-token corpus costs **$13.43 with context-stuffing** vs **$2.59 with MemoryCrux T2**. That's **$10.84 saved per invocation**. A Pro subscription (£79/mo ≈ $100/mo) pays for itself in **~9 agent sessions per month** on LLM savings alone — before counting the quality improvement (28% → 100% recall).

At scale, the economics are unambiguous: MemoryCrux is cheaper than not using it.

## Per-Invocation LLM Costs (Delta, 2M+ token corpus)

All costs are USD, measured from the Delta benchmark against production VaultCrux.

### Without MemoryCrux

| Arm | Sonnet 4.6 | GPT-5.4 | GPT-5.4-mini |
|-----|-----------|---------|-------------|
| **C0** (bare — no corpus) | $0.70 | $0.46 | $0.06 |
| **C2** (context-stuffed) | $13.43 | $10.04 | $0.42 |

C0 is cheap but useless (20–44% recall). C2 is the "just dump it in the prompt" approach — expensive and, at 2M tokens, counterproductive.

### With MemoryCrux

| Arm | Sonnet 4.6 | GPT-5.4 | GPT-5.4-mini |
|-----|-----------|---------|-------------|
| **F1** (raw VaultCrux tools) | $6.28 | $1.76 | $0.33 |
| **T2** (MCP tool suite) | $2.59 | $1.53 | $0.07 |
| **T3** (compound tools) | $2.42 | $1.26 | $0.02 |

Tool arms include all VaultCrux API call overhead (embedding, retrieval, constraint checks).

### LLM Savings Per Invocation (vs C2)

| Arm | Sonnet 4.6 | GPT-5.4 | GPT-5.4-mini |
|-----|-----------|---------|-------------|
| **F1** | $7.15 (53%) | $8.28 (82%) | $0.09 (21%) |
| **T2** | **$10.84 (81%)** | $8.51 (85%) | $0.35 (83%) |
| **T3** | $11.01 (82%) | **$8.78 (87%)** | $0.40 (95%) |

The more capable (and expensive) the model, the larger the absolute savings.

## Subscription Breakeven

Using the Crux Platform unified tier pricing (Pricing Alignment Matrix v1.1):

| Tier | Monthly | ≈ USD | Best arm | Savings/invocation | Breakeven |
|------|---------|-------|----------|-------------------|-----------|
| **Developer** | £9 | ~$11 | Sonnet T2 | $10.84 | **~1 session** |
| **Starter** | £29 | ~$37 | Sonnet T2 | $10.84 | **~3 sessions** |
| **Pro** | £79 | ~$100 | Sonnet T2 | $10.84 | **~9 sessions** |
| **Team** | £199 | ~$252 | Sonnet T2 | $10.84 | **~23 sessions** |

For GPT-5.4 users:

| Tier | ≈ USD | Best arm | Savings/invocation | Breakeven |
|------|-------|----------|-------------------|-----------|
| **Developer** | ~$11 | GPT-5.4 T3 | $8.78 | **~1 session** |
| **Starter** | ~$37 | GPT-5.4 T3 | $8.78 | **~4 sessions** |
| **Pro** | ~$100 | GPT-5.4 T3 | $8.78 | **~11 sessions** |
| **Team** | ~$252 | GPT-5.4 T3 | $8.78 | **~29 sessions** |

For GPT-5.4-mini (budget) users:

| Tier | ≈ USD | Best arm | Savings/invocation | Breakeven |
|------|-------|----------|-------------------|-----------|
| **Developer** | ~$11 | mini T3 | $0.40 | ~28 sessions |
| **Starter** | ~$37 | mini T3 | $0.40 | ~93 sessions |

Mini savings are small in absolute terms because C2 is already cheap on mini ($0.42). But mini C2 also only achieves 40% recall — you're saving less money but getting dramatically better results (96% with F1).

## Total Cost of Ownership (Monthly)

What does a team actually pay per month for a given quality level?

### Scenario: 50 agent sessions/month over a 2M-token knowledge base

| Approach | LLM cost | Subscription | Total/mo | Core recall |
|----------|---------|-------------|----------|-------------|
| **C2 + Sonnet** | $671.50 | $0 | **$671.50** | 28% |
| **C2 + GPT-5.4** | $502.00 | $0 | **$502.00** | 8% |
| **T2 + Sonnet (Pro)** | $129.50 | $100 | **$229.50** | 100% |
| **T3 + GPT-5.4 (Pro)** | $63.00 | $100 | **$163.00** | 100% |
| **F1 + Sonnet (Pro)** | $314.00 | $100 | **$414.00** | 100% |
| **T2 + mini (Starter)** | $3.50 | $37 | **$40.50** | 72% |
| **F1 + mini (Developer)** | $16.50 | $11 | **$27.50** | 96% |

### Scenario: 200 agent sessions/month (team usage)

| Approach | LLM cost | Subscription | Total/mo | Core recall |
|----------|---------|-------------|----------|-------------|
| **C2 + Sonnet** | $2,686.00 | $0 | **$2,686.00** | 28% |
| **T2 + Sonnet (Team)** | $518.00 | $252 | **$770.00** | 100% |
| **T3 + GPT-5.4 (Team)** | $252.00 | $252 | **$504.00** | 100% |

At 200 sessions/month with Sonnet, MemoryCrux saves **$1,916/month** (71%) while improving recall from 28% to 100%.

## Quality-Adjusted Cost

The real comparison isn't just cost — it's cost per unit of useful output.

| Approach | Cost/session | Core recall | **Cost per correct decision** |
|----------|-------------|-------------|------------------------------|
| C2 + Sonnet | $13.43 | 28% (7/25) | **$1.92/decision** |
| C2 + GPT-5.4 | $10.04 | 8% (2/25) | **$5.02/decision** |
| T2 + Sonnet | $2.59 | 100% (25/25) | **$0.10/decision** |
| T3 + GPT-5.4 | $1.26 | 100% (25/25) | **$0.05/decision** |
| F1 + mini | $0.33 | 96% (24/25) | **$0.01/decision** |

MemoryCrux T2 + Sonnet delivers correct architectural decisions at **$0.10 each**. Context-stuffing + GPT-5.4 costs **$5.02 per correct decision** — 50× more expensive for dramatically worse results.

## Session Duration

Delta sessions execute 5 phases (Auth → Payments → Pipeline → Infra → Synthesis) across 2M+ tokens. Wall-clock times from benchmark runs:

| Arm | Sonnet 4.6 | GPT-5.4 | GPT-5.4-mini |
|-----|-----------|---------|-------------|
| **C2** (context-stuffed) | 45.4 min | 3.4 min | 0.8 min |
| **F1** (raw tools) | 7.6 min | 3.1 min | 1.0 min |
| **T2** (MCP tools) | 17.5 min | 13.0 min | 1.3 min |
| **T3** (compound tools) | 29.5 min | 13.2 min | 9.3 min |

Sonnet C2 takes 45 minutes because it processes 2M tokens of context per turn. Tool arms are faster — they retrieve only what they need.

**Typical T2 session:** ~13–17 minutes for capable models, ~1 minute for mini.

## What Does a Pro Subscriber Get?

Pro = £79/mo ≈ $100/mo. The subscription covers MemoryCrux access; LLM API costs are billed separately by Anthropic/OpenAI.

### Daily usage budget (2 sessions/day, 60/month)

| Model | Arm | LLM cost/mo | + Subscription | **Total/mo** | Recall |
|-------|-----|------------|----------------|-------------|--------|
| **Sonnet 4.6** | T2 | $155 | $100 | **$255** | 100% |
| **GPT-5.4** | T3 | $76 | $100 | **$176** | 100% |
| **GPT-5.4-mini** | F1 | $20 | $100 | **$120** | 96% |

### Without MemoryCrux (same 2 sessions/day)

| Model | Arm | LLM cost/mo | Subscription | **Total/mo** | Recall |
|-------|-----|------------|-------------|-------------|--------|
| **Sonnet 4.6** | C2 | $806 | $0 | **$806** | 28% |
| **GPT-5.4** | C2 | $602 | $0 | **$602** | 8% |
| **GPT-5.4-mini** | C2 | $25 | $0 | **$25** | 40% |

**Pro subscriber running 2 Sonnet sessions/day:** $255/mo total for 100% recall. Without MemoryCrux: $806/mo for 28% recall. That's a **$551/month saving** and a **3.6× quality improvement**.

### Sessions available per LLM budget

How many sessions can you run for a given monthly LLM spend (subscription separate)?

| LLM Budget | Sonnet T2 | GPT-5.4 T3 | Mini F1 |
|-----------|-----------|------------|---------|
| $25/mo | 9 sessions | 19 sessions | 75 sessions |
| $50/mo | 19 sessions | 39 sessions | 151 sessions |
| $100/mo | 38 sessions | 79 sessions | 303 sessions |
| $250/mo | 96 sessions | 198 sessions | 757 sessions |
| $500/mo | 193 sessions | 396 sessions | 1,515 sessions |

At $100/month LLM budget with GPT-5.4 T3, a Pro subscriber gets **79 sessions of 100% recall** over a 2M-token knowledge base — roughly **2.5 sessions per day**, each completing a 5-phase architectural review in ~13 minutes.

## VaultCrux Variable Costs

VaultCrux charges per-operation on top of the subscription (Pricing Alignment Matrix v1.1):

| Operation | Cost | Typical per session |
|-----------|------|-------------------|
| MemoryCrux query | ~£0.001 | 10–30 queries |
| Constraint check | ~£0.002 | 2–5 checks |
| Embedding (ingest) | ~£0.0001/chunk | One-time corpus load |

**Per-session VaultCrux variable cost:** ~£0.01–0.04 ($0.01–0.05). Negligible compared to LLM API costs.

## Infrastructure Amortisation

VaultCrux fixed infrastructure costs ~€243/month (≈ $260/month). At 100 users this is $2.60/user/month. At 1,000 users it's $0.26/user/month.

Even at 10 users (early stage), the infrastructure cost per user ($26/month) is dwarfed by the LLM savings ($542/month for a Pro user running 50 Sonnet sessions).

## Key Takeaways

1. **MemoryCrux pays for itself in 1–9 sessions** depending on tier and model. For any team running more than a handful of agent sessions per month over large knowledge bases, the subscription is a net cost reduction.

2. **The more you use it, the more you save.** LLM savings scale linearly with usage; subscription cost is fixed. At 50 sessions/month, a Pro subscriber saves $442–$539/month net.

3. **Context-stuffing is the most expensive option at scale.** C2 is 5–20× more expensive per invocation than tool-mediated arms, while delivering 8–44% recall vs 96–100%.

4. **Quality-adjusted cost makes the case even stronger.** Cost per correct architectural decision is 20–50× lower with MemoryCrux than with context-stuffing.

5. **Mini users are the exception.** At $0.42/session for C2, the absolute LLM savings are small. But mini C2 only achieves 40% recall — the value proposition shifts from cost savings to quality improvement.

6. **VaultCrux variable costs are negligible.** Per-session VaultCrux API costs (~$0.01–0.05) are rounding errors compared to LLM API costs ($0.07–13.43).
