# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-v01-20260326-c5322e

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 176.5s |
| Timestamp | 2026-03-26T12:50:04.947Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 58,270 |
| Output tokens | 9,716 |
| Cached tokens | 38,656 |
| Billable tokens | 67,986 |
| Estimated cost | $0.1945 |

## Sessions

### Auth Module Design (6 turns, kill: none)

- Tool calls: 9
- Output length: 8483 chars

### Rate Limiting Implementation (3 turns, kill: none)

- Tool calls: 5
- Output length: 11517 chars

### Error Handling Refactor (5 turns, kill: none)

- Tool calls: 11
- Output length: 12576 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10131ms | 10502ms | 10502ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| get_checkpoints | 5ms | 8ms | 8ms | 3 |
| query_memory | 4ms | 8ms | 8ms | 10 |
| assess_coverage | 7ms | 8ms | 8ms | 2 |
| record_decision_context | 6ms | 7ms | 7ms | 3 |
| check_constraints | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
