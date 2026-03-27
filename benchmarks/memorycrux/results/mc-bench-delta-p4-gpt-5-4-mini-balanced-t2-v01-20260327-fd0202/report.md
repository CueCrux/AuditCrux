# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-fd0202

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
| Duration | 84.4s |
| Timestamp | 2026-03-27T04:28:13.865Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 134,708 |
| Output tokens | 3,479 |
| Cached tokens | 94,464 |
| Billable tokens | 138,187 |
| Estimated cost | $0.0311 |

## Sessions

### Auth System Design Review (7 turns, kill: none)

- Tool calls: 6
- Output length: 1140 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 7
- Output length: 1181 chars

### Data Pipeline Architecture Review (5 turns, kill: none)

- Tool calls: 9
- Output length: 1175 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 10
- Output length: 1602 chars

### Deployment Readiness Review (7 turns, kill: none)

- Tool calls: 10
- Output length: 1588 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 10334ms | 10334ms | 5 |
| get_checkpoints | 5ms | 6ms | 6ms | 5 |
| get_constraints | 5ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| query_memory | 8ms | 10ms | 10ms | 11 |
| get_contradictions | 5ms | 6ms | 6ms | 3 |
| list_topics | 6ms | 6ms | 6ms | 2 |
| get_freshness_report | 5ms | 6ms | 6ms | 4 |
| record_decision_context | 5ms | 5ms | 5ms | 1 |
| escalate_with_context | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
