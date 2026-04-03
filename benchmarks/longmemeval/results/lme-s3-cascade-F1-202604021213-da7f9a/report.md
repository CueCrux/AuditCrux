# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021213-da7f9a` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T12:26:57.794Z |
| Duration | 793s |
| Questions | 9 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 1,792,837 |
| Output tokens | 30,470 |
| Cached tokens | 0 |
| Total cost | $14.73 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| multi-session | 8 | 7.3 | $1.1012 |
| temporal-reasoning | 1 | 26.0 | $5.9159 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 9 |
| Escalated (multi-tier) | 9 (100.0%) |
| Resolved at Tier 0 (Haiku) | 0 |
| Resolved at Tier 1 (Sonnet) | 0 |
| Resolved at Tier 2 (Opus) | 9 |
| Total cascade cost | $14.73 |
