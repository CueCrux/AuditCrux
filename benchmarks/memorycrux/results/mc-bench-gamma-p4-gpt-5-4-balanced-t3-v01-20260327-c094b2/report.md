# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-t3-v01-20260327-c094b2

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 416.6s |
| Timestamp | 2026-03-27T00:48:33.699Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 195,626 |
| Output tokens | 21,717 |
| Cached tokens | 162,816 |
| Billable tokens | 217,343 |
| Estimated cost | $0.5027 |

## Sessions

### Design Event Schema (9 turns, kill: none)

- Tool calls: 16
- Output length: 17119 chars

### Implement Consumer Service (9 turns, kill: none)

- Tool calls: 12
- Output length: 16664 chars

### Add Monitoring (6 turns, kill: none)

- Tool calls: 13
- Output length: 13472 chars

### Resolve Serialization Contradiction (7 turns, kill: none)

- Tool calls: 15
- Output length: 13607 chars

### Deployment Readiness Review (8 turns, kill: none)

- Tool calls: 26
- Output length: 15976 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 10324ms | 10508ms | 10508ms | 5 |
| search | 5ms | 9ms | 10ms | 70 |
| save_decision | 5ms | 6ms | 6ms | 6 |
| safe_to_proceed | 9ms | 9ms | 9ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
