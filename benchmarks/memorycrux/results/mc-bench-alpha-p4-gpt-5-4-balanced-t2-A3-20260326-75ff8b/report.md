# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A3-20260326-75ff8b

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A3 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 203.2s |
| Timestamp | 2026-03-26T16:37:47.552Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 64,327 |
| Output tokens | 10,534 |
| Cached tokens | 48,640 |
| Billable tokens | 74,861 |
| Estimated cost | $0.2054 |

## Sessions

### Auth Module Design (5 turns, kill: graceful)

- Tool calls: 7
- Output length: 9455 chars

### Rate Limiting Implementation (5 turns, kill: graceful)

- Tool calls: 11
- Output length: 11913 chars

### Error Handling Refactor (6 turns, kill: graceful)

- Tool calls: 14
- Output length: 12722 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10493ms | 10501ms | 10501ms | 3 |
| get_constraints | 4ms | 6ms | 6ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 10ms | 10ms | 13 |
| assess_coverage | 5ms | 7ms | 7ms | 3 |
| record_decision_context | 6ms | 7ms | 7ms | 4 |
| list_topics | 8ms | 8ms | 8ms | 1 |
| check_constraints | 7ms | 7ms | 7ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
