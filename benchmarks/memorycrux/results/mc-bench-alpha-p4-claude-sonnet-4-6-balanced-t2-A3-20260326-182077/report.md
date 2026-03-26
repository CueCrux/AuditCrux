# Benchmark Run: mc-bench-alpha-p4-claude-sonnet-4-6-balanced-t2-A3-20260326-182077

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A3 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 594.2s |
| Timestamp | 2026-03-26T15:02:24.137Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 263,879 |
| Output tokens | 21,115 |
| Cached tokens | 0 |
| Billable tokens | 284,994 |
| Estimated cost | $1.1084 |

## Sessions

### Auth Module Design (8 turns, kill: graceful)

- Tool calls: 16
- Output length: 14703 chars

### Rate Limiting Implementation (9 turns, kill: graceful)

- Tool calls: 16
- Output length: 13298 chars

### Error Handling Refactor (15 turns, kill: graceful)

- Tool calls: 28
- Output length: 14633 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10493ms | 10496ms | 10496ms | 5 |
| get_checkpoints | 6ms | 11ms | 11ms | 3 |
| get_constraints | 6ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 7ms | 10490ms | 28 |
| assess_coverage | 5ms | 6ms | 6ms | 3 |
| list_topics | 6ms | 7ms | 7ms | 3 |
| record_decision_context | 6ms | 11ms | 11ms | 5 |
| checkpoint_decision_state | 8ms | 10ms | 10ms | 3 |
| get_decision_context | 10486ms | 10489ms | 10489ms | 2 |
| suggest_constraint | 4ms | 7ms | 7ms | 3 |
| verify_before_acting | 7ms | 7ms | 7ms | 1 |
| check_constraints | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
