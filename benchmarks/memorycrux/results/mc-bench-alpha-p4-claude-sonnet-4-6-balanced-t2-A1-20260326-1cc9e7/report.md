# Benchmark Run: mc-bench-alpha-p4-claude-sonnet-4-6-balanced-t2-A1-20260326-1cc9e7

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A1 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 410.0s |
| Timestamp | 2026-03-26T14:29:36.443Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 155,158 |
| Output tokens | 18,514 |
| Cached tokens | 0 |
| Billable tokens | 173,672 |
| Estimated cost | $0.7432 |

## Sessions

### Auth Module Design (8 turns, kill: dirty)

- Tool calls: 13
- Output length: 14832 chars

### Rate Limiting Implementation (6 turns, kill: dirty)

- Tool calls: 12
- Output length: 10680 chars

### Error Handling Refactor (9 turns, kill: dirty)

- Tool calls: 16
- Output length: 14832 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10496ms | 10498ms | 10498ms | 3 |
| get_checkpoints | 10ms | 11ms | 11ms | 3 |
| get_constraints | 5ms | 7ms | 7ms | 3 |
| query_memory | 5ms | 10499ms | 10499ms | 15 |
| assess_coverage | 5ms | 6ms | 6ms | 3 |
| check_constraints | 6ms | 7ms | 7ms | 2 |
| verify_before_acting | 5ms | 6ms | 6ms | 2 |
| record_decision_context | 6ms | 7ms | 7ms | 5 |
| checkpoint_decision_state | 8ms | 11ms | 11ms | 3 |
| suggest_constraint | 4ms | 4ms | 4ms | 1 |
| list_topics | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
