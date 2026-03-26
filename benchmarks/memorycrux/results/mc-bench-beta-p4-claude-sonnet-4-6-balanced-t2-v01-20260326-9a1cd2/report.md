# Benchmark Run: mc-bench-beta-p4-claude-sonnet-4-6-balanced-t2-v01-20260326-9a1cd2

| Field | Value |
|---|---|
| Project | beta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 38.3s |
| Timestamp | 2026-03-26T13:23:30.212Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 16,599 |
| Output tokens | 1,158 |
| Cached tokens | 0 |
| Billable tokens | 17,757 |
| Estimated cost | $0.0672 |

## Sessions

### Execute Migration (4 turns, kill: none)

- Tool calls: 7
- Output length: 3310 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 7ms | 7ms | 7ms | 1 |
| get_checkpoints | 5ms | 5ms | 5ms | 1 |
| get_constraints | 4ms | 4ms | 4ms | 1 |
| query_memory | 6ms | 10497ms | 10497ms | 3 |
| list_topics | 4ms | 4ms | 4ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
