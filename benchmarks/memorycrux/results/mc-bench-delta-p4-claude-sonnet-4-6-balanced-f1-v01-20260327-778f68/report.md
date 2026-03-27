# Benchmark Run: mc-bench-delta-p4-claude-sonnet-4-6-balanced-f1-v01-20260327-778f68

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 453.2s |
| Timestamp | 2026-03-27T12:10:27.068Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 1,976,146 |
| Output tokens | 23,426 |
| Cached tokens | 0 |
| Billable tokens | 1,999,572 |
| Estimated cost | $6.2798 |

## Sessions

### Auth System Design Review (5 turns, kill: none)

- Tool calls: 19
- Output length: 10286 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 12
- Output length: 6479 chars

### Data Pipeline Architecture Review (6 turns, kill: none)

- Tool calls: 13
- Output length: 3639 chars

### Infrastructure Safety Assessment (5 turns, kill: none)

- Tool calls: 24
- Output length: 7284 chars

### Deployment Readiness Review (7 turns, kill: none)

- Tool calls: 57
- Output length: 32399 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 111 |
| search_content | 12ms | 16ms | 16ms | 13 |
| search_files | 0ms | 0ms | 0ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
