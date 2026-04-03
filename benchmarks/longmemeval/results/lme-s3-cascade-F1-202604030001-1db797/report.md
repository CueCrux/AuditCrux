# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604030001-1db797` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-03T01:01:47.885Z |
| Duration | 3595s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 30,557,894 |
| Output tokens | 618,773 |
| Cached tokens | 0 |
| Total cost | $62.22 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 5.9 | $0.1169 |
| multi-session | 133 | 7.9 | $0.1915 |
| single-session-assistant | 56 | 2.8 | $0.0349 |
| single-session-preference | 30 | 2.3 | $0.0352 |
| single-session-user | 70 | 3.6 | $0.0578 |
| temporal-reasoning | 133 | 7.0 | $0.1547 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 366 (73.2%) |
| Resolved at Tier 0 (Haiku) | 134 |
| Resolved at Tier 1 (Sonnet) | 366 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $62.22 |
