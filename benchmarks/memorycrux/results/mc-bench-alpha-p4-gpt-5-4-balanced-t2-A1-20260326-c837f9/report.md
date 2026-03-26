# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-balanced-t2-A1-20260326-c837f9

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
| Duration | 179.8s |
| Timestamp | 2026-03-26T16:17:53.371Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 55,161 |
| Output tokens | 9,247 |
| Cached tokens | 39,552 |
| Billable tokens | 64,408 |
| Estimated cost | $0.1809 |

## Sessions

### Auth Module Design (5 turns, kill: dirty)

- Tool calls: 8
- Output length: 9309 chars

### Rate Limiting Implementation (4 turns, kill: dirty)

- Tool calls: 9
- Output length: 9452 chars

### Error Handling Refactor (5 turns, kill: dirty)

- Tool calls: 13
- Output length: 10854 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10257ms | 10496ms | 10496ms | 3 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| get_checkpoints | 6ms | 6ms | 6ms | 3 |
| query_memory | 5ms | 7ms | 7ms | 14 |
| record_decision_context | 5ms | 6ms | 6ms | 3 |
| assess_coverage | 4ms | 4ms | 4ms | 2 |
| escalate_with_context | 5ms | 5ms | 5ms | 1 |
| check_constraints | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
