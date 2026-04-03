# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604020952-ef7cef` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T09:56:51.702Z |
| Duration | 235s |
| Questions | 5 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 481,448 |
| Output tokens | 9,480 |
| Cached tokens | 0 |
| Total cost | $1.77 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 1 | 3.0 | $0.0738 |
| multi-session | 1 | 7.0 | $0.1606 |
| single-session-preference | 1 | 4.0 | $0.2667 |
| single-session-user | 1 | 13.0 | $1.1359 |
| temporal-reasoning | 1 | 7.0 | $0.1367 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 5 |
| Escalated (multi-tier) | 5 (100.0%) |
| Resolved at Tier 0 (Haiku) | 0 |
| Resolved at Tier 1 (Sonnet) | 3 |
| Resolved at Tier 2 (Opus) | 2 |
| Total cascade cost | $1.77 |
