# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A2-20260326-c8e818

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A2 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 195.5s |
| Timestamp | 2026-03-26T16:21:09.275Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 60,411 |
| Output tokens | 9,297 |
| Cached tokens | 44,288 |
| Billable tokens | 69,708 |
| Estimated cost | $0.1886 |

## Sessions

### Auth Module Design (5 turns, kill: clean)

- Tool calls: 8
- Output length: 9070 chars

### Rate Limiting Implementation (4 turns, kill: clean)

- Tool calls: 9
- Output length: 10681 chars

### Error Handling Refactor (6 turns, kill: clean)

- Tool calls: 13
- Output length: 9909 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10500ms | 10500ms | 10500ms | 3 |
| get_checkpoints | 6ms | 6ms | 6ms | 3 |
| get_constraints | 4ms | 6ms | 6ms | 3 |
| query_memory | 6ms | 8ms | 8ms | 13 |
| record_decision_context | 6ms | 7ms | 7ms | 4 |
| assess_coverage | 5ms | 6ms | 6ms | 2 |
| check_constraints | 5ms | 6ms | 6ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
