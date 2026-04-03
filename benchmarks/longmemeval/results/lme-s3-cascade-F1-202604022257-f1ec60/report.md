# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604022257-f1ec60` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T23:55:38.927Z |
| Duration | 3472s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 30,480,376 |
| Output tokens | 610,759 |
| Cached tokens | 0 |
| Total cost | $61.40 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 5.8 | $0.1176 |
| multi-session | 133 | 8.0 | $0.1905 |
| single-session-assistant | 56 | 2.7 | $0.0317 |
| single-session-preference | 30 | 2.2 | $0.0313 |
| single-session-user | 70 | 3.0 | $0.0499 |
| temporal-reasoning | 133 | 7.1 | $0.1555 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 358 (71.6%) |
| Resolved at Tier 0 (Haiku) | 142 |
| Resolved at Tier 1 (Sonnet) | 358 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $61.40 |
