# Benchmark Run: mc-bench-alpha-p4-gpt-5-4-mini-balanced-t2-v01-20260326-efa3dc

| Field | Value |
|---|---|
| Project | alpha |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 47.8s |
| Timestamp | 2026-03-26T12:37:42.021Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 55,229 |
| Output tokens | 4,565 |
| Cached tokens | 31,872 |
| Billable tokens | 59,794 |
| Estimated cost | $0.0198 |

## Sessions

### Auth Module Design (5 turns, kill: none)

- Tool calls: 7
- Output length: 5859 chars

### Rate Limiting Implementation (5 turns, kill: none)

- Tool calls: 7
- Output length: 733 chars

### Error Handling Refactor (4 turns, kill: none)

- Tool calls: 7
- Output length: 6739 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 13ms | 10501ms | 10501ms | 3 |
| get_checkpoints | 5ms | 6ms | 6ms | 3 |
| get_constraints | 5ms | 5ms | 5ms | 3 |
| query_memory | 7ms | 9ms | 9ms | 5 |
| assess_coverage | 6ms | 7ms | 7ms | 3 |
| record_decision_context | 8ms | 8ms | 8ms | 1 |
| escalate_with_context | 6ms | 7ms | 7ms | 3 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
