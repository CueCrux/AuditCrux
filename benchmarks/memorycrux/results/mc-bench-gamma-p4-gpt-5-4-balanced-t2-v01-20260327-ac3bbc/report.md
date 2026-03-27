# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t2-v01-20260327-ac3bbc

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
| Duration | 557.6s |
| Timestamp | 2026-03-27T00:28:47.631Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 522,695 |
| Output tokens | 28,765 |
| Cached tokens | 459,776 |
| Billable tokens | 551,460 |
| Estimated cost | $1.0197 |

## Sessions

### Design Event Schema (10 turns, kill: none)

- Tool calls: 25
- Output length: 20899 chars

### Implement Consumer Service (9 turns, kill: none)

- Tool calls: 24
- Output length: 17814 chars

### Add Monitoring (9 turns, kill: none)

- Tool calls: 26
- Output length: 15405 chars

### Resolve Serialization Contradiction (13 turns, kill: none)

- Tool calls: 54
- Output length: 13581 chars

### Deployment Readiness Review (13 turns, kill: none)

- Tool calls: 44
- Output length: 16645 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10502ms | 10505ms | 10505ms | 5 |
| get_checkpoints | 6ms | 6ms | 6ms | 5 |
| get_constraints | 4ms | 5ms | 5ms | 5 |
| assess_coverage | 5ms | 5ms | 5ms | 5 |
| query_memory | 4ms | 7ms | 10495ms | 74 |
| get_contradictions | 4ms | 4ms | 4ms | 5 |
| get_freshness_report | 3ms | 5ms | 5ms | 6 |
| list_topics | 5ms | 6ms | 6ms | 5 |
| check_claim | 1ms | 1ms | 2ms | 41 |
| record_decision_context | 5ms | 6ms | 6ms | 10 |
| checkpoint_decision_state | 7ms | 8ms | 8ms | 4 |
| get_decision_context | 10486ms | 10489ms | 10489ms | 5 |
| escalate_with_context | 9ms | 9ms | 9ms | 1 |
| check_constraints | 4ms | 5ms | 5ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
