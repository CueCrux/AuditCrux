# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-G1-20260327-8f0f6d

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
| Duration | 508.8s |
| Timestamp | 2026-03-27T00:57:15.243Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 376,212 |
| Output tokens | 27,462 |
| Cached tokens | 326,656 |
| Billable tokens | 403,674 |
| Estimated cost | $0.8068 |

## Sessions

### Design Event Schema (10 turns, kill: dirty)

- Tool calls: 32
- Output length: 18515 chars

### Implement Consumer Service (8 turns, kill: dirty)

- Tool calls: 18
- Output length: 20017 chars

### Add Monitoring (9 turns, kill: dirty)

- Tool calls: 24
- Output length: 19488 chars

### Resolve Serialization Contradiction (9 turns, kill: dirty)

- Tool calls: 42
- Output length: 12712 chars

### Deployment Readiness Review (12 turns, kill: dirty)

- Tool calls: 53
- Output length: 18230 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10250ms | 10502ms | 10502ms | 5 |
| get_checkpoints | 5ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 6ms | 10354ms | 90 |
| get_freshness_report | 4ms | 5ms | 5ms | 5 |
| get_contradictions | 4ms | 4ms | 4ms | 5 |
| check_claim | 1ms | 2ms | 2ms | 33 |
| list_topics | 5ms | 6ms | 6ms | 5 |
| record_decision_context | 5ms | 8ms | 8ms | 7 |
| checkpoint_decision_state | 7ms | 7ms | 7ms | 1 |
| get_decision_context | 10128ms | 10486ms | 10486ms | 3 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
