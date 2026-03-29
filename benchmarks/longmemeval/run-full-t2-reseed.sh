#!/usr/bin/env bash
# Full T2 run with re-ingest — semantic chunking enabled on prod worker
set -euo pipefail
cd /home/myles/CueCrux/AuditCrux

export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
export BENCH_VAULTCRUX_API_BASE=http://100.109.10.67:14333
export BENCH_VAULTCRUX_API_KEY=vcrx_bench-delta-prod-key-20260327

exec npx tsx benchmarks/longmemeval/run-longmemeval.ts \
  --dataset s --arm T2 --model claude-sonnet-4-6 --budget-limit 50
