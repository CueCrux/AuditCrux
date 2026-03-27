# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G4-20260327-78b6ff

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
| Duration | 382.5s |
| Timestamp | 2026-03-27T00:49:03.269Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 412,960 |
| Output tokens | 26,480 |
| Cached tokens | 243,072 |
| Billable tokens | 439,440 |
| Estimated cost | $0.9934 |

## Sessions

### Design Event Schema (4 turns, kill: graceful)

- Tool calls: 36
- Output length: 23586 chars

### Implement Consumer Service (4 turns, kill: graceful)

- Tool calls: 35
- Output length: 18864 chars

### Add Monitoring (4 turns, kill: graceful)

- Tool calls: 28
- Output length: 17203 chars

### Resolve Serialization Contradiction (5 turns, kill: graceful)

- Tool calls: 34
- Output length: 16462 chars

### Deployment Readiness Review (6 turns, kill: graceful)

- Tool calls: 56
- Output length: 19884 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 1ms | 1ms | 2ms | 55 |
| search_files | 0ms | 0ms | 0ms | 7 |
| read_file | 0ms | 0ms | 0ms | 127 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
