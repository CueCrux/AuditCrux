#!/usr/bin/env bash
# Wipe LongMemEval vectors from Qdrant vaultcrux_private_768 collection
# Must run AFTER Postgres wipe (this is vector cleanup only)
set -euo pipefail

QDRANT_URL="http://100.75.64.43:6333"
QDRANT_KEY="kCexWISTy8Vw+CS8ukSj2aHaT2s0lf/Qrl5PQ4Xk3L4="
COLLECTION="vaultcrux_private_768"

echo "Counting LME vectors in Qdrant..."
COUNT=$(curl -s -X POST \
  -H "api-key: $QDRANT_KEY" \
  -H "Content-Type: application/json" \
  "$QDRANT_URL/collections/$COLLECTION/points/count" \
  -d '{"filter":{"must":[{"key":"tenant_id","match":{"text":"__longmemeval_"}}]}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['count'])" 2>/dev/null || echo "0")

echo "Found $COUNT LME vectors"

if [ "$COUNT" = "0" ]; then
  echo "No vectors to delete"
  exit 0
fi

# Scroll and delete in batches — Qdrant doesn't support filter-based DELETE well on large sets
# Use the delete endpoint with filter instead
echo "Deleting LME vectors by tenant_id prefix filter..."
curl -s -X POST \
  -H "api-key: $QDRANT_KEY" \
  -H "Content-Type: application/json" \
  "$QDRANT_URL/collections/$COLLECTION/points/delete" \
  -d '{
    "filter": {
      "should": [
        {"key": "tenant_id", "match": {"text": "__longmemeval_"}}
      ]
    }
  }' | python3 -m json.tool

echo "Qdrant cleanup complete"
