# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-9ab4ae

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
| Duration | 386.3s |
| Timestamp | 2026-03-27T04:41:54.630Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 164,586 |
| Output tokens | 4,422 |
| Cached tokens | 130,944 |
| Billable tokens | 169,008 |
| Estimated cost | $0.0336 |

## Sessions

### Auth System Design Review (5 turns, kill: none)

- Tool calls: 8
- Output length: 750 chars

### Payment Integration Audit (8 turns, kill: none)

- Tool calls: 9
- Output length: 1047 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 9
- Output length: 1096 chars

### Infrastructure Safety Assessment (8 turns, kill: none)

- Tool calls: 14
- Output length: 1231 chars

### Deployment Readiness Review (6 turns, kill: none)

- Tool calls: 12
- Output length: 1535 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 14ms | 10498ms | 10498ms | 5 |
| get_checkpoints | 5ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 6ms | 6ms | 5 |
| assess_coverage | 4ms | 6ms | 6ms | 5 |
| get_contradictions | 7ms | 9ms | 9ms | 4 |
| get_freshness_report | 7ms | 8ms | 8ms | 5 |
| query_memory | 5ms | 8ms | 8ms | 15 |
| escalate_with_context | 5ms | 6ms | 6ms | 6 |
| list_topics | 8ms | 8ms | 8ms | 1 |
| record_decision_context | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
