# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-v01-20260326-d1bb05

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 515.5s |
| Timestamp | 2026-03-26T21:47:58.015Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 446,472 |
| Output tokens | 26,070 |
| Cached tokens | 393,344 |
| Billable tokens | 472,542 |
| Estimated cost | $0.8852 |

## Sessions

### Design Event Schema (8 turns, kill: none)

- Tool calls: 19
- Output length: 0 chars

### Implement Consumer Service (9 turns, kill: none)

- Tool calls: 18
- Output length: 15870 chars

### Add Monitoring (9 turns, kill: none)

- Tool calls: 32
- Output length: 14995 chars

### Resolve Serialization Contradiction (14 turns, kill: none)

- Tool calls: 46
- Output length: 15238 chars

### Deployment Readiness Review (13 turns, kill: none)

- Tool calls: 53
- Output length: 14650 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10499ms | 10500ms | 10500ms | 5 |
| get_checkpoints | 6ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 7ms | 9ms | 72 |
| list_topics | 5ms | 6ms | 6ms | 4 |
| get_freshness_report | 4ms | 5ms | 5ms | 5 |
| get_contradictions | 4ms | 5ms | 5ms | 5 |
| check_claim | 1ms | 2ms | 2ms | 44 |
| record_decision_context | 5ms | 7ms | 7ms | 10 |
| check_constraints | 7ms | 10487ms | 10487ms | 3 |
| get_decision_context | 10487ms | 10488ms | 10488ms | 2 |
| escalate_with_context | 7ms | 7ms | 7ms | 2 |
| checkpoint_decision_state | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
