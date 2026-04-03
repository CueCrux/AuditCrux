# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021823-3dfdbf` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T19:08:42.477Z |
| Duration | 2729s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 21,147,995 |
| Output tokens | 477,051 |
| Cached tokens | 0 |
| Total cost | $39.56 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.5 | $0.0619 |
| multi-session | 133 | 4.0 | $0.1276 |
| single-session-assistant | 56 | 1.2 | $0.0180 |
| single-session-preference | 30 | 1.8 | $0.0294 |
| single-session-user | 70 | 1.8 | $0.0348 |
| temporal-reasoning | 133 | 4.0 | $0.1010 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 287 (57.4%) |
| Resolved at Tier 0 (Haiku) | 213 |
| Resolved at Tier 1 (Sonnet) | 287 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $39.56 |
