#!/usr/bin/env bash
# Seed synthetic agent_session events into CoreCrux Decision Plane via gRPC.
# Usage: ./seed-decision-plane.sh [CORECRUX_GRPC_HOST] [CORECRUX_GRPC_PORT]
#
# Requires: grpcurl and the CoreCrux proto file.

set -euo pipefail

HOST="${1:-100.111.227.102}"
PORT="${2:-4007}"
PROTO_DIR="/srv/corecrux/CoreCrux/proto"
PROTO="corecrux_dataplane_v1.proto"
TENANT="__audit_memory__"
SESSION="__audit_session_01__"
AGENT="audit-agent"
SVC="corecrux.dataplane.v1.CoreCruxDataPlaneV1/AppendBatch"

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# Build an AgentDecisionRecordedV1 JSON payload, base64 encode it
decision_b64() {
  local dec_id="$1" tool="$2" signal="$3" confidence="$4" parent="${5:-}"
  local json
  json=$(cat <<EOJSON
{"schema":"agent.decision.recorded.v1","decisionId":"$dec_id","agentId":"$AGENT","tenantId":"$TENANT","sessionId":"$SESSION","contextReceiptIds":[],"knowledgeStateCursor":{"shardId":0,"epoch":1,"segmentSeq":0,"offset":0},"toolCalled":"$tool","toolParametersHash":"$(echo -n "$dec_id" | sha256sum | cut -c1-16)","sufficiencySignal":"$signal","confidenceSnapshot":$confidence,"decisionHash":"$(echo -n "$dec_id" | sha256sum | cut -c1-32)"$([ -n "$parent" ] && echo ",\"parentDecisionId\":\"$parent\"")}
EOJSON
  )
  echo -n "$json" | base64 -w0
}

echo "=== Seeding Decision Plane events ==="
echo "  Target: $HOST:$PORT"
echo "  Tenant: $TENANT / Session: $SESSION"
echo ""

# Build all 5 events as a single batch
EVT_TYPE="agent.decision.recorded.v1"
CT="application/json; profile=corecrux-decision-plane-v1"
TS=$(now_iso)

B1=$(decision_b64 "audit-dec-001" "query_vault" "sufficient" 0.92)
B2=$(decision_b64 "audit-dec-002" "store_memory" "thin" 0.74 "audit-dec-001")
B3=$(decision_b64 "audit-dec-003" "check_constraints" "contested" 0.51 "audit-dec-002")
B4=$(decision_b64 "audit-dec-004" "verify_before_acting" "sufficient" 0.88 "audit-dec-003")
B5=$(decision_b64 "audit-dec-005" "query_vault" "sufficient" 0.95)

REQUEST=$(cat <<EOJSON
{
  "tenant_id": "$TENANT",
  "stream_type": "agent_session",
  "stream_id": "$SESSION",
  "expected_next_seq": 0,
  "events": [
    {"event_id":"evt-audit-dec-001","occurred_at":"$TS","event_type":"$EVT_TYPE","content_type":"$CT","payload":"$B1"},
    {"event_id":"evt-audit-dec-002","occurred_at":"$TS","event_type":"$EVT_TYPE","content_type":"$CT","payload":"$B2"},
    {"event_id":"evt-audit-dec-003","occurred_at":"$TS","event_type":"$EVT_TYPE","content_type":"$CT","payload":"$B3"},
    {"event_id":"evt-audit-dec-004","occurred_at":"$TS","event_type":"$EVT_TYPE","content_type":"$CT","payload":"$B4"},
    {"event_id":"evt-audit-dec-005","occurred_at":"$TS","event_type":"$EVT_TYPE","content_type":"$CT","payload":"$B5"}
  ]
}
EOJSON
)

echo "Appending 5 decision events as single batch..."
RESULT=$(echo "$REQUEST" | grpcurl -plaintext \
  -import-path "$PROTO_DIR" -proto "$PROTO" \
  -H 'x-corecrux-scopes: events:write' \
  -d @ "$HOST:$PORT" "$SVC" 2>&1) || true

echo "$RESULT"

if echo "$RESULT" | grep -q "writeConfirmation"; then
  echo ""
  echo "=== Seed SUCCESS ==="
elif echo "$RESULT" | grep -q "DUPLICATE_COMMITTED\|APPENDED"; then
  echo ""
  echo "=== Seed SUCCESS (some duplicates) ==="
else
  echo ""
  echo "=== Seed may need retry (check errors above) ==="
  # Try with expected_next_seq=1 in case stream already has the empty test event
  echo "Retrying with expected_next_seq=1..."
  REQUEST2=$(echo "$REQUEST" | sed 's/"expected_next_seq": 0/"expected_next_seq": 1/')
  RESULT2=$(echo "$REQUEST2" | grpcurl -plaintext \
    -import-path "$PROTO_DIR" -proto "$PROTO" \
    -H 'x-corecrux-scopes: events:write' \
    -d @ "$HOST:$PORT" "$SVC" 2>&1) || true
  echo "$RESULT2"
fi

echo ""
echo "Verify: curl -H 'X-Corecrux-Scopes: admin:read' http://$HOST:4006/v1/admin/decision-plane/agent-sessions/$SESSION?tenant_id=$TENANT"
