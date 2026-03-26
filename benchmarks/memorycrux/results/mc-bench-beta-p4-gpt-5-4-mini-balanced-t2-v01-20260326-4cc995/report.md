# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-4cc995

| Field | Value |
|---|---|
| Project | beta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 29.8s |
| Timestamp | 2026-03-26T16:11:19.611Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 26,773 |
| Output tokens | 1,590 |
| Cached tokens | 17,024 |
| Billable tokens | 28,363 |
| Estimated cost | $0.0081 |

## Sessions

### Execute Migration (7 turns, kill: none)

- Tool calls: 8
- Output length: 4013 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10503ms | 10503ms | 10503ms | 1 |
| get_checkpoints | 5ms | 5ms | 5ms | 1 |
| list_topics | 5ms | 5ms | 5ms | 1 |
| get_constraints | 6ms | 6ms | 6ms | 1 |
| verify_before_acting | 6ms | 13ms | 13ms | 2 |
| escalate_with_context | 7ms | 11ms | 11ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
