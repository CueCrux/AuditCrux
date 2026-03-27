# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-G1-20260326-3f2b47

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
| Duration | 331.5s |
| Timestamp | 2026-03-26T22:56:54.182Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 237,148 |
| Output tokens | 23,654 |
| Cached tokens | 99,072 |
| Billable tokens | 260,802 |
| Estimated cost | $0.7056 |

## Sessions

### Design Event Schema (4 turns, kill: dirty)

- Tool calls: 25
- Output length: 0 chars

### Implement Consumer Service (3 turns, kill: dirty)

- Tool calls: 25
- Output length: 0 chars

### Add Monitoring (3 turns, kill: dirty)

- Tool calls: 20
- Output length: 0 chars

### Resolve Serialization Contradiction (5 turns, kill: dirty)

- Tool calls: 27
- Output length: 0 chars

### Deployment Readiness Review (2 turns, kill: dirty)

- Tool calls: 45
- Output length: 0 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 1ms | 2ms | 2ms | 38 |
| read_file | 0ms | 0ms | 0ms | 104 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
