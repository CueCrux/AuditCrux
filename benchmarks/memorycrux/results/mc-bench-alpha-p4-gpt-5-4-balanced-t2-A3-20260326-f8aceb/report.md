# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A3-20260326-f8aceb

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
| Duration | 183.0s |
| Timestamp | 2026-03-26T14:14:37.859Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 77,108 |
| Output tokens | 10,147 |
| Cached tokens | 58,240 |
| Billable tokens | 87,255 |
| Estimated cost | $0.2214 |

## Sessions

### Auth Module Design (5 turns, kill: graceful)

- Tool calls: 8
- Output length: 11224 chars

### Rate Limiting Implementation (4 turns, kill: graceful)

- Tool calls: 9
- Output length: 8959 chars

### Error Handling Refactor (6 turns, kill: graceful)

- Tool calls: 12
- Output length: 13020 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10494ms | 10498ms | 10498ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| get_checkpoints | 4ms | 7ms | 7ms | 3 |
| query_memory | 5ms | 8ms | 8ms | 12 |
| record_decision_context | 6ms | 7ms | 7ms | 4 |
| assess_coverage | 5ms | 5ms | 5ms | 2 |
| verify_before_acting | 5ms | 5ms | 5ms | 1 |
| check_constraints | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
