# LongMemEval Run Report

| Field | Value |
|-------|-------|
| Run ID | `lme-s3-cascade-F1-202604021811-adb4e5` |
| Dataset | LongMemEval_S3 |
| Arm | F1 |
| Model | cascade |
| Timestamp | 2026-04-02T18:21:37.166Z |
| Duration | 614s |
| Questions | 88 |

## Token Usage

| Metric | Value |
|--------|-------|
| Input tokens | 4,857,670 |
| Output tokens | 102,673 |
| Cached tokens | 0 |
| Total cost | $9.51 |

## Per-Type Summary

| Type | Questions | Avg Tools | Avg Cost |
|------|-----------|-----------|----------|
| knowledge-update | 15 | 2.5 | $0.0619 |
| multi-session | 37 | 4.1 | $0.1225 |
| single-session-assistant | 1 | 3.0 | $0.0873 |
| single-session-preference | 4 | 2.5 | $0.0357 |
| single-session-user | 2 | 4.0 | $0.0756 |
| temporal-reasoning | 29 | 4.0 | $0.1264 |

## Cascade Escalation Summary

| Metric | Value |
|--------|-------|
| Questions with cascade | 88 |
| Escalated (multi-tier) | 65 (73.9%) |
| Resolved at Tier 0 (Haiku) | 23 |
| Resolved at Tier 1 (Sonnet) | 65 |
| Resolved at Tier 2 (Opus) | 0 |
| Total cascade cost | $9.51 |
