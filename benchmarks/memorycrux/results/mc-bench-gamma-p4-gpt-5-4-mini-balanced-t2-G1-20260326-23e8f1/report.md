# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-t2-G1-20260326-23e8f1

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G1 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 135.2s |
| Timestamp | 2026-03-26T21:11:18.091Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 234,160 |
| Output tokens | 12,433 |
| Cached tokens | 135,168 |
| Billable tokens | 246,593 |
| Estimated cost | $0.0730 |

## Sessions

### Design Event Schema (5 turns, kill: dirty)

- Tool calls: 11
- Output length: 11715 chars

### Implement Consumer Service (8 turns, kill: dirty)

- Tool calls: 9
- Output length: 8927 chars

### Add Monitoring (9 turns, kill: dirty)

- Tool calls: 14
- Output length: 10500 chars

### Resolve Serialization Contradiction (10 turns, kill: dirty)

- Tool calls: 9
- Output length: 6162 chars

### Deployment Readiness Review (8 turns, kill: dirty)

- Tool calls: 7
- Output length: 1360 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10496ms | 10496ms | 5 |
| get_checkpoints | 6ms | 6ms | 6ms | 5 |
| get_constraints | 6ms | 6ms | 6ms | 5 |
| assess_coverage | 4ms | 6ms | 6ms | 4 |
| get_freshness_report | 4ms | 6ms | 6ms | 2 |
| query_memory | 5ms | 10494ms | 10494ms | 14 |
| record_decision_context | 6ms | 6ms | 6ms | 3 |
| list_topics | 4ms | 4ms | 4ms | 2 |
| check_constraints | 5ms | 6ms | 6ms | 2 |
| check_claim | 2ms | 2ms | 2ms | 2 |
| escalate_with_context | 5ms | 8ms | 8ms | 4 |
| get_contradictions | 7ms | 7ms | 7ms | 1 |
| checkpoint_decision_state | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
