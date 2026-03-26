# Benchmark Run: mc-bench-beta-p4-gpt-5-4-mini-balanced-t2-v01-20260326-fd15b1

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
| Duration | 3.7s |
| Timestamp | 2026-03-26T12:15:20.354Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 3,855 |
| Output tokens | 354 |
| Cached tokens | 1,664 |
| Billable tokens | 4,209 |
| Estimated cost | $0.0016 |

## Sessions

### Execute Migration (2 turns, kill: none)

- Tool calls: 3
- Output length: 1079 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 4ms | 4ms | 4ms | 1 |
| get_checkpoints | 2ms | 2ms | 2ms | 1 |
| get_constraints | 2ms | 2ms | 2ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
