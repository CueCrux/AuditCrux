# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-A1-20260326-328f41

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
| Duration | 58.4s |
| Timestamp | 2026-03-26T16:13:11.530Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 58,399 |
| Output tokens | 6,175 |
| Cached tokens | 30,464 |
| Billable tokens | 64,574 |
| Estimated cost | $0.0241 |

## Sessions

### Auth Module Design (5 turns, kill: dirty)

- Tool calls: 7
- Output length: 6761 chars

### Rate Limiting Implementation (5 turns, kill: dirty)

- Tool calls: 8
- Output length: 5744 chars

### Error Handling Refactor (6 turns, kill: dirty)

- Tool calls: 9
- Output length: 5686 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10433ms | 10433ms | 3 |
| get_checkpoints | 5ms | 5ms | 5ms | 3 |
| get_constraints | 4ms | 7ms | 7ms | 3 |
| query_memory | 6ms | 7ms | 7ms | 5 |
| assess_coverage | 5ms | 7ms | 7ms | 3 |
| record_decision_context | 6ms | 7ms | 7ms | 3 |
| escalate_with_context | 6ms | 6ms | 6ms | 2 |
| list_topics | 4ms | 4ms | 4ms | 1 |
| verify_before_acting | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
