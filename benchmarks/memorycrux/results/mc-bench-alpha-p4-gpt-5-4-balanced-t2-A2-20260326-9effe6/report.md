# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A2-20260326-9effe6

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
| Duration | 217.2s |
| Timestamp | 2026-03-26T14:06:57.963Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 72,151 |
| Output tokens | 10,577 |
| Cached tokens | 45,312 |
| Billable tokens | 82,728 |
| Estimated cost | $0.2295 |

## Sessions

### Auth Module Design (4 turns, kill: clean)

- Tool calls: 8
- Output length: 11555 chars

### Rate Limiting Implementation (4 turns, kill: clean)

- Tool calls: 9
- Output length: 11455 chars

### Error Handling Refactor (6 turns, kill: clean)

- Tool calls: 14
- Output length: 13409 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10223ms | 10319ms | 10319ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| get_checkpoints | 6ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 8ms | 8ms | 13 |
| get_decision_context | 10492ms | 10492ms | 10492ms | 1 |
| assess_coverage | 5ms | 6ms | 6ms | 3 |
| record_decision_context | 6ms | 6ms | 6ms | 3 |
| check_constraints | 5ms | 6ms | 6ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
