# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-7f4981

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
| Duration | 508.3s |
| Timestamp | 2026-03-27T09:07:37.423Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 219,577 |
| Output tokens | 4,789 |
| Cached tokens | 120,320 |
| Billable tokens | 224,366 |
| Estimated cost | $0.0594 |

## Sessions

### Auth System Design Review (4 turns, kill: none)

- Tool calls: 11
- Output length: 3521 chars

### Payment Integration Audit (5 turns, kill: none)

- Tool calls: 7
- Output length: 2443 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 7
- Output length: 976 chars

### Infrastructure Safety Assessment (5 turns, kill: none)

- Tool calls: 10
- Output length: 3609 chars

### Deployment Readiness Review (4 turns, kill: none)

- Tool calls: 7
- Output length: 2195 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 530ms | 587ms | 587ms | 5 |
| get_checkpoints | 203ms | 322ms | 322ms | 4 |
| get_constraints | 203ms | 254ms | 254ms | 4 |
| assess_coverage | 205ms | 309ms | 309ms | 5 |
| get_contradictions | 323ms | 338ms | 338ms | 3 |
| query_memory | 450ms | 609ms | 609ms | 15 |
| get_freshness_report | 323ms | 423ms | 423ms | 3 |
| check_claim | 44ms | 47ms | 47ms | 2 |
| record_decision_context | 288ms | 288ms | 288ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
