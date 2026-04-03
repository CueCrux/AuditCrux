# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021707-6e1745` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T17:52:05.956Z |
| Duration | 2695s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 21,593,469 |
| Output tokens | 468,333 |
| Cached tokens | 0 |
| Total cost | $41.12 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.5 | $0.0658 |
| multi-session | 133 | 3.9 | $0.1343 |
| single-session-assistant | 56 | 1.3 | $0.0199 |
| single-session-preference | 30 | 1.9 | $0.0314 |
| single-session-user | 70 | 1.8 | $0.0348 |
| temporal-reasoning | 133 | 3.7 | $0.1025 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 286 (57.2%) |
| Resolved at Tier 0 (Haiku) | 214 |
| Resolved at Tier 1 (Sonnet) | 286 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $41.12 |
