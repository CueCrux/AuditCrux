# Benchmark Run: mc-bench-delta-p4-claude-sonnet-4-6-balanced-t3-v01-20260327-27ea03

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 1767.9s |
| Timestamp | 2026-03-27T10:51:44.551Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 662,791 |
| Output tokens | 29,066 |
| Cached tokens | 0 |
| Billable tokens | 691,857 |
| Estimated cost | $2.4244 |

## Sessions

### Auth System Design Review (6 turns, kill: none)

- Tool calls: 10
- Output length: 11226 chars

### Payment Integration Audit (6 turns, kill: none)

- Tool calls: 11
- Output length: 8228 chars

### Data Pipeline Architecture Review (7 turns, kill: none)

- Tool calls: 12
- Output length: 5746 chars

### Infrastructure Safety Assessment (6 turns, kill: none)

- Tool calls: 11
- Output length: 7406 chars

### Deployment Readiness Review (10 turns, kill: none)

- Tool calls: 27
- Output length: 28899 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 802ms | 957ms | 957ms | 5 |
| search | 433ms | 606ms | 670ms | 55 |
| save_decision | 289ms | 523ms | 523ms | 10 |
| safe_to_proceed | 269ms | 269ms | 269ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
