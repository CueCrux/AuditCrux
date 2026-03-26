# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A1-20260326-0a428a

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A1 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 210.3s |
| Timestamp | 2026-03-26T16:31:05.618Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 56,325 |
| Output tokens | 10,411 |
| Cached tokens | 39,552 |
| Billable tokens | 66,736 |
| Estimated cost | $0.1955 |

## Sessions

### Auth Module Design (5 turns, kill: dirty)

- Tool calls: 10
- Output length: 10334 chars

### Rate Limiting Implementation (4 turns, kill: dirty)

- Tool calls: 9
- Output length: 12452 chars

### Error Handling Refactor (5 turns, kill: dirty)

- Tool calls: 13
- Output length: 11412 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10497ms | 10505ms | 10505ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 7ms | 7ms | 14 |
| assess_coverage | 4ms | 5ms | 5ms | 3 |
| record_decision_context | 5ms | 6ms | 6ms | 4 |
| get_decision_context | 10153ms | 10153ms | 10153ms | 1 |
| verify_before_acting | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
