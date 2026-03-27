# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t3-v01-20260327-41ce12

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 408.3s |
| Timestamp | 2026-03-27T04:48:49.656Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 106,516 |
| Output tokens | 3,565 |
| Cached tokens | 70,272 |
| Billable tokens | 110,081 |
| Estimated cost | $0.0272 |

## Sessions

### Auth System Design Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 1075 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 5
- Output length: 1364 chars

### Data Pipeline Architecture Review (7 turns, kill: none)

- Tool calls: 10
- Output length: 1260 chars

### Infrastructure Safety Assessment (6 turns, kill: none)

- Tool calls: 7
- Output length: 1295 chars

### Deployment Readiness Review (4 turns, kill: none)

- Tool calls: 7
- Output length: 3031 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 16ms | 10516ms | 10516ms | 5 |
| search | 8ms | 12ms | 10468ms | 28 |
| save_decision | 5ms | 5ms | 5ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
