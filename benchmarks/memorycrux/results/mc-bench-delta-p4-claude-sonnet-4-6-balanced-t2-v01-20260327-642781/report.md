# Benchmark Run: mc-bench-delta-p4-claude-sonnet-4-6-balanced-t2-v01-20260327-642781

| Field | Value |
|---|---|
| Project | delta |
| Fixture variant | v01 |
| Phase | 4 |
| Arm | T2 |
| Model | claude-sonnet-4-6 |
| Provider | anthropic |
| Profile | balanced |
| Context cap | 16,000 tokens |
| Duration | 1048.3s |
| Timestamp | 2026-03-27T12:28:06.652Z |

## Token Usage

| Metric | Value |
|---|---|
| Input tokens | 727,108 |
| Output tokens | 27,213 |
| Cached tokens | 0 |
| Billable tokens | 754,321 |
| Estimated cost | $2.5895 |

## Sessions

### Auth System Design Review (7 turns, kill: none)

- Tool calls: 18
- Output length: 11954 chars

### Payment Integration Audit (5 turns, kill: none)

- Tool calls: 18
- Output length: 9564 chars

### Data Pipeline Architecture Review (6 turns, kill: none)

- Tool calls: 20
- Output length: 6467 chars

### Infrastructure Safety Assessment (5 turns, kill: none)

- Tool calls: 19
- Output length: 7711 chars

### Deployment Readiness Review (7 turns, kill: none)

- Tool calls: 29
- Output length: 23345 chars

## Track A

### Latency

| Operation | p50 | p95 | p99 | Count |
|---|---|---|---|---|
| get_relevant_context | 597ms | 632ms | 632ms | 5 |
| get_checkpoints | 210ms | 251ms | 251ms | 5 |
| get_constraints | 205ms | 311ms | 311ms | 5 |
| assess_coverage | 206ms | 208ms | 208ms | 5 |
| get_contradictions | 419ms | 512ms | 512ms | 5 |
| query_memory | 451ms | 587ms | 630ms | 50 |
| check_claim | 44ms | 46ms | 46ms | 13 |
| get_decision_context | 349ms | 349ms | 349ms | 1 |
| get_correction_chain | 337ms | 337ms | 337ms | 1 |
| record_decision_context | 284ms | 289ms | 289ms | 4 |
| suggest_constraint | 181ms | 181ms | 181ms | 1 |
| checkpoint_decision_state | 235ms | 342ms | 342ms | 5 |
| get_freshness_report | 405ms | 525ms | 525ms | 4 |

Receipt integrity: chain=true, sigs=true, count=0

All targets met: **NO**
