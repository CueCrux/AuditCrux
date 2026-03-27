# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-e0b13c

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
| Duration | 424.2s |
| Timestamp | 2026-03-27T05:03:05.703Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 172,455 |
| Output tokens | 4,951 |
| Cached tokens | 141,056 |
| Billable tokens | 177,406 |
| Estimated cost | $0.0346 |

## Sessions

### Auth System Design Review (6 turns, kill: none)

- Tool calls: 9
- Output length: 730 chars

### Payment Integration Audit (6 turns, kill: none)

- Tool calls: 7
- Output length: 775 chars

### Data Pipeline Architecture Review (7 turns, kill: none)

- Tool calls: 13
- Output length: 964 chars

### Infrastructure Safety Assessment (6 turns, kill: none)

- Tool calls: 11
- Output length: 1218 chars

### Deployment Readiness Review (5 turns, kill: none)

- Tool calls: 11
- Output length: 2045 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 20ms | 10509ms | 10509ms | 5 |
| get_checkpoints | 7ms | 8ms | 8ms | 5 |
| get_constraints | 6ms | 6ms | 6ms | 5 |
| assess_coverage | 7ms | 7ms | 7ms | 5 |
| get_contradictions | 15ms | 15ms | 15ms | 3 |
| get_freshness_report | 13ms | 14ms | 14ms | 4 |
| query_memory | 7ms | 12ms | 12ms | 14 |
| escalate_with_context | 7ms | 11ms | 11ms | 8 |
| record_decision_context | 7ms | 7ms | 7ms | 1 |
| list_topics | 13ms | 13ms | 13ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
