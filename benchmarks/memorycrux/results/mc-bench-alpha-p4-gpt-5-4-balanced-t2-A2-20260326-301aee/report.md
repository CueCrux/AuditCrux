# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A2-20260326-301aee

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
| Duration | 197.9s |
| Timestamp | 2026-03-26T16:34:23.923Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 61,889 |
| Output tokens | 8,972 |
| Cached tokens | 45,696 |
| Billable tokens | 70,861 |
| Estimated cost | $0.1873 |

## Sessions

### Auth Module Design (5 turns, kill: clean)

- Tool calls: 9
- Output length: 8885 chars

### Rate Limiting Implementation (4 turns, kill: clean)

- Tool calls: 8
- Output length: 9180 chars

### Error Handling Refactor (6 turns, kill: clean)

- Tool calls: 12
- Output length: 10315 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10501ms | 10502ms | 10502ms | 3 |
| get_constraints | 4ms | 5ms | 5ms | 3 |
| get_checkpoints | 4ms | 6ms | 6ms | 3 |
| query_memory | 6ms | 8ms | 8ms | 10 |
| assess_coverage | 6ms | 6ms | 6ms | 3 |
| record_decision_context | 6ms | 6ms | 6ms | 4 |
| get_decision_context | 10488ms | 10488ms | 10488ms | 1 |
| verify_before_acting | 5ms | 5ms | 5ms | 1 |
| check_constraints | 8ms | 8ms | 8ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
