# Benchmark Run: mc-bench-gamma-p4-claude-sonnet-4-6-balanced-t2-v01-20260326-9bdf75

| Field | Value |
|---|---|
| Project | gamma |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 4182.8s |
| Timestamp | 2026-03-26T23:51:03.157Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 2,002,708 |
| Output tokens | 41,346 |
| Cached tokens | 0 |
| Billable tokens | 2,044,054 |
| Estimated cost | $6.6283 |

## Sessions

### Design Event Schema (9 turns, kill: none)

- Tool calls: 27
- Output length: 14171 chars

### Implement Consumer Service (18 turns, kill: none)

- Tool calls: 38
- Output length: 15413 chars

### Add Monitoring (16 turns, kill: none)

- Tool calls: 39
- Output length: 14494 chars

### Resolve Serialization Contradiction (20 turns, kill: none)

- Tool calls: 53
- Output length: 14900 chars

### Deployment Readiness Review (20 turns, kill: none)

- Tool calls: 76
- Output length: 1218 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 10501ms | 10510ms | 10510ms | 6 |
| get_checkpoints | 6ms | 7ms | 7ms | 5 |
| get_constraints | 4ms | 9ms | 9ms | 5 |
| assess_coverage | 4ms | 6ms | 6ms | 5 |
| query_memory | 5ms | 10496ms | 10501ms | 157 |
| list_topics | 4ms | 5ms | 5ms | 5 |
| get_decision_context | 10472ms | 10487ms | 10487ms | 6 |
| get_contradictions | 6ms | 7ms | 7ms | 5 |
| get_freshness_report | 4ms | 5ms | 5ms | 4 |
| check_claim | 1ms | 2ms | 2ms | 12 |
| record_decision_context | 4ms | 11ms | 11ms | 10 |
| suggest_constraint | 4ms | 6ms | 6ms | 4 |
| checkpoint_decision_state | 9ms | 13ms | 13ms | 4 |
| verify_before_acting | 3ms | 6ms | 6ms | 2 |
| check_constraints | 3ms | 5ms | 5ms | 2 |
| escalate_with_context | 6ms | 6ms | 6ms | 1 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
