# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A3-20260326-4b4ec0

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
| Duration | 50.2s |
| Timestamp | 2026-03-26T16:14:53.125Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 32,259 |
| Output tokens | 5,268 |
| Cached tokens | 16,896 |
| Billable tokens | 37,527 |
| Estimated cost | $0.0163 |

## Sessions

### Auth Module Design (3 turns, kill: graceful)

- Tool calls: 5
- Output length: 6801 chars

### Rate Limiting Implementation (4 turns, kill: graceful)

- Tool calls: 5
- Output length: 5991 chars

### Error Handling Refactor (4 turns, kill: graceful)

- Tool calls: 7
- Output length: 6351 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 11ms | 10495ms | 10495ms | 3 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| get_checkpoints | 4ms | 5ms | 5ms | 3 |
| assess_coverage | 6ms | 7ms | 7ms | 2 |
| query_memory | 5ms | 8ms | 8ms | 5 |
| record_decision_context | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
