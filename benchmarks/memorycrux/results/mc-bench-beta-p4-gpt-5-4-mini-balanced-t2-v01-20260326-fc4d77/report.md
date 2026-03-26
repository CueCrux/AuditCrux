# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-fc4d77

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
| Duration | 15.7s |
| Timestamp | 2026-03-26T12:16:22.978Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 4,420 |
| Output tokens | 431 |
| Cached tokens | 1,664 |
| Billable tokens | 4,851 |
| Estimated cost | $0.0020 |

## Sessions

### Execute Migration (2 turns, kill: none)

- Tool calls: 3
- Output length: 1441 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10543ms | 10543ms | 10543ms | 1 |
| get_checkpoints | 6ms | 6ms | 6ms | 1 |
| get_constraints | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
