# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G4-20260327-90f6d1

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G4 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 385.7s |
| Timestamp | 2026-03-27T00:50:15.703Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 297,517 |
| Output tokens | 26,104 |
| Cached tokens | 150,272 |
| Billable tokens | 323,621 |
| Estimated cost | $0.8170 |

## Sessions

### Design Event Schema (2 turns, kill: graceful)

- Tool calls: 20
- Output length: 20035 chars

### Implement Consumer Service (5 turns, kill: graceful)

- Tool calls: 27
- Output length: 20434 chars

### Add Monitoring (3 turns, kill: graceful)

- Tool calls: 29
- Output length: 19231 chars

### Resolve Serialization Contradiction (5 turns, kill: graceful)

- Tool calls: 39
- Output length: 16506 chars

### Deployment Readiness Review (5 turns, kill: graceful)

- Tool calls: 46
- Output length: 20422 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 124 |
| search_content | 1ms | 1ms | 1ms | 37 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
