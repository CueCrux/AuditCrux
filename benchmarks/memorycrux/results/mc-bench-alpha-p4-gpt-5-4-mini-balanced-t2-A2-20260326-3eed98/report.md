# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A2-20260326-3eed98

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
| Duration | 50.6s |
| Timestamp | 2026-03-26T16:14:02.520Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 31,230 |
| Output tokens | 5,444 |
| Cached tokens | 14,080 |
| Billable tokens | 36,674 |
| Estimated cost | $0.0170 |

## Sessions

### Auth Module Design (3 turns, kill: clean)

- Tool calls: 7
- Output length: 6663 chars

### Rate Limiting Implementation (4 turns, kill: clean)

- Tool calls: 5
- Output length: 8275 chars

### Error Handling Refactor (4 turns, kill: clean)

- Tool calls: 7
- Output length: 6520 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 10158ms | 10158ms | 3 |
| get_checkpoints | 5ms | 7ms | 7ms | 3 |
| list_topics | 7ms | 7ms | 7ms | 1 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 6ms | 6ms | 7 |
| assess_coverage | 6ms | 6ms | 6ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
