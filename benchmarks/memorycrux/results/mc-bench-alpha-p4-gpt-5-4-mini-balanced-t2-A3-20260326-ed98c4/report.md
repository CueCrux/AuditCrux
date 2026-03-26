# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A3-20260326-ed98c4

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A3 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 47.8s |
| Timestamp | 2026-03-26T13:49:40.595Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 42,121 |
| Output tokens | 4,822 |
| Cached tokens | 24,192 |
| Billable tokens | 46,943 |
| Estimated cost | $0.0173 |

## Sessions

### Auth Module Design (4 turns, kill: graceful)

- Tool calls: 7
- Output length: 6800 chars

### Rate Limiting Implementation (5 turns, kill: graceful)

- Tool calls: 6
- Output length: 4999 chars

### Error Handling Refactor (4 turns, kill: graceful)

- Tool calls: 7
- Output length: 6273 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 10498ms | 10498ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| list_topics | 4ms | 4ms | 4ms | 1 |
| get_constraints | 4ms | 6ms | 6ms | 3 |
| check_constraints | 5ms | 6ms | 6ms | 4 |
| assess_coverage | 6ms | 7ms | 7ms | 2 |
| query_memory | 4ms | 7ms | 7ms | 4 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
