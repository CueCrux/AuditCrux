# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-mini-balanced-f1-G4-20260326-d49ed1

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | G4 |
| Phase | 4 |
| Arm | F1 |
| Model | gpt-5.4-mini |
| Provider | openai |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 109.6s |
| Timestamp | 2026-03-26T21:16:01.642Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 252,105 |
| Output tokens | 17,606 |
| Cached tokens | 134,656 |
| Billable tokens | 269,711 |
| Estimated cost | $0.0886 |

## Sessions

### Design Event Schema (4 turns, kill: graceful)

- Tool calls: 16
- Output length: 16583 chars

### Implement Consumer Service (4 turns, kill: graceful)

- Tool calls: 15
- Output length: 13429 chars

### Add Monitoring (5 turns, kill: graceful)

- Tool calls: 15
- Output length: 13454 chars

### Resolve Serialization Contradiction (4 turns, kill: graceful)

- Tool calls: 24
- Output length: 8724 chars

### Deployment Readiness Review (8 turns, kill: graceful)

- Tool calls: 38
- Output length: 12107 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_files | 0ms | 0ms | 0ms | 3 |
| read_file | 0ms | 0ms | 0ms | 65 |
| search_content | 0ms | 0ms | 0ms | 40 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
