# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-0be97b

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 138.5s |
| Timestamp | 2026-03-27T04:31:15.911Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 114,350 |
| Output tokens | 4,442 |
| Cached tokens | 56,064 |
| Billable tokens | 118,792 |
| Estimated cost | $0.0360 |

## Sessions

### Auth System Design Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 638 chars

### Payment Integration Audit (6 turns, kill: none)

- Tool calls: 13
- Output length: 645 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 610 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 5
- Output length: 902 chars

### Deployment Readiness Review (5 turns, kill: none)

- Tool calls: 14
- Output length: 9470 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 6ms | 1028ms | 1028ms | 5 |
| get_checkpoints | 5ms | 7ms | 7ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 3ms | 5ms | 5ms | 5 |
| query_memory | 5ms | 10495ms | 10495ms | 16 |
| list_topics | 1ms | 6ms | 6ms | 2 |
| get_freshness_report | 6ms | 7ms | 7ms | 2 |
| escalate_with_context | 6ms | 6ms | 6ms | 1 |
| get_contradictions | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
