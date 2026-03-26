# Benchmark Run: mc-bench-alpha-p4-claude-sonnet-4-6-balanced-t2-A2-20260326-55d606

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A2 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 472.0s |
| Timestamp | 2026-03-26T14:45:05.023Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 178,447 |
| Output tokens | 20,822 |
| Cached tokens | 0 |
| Billable tokens | 199,269 |
| Estimated cost | $0.8477 |

## Sessions

### Auth Module Design (8 turns, kill: clean)

- Tool calls: 15
- Output length: 13650 chars

### Rate Limiting Implementation (9 turns, kill: clean)

- Tool calls: 16
- Output length: 12072 chars

### Error Handling Refactor (8 turns, kill: clean)

- Tool calls: 20
- Output length: 14054 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10084ms | 10175ms | 10175ms | 3 |
| get_checkpoints | 10ms | 13ms | 13ms | 3 |
| get_constraints | 4ms | 5ms | 5ms | 3 |
| query_memory | 6ms | 10498ms | 10498ms | 13 |
| assess_coverage | 6ms | 8ms | 8ms | 3 |
| list_topics | 5ms | 5ms | 5ms | 3 |
| check_constraints | 6ms | 7ms | 7ms | 5 |
| verify_before_acting | 5ms | 7ms | 7ms | 5 |
| record_decision_context | 5ms | 9ms | 9ms | 7 |
| checkpoint_decision_state | 9ms | 10ms | 10ms | 3 |
| suggest_constraint | 4ms | 4ms | 4ms | 2 |
| get_decision_context | 10492ms | 10492ms | 10492ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
