# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t2-v01-20260327-5d26d5

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
| Duration | 77.9s |
| Timestamp | 2026-03-27T09:32:23.637Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 272,235 |
| Output tokens | 7,095 |
| Cached tokens | 171,008 |
| Billable tokens | 279,330 |
| Estimated cost | $0.0689 |

## Sessions

### Auth System Design Review (7 turns, kill: none)

- Tool calls: 8
- Output length: 4828 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 6
- Output length: 1943 chars

### Data Pipeline Architecture Review (7 turns, kill: none)

- Tool calls: 10
- Output length: 1878 chars

### Infrastructure Safety Assessment (7 turns, kill: none)

- Tool calls: 9
- Output length: 2314 chars

### Deployment Readiness Review (4 turns, kill: none)

- Tool calls: 11
- Output length: 11836 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 579ms | 593ms | 593ms | 5 |
| get_checkpoints | 206ms | 309ms | 309ms | 4 |
| get_constraints | 201ms | 205ms | 205ms | 4 |
| query_memory | 478ms | 610ms | 610ms | 14 |
| get_contradictions | 384ms | 400ms | 400ms | 3 |
| assess_coverage | 204ms | 209ms | 209ms | 5 |
| check_claim | 44ms | 46ms | 46ms | 6 |
| get_freshness_report | 384ms | 387ms | 387ms | 3 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
