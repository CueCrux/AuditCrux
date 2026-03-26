# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A1-20260326-be26e1

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
| Duration | 62.6s |
| Timestamp | 2026-03-26T13:45:32.184Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 60,251 |
| Output tokens | 5,255 |
| Cached tokens | 27,520 |
| Billable tokens | 65,506 |
| Estimated cost | $0.0243 |

## Sessions

### Auth Module Design (5 turns, kill: dirty)

- Tool calls: 8
- Output length: 6198 chars

### Rate Limiting Implementation (4 turns, kill: dirty)

- Tool calls: 5
- Output length: 7061 chars

### Error Handling Refactor (5 turns, kill: dirty)

- Tool calls: 6
- Output length: 5577 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 10498ms | 10498ms | 3 |
| get_checkpoints | 5ms | 7ms | 7ms | 3 |
| list_topics | 5ms | 5ms | 5ms | 1 |
| get_constraints | 6ms | 6ms | 6ms | 3 |
| query_memory | 6ms | 10491ms | 10491ms | 3 |
| assess_coverage | 5ms | 6ms | 6ms | 2 |
| record_decision_context | 7ms | 7ms | 7ms | 1 |
| escalate_with_context | 5ms | 5ms | 5ms | 1 |
| check_constraints | 6ms | 8ms | 8ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
