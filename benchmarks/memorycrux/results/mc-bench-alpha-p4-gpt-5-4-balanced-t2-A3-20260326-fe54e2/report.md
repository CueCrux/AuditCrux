# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A3-20260326-fe54e2

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
| Duration | 229.4s |
| Timestamp | 2026-03-26T16:25:00.811Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 63,713 |
| Output tokens | 8,819 |
| Cached tokens | 48,384 |
| Billable tokens | 72,532 |
| Estimated cost | $0.1870 |

## Sessions

### Auth Module Design (5 turns, kill: graceful)

- Tool calls: 9
- Output length: 7456 chars

### Rate Limiting Implementation (4 turns, kill: graceful)

- Tool calls: 8
- Output length: 10652 chars

### Error Handling Refactor (6 turns, kill: graceful)

- Tool calls: 14
- Output length: 9554 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10494ms | 10505ms | 10505ms | 3 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| get_checkpoints | 5ms | 7ms | 7ms | 3 |
| query_memory | 6ms | 9ms | 9ms | 11 |
| assess_coverage | 7ms | 13ms | 13ms | 2 |
| record_decision_context | 6ms | 6ms | 6ms | 4 |
| get_decision_context | 10137ms | 10486ms | 10486ms | 3 |
| verify_before_acting | 9ms | 9ms | 9ms | 1 |
| check_constraints | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
