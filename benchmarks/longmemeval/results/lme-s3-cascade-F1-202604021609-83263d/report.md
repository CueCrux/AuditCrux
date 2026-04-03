# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021609-83263d` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T16:55:49.812Z |
| Duration | 2780s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 22,019,732 |
| Output tokens | 470,758 |
| Cached tokens | 0 |
| Total cost | $41.41 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.4 | $0.0641 |
| multi-session | 133 | 4.1 | $0.1361 |
| single-session-assistant | 56 | 1.3 | $0.0200 |
| single-session-preference | 30 | 1.6 | $0.0263 |
| single-session-user | 70 | 1.7 | $0.0325 |
| temporal-reasoning | 133 | 3.9 | $0.1061 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 280 (56.0%) |
| Resolved at Tier 0 (Haiku) | 220 |
| Resolved at Tier 1 (Sonnet) | 280 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $41.41 |
