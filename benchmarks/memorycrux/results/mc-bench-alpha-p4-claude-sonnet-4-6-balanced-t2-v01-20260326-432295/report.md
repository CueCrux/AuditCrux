# Benchmark Run: mc-bench-alpha-p4-claude-sonnet-4-6-balanced-t2-v01-20260326-432295

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 437.2s |
| Timestamp | 2026-03-26T13:31:02.277Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 166,160 |
| Output tokens | 19,081 |
| Cached tokens | 0 |
| Billable tokens | 185,241 |
| Estimated cost | $0.7847 |

## Sessions

### Auth Module Design (6 turns, kill: none)

- Tool calls: 14
- Output length: 15387 chars

### Rate Limiting Implementation (10 turns, kill: none)

- Tool calls: 15
- Output length: 11681 chars

### Error Handling Refactor (7 turns, kill: none)

- Tool calls: 14
- Output length: 14554 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10497ms | 10500ms | 10500ms | 3 |
| get_checkpoints | 11ms | 12ms | 12ms | 3 |
| get_constraints | 5ms | 7ms | 7ms | 3 |
| query_memory | 5ms | 8ms | 8ms | 15 |
| assess_coverage | 5ms | 8ms | 8ms | 3 |
| record_decision_context | 6ms | 7ms | 7ms | 5 |
| checkpoint_decision_state | 8ms | 9ms | 9ms | 3 |
| suggest_constraint | 4ms | 4ms | 4ms | 1 |
| list_topics | 6ms | 6ms | 6ms | 2 |
| check_constraints | 4ms | 8ms | 8ms | 2 |
| verify_before_acting | 6ms | 6ms | 6ms | 2 |
| get_decision_context | 10355ms | 10355ms | 10355ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
