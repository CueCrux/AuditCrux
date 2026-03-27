# Benchmark Run: mc-bench-gamma-p4-claude-sonnet-4-6-balanced-t3-v01-20260327-4a26c7

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 3198.3s |
| Timestamp | 2026-03-27T01:35:01.266Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 1,561,773 |
| Output tokens | 43,337 |
| Cached tokens | 0 |
| Billable tokens | 1,605,110 |
| Estimated cost | $5.3354 |

## Sessions

### Design Event Schema (10 turns, kill: none)

- Tool calls: 24
- Output length: 33897 chars

### Implement Consumer Service (14 turns, kill: none)

- Tool calls: 27
- Output length: 32571 chars

### Add Monitoring (20 turns, kill: none)

- Tool calls: 44
- Output length: 526 chars

### Resolve Serialization Contradiction (20 turns, kill: none)

- Tool calls: 55
- Output length: 1409 chars

### Deployment Readiness Review (20 turns, kill: none)

- Tool calls: 60
- Output length: 691 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 10501ms | 10509ms | 10509ms | 7 |
| search | 5ms | 10494ms | 10502ms | 182 |
| safe_to_proceed | 8ms | 10493ms | 10493ms | 7 |
| save_decision | 6ms | 11ms | 11ms | 14 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
