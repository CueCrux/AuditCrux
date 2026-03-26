# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A1-20260326-20c89c

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | A1 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 220.4s |
| Timestamp | 2026-03-26T13:58:29.850Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 73,847 |
| Output tokens | 12,068 |
| Cached tokens | 55,680 |
| Billable tokens | 85,915 |
| Estimated cost | $0.2357 |

## Sessions

### Auth Module Design (5 turns, kill: dirty)

- Tool calls: 8
- Output length: 12179 chars

### Rate Limiting Implementation (3 turns, kill: dirty)

- Tool calls: 5
- Output length: 13490 chars

### Error Handling Refactor (7 turns, kill: dirty)

- Tool calls: 16
- Output length: 15743 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10493ms | 10501ms | 10501ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 6ms | 6ms | 12 |
| record_decision_context | 5ms | 6ms | 6ms | 4 |
| check_constraints | 4ms | 5ms | 5ms | 3 |
| verify_before_acting | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
