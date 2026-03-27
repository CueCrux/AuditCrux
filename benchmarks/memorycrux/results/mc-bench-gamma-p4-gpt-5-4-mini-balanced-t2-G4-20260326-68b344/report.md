# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-t2-G4-20260326-68b344

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G4 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 125.8s |
| Timestamp | 2026-03-26T21:18:12.772Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 169,768 |
| Output tokens | 12,405 |
| Cached tokens | 98,560 |
| Billable tokens | 182,173 |
| Estimated cost | $0.0582 |

## Sessions

### Design Event Schema (4 turns, kill: graceful)

- Tool calls: 11
- Output length: 10827 chars

### Implement Consumer Service (6 turns, kill: graceful)

- Tool calls: 7
- Output length: 8714 chars

### Add Monitoring (8 turns, kill: graceful)

- Tool calls: 13
- Output length: 10318 chars

### Resolve Serialization Contradiction (8 turns, kill: graceful)

- Tool calls: 7
- Output length: 6370 chars

### Deployment Readiness Review (5 turns, kill: graceful)

- Tool calls: 11
- Output length: 9156 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10497ms | 10504ms | 10504ms | 5 |
| get_checkpoints | 6ms | 7ms | 7ms | 5 |
| get_constraints | 5ms | 6ms | 6ms | 5 |
| assess_coverage | 5ms | 7ms | 7ms | 5 |
| get_freshness_report | 4ms | 6ms | 6ms | 4 |
| query_memory | 4ms | 9ms | 9ms | 16 |
| get_contradictions | 5ms | 5ms | 5ms | 3 |
| check_claim | 2ms | 2ms | 2ms | 4 |
| record_decision_context | 7ms | 7ms | 7ms | 1 |
| escalate_with_context | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
