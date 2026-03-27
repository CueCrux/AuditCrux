# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-G4-20260326-8c0be1

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
| Duration | 649.2s |
| Timestamp | 2026-03-26T23:22:29.607Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 600,991 |
| Output tokens | 28,692 |
| Cached tokens | 529,152 |
| Billable tokens | 629,683 |
| Estimated cost | $1.1280 |

## Sessions

### Design Event Schema (8 turns, kill: graceful)

- Tool calls: 15
- Output length: 0 chars

### Implement Consumer Service (8 turns, kill: graceful)

- Tool calls: 24
- Output length: 0 chars

### Add Monitoring (11 turns, kill: graceful)

- Tool calls: 40
- Output length: 0 chars

### Resolve Serialization Contradiction (14 turns, kill: graceful)

- Tool calls: 61
- Output length: 13042 chars

### Deployment Readiness Review (15 turns, kill: graceful)

- Tool calls: 65
- Output length: 19023 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10497ms | 10497ms | 5 |
| get_checkpoints | 5ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| list_topics | 5ms | 7ms | 7ms | 5 |
| query_memory | 4ms | 7ms | 10496ms | 119 |
| get_freshness_report | 4ms | 7ms | 7ms | 5 |
| get_contradictions | 3ms | 4ms | 4ms | 4 |
| check_claim | 1ms | 2ms | 2ms | 33 |
| record_decision_context | 6ms | 6ms | 6ms | 8 |
| get_decision_context | 10486ms | 10489ms | 10489ms | 9 |
| checkpoint_decision_state | 7ms | 9ms | 9ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
