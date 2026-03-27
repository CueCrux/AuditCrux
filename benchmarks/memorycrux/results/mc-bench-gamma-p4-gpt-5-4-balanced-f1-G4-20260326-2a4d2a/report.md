# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G4-20260326-2a4d2a

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
| Duration | 331.1s |
| Timestamp | 2026-03-26T23:15:22.815Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 266,144 |
| Output tokens | 24,059 |
| Cached tokens | 105,472 |
| Billable tokens | 290,203 |
| Estimated cost | $0.7741 |

## Sessions

### Design Event Schema (3 turns, kill: graceful)

- Tool calls: 24
- Output length: 0 chars

### Implement Consumer Service (3 turns, kill: graceful)

- Tool calls: 32
- Output length: 0 chars

### Add Monitoring (4 turns, kill: graceful)

- Tool calls: 30
- Output length: 0 chars

### Resolve Serialization Contradiction (4 turns, kill: graceful)

- Tool calls: 32
- Output length: 0 chars

### Deployment Readiness Review (2 turns, kill: graceful)

- Tool calls: 45
- Output length: 0 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 1ms | 2ms | 2ms | 41 |
| read_file | 0ms | 0ms | 0ms | 122 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
