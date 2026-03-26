# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A2-20260326-475c7a

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A2 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 48.9s |
| Timestamp | 2026-03-26T16:26:41.114Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 51,146 |
| Output tokens | 3,836 |
| Cached tokens | 24,320 |
| Billable tokens | 54,982 |
| Estimated cost | $0.0193 |

## Sessions

### Auth Module Design (4 turns, kill: clean)

- Tool calls: 7
- Output length: 6627 chars

### Rate Limiting Implementation (5 turns, kill: clean)

- Tool calls: 9
- Output length: 911 chars

### Error Handling Refactor (6 turns, kill: clean)

- Tool calls: 7
- Output length: 1284 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10503ms | 10503ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| list_topics | 4ms | 6ms | 6ms | 2 |
| query_memory | 6ms | 9ms | 9ms | 4 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| assess_coverage | 6ms | 7ms | 7ms | 3 |
| record_decision_context | 8ms | 8ms | 8ms | 1 |
| escalate_with_context | 7ms | 8ms | 8ms | 4 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
