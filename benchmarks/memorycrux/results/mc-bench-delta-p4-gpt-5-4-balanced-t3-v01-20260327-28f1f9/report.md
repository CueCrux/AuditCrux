# Benchmark Run: mc-bench-delta-p4-gpt-5-4-balanced-t3-v01-20260327-28f1f9

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 793.8s |
| Timestamp | 2026-03-27T13:18:48.243Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 702,333 |
| Output tokens | 16,828 |
| Cached tokens | 534,912 |
| Billable tokens | 719,161 |
| Estimated cost | $1.2555 |

## Sessions

### Auth System Design Review (6 turns, kill: none)

- Tool calls: 11
- Output length: 9278 chars

### Payment Integration Audit (7 turns, kill: none)

- Tool calls: 15
- Output length: 4565 chars

### Data Pipeline Architecture Review (8 turns, kill: none)

- Tool calls: 16
- Output length: 2004 chars

### Infrastructure Safety Assessment (6 turns, kill: none)

- Tool calls: 14
- Output length: 8146 chars

### Deployment Readiness Review (7 turns, kill: none)

- Tool calls: 26
- Output length: 23793 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 820ms | 959ms | 959ms | 5 |
| search | 457ms | 622ms | 642ms | 67 |
| save_decision | 284ms | 520ms | 520ms | 10 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
