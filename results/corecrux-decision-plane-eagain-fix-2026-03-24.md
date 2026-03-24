# CoreCrux Decision Plane EAGAIN Fix — Audit Results

**Date:** 2026-03-24
**Scope:** flock self-lock reentry bug in corecrux-decision scan path

## Root Cause

`scan_decision_events()` opened fresh `ShardStorage` handles per HTTP request. On Linux, `flock(LOCK_EX|LOCK_NB)` on an already-locked file from a different file description (even same process) returns EAGAIN. The daemon held exclusive flocks on all shards, so every decision-plane read failed with "resource temporarily unavailable".

## Fix Applied

| Component | Change |
|-----------|--------|
| `corecrux-decision/src/lib.rs` | Added `scan_decision_events_from_storages()` daemon-safe entry point; made `replay_decision_frames()` public |
| `corecruxd/src/dataplane_store.rs` | Added `scan_decision_events_pooled()` using existing `StdRwLock<ShardStorage>` guards |
| `corecruxd/src/pool.rs` | Pool-level `scan_decision_events()` delegation |
| `corecruxd/src/http.rs` | All 3 decision handlers switched from `scan_decision_events()` to `pool.scan_decision_events()` |
| `corecruxd/src/metrics.rs` | 3 new CounterVecs: `decision_read_path_total{source}`, `shard_open_attempts_total{caller}`, `lock_contention_total{caller}` |
| `corecrux-storage/src/lib.rs` | Lock-reentry regression test (`second_open_on_locked_shard_returns_would_block`) |
| `corecruxctl/src/chaos.rs` | 3 chaos faults: `lock_reentry`, `self_lock_contention`, `reopen_locked_shard` |

## Production Verification (GPU-1)

- Binary: `cargo build --release -p corecruxd --features cuda`
- Projections bootstrapped: `CORECRUXD_PROJECTIONS_ENABLED=1` + `corecruxctl projections rebuild`
- Session index: HTTP 200, 5 seeded decisions (~40s scan latency, pre-projection)
- Metrics: `corecrux_decision_read_path_total{source="pooled"} 2`, zero `reopened`
- readyz: all 4 projections healthy across 4 shards

## MemoryCrux Audit Results

Run ID: `ea4e02ff` (2026-03-24T01:02:22Z)

| Category | Tools | Tests | Passed | Failed | Skipped | Verdict |
|----------|-------|-------|--------|--------|---------|---------|
| A: Core Memory | 7 | 14 | 14 | 0 | 0 | PASS |
| B: Decision Plane | 0 | 0 | 0 | 0 | 0 | SKIP |
| C: Platform Wiring | 3 | 8 | 8 | 0 | 0 | PASS |
| D: Constraints | 6 | 24 | 24 | 0 | 0 | PASS |

**46/46 tests passed, 1 category skipped.**

Cat B (Decision Plane) gracefully skipped: VaultCrux proxies decision-plane calls to CoreCrux, but CoreCrux runs on GPU-1 (not localhost). The skip confirms the graceful-degradation design works correctly — `upstream_down` error triggers skip, not fail.

## Latency Percentiles

| Category | P50 | P95 |
|----------|-----|-----|
| A: Core Memory | 4ms | 27ms |
| C: Platform Wiring | 4ms | 6ms |
| D: Constraints | 5ms | 10ms |

## Known Limitations

- Decision plane scan takes ~40s for 1.56M frames (full event replay, no indexed projection)
- Cat B requires VaultCrux→CoreCrux network path (Tailscale or vSwitch)
- `corecruxctl projections rebuild` requires daemon stopped (flock contention)

## Evidence Files

- `AuditCrux/scripts/audit-results/audit-memory-2026-03-24T01-02-22.json`
- `AuditCrux/scripts/audit-results/audit-memory-2026-03-24T01-02-22.md`
