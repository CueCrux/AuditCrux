# Benchmark Run: mc-bench-gamma-p4-claude-sonnet-4-6-balanced-f1-v01-20260326-b9ae41

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | F1 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 32,000 tokens |
| Duration | 2344.7s |
| Timestamp | 2026-03-26T22:40:54.803Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 1,192,700 |
| Output tokens | 31,372 |
| Cached tokens | 0 |
| Billable tokens | 1,224,072 |
| Estimated cost | $4.0487 |

## Sessions

### Design Event Schema (7 turns, kill: none)

- Tool calls: 29
- Output length: 14363 chars

### Implement Consumer Service (6 turns, kill: none)

- Tool calls: 30
- Output length: 14617 chars

### Add Monitoring (8 turns, kill: none)

- Tool calls: 39
- Output length: 13918 chars

### Resolve Serialization Contradiction (12 turns, kill: none)

- Tool calls: 57
- Output length: 14539 chars

### Deployment Readiness Review (5 turns, kill: none)

- Tool calls: 66
- Output length: 13038 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| read_file | 0ms | 0ms | 0ms | 201 |
| search_content | 1ms | 2ms | 2ms | 20 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
