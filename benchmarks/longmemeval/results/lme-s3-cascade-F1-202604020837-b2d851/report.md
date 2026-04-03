# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604020837-b2d851` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T08:43:13.051Z |
| Duration | 316s |
| Questions | 10 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 535,017 |
| Output tokens | 13,367 |
| Cached tokens | 0 |
| Total cost | $3.23 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 2 | 2.0 | $0.0453 |
| multi-session | 2 | 11.0 | $1.4443 |
| single-session-preference | 2 | 2.0 | $0.0528 |
| single-session-user | 2 | 1.0 | $0.0078 |
| temporal-reasoning | 2 | 3.5 | $0.0630 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 10 |
| Escalated (multi-tier) | 5 (50.0%) |
| Resolved at Tier 0 (Haiku) | 5 |
| Resolved at Tier 1 (Sonnet) | 3 |
| Resolved at Tier 2 (Opus) | 2 |
| Total cascade cost | $3.23 |
