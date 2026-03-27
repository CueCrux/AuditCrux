# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-G4-20260327-dcbd6f

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G4 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 583.0s |
| Timestamp | 2026-03-27T00:59:58.694Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 570,738 |
| Output tokens | 29,118 |
| Cached tokens | 513,408 |
| Billable tokens | 599,856 |
| Estimated cost | $1.0763 |

## Sessions

### Design Event Schema (15 turns, kill: graceful)

- Tool calls: 31
- Output length: 20648 chars

### Implement Consumer Service (7 turns, kill: graceful)

- Tool calls: 16
- Output length: 17278 chars

### Add Monitoring (7 turns, kill: graceful)

- Tool calls: 23
- Output length: 17868 chars

### Resolve Serialization Contradiction (13 turns, kill: graceful)

- Tool calls: 52
- Output length: 15578 chars

### Deployment Readiness Review (14 turns, kill: graceful)

- Tool calls: 72
- Output length: 17122 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10140ms | 10412ms | 10412ms | 5 |
| get_checkpoints | 6ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 6ms | 10031ms | 100 |
| get_freshness_report | 4ms | 4ms | 4ms | 5 |
| get_contradictions | 4ms | 5ms | 5ms | 5 |
| list_topics | 5ms | 7ms | 7ms | 4 |
| check_claim | 1ms | 2ms | 2ms | 36 |
| record_decision_context | 5ms | 7ms | 7ms | 9 |
| check_constraints | 5ms | 7ms | 7ms | 4 |
| checkpoint_decision_state | 7ms | 8ms | 8ms | 3 |
| get_decision_context | 10480ms | 10486ms | 10486ms | 7 |
| verify_before_acting | 3ms | 3ms | 3ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
