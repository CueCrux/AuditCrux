# Benchmark Run: mc-bench-gamma-p4-gpt-5-4-balanced-f1-v01-20260327-0b183b

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
| Duration | 362.4s |
| Timestamp | 2026-03-27T00:19:29.981Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 348,913 |
| Output tokens | 27,317 |
| Cached tokens | 199,936 |
| Billable tokens | 376,230 |
| Estimated cost | $0.8955 |

## Sessions

### Design Event Schema (6 turns, kill: none)

- Tool calls: 33
- Output length: 18745 chars

### Implement Consumer Service (3 turns, kill: none)

- Tool calls: 27
- Output length: 21754 chars

### Add Monitoring (4 turns, kill: none)

- Tool calls: 25
- Output length: 19346 chars

### Resolve Serialization Contradiction (5 turns, kill: none)

- Tool calls: 38
- Output length: 16933 chars

### Deployment Readiness Review (5 turns, kill: none)

- Tool calls: 52
- Output length: 22154 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| search_content | 1ms | 1ms | 2ms | 47 |
| search_files | 0ms | 0ms | 0ms | 5 |
| read_file | 0ms | 0ms | 0ms | 123 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
