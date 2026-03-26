# Benchmark Run: mc-bench-beta-p4-gpt-5-4-balanced-t2-v01-20260326-162cac

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
| Duration | 13.9s |
| Timestamp | 2026-03-26T16:11:33.895Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 10,659 |
| Output tokens | 560 |
| Cached tokens | 7,168 |
| Billable tokens | 11,219 |
| Estimated cost | $0.0233 |

## Sessions

### Execute Migration (4 turns, kill: none)

- Tool calls: 7
- Output length: 1209 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 8ms | 8ms | 8ms | 1 |
| get_checkpoints | 4ms | 4ms | 4ms | 1 |
| get_constraints | 4ms | 4ms | 4ms | 1 |
| query_memory | 6ms | 6ms | 6ms | 3 |
| assess_coverage | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
