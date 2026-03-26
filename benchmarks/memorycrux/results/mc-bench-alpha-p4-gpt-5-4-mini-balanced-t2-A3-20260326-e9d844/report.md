# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A3-20260326-e9d844

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
| Duration | 53.3s |
| Timestamp | 2026-03-26T16:27:34.864Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 34,333 |
| Output tokens | 5,604 |
| Cached tokens | 14,720 |
| Billable tokens | 39,937 |
| Estimated cost | $0.0183 |

## Sessions

### Auth Module Design (4 turns, kill: graceful)

- Tool calls: 6
- Output length: 7403 chars

### Rate Limiting Implementation (4 turns, kill: graceful)

- Tool calls: 5
- Output length: 5316 chars

### Error Handling Refactor (4 turns, kill: graceful)

- Tool calls: 5
- Output length: 6759 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10496ms | 10496ms | 3 |
| get_checkpoints | 5ms | 5ms | 5ms | 3 |
| list_topics | 4ms | 4ms | 4ms | 1 |
| get_constraints | 4ms | 6ms | 6ms | 3 |
| record_decision_context | 5ms | 6ms | 6ms | 2 |
| escalate_with_context | 7ms | 7ms | 7ms | 1 |
| query_memory | 5ms | 7ms | 7ms | 2 |
| assess_coverage | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
