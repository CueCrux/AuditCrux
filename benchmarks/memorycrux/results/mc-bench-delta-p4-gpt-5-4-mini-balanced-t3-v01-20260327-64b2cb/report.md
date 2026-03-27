# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t3-v01-20260327-64b2cb

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
| Duration | 54.3s |
| Timestamp | 2026-03-27T04:24:17.752Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 45,965 |
| Output tokens | 3,091 |
| Cached tokens | 24,960 |
| Billable tokens | 49,056 |
| Estimated cost | $0.0158 |

## Sessions

### Auth System Design Review (6 turns, kill: none)

- Tool calls: 7
- Output length: 720 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 4
- Output length: 737 chars

### Data Pipeline Architecture Review (6 turns, kill: none)

- Tool calls: 7
- Output length: 642 chars

### Infrastructure Safety Assessment (10 turns, kill: none)

- Tool calls: 11
- Output length: 1250 chars

### Deployment Readiness Review (3 turns, kill: none)

- Tool calls: 6
- Output length: 1964 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 19ms | 10513ms | 10513ms | 5 |
| search | 7ms | 11ms | 13ms | 29 |
| save_decision | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
