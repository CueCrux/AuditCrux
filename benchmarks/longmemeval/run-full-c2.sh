#!/usr/bin/env bash
# Full C2 run — designed to be run via nohup
set -euo pipefail
cd /home/myles/CueCrux/AuditCrux

export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

exec npx tsx benchmarks/longmemeval/run-longmemeval.ts \
  --dataset s --arm C2 --model claude-sonnet-4-6 --budget-limit 200
