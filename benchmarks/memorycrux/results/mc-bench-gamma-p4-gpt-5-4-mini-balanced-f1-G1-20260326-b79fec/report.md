# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-f1-G1-20260326-b79fec

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G1 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 102.0s |
| Timestamp | 2026-03-26T21:08:51.348Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 297,195 |
| Output tokens | 17,372 |
| Cached tokens | 146,176 |
| Billable tokens | 314,567 |
| Estimated cost | $0.1028 |

## Sessions

### Design Event Schema (4 turns, kill: dirty)

- Tool calls: 16
- Output length: 16338 chars

### Implement Consumer Service (4 turns, kill: dirty)

- Tool calls: 30
- Output length: 11897 chars

### Add Monitoring (5 turns, kill: dirty)

- Tool calls: 25
- Output length: 12446 chars

### Resolve Serialization Contradiction (5 turns, kill: dirty)

- Tool calls: 13
- Output length: 10092 chars

### Deployment Readiness Review (5 turns, kill: dirty)

- Tool calls: 39
- Output length: 12653 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_files | 0ms | 0ms | 0ms | 21 |
| read_file | 0ms | 0ms | 0ms | 66 |
| search_content | 0ms | 0ms | 0ms | 36 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
