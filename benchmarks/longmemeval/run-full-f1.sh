#!/usr/bin/env bash
# Full F1 run — designed to be run via nohup
set -euo pipefail
cd /home/myles/CueCrux/AuditCrux

export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
export BENCH_VAULTCRUX_API_BASE=http://100.109.10.67:14333
export BENCH_VAULTCRUX_API_KEY=vcrx_bench-delta-prod-key-20260327

exec npx tsx benchmarks/longmemeval/run-longmemeval.ts \
  --dataset s --arm F1 --model claude-sonnet-4-6 --budget-limit 50
