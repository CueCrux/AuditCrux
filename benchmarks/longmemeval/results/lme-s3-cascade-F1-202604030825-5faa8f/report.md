# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604030825-5faa8f` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-03T08:44:48.105Z |
| Duration | 1186s |
| Questions | 268 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 9,693,750 |
| Output tokens | 235,881 |
| Cached tokens | 0 |
| Total cost | $18.69 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.5 | $0.0554 |
| multi-session | 1 | 2.0 | $0.0984 |
| single-session-assistant | 56 | 1.2 | $0.0159 |
| temporal-reasoning | 133 | 4.0 | $0.1006 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 268 |
| Escalated (multi-tier) | 134 (50.0%) |
| Resolved at Tier 0 (Haiku) | 134 |
| Resolved at Tier 1 (Sonnet) | 134 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $18.69 |
