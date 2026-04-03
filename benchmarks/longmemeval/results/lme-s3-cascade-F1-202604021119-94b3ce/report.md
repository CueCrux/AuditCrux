# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021119-94b3ce` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T11:31:20.309Z |
| Duration | 717s |
| Questions | 9 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 1,687,832 |
| Output tokens | 29,186 |
| Cached tokens | 0 |
| Total cost | $12.34 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| multi-session | 8 | 8.6 | $1.1319 |
| temporal-reasoning | 1 | 22.0 | $3.2850 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 9 |
| Escalated (multi-tier) | 9 (100.0%) |
| Resolved at Tier 0 (Haiku) | 0 |
| Resolved at Tier 1 (Sonnet) | 0 |
| Resolved at Tier 2 (Opus) | 9 |
| Total cascade cost | $12.34 |
