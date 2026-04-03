# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021102-5b8a30` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T11:10:11.246Z |
| Duration | 440s |
| Questions | 9 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 1,143,762 |
| Output tokens | 19,397 |
| Cached tokens | 0 |
| Total cost | $5.49 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| multi-session | 8 | 4.8 | $0.1512 |
| temporal-reasoning | 1 | 22.0 | $4.2781 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 9 |
| Escalated (multi-tier) | 8 (88.9%) |
| Resolved at Tier 0 (Haiku) | 1 |
| Resolved at Tier 1 (Sonnet) | 7 |
| Resolved at Tier 2 (Opus) | 1 |
| Total cascade cost | $5.49 |
