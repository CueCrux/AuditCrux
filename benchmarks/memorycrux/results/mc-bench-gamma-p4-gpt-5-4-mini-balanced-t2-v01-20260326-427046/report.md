# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-t2-v01-20260326-427046

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 166.3s |
| Timestamp | 2026-03-26T21:04:03.293Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 245,389 |
| Output tokens | 12,307 |
| Cached tokens | 169,728 |
| Billable tokens | 257,696 |
| Estimated cost | $0.0669 |

## Sessions

### Design Event Schema (7 turns, kill: none)

- Tool calls: 12
- Output length: 10507 chars

### Implement Consumer Service (7 turns, kill: none)

- Tool calls: 6
- Output length: 9036 chars

### Add Monitoring (8 turns, kill: none)

- Tool calls: 13
- Output length: 9443 chars

### Resolve Serialization Contradiction (4 turns, kill: none)

- Tool calls: 10
- Output length: 6347 chars

### Deployment Readiness Review (10 turns, kill: none)

- Tool calls: 18
- Output length: 1885 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 15ms | 10504ms | 10504ms | 5 |
| get_checkpoints | 6ms | 7ms | 7ms | 5 |
| get_constraints | 4ms | 6ms | 6ms | 5 |
| assess_coverage | 5ms | 7ms | 7ms | 5 |
| get_freshness_report | 4ms | 5ms | 5ms | 3 |
| query_memory | 5ms | 10495ms | 10497ms | 25 |
| get_contradictions | 4ms | 7ms | 7ms | 2 |
| check_claim | 2ms | 3ms | 3ms | 4 |
| record_decision_context | 5ms | 6ms | 6ms | 2 |
| escalate_with_context | 7ms | 7ms | 7ms | 3 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
