# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A2-20260326-6462c0

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
| Duration | 48.8s |
| Timestamp | 2026-03-26T13:47:36.944Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 33,754 |
| Output tokens | 5,151 |
| Cached tokens | 14,592 |
| Billable tokens | 38,905 |
| Estimated cost | $0.0174 |

## Sessions

### Auth Module Design (3 turns, kill: clean)

- Tool calls: 5
- Output length: 7020 chars

### Rate Limiting Implementation (4 turns, kill: clean)

- Tool calls: 5
- Output length: 6646 chars

### Error Handling Refactor (4 turns, kill: clean)

- Tool calls: 7
- Output length: 6676 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 15ms | 10499ms | 10499ms | 3 |
| get_checkpoints | 5ms | 5ms | 5ms | 3 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| query_memory | 6ms | 7ms | 7ms | 4 |
| assess_coverage | 6ms | 7ms | 7ms | 3 |
| list_topics | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
