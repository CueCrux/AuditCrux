# Benchmark Run: mc-bench-beta-p4-gpt-5-4-balanced-t2-v01-20260326-3a1848

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
| Duration | 23.5s |
| Timestamp | 2026-03-26T12:46:59.839Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 10,514 |
| Output tokens | 550 |
| Cached tokens | 5,632 |
| Billable tokens | 11,064 |
| Estimated cost | $0.0247 |

## Sessions

### Execute Migration (3 turns, kill: none)

- Tool calls: 6
- Output length: 1226 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10499ms | 10499ms | 10499ms | 1 |
| get_checkpoints | 7ms | 7ms | 7ms | 1 |
| get_constraints | 7ms | 7ms | 7ms | 1 |
| query_memory | 5ms | 6ms | 6ms | 2 |
| assess_coverage | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
