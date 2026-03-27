# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-v01-20260326-d3c5ba

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 386.8s |
| Timestamp | 2026-03-26T21:38:54.080Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 399,643 |
| Output tokens | 23,945 |
| Cached tokens | 190,464 |
| Billable tokens | 423,588 |
| Estimated cost | $1.0005 |

## Sessions

### Design Event Schema (3 turns, kill: none)

- Tool calls: 25
- Output length: 0 chars

### Implement Consumer Service (4 turns, kill: none)

- Tool calls: 24
- Output length: 0 chars

### Add Monitoring (5 turns, kill: none)

- Tool calls: 22
- Output length: 0 chars

### Resolve Serialization Contradiction (5 turns, kill: none)

- Tool calls: 30
- Output length: 17868 chars

### Deployment Readiness Review (4 turns, kill: none)

- Tool calls: 54
- Output length: 0 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 1ms | 1ms | 2ms | 57 |
| read_file | 0ms | 0ms | 0ms | 98 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
