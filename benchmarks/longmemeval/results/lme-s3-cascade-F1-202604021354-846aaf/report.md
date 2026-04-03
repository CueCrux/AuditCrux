# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021354-846aaf` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T14:33:58.821Z |
| Duration | 2364s |
| Questions | 500 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 19,282,994 |
| Output tokens | 427,189 |
| Cached tokens | 0 |
| Total cost | $33.67 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 78 | 2.4 | $0.0537 |
| multi-session | 133 | 3.9 | $0.1245 |
| single-session-assistant | 56 | 1.2 | $0.0138 |
| single-session-preference | 30 | 1.5 | $0.0230 |
| single-session-user | 70 | 1.7 | $0.0290 |
| temporal-reasoning | 133 | 3.2 | $0.0709 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 500 |
| Escalated (multi-tier) | 208 (41.6%) |
| Resolved at Tier 0 (Haiku) | 292 |
| Resolved at Tier 1 (Sonnet) | 208 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $33.67 |
