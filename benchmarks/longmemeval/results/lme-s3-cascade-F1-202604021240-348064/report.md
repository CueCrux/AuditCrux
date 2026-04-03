# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021240-348064` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T13:19:50.026Z |
| Duration | 2342s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 19,556,116 |
| Output tokens | 428,284 |
| Cached tokens | 0 |
| Total cost | $34.41 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.4 | $0.0532 |
| multi-session | 133 | 3.9 | $0.1262 |
| single-session-assistant | 56 | 1.1 | $0.0115 |
| single-session-preference | 30 | 1.8 | $0.0264 |
| single-session-user | 70 | 1.7 | $0.0304 |
| temporal-reasoning | 133 | 3.2 | $0.0746 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 203 (40.6%) |
| Resolved at Tier 0 (Haiku) | 297 |
| Resolved at Tier 1 (Sonnet) | 203 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $34.41 |
