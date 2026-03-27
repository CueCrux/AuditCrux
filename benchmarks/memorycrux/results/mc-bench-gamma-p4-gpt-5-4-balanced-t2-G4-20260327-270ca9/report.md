# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-G4-20260327-270ca9

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
| Duration | 610.1s |
| Timestamp | 2026-03-27T00:59:13.384Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 511,531 |
| Output tokens | 28,713 |
| Cached tokens | 454,016 |
| Billable tokens | 540,244 |
| Estimated cost | $0.9984 |

## Sessions

### Design Event Schema (13 turns, kill: graceful)

- Tool calls: 21
- Output length: 21290 chars

### Implement Consumer Service (9 turns, kill: graceful)

- Tool calls: 29
- Output length: 18389 chars

### Add Monitoring (9 turns, kill: graceful)

- Tool calls: 33
- Output length: 17334 chars

### Resolve Serialization Contradiction (12 turns, kill: graceful)

- Tool calls: 47
- Output length: 13339 chars

### Deployment Readiness Review (13 turns, kill: graceful)

- Tool calls: 43
- Output length: 16757 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 10254ms | 10254ms | 5 |
| get_checkpoints | 5ms | 7ms | 7ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 5ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 7ms | 10496ms | 72 |
| list_topics | 5ms | 6ms | 6ms | 5 |
| get_contradictions | 4ms | 4ms | 4ms | 5 |
| get_freshness_report | 4ms | 5ms | 5ms | 5 |
| check_claim | 1ms | 2ms | 2ms | 37 |
| record_decision_context | 5ms | 6ms | 6ms | 8 |
| escalate_with_context | 4ms | 5ms | 5ms | 2 |
| check_constraints | 6ms | 10489ms | 10489ms | 5 |
| checkpoint_decision_state | 7ms | 8ms | 8ms | 3 |
| get_decision_context | 10486ms | 10488ms | 10488ms | 9 |
| get_platform_capabilities | 3ms | 3ms | 3ms | 1 |
| verify_before_acting | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
