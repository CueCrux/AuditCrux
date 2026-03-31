# LongMemEval Proposition Extraction — Post-Mortem

**Date:** 2026-03-30
**Result:** 13.6% (catastrophic regression from 75.6% baseline)
**Root cause:** Vault Transit decryption failures on proposition chunks

---

## What Happened

We extracted 59,657 atomic propositions from 500 LongMemEval problems using Haiku ($5.97) and ingested them as additional memory imports into VaultCrux s3 tenants. This added ~60K proposition chunks to the existing ~242K chunks (total 302K).

The benchmark then scored **13.6%** — down from 75.6%.

## Root Cause: Decryption Failures

**267 of 316 regressions** (84.5%) show the model saying content is "temporarily unavailable", "encrypted", or "unable to retrieve". The proposition chunks were encrypted by Vault Transit at ingest but **are not decrypting properly at retrieval time**.

The ciphertext isn't leaking to the model (0 vault:v1 mentions) — the decryption failure sentinel is being returned instead, which the model interprets as "content unavailable".

### Why Decryption Fails for Propositions but Not Original Chunks

The original chunks were ingested by the **VaultCrux-App production worker** which has proper Vault Transit credentials configured in its Docker environment. The proposition chunks were ingested via the **`/v1/memory/imports` API endpoint** from Data-1, which creates ingest jobs. These jobs were then processed by the **Data-1 workers** (started via `start-workers.sh`) which had `VAULT_ADDR` and `VAULT_TRANSIT_TOKEN` set but may have had a different transit context salt or the token expired.

**UPDATED 2026-03-31:** Investigation revealed all Vault Transit credentials were identical between workers. The actual root cause was **Vault Transit token expiry** — the static token `hvs.CAESIBb_...` had exceeded its TTL. Vault rejected ALL decrypt requests with "permission denied", affecting all chunks (not just propositions).

A new token was created from Vault root and deployed. No data was corrupted — all ciphertext is intact and decryptable with the renewed token.

See full incident report: `PlanCrux/docs/incidents/vault-token-expiry-2026-03-30.md`

**Implication:** The 13.6% result conflated two separate issues:
1. Vault token expiry (267 regressions) — now fixed
2. Proposition retrieval dilution (49 regressions) — genuine design issue, needs separate retrieval tier

## Impact Breakdown

| Category | Regressions | Pattern |
|----------|-------------|---------|
| Decryption failure (content unavailable) | 267 | Model sees sentinel, abstains |
| Wrong answer (noise dilution) | 49 | Proposition chunks match but contain wrong/partial facts |
| **Total regressions** | **316** | |
| New passes (propositions helped) | 6 | 3 multi-session, 2 temporal, 1 knowledge-update |

## What Propositions Actually Did (the 49 non-decryption failures)

Even excluding decryption failures, 49 questions regressed from correct to wrong. This suggests retrieval dilution IS a secondary problem:
- 60K proposition chunks (short, atomic) compete with 242K original chunks for top-K slots
- Proposition chunks match queries more broadly but contain less context
- The model gets fragments instead of coherent conversation chunks

## Lessons

1. **Credential parity:** Any ingest path must use identical Vault Transit credentials as the retrieval path. The Data-1 workers had credentials copied from the prod env but the transit context salt may have differed.

2. **Proposition ingest must go through the SAME worker** as original chunks — the VaultCrux-App production worker, not ad-hoc workers on Data-1.

3. **Proposition dilution is real:** Even with correct decryption, dumping 60K short chunks alongside 242K longer chunks will degrade retrieval quality. Propositions need to be a **secondary retrieval layer** with separate scoring, not mixed into the primary index.

4. **Test decryption before benchmarking:** A simple spot-check of "can I retrieve and read a proposition chunk?" would have caught this before running 500 questions.

## Recovery Plan

1. **Delete all proposition chunks** from s3 tenants (the ones with decryption issues)
2. **Re-run baseline benchmark** to confirm 75.6% is restored
3. **If propositions are retried:** Ingest via the prod worker (VaultCrux-App), NOT via Data-1 workers. OR disable encryption for benchmark tenants.
4. **Better approach:** Use propositions as a separate retrieval tier with a query router, not mixed into the same index

---

## Numbers

| Metric | Value |
|--------|-------|
| Propositions extracted | 59,657 |
| Propositions ingested | 50,090 |
| Haiku cost | $5.97 |
| Benchmark cost (run 1: 125q) | $7.83 |
| Benchmark cost (run 2: 375q) | $24.19 |
| Pre-proposition accuracy | 75.6% |
| Post-proposition accuracy | 13.6% |
| Regressions | 316 |
| Regressions from decryption failure | 267 (84.5%) |
| Regressions from dilution | 49 (15.5%) |
| New passes from propositions | 6 |

---

*Generated 2026-03-30*
