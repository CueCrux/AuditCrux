# Benchmark Run: mc-bench-delta-p4-gpt-5-4-mini-balanced-t3-v01-20260327-2ea6e2

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
| Duration | 558.8s |
| Timestamp | 2026-03-27T09:17:46.969Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 61,007 |
| Output tokens | 2,944 |
| Cached tokens | 37,376 |
| Billable tokens | 63,951 |
| Estimated cost | $0.0179 |

## Sessions

### Auth System Design Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 1143 chars

### Payment Integration Audit (4 turns, kill: none)

- Tool calls: 5
- Output length: 1245 chars

### Data Pipeline Architecture Review (4 turns, kill: none)

- Tool calls: 5
- Output length: 988 chars

### Infrastructure Safety Assessment (4 turns, kill: none)

- Tool calls: 9
- Output length: 1444 chars

### Deployment Readiness Review (3 turns, kill: none)

- Tool calls: 6
- Output length: 1710 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 442ms | 507ms | 507ms | 5 |
| search | 302ms | 406ms | 413ms | 25 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
