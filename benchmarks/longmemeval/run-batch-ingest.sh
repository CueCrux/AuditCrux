#!/usr/bin/env bash
# Batch ingest all 500 problems, wait for embeddings, verify
set -euo pipefail
cd /home/myles/CueCrux/AuditCrux

export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
export BENCH_VAULTCRUX_API_BASE=http://100.109.10.67:14333
export BENCH_VAULTCRUX_API_KEY=vcrx_bench-delta-prod-key-20260327

exec npx tsx benchmarks/longmemeval/batch-ingest.ts \
  --dataset s --concurrency 10 --cooldown 5
