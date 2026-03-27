# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-f1-v01-20260326-09b551

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 102.0s |
| Timestamp | 2026-03-26T20:58:07.597Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 158,992 |
| Output tokens | 17,076 |
| Cached tokens | 54,144 |
| Billable tokens | 176,068 |
| Estimated cost | $0.0747 |

## Sessions

### Design Event Schema (4 turns, kill: none)

- Tool calls: 22
- Output length: 15047 chars

### Implement Consumer Service (4 turns, kill: none)

- Tool calls: 28
- Output length: 11782 chars

### Add Monitoring (3 turns, kill: none)

- Tool calls: 12
- Output length: 12298 chars

### Resolve Serialization Contradiction (5 turns, kill: none)

- Tool calls: 22
- Output length: 7716 chars

### Deployment Readiness Review (6 turns, kill: none)

- Tool calls: 37
- Output length: 14782 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 0ms | 0ms | 2ms | 46 |
| read_file | 0ms | 0ms | 0ms | 55 |
| search_files | 0ms | 0ms | 0ms | 20 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
