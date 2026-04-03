# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021506-8c9d8e` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T15:16:29.330Z |
| Duration | 584s |
| Questions | 88 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 4,678,736 |
| Output tokens | 98,461 |
| Cached tokens | 0 |
| Total cost | $8.80 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 15 | 2.1 | $0.0520 |
| multi-session | 37 | 4.2 | $0.1297 |
| single-session-assistant | 1 | 3.0 | $0.0760 |
| single-session-preference | 4 | 2.5 | $0.0357 |
| single-session-user | 2 | 4.0 | $0.0756 |
| temporal-reasoning | 29 | 3.8 | $0.0982 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 88 |
| Escalated (multi-tier) | 62 (70.5%) |
| Resolved at Tier 0 (Haiku) | 26 |
| Resolved at Tier 1 (Sonnet) | 62 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $8.80 |
