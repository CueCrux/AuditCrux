# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G1-20260327-62760e

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G1 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4 |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 385.8s |
| Timestamp | 2026-03-27T00:50:14.678Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 330,351 |
| Output tokens | 25,938 |
| Cached tokens | 189,696 |
| Billable tokens | 356,289 |
| Estimated cost | $0.8481 |

## Sessions

### Design Event Schema (2 turns, kill: dirty)

- Tool calls: 20
- Output length: 17271 chars

### Implement Consumer Service (5 turns, kill: dirty)

- Tool calls: 38
- Output length: 22372 chars

### Add Monitoring (4 turns, kill: dirty)

- Tool calls: 26
- Output length: 19640 chars

### Resolve Serialization Contradiction (4 turns, kill: dirty)

- Tool calls: 31
- Output length: 17113 chars

### Deployment Readiness Review (5 turns, kill: dirty)

- Tool calls: 44
- Output length: 20616 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 114 |
| search_content | 1ms | 1ms | 2ms | 45 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
