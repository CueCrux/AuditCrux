# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t3-v01-20260327-9c4e39

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
| Duration | 70.1s |
| Timestamp | 2026-03-27T04:27:00.732Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 31,647 |
| Output tokens | 2,315 |
| Cached tokens | 19,584 |
| Billable tokens | 33,962 |
| Estimated cost | $0.0105 |

## Sessions

### Auth System Design Review (5 turns, kill: none)

- Tool calls: 4
- Output length: 713 chars

### Payment Integration Audit (6 turns, kill: none)

- Tool calls: 7
- Output length: 695 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 892 chars

### Infrastructure Safety Assessment (6 turns, kill: none)

- Tool calls: 7
- Output length: 716 chars

### Deployment Readiness Review (3 turns, kill: none)

- Tool calls: 6
- Output length: 750 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 20ms | 122ms | 122ms | 5 |
| search | 5ms | 37ms | 47ms | 24 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
