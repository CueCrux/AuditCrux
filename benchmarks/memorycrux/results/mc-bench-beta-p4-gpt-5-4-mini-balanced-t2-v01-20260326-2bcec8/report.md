# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-2bcec8

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
| Duration | 18.8s |
| Timestamp | 2026-03-26T16:11:53.079Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 8,527 |
| Output tokens | 808 |
| Cached tokens | 4,864 |
| Billable tokens | 9,335 |
| Estimated cost | $0.0032 |

## Sessions

### Execute Migration (3 turns, kill: none)

- Tool calls: 4
- Output length: 2927 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10494ms | 10494ms | 10494ms | 1 |
| get_constraints | 7ms | 7ms | 7ms | 1 |
| get_checkpoints | 5ms | 5ms | 5ms | 1 |
| assess_coverage | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
