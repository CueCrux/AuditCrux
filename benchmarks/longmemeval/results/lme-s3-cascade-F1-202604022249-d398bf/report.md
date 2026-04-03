# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604022249-d398bf` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T22:57:01.669Z |
| Duration | 466s |
| Questions | 20 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 1,167,155 |
| Output tokens | 22,199 |
| Cached tokens | 0 |
| Total cost | $2.41 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 4 | 1.3 | $0.0209 |
| multi-session | 4 | 4.8 | $0.1296 |
| single-session-preference | 4 | 2.0 | $0.0500 |
| single-session-user | 4 | 1.0 | $0.0070 |
| temporal-reasoning | 4 | 9.3 | $0.3952 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 20 |
| Escalated (multi-tier) | 11 (55.0%) |
| Resolved at Tier 0 (Haiku) | 9 |
| Resolved at Tier 1 (Sonnet) | 11 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $2.41 |
