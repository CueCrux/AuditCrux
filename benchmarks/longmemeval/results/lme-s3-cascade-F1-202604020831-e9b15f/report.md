# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604020831-e9b15f` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T08:37:08.359Z |
| Duration | 331s |
| Questions | 10 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 472,506 |
| Output tokens | 13,160 |
| Cached tokens | 0 |
| Total cost | $2.71 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 2 | 3.0 | $0.1423 |
| multi-session | 2 | 6.5 | $0.6421 |
| single-session-preference | 2 | 3.5 | $0.1914 |
| single-session-user | 2 | 3.0 | $0.1827 |
| temporal-reasoning | 2 | 5.5 | $0.1967 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 10 |
| Escalated (multi-tier) | 9 (90.0%) |
| Resolved at Tier 0 (Haiku) | 1 |
| Resolved at Tier 1 (Sonnet) | 3 |
| Resolved at Tier 2 (Opus) | 6 |
| Total cascade cost | $2.71 |
