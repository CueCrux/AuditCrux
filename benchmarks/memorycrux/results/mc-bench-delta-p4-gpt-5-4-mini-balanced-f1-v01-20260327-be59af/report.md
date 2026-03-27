# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-f1-v01-20260327-be59af

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 61.7s |
| Timestamp | 2026-03-27T04:24:13.626Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 1,410,827 |
| Output tokens | 8,240 |
| Cached tokens | 840,960 |
| Billable tokens | 1,419,067 |
| Estimated cost | $0.3252 |

## Sessions

### Auth System Design Review (3 turns, kill: none)

- Tool calls: 11
- Output length: 3762 chars

### Payment Integration Audit (3 turns, kill: none)

- Tool calls: 14
- Output length: 1780 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 19
- Output length: 1582 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 19
- Output length: 2539 chars

### Deployment Readiness Review (9 turns, kill: none)

- Tool calls: 49
- Output length: 14813 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_files | 0ms | 0ms | 0ms | 21 |
| search_content | 0ms | 1ms | 15ms | 40 |
| read_file | 0ms | 0ms | 0ms | 51 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
