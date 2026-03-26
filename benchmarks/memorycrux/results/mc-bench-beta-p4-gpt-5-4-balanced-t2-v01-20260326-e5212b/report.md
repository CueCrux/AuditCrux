# Benchmark Run: mc-bench-beta-p4-gpt-5-4-balanced-t2-v01-20260326-e5212b

| Field | Value |
|---|---|
| Project | beta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 10.6s |
| Timestamp | 2026-03-26T16:12:04.060Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 10,667 |
| Output tokens | 573 |
| Cached tokens | 7,296 |
| Billable tokens | 11,240 |
| Estimated cost | $0.0233 |

## Sessions

### Execute Migration (4 turns, kill: none)

- Tool calls: 7
- Output length: 1217 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 12ms | 12ms | 12ms | 1 |
| get_checkpoints | 5ms | 5ms | 5ms | 1 |
| get_constraints | 4ms | 4ms | 4ms | 1 |
| query_memory | 4ms | 8ms | 8ms | 2 |
| list_topics | 4ms | 4ms | 4ms | 1 |
| assess_coverage | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
