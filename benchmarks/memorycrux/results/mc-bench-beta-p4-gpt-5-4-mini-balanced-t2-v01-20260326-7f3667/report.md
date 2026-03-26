# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-7f3667

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
| Duration | 31.3s |
| Timestamp | 2026-03-26T12:34:51.088Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 19,907 |
| Output tokens | 1,339 |
| Cached tokens | 7,936 |
| Billable tokens | 21,246 |
| Estimated cost | $0.0077 |

## Sessions

### Execute Migration (3 turns, kill: none)

- Tool calls: 8
- Output length: 4730 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10499ms | 10499ms | 10499ms | 1 |
| get_checkpoints | 6ms | 6ms | 6ms | 1 |
| get_constraints | 5ms | 6ms | 6ms | 3 |
| get_platform_capabilities | 5ms | 5ms | 5ms | 1 |
| query_memory | 10492ms | 10492ms | 10492ms | 1 |
| assess_coverage | 8ms | 8ms | 8ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
