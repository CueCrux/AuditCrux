# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-t3-v01-20260327-a1fad8

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T3 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 131.7s |
| Timestamp | 2026-03-27T00:43:42.328Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 136,907 |
| Output tokens | 15,402 |
| Cached tokens | 79,232 |
| Billable tokens | 152,309 |
| Estimated cost | $0.0556 |

## Sessions

### Design Event Schema (6 turns, kill: none)

- Tool calls: 9
- Output length: 14255 chars

### Implement Consumer Service (5 turns, kill: none)

- Tool calls: 5
- Output length: 8621 chars

### Add Monitoring (7 turns, kill: none)

- Tool calls: 9
- Output length: 11329 chars

### Resolve Serialization Contradiction (6 turns, kill: none)

- Tool calls: 8
- Output length: 5605 chars

### Deployment Readiness Review (6 turns, kill: none)

- Tool calls: 8
- Output length: 9741 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| brief_me | 10192ms | 10505ms | 10505ms | 5 |
| search | 6ms | 10ms | 11ms | 25 |
| save_decision | 5ms | 14ms | 14ms | 8 |
| safe_to_proceed | 7ms | 7ms | 7ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
