# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-d5ed15

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
| Duration | 34.9s |
| Timestamp | 2026-03-27T04:23:50.995Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 58,486 |
| Output tokens | 2,290 |
| Cached tokens | 33,920 |
| Billable tokens | 60,776 |
| Estimated cost | $0.0169 |

## Sessions

### Auth System Design Review (3 turns, kill: none)

- Tool calls: 6
- Output length: 730 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 5
- Output length: 586 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 700 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 5
- Output length: 782 chars

### Deployment Readiness Review (5 turns, kill: none)

- Tool calls: 9
- Output length: 717 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 7ms | 10ms | 10ms | 5 |
| get_checkpoints | 6ms | 8ms | 8ms | 5 |
| get_constraints | 4ms | 4ms | 4ms | 5 |
| assess_coverage | 4ms | 5ms | 5ms | 5 |
| get_contradictions | 4ms | 4ms | 4ms | 2 |
| query_memory | 6ms | 6ms | 6ms | 5 |
| get_freshness_report | 4ms | 4ms | 4ms | 1 |
| list_topics | 4ms | 4ms | 4ms | 1 |
| escalate_with_context | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
