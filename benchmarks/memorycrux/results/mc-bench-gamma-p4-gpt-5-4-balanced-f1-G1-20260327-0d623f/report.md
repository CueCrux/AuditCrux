# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G1-20260327-0d623f

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
| Duration | 370.3s |
| Timestamp | 2026-03-27T00:48:46.482Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 357,788 |
| Output tokens | 25,434 |
| Cached tokens | 188,544 |
| Billable tokens | 383,222 |
| Estimated cost | $0.9131 |

## Sessions

### Design Event Schema (3 turns, kill: dirty)

- Tool calls: 32
- Output length: 16968 chars

### Implement Consumer Service (5 turns, kill: dirty)

- Tool calls: 39
- Output length: 20668 chars

### Add Monitoring (4 turns, kill: dirty)

- Tool calls: 24
- Output length: 18533 chars

### Resolve Serialization Contradiction (5 turns, kill: dirty)

- Tool calls: 35
- Output length: 16689 chars

### Deployment Readiness Review (5 turns, kill: dirty)

- Tool calls: 44
- Output length: 19402 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 124 |
| search_content | 1ms | 1ms | 2ms | 50 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
