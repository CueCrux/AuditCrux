# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A1-20260326-dc8dc3

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A1 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 50.6s |
| Timestamp | 2026-03-26T16:25:51.829Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 35,428 |
| Output tokens | 5,253 |
| Cached tokens | 18,432 |
| Billable tokens | 40,681 |
| Estimated cost | $0.0170 |

## Sessions

### Auth Module Design (3 turns, kill: dirty)

- Tool calls: 6
- Output length: 6882 chars

### Rate Limiting Implementation (4 turns, kill: dirty)

- Tool calls: 5
- Output length: 6428 chars

### Error Handling Refactor (5 turns, kill: dirty)

- Tool calls: 8
- Output length: 5854 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 14ms | 10494ms | 10494ms | 3 |
| get_checkpoints | 5ms | 8ms | 8ms | 3 |
| list_topics | 5ms | 5ms | 5ms | 1 |
| get_constraints | 5ms | 7ms | 7ms | 3 |
| query_memory | 6ms | 8ms | 8ms | 5 |
| assess_coverage | 6ms | 7ms | 7ms | 3 |
| record_decision_context | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
