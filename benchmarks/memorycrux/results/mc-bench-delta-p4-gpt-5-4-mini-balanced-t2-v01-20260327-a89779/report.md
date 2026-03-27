# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-a89779

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 117.7s |
| Timestamp | 2026-03-27T04:27:44.387Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 155,493 |
| Output tokens | 3,181 |
| Cached tokens | 112,640 |
| Billable tokens | 158,674 |
| Estimated cost | $0.0335 |

## Sessions

### Auth System Design Review (4 turns, kill: none)

- Tool calls: 6
- Output length: 941 chars

### Payment Integration Audit (6 turns, kill: none)

- Tool calls: 8
- Output length: 991 chars

### Data Pipeline Architecture Review (6 turns, kill: none)

- Tool calls: 9
- Output length: 796 chars

### Infrastructure Safety Assessment (7 turns, kill: none)

- Tool calls: 11
- Output length: 1530 chars

### Deployment Readiness Review (7 turns, kill: none)

- Tool calls: 6
- Output length: 1818 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 29ms | 10501ms | 10501ms | 5 |
| get_checkpoints | 6ms | 47ms | 47ms | 5 |
| get_constraints | 5ms | 10ms | 10ms | 5 |
| assess_coverage | 5ms | 17ms | 17ms | 5 |
| get_contradictions | 5ms | 8ms | 8ms | 3 |
| query_memory | 6ms | 10501ms | 10501ms | 14 |
| escalate_with_context | 3ms | 3ms | 3ms | 1 |
| get_freshness_report | 4ms | 6ms | 6ms | 2 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
