# Benchmark Run: mc-bench-delta-p4-gpt-5-4-balanced-t2-v01-20260327-37f457

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 781.5s |
| Timestamp | 2026-03-27T13:05:22.751Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 882,110 |
| Output tokens | 18,580 |
| Cached tokens | 692,480 |
| Billable tokens | 900,690 |
| Estimated cost | $1.5255 |

## Sessions

### Auth System Design Review (7 turns, kill: none)

- Tool calls: 23
- Output length: 9309 chars

### Payment Integration Audit (8 turns, kill: none)

- Tool calls: 27
- Output length: 5637 chars

### Data Pipeline Architecture Review (11 turns, kill: none)

- Tool calls: 44
- Output length: 2083 chars

### Infrastructure Safety Assessment (8 turns, kill: none)

- Tool calls: 29
- Output length: 6356 chars

### Deployment Readiness Review (6 turns, kill: none)

- Tool calls: 26
- Output length: 22900 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 527ms | 815ms | 815ms | 5 |
| get_checkpoints | 311ms | 314ms | 314ms | 5 |
| get_constraints | 204ms | 363ms | 363ms | 5 |
| assess_coverage | 206ms | 212ms | 212ms | 5 |
| get_contradictions | 454ms | 550ms | 550ms | 5 |
| get_freshness_report | 466ms | 974ms | 974ms | 5 |
| query_memory | 451ms | 611ms | 617ms | 54 |
| get_decision_context | 229ms | 294ms | 294ms | 4 |
| check_claim | 44ms | 45ms | 46ms | 51 |
| record_decision_context | 179ms | 286ms | 286ms | 6 |
| checkpoint_decision_state | 234ms | 338ms | 338ms | 3 |
| list_topics | 459ms | 459ms | 459ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
