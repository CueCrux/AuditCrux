# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-G1-20260326-5c7467

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G1 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 577.0s |
| Timestamp | 2026-03-26T23:10:08.654Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 416,831 |
| Output tokens | 25,792 |
| Cached tokens | 356,608 |
| Billable tokens | 442,623 |
| Estimated cost | $0.8542 |

## Sessions

### Design Event Schema (8 turns, kill: dirty)

- Tool calls: 25
- Output length: 0 chars

### Implement Consumer Service (9 turns, kill: dirty)

- Tool calls: 18
- Output length: 0 chars

### Add Monitoring (11 turns, kill: dirty)

- Tool calls: 39
- Output length: 14179 chars

### Resolve Serialization Contradiction (13 turns, kill: dirty)

- Tool calls: 46
- Output length: 13398 chars

### Deployment Readiness Review (9 turns, kill: dirty)

- Tool calls: 38
- Output length: 14880 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10498ms | 10507ms | 10507ms | 5 |
| get_checkpoints | 6ms | 7ms | 7ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 7ms | 10493ms | 77 |
| get_freshness_report | 3ms | 5ms | 5ms | 5 |
| get_contradictions | 4ms | 4ms | 4ms | 5 |
| list_topics | 5ms | 5ms | 5ms | 5 |
| check_claim | 1ms | 2ms | 2ms | 36 |
| record_decision_context | 5ms | 7ms | 7ms | 8 |
| get_decision_context | 10487ms | 10489ms | 10489ms | 6 |
| check_constraints | 5ms | 10490ms | 10490ms | 2 |
| checkpoint_decision_state | 8ms | 8ms | 8ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
