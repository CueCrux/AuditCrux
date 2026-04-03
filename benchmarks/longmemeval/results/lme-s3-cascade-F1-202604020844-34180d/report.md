# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604020844-34180d` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T09:36:15.102Z |
| Duration | 3095s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 19,412,848 |
| Output tokens | 431,502 |
| Cached tokens | 0 |
| Total cost | $33.89 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.4 | $0.0563 |
| multi-session | 133 | 4.1 | $0.1246 |
| single-session-assistant | 56 | 1.1 | $0.0115 |
| single-session-preference | 30 | 1.8 | $0.0270 |
| single-session-user | 70 | 1.7 | $0.0297 |
| temporal-reasoning | 133 | 3.3 | $0.0706 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 207 (41.4%) |
| Resolved at Tier 0 (Haiku) | 293 |
| Resolved at Tier 1 (Sonnet) | 207 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $33.89 |
