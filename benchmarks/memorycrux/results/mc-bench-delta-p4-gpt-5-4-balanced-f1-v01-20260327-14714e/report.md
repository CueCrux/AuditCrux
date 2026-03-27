# Benchmark Run: mc-bench-delta-p4-gpt-5-4-balanced-f1-v01-20260327-14714e

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 186.9s |
| Timestamp | 2026-03-27T12:38:59.476Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 983,534 |
| Output tokens | 13,211 |
| Cached tokens | 667,648 |
| Billable tokens | 996,745 |
| Estimated cost | $1.7564 |

## Sessions

### Auth System Design Review (2 turns, kill: none)

- Tool calls: 6
- Output length: 6319 chars

### Payment Integration Audit (3 turns, kill: none)

- Tool calls: 16
- Output length: 5907 chars

### Data Pipeline Architecture Review (3 turns, kill: none)

- Tool calls: 15
- Output length: 3161 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 29
- Output length: 5858 chars

### Deployment Readiness Review (4 turns, kill: none)

- Tool calls: 50
- Output length: 24555 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 72 |
| search_files | 0ms | 1ms | 1ms | 18 |
| search_content | 11ms | 15ms | 16ms | 26 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
