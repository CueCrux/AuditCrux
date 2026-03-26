# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-046cd5

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
| Duration | 3.6s |
| Timestamp | 2026-03-26T12:14:45.213Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 3,857 |
| Output tokens | 341 |
| Cached tokens | 1,664 |
| Billable tokens | 4,198 |
| Estimated cost | $0.0016 |

## Sessions

### Execute Migration (2 turns, kill: none)

- Tool calls: 3
- Output length: 996 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 3ms | 3ms | 3ms | 1 |
| get_checkpoints | 3ms | 3ms | 3ms | 1 |
| get_constraints | 4ms | 4ms | 4ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
