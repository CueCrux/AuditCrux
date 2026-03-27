#!/usr/bin/env bash
# LongMemEval Evaluation Wrapper
#
# Runs LongMemEval's evaluate_qa.py GPT-4o judge against a hypothesis file.
#
# Usage:
#   ./evaluate.sh results/lme-s-sonnet46-T2-202603271200-abc123/hypotheses.jsonl
#   ./evaluate.sh results/lme-s-sonnet46-T2-202603271200-abc123/hypotheses.jsonl gpt-4o-mini
#
# Requires: OPENAI_API_KEY in environment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_SCRIPT="${SCRIPT_DIR}/../_datasets/LongMemEval/src/evaluation/evaluate_qa.py"

HYP_FILE="${1:?Usage: ./evaluate.sh <hypotheses.jsonl> [metric_model]}"
METRIC_MODEL="${2:-gpt-4o}"

# Determine dataset from path (lme-s-... or lme-m-...)
if [[ "$HYP_FILE" == *"-s-"* ]]; then
  DATASET="s"
elif [[ "$HYP_FILE" == *"-m-"* ]]; then
  DATASET="m"
else
  echo "Cannot determine dataset from path. Expected '-s-' or '-m-' in filename."
  echo "Set DATASET=s or DATASET=m manually."
  exit 1
fi

# Generate reference file if not present
REF_DIR="${SCRIPT_DIR}/references"
REF_FILE="${REF_DIR}/longmemeval_${DATASET}_references.json"

if [ ! -f "$REF_FILE" ]; then
  echo "[evaluate] Generating reference file for LongMemEval_${DATASET^^}..."
  npx tsx "${SCRIPT_DIR}/generate-references.ts" --dataset "$DATASET"
fi

if [ ! -f "$EVAL_SCRIPT" ]; then
  echo "Error: evaluate_qa.py not found at $EVAL_SCRIPT"
  echo "Clone LongMemEval to AuditCrux/benchmarks/_datasets/LongMemEval/"
  exit 1
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Error: OPENAI_API_KEY is required for the GPT-4o judge"
  exit 1
fi

echo "[evaluate] Hypothesis file: $HYP_FILE"
echo "[evaluate] Reference file:  $REF_FILE"
echo "[evaluate] Metric model:    $METRIC_MODEL"
echo ""

python3 "$EVAL_SCRIPT" "$METRIC_MODEL" "$HYP_FILE" "$REF_FILE"
