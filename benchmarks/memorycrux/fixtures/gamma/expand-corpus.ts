#!/usr/bin/env tsx
// Gamma Fixture — Corpus expansion
//
// Adds ~90K tokens of additional documents to reach the ~107K token target.
// Run AFTER generate-corpus.ts:
//   npx tsx generate-corpus.ts && npx tsx expand-corpus.ts
//
// Document categories added:
//   8 service specifications (~5K tokens each = 40K)
//   5 deep-dive design docs (~4K tokens each = 20K)
//   5 meeting notes / RFCs (~3K tokens each = 15K)
//   5 operational playbooks (~3K tokens each = 15K)

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface CorpusDoc {
  id: string;
  type: "document" | "decision" | "constraint" | "incident";
  title: string;
  tokens: number;
  domain?: string;
  phase?: string | number;
  metadata?: Record<string, unknown>;
  content: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeDoc(
  id: string,
  type: CorpusDoc["type"],
  title: string,
  domain: string,
  phase: string | number,
  content: string,
  metadata?: Record<string, unknown>,
): CorpusDoc {
  return { id, type, title, tokens: estimateTokens(content), domain, phase, content, metadata };
}

// Utility to generate realistic filler paragraphs for a given topic
function techParagraph(topic: string, detail: string, lines: number): string {
  const paragraphs: string[] = [];
  for (let i = 0; i < lines; i++) {
    paragraphs.push(
      `The ${topic} implementation requires careful consideration of ${detail} in the context of ` +
      `the Enterprise Data Platform migration. Specifically, the team evaluated multiple approaches ` +
      `including vendor-managed solutions, open-source alternatives, and hybrid architectures. ` +
      `After thorough analysis of throughput requirements (targeting 50,000 events/second sustained ` +
      `with burst capacity to 200,000 events/second), latency budgets (p99 < 100ms end-to-end), ` +
      `and operational complexity trade-offs, the following design was selected.`
    );
  }
  return paragraphs.join("\n\n");
}

const newDocs: CorpusDoc[] = [];

// ============================================================
// Service Specifications (~5K tokens each)
// ============================================================

newDocs.push(makeDoc(
  "gamma-svc-ingest", "document",
  "Service Spec: Event Ingestion Service (edp-ingest)",
  "services", "phase-1",
  `# Service Specification: Event Ingestion Service (edp-ingest)

## Overview

The Event Ingestion Service is the primary entry point for all events entering the Enterprise Data
Platform. It receives events via HTTP/gRPC, validates them against registered Avro schemas,
and produces them to the appropriate Kafka topics.

## API Surface

### HTTP Endpoints

\`\`\`
POST /v1/events/{source}/{entity}
  Content-Type: application/avro+binary | application/json
  X-EDP-Schema-Version: <version>
  X-EDP-Idempotency-Key: <uuid>
  X-EDP-Source-System: <system-id>

  → 202 Accepted (event queued)
  → 400 Bad Request (schema validation failed)
  → 409 Conflict (duplicate idempotency key)
  → 429 Too Many Requests (rate limited)
  → 503 Service Unavailable (Kafka unavailable)
\`\`\`

### gRPC Service

\`\`\`protobuf
service EventIngestion {
  rpc IngestEvent(IngestEventRequest) returns (IngestEventResponse);
  rpc IngestBatch(IngestBatchRequest) returns (IngestBatchResponse);
  rpc GetIngestionStatus(StatusRequest) returns (StatusResponse);
}
\`\`\`

## Schema Validation

All events are validated against the Confluent Schema Registry before production to Kafka.
The service caches schemas locally with a TTL of 5 minutes. Schema evolution rules:

- BACKWARD compatibility required for all production schemas
- New optional fields: always allowed
- Removing fields: requires deprecation period (30 days minimum)
- Changing field types: NOT allowed (create new schema version)

### Validation Pipeline

1. Extract schema fingerprint from X-EDP-Schema-Version header
2. Check local cache for matching schema
3. If cache miss, fetch from Schema Registry (with circuit breaker)
4. Deserialize event payload against schema
5. Apply custom validation rules (if registered for this source/entity)
6. Generate canonical event envelope with metadata

## Kafka Production

### Topic Selection

Events are routed to topics following the naming convention:
\`edp.events.{source}.{entity}\`

Partition key selection:
- Default: entity ID (from event payload \`$.entity_id\`)
- Override: X-EDP-Partition-Key header
- Fallback: round-robin if no key available

### Producer Configuration

\`\`\`yaml
acks: all
retries: 10
retry.backoff.ms: 100
retry.backoff.max.ms: 10000
max.in.flight.requests.per.connection: 5
enable.idempotence: true
compression.type: lz4
batch.size: 65536
linger.ms: 10
buffer.memory: 67108864
max.block.ms: 30000
delivery.timeout.ms: 120000
\`\`\`

### Idempotency

The service maintains a deduplication window using Redis:
- Key: \`edp:dedup:{idempotency_key}\`
- TTL: 24 hours
- Check-and-set pattern with Lua scripting for atomicity

If a duplicate is detected within the window:
- Return 409 Conflict with the original event ID
- Do NOT re-produce to Kafka
- Log the duplicate detection for monitoring

## Rate Limiting

Per-source rate limits are configured in Consul KV:
\`\`\`
edp/rate-limits/{source-system-id}/rps: 1000
edp/rate-limits/{source-system-id}/burst: 5000
edp/rate-limits/default/rps: 100
edp/rate-limits/default/burst: 500
\`\`\`

Rate limiting uses a sliding window algorithm implemented in Redis.
When a source exceeds its limit, 429 responses include a Retry-After header.

## Error Handling

### Dead Letter Queue

Events that fail validation or Kafka production after all retries are sent to the DLQ:
- Topic: \`edp.dlq.{source}.{entity}\`
- Includes original event, error details, attempt count, timestamps
- DLQ events are monitored by the Operations team
- Alert threshold: >100 DLQ events per source per hour

### Circuit Breakers

The service uses circuit breakers for external dependencies:

| Dependency | Open Threshold | Half-Open After | Close Threshold |
|------------|---------------|-----------------|-----------------|
| Schema Registry | 5 failures in 30s | 60s | 3 successes |
| Kafka (per broker) | 3 failures in 15s | 30s | 2 successes |
| Redis (dedup) | 10 failures in 60s | 120s | 5 successes |
| Consul (config) | 5 failures in 60s | 300s | 3 successes |

When the Schema Registry circuit breaker opens:
- Events with cached schemas: still accepted
- Events without cached schemas: return 503 with Retry-After

When the Kafka circuit breaker opens:
- All events: return 503 with Retry-After
- Alert: PagerDuty P1 (Kafka unavailable)

## Monitoring

### Metrics (Prometheus)

\`\`\`
edp_ingest_events_total{source, entity, status}
edp_ingest_latency_seconds{source, entity, quantile}
edp_ingest_schema_validation_errors_total{source, entity, error_type}
edp_ingest_kafka_produce_errors_total{source, entity, error_type}
edp_ingest_dlq_events_total{source, entity}
edp_ingest_dedup_hits_total{source}
edp_ingest_rate_limit_hits_total{source}
edp_ingest_circuit_breaker_state{dependency, state}
\`\`\`

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighDLQRate | >100 DLQ events/hour per source | Warning |
| KafkaUnavailable | Kafka circuit breaker open >5 min | Critical |
| SchemaRegistryDown | SR circuit breaker open >10 min | Warning |
| HighLatency | p99 latency >500ms for 5 min | Warning |
| ErrorRate | >5% error rate for 5 min | Critical |

## Deployment

### Resource Requirements

\`\`\`yaml
replicas: 3 (min) / 10 (max)
cpu:
  request: 500m
  limit: 2000m
memory:
  request: 512Mi
  limit: 1Gi
\`\`\`

### Health Checks

\`\`\`yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
\`\`\`

### Dependencies

- Kafka cluster (5 brokers, KRaft mode)
- Confluent Schema Registry
- Redis cluster (3 nodes, sentinel)
- Consul (service discovery + config)
- Prometheus (metrics)

## Security

- mTLS between service and Kafka brokers
- API key authentication for external sources
- OAuth2 + JWT for internal service-to-service
- All events encrypted at rest (Kafka broker-level encryption)
- PII fields detected and tagged (see Privacy Spec)

## SLOs

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.95% | Successful responses / total requests |
| Latency (p99) | <200ms | Time from request receipt to Kafka ack |
| Data Loss | 0% | Events accepted but not in Kafka after 5 min |
| DLQ Processing | <1 hour | Time from DLQ entry to resolution |
`,
));


newDocs.push(makeDoc(
  "gamma-svc-consumer", "document",
  "Service Spec: Event Consumer Framework (edp-consumer)",
  "services", "phase-2",
  `# Service Specification: Event Consumer Framework (edp-consumer)

## Overview

The Event Consumer Framework provides a standardized way for downstream services to consume events
from the Enterprise Data Platform. It handles consumer group management, offset commits,
deserialization, error handling, and observability.

## Architecture

### Consumer Group Strategy

Each consuming service gets its own consumer group:
\`\`\`
group.id: edp.consumer.{service-name}.{environment}
\`\`\`

This ensures:
- Independent consumption rates per service
- Independent offset management
- No interference between consumers
- Easy monitoring per service

### Partition Assignment

Default strategy: CooperativeStickyAssignor

Rationale:
- Minimizes partition movement during rebalances
- Supports incremental rebalances (no stop-the-world)
- Better cache utilization for stateful consumers

### Consumer Configuration

\`\`\`yaml
auto.offset.reset: earliest
enable.auto.commit: false
max.poll.records: 500
max.poll.interval.ms: 300000
session.timeout.ms: 45000
heartbeat.interval.ms: 15000
fetch.min.bytes: 1024
fetch.max.wait.ms: 500
max.partition.fetch.bytes: 1048576
\`\`\`

## Processing Guarantees

### At-Least-Once (Default)

Most consumers use at-least-once semantics:
1. Poll records from Kafka
2. Process each record
3. Commit offsets after successful processing
4. On failure: don't commit, re-process on next poll

Consumers MUST be idempotent. The framework provides:
- Dedup cache (Redis, configurable TTL)
- Idempotency key extraction from event headers
- Automatic dedup checking before handler invocation

### Exactly-Once (Opt-in)

For services requiring exactly-once semantics (e.g., financial data):
- Uses Kafka transactions with read-process-write pattern
- Consumer + producer in same transaction
- isolation.level: read_committed
- Requires careful sink design (transactional outbox pattern)

See ADR-005 for the full exactly-once design decision.

## Error Handling

### Retry Strategy

\`\`\`
Level 1: In-memory retry (3 attempts, exponential backoff 100ms-1s)
Level 2: Retry topic (edp.retry.{service}.{entity}, 3 attempts, 1min-15min)
Level 3: DLQ (edp.dlq.{service}.{entity}, requires manual intervention)
\`\`\`

### Poison Pill Detection

Events that consistently cause exceptions are detected:
- After 3 consecutive failures for the same event key
- Event is sent directly to DLQ (skip retry topic)
- Alert raised with event details
- Remaining partition events continue processing

### Consumer Lag Alerting

\`\`\`
edp_consumer_lag{service, topic, partition}
edp_consumer_lag_seconds{service, topic}
\`\`\`

Alert thresholds:
| Severity | Lag (records) | Lag (time) |
|----------|--------------|------------|
| Warning | >10,000 | >5 min |
| Critical | >100,000 | >30 min |
| P1 | >1,000,000 | >2 hours |

## Schema Deserialization

The consumer framework automatically:
1. Extracts schema ID from Avro wire format header
2. Fetches schema from registry (cached)
3. Deserializes to Java/Kotlin POJO or generic record
4. Provides both typed and generic access

### Schema Evolution Handling

When a new schema version is published:
- Consumers with BACKWARD compatibility: automatic (old schema reads new data)
- Consumers with FORWARD compatibility: may need redeployment
- Consumer reports schema version in metrics for monitoring

## Observability

### Metrics

\`\`\`
edp_consumer_records_processed_total{service, topic, status}
edp_consumer_processing_latency_seconds{service, topic, quantile}
edp_consumer_batch_size{service, topic}
edp_consumer_rebalance_total{service}
edp_consumer_commit_latency_seconds{service, quantile}
edp_consumer_retry_total{service, topic, level}
edp_consumer_dlq_total{service, topic}
\`\`\`

### Distributed Tracing

Each event carries trace context in headers:
- \`traceparent\`: W3C Trace Context
- \`X-EDP-Correlation-ID\`: Business correlation ID

The consumer framework automatically:
- Extracts trace context from event headers
- Creates child spans for processing
- Propagates context to downstream calls
- Reports processing duration per event

### Structured Logging

\`\`\`json
{
  "level": "info",
  "service": "order-enrichment",
  "topic": "edp.events.ecommerce.orders",
  "partition": 7,
  "offset": 1234567,
  "event_id": "evt_abc123",
  "correlation_id": "corr_xyz789",
  "processing_time_ms": 45,
  "schema_version": 3,
  "message": "Event processed successfully"
}
\`\`\`

## Integration Patterns

### Materialised View Builder

For services that maintain a read-optimized view:
1. Consume events from source topics
2. Apply transformations/aggregations
3. Write to target store (PostgreSQL, Elasticsearch, Redis)
4. Use KTable semantics where possible

### Event Sourcing Bridge

For services migrating from request/response to event-driven:
1. Consume change events from legacy systems (via Debezium CDC)
2. Transform to EDP canonical event format
3. Produce to downstream topics

### Saga Orchestration

For distributed transactions across multiple services:
1. Saga orchestrator consumes completion events
2. Maintains saga state (PostgreSQL + outbox pattern)
3. Produces next step commands to target service topics
4. Handles compensation on failure

## Deployment

### Resource Requirements

Consumers are scaled independently based on partition count:
- 1 consumer instance per partition (maximum)
- Recommended: ceil(partition_count / 3) instances

\`\`\`yaml
replicas: 4 (for 12-partition topics)
cpu:
  request: 250m
  limit: 1000m
memory:
  request: 256Mi
  limit: 512Mi
\`\`\`

### Rolling Updates

Zero-downtime updates using partition rebalancing:
1. Start new instances (they join consumer group)
2. Partitions rebalance across all instances
3. Old instances drain current batch, commit offsets
4. Old instances shut down
5. Final rebalance distributes their partitions

## Security

- mTLS to Kafka brokers
- ACL-based topic access (service can only read subscribed topics)
- Sensitive fields decrypted at consumer if authorized
- Audit log for DLQ access
`,
));


newDocs.push(makeDoc(
  "gamma-svc-transformer", "document",
  "Service Spec: Event Transformation Pipeline (edp-transform)",
  "services", "phase-2",
  `# Service Specification: Event Transformation Pipeline (edp-transform)

## Overview

The Event Transformation Pipeline processes raw events from source topics, applies transformations,
enrichments, and routing rules, and produces normalised events to downstream consumer topics.
It is the central processing layer of the Enterprise Data Platform.

## Architecture

### Pipeline Definition

Transformations are defined as YAML pipelines:

\`\`\`yaml
pipeline: order-enrichment
version: 3
source:
  topic: edp.events.ecommerce.raw-orders
  schema: com.edp.ecommerce.RawOrder@v2
sink:
  topic: edp.events.ecommerce.orders
  schema: com.edp.ecommerce.Order@v5
stages:
  - name: validate-required-fields
    type: filter
    config:
      condition: "record.orderId != null && record.customerId != null"
      on_fail: dlq
  - name: enrich-customer
    type: lookup
    config:
      source: postgres
      connection: edp-customer-db
      query: "SELECT tier, region, segment FROM customers WHERE id = :customerId"
      timeout_ms: 200
      on_fail: skip_enrichment
  - name: calculate-totals
    type: transform
    config:
      expression: |
        {
          ...record,
          subtotal: record.items.map(i => i.price * i.quantity).sum(),
          tax: calculateTax(record.items, enrichment.region),
          total: subtotal + tax
        }
  - name: classify-priority
    type: route
    config:
      field: enrichment.tier
      rules:
        - match: "premium|enterprise"
          tag: high-priority
        - match: "*"
          tag: standard
\`\`\`

### Stage Types

| Stage Type | Description | Supports Async |
|-----------|-------------|----------------|
| filter | Drop/route events based on conditions | No |
| transform | Modify event fields (expressions) | No |
| lookup | Enrich from external source | Yes |
| aggregate | Window-based aggregation | Yes (windowed) |
| route | Split events to different sinks | No |
| validate | Schema validation + custom rules | No |
| dedup | Remove duplicates within window | Yes |

### Lookup Sources

The transformation pipeline can enrich events from:

1. **PostgreSQL**: Direct SQL queries (connection pooled, cached)
2. **Redis**: Key-value lookups (sub-ms latency)
3. **gRPC services**: Real-time enrichment from other microservices
4. **Static files**: CSV/JSON reference data (loaded at startup, refreshed hourly)

Lookup results are cached with configurable TTL:
\`\`\`yaml
cache:
  type: redis
  ttl: 300  # seconds
  max_entries: 100000
  eviction: lru
\`\`\`

## Processing Semantics

### Ordering Guarantees

- Within a partition: strict ordering maintained
- Across partitions: no ordering guarantee
- Stateful operations (aggregate): ordering within window

### Windowing

For aggregate stages:
\`\`\`yaml
window:
  type: tumbling | sliding | session
  size: 5m
  grace: 30s  # late event tolerance
  watermark: event_time  # or processing_time
\`\`\`

Late events (outside grace period):
- Logged as late arrivals
- Optionally forwarded to late-events topic
- Not included in already-emitted aggregations

### State Management

Stateful operations use RocksDB for local state:
- Snapshotted to object storage every 10 minutes
- Restored on startup from latest snapshot + changelog replay
- Changelog topics: \`edp.internal.transform.{pipeline}.{stage}.changelog\`

## Performance Tuning

### Batching

Events are processed in micro-batches for efficiency:
\`\`\`yaml
batch:
  max_size: 1000
  max_wait_ms: 100
  concurrent_lookups: 10
\`\`\`

### Backpressure

When downstream sinks are slow:
1. Producer buffer fills up
2. Processing thread blocks on produce
3. Consumer stops polling (poll interval protection)
4. Kafka rebalance NOT triggered (session.timeout separate from poll)
5. Backpressure propagates naturally

### Scaling

Pipeline throughput scales with:
- Partition count (source topic)
- Instance count (up to partition count)
- Lookup parallelism (concurrent_lookups config)
- Batch size (larger = more throughput, higher latency)

Measured throughput per instance:
| Scenario | Events/sec | p99 Latency |
|----------|-----------|-------------|
| Pass-through | 50,000 | 5ms |
| Filter only | 45,000 | 8ms |
| 1 lookup (cached) | 30,000 | 15ms |
| 1 lookup (miss) | 5,000 | 200ms |
| 2 lookups + transform | 3,000 | 350ms |
| Aggregate (windowed) | 20,000 | 50ms |

## Pipeline Management

### Versioning

Pipelines are versioned in Git:
\`\`\`
pipelines/
  order-enrichment/
    v1.yaml
    v2.yaml
    v3.yaml  (current)
  payment-processing/
    v1.yaml
    v2.yaml  (current)
\`\`\`

### Deployment

Pipeline updates follow blue-green deployment:
1. Deploy new version alongside current
2. New version starts consuming from current offsets
3. Validate output (shadow mode, 1% of traffic)
4. Switch traffic to new version
5. Drain old version

### Testing

Pipeline stages are unit-tested with sample events:
\`\`\`yaml
tests:
  - name: basic-order-enrichment
    input:
      orderId: "ord_123"
      customerId: "cust_456"
      items: [{sku: "ABC", price: 10.00, quantity: 2}]
    mocks:
      enrich-customer:
        return: {tier: "premium", region: "US-EAST", segment: "enterprise"}
    expected:
      subtotal: 20.00
      priority_tag: "high-priority"
\`\`\`

## Monitoring

### Pipeline-Level Metrics

\`\`\`
edp_transform_input_events_total{pipeline, version}
edp_transform_output_events_total{pipeline, version, sink}
edp_transform_filtered_events_total{pipeline, version, stage, reason}
edp_transform_stage_latency_seconds{pipeline, stage, quantile}
edp_transform_lookup_cache_hit_ratio{pipeline, stage}
edp_transform_late_events_total{pipeline, stage}
edp_transform_state_size_bytes{pipeline, stage}
\`\`\`

### Pipeline Dashboard

Each pipeline has a Grafana dashboard showing:
- Input/output event rates
- Stage-by-stage latency breakdown
- Lookup cache hit ratios
- Error rates and DLQ counts
- Consumer lag
- State store size

## Security

- Pipelines run with least-privilege service accounts
- Lookup credentials stored in Vault (rotated monthly)
- Sensitive field transformations logged to audit trail
- Pipeline changes require code review + security review for new lookups
`,
));


newDocs.push(makeDoc(
  "gamma-svc-schema-registry", "document",
  "Service Spec: Schema Registry Operations Guide",
  "services", "phase-1",
  `# Schema Registry Operations Guide

## Overview

The Confluent Schema Registry is a critical dependency for the Enterprise Data Platform.
It stores and serves Avro schemas for all event types, enforces compatibility rules,
and provides schema evolution governance.

## Architecture

### Deployment

- 3 instances behind an internal load balancer
- Primary/secondary leadership election via Kafka (\`_schemas\` topic)
- All instances serve reads; only primary serves writes
- Deployed on Kubernetes (StatefulSet for stable network identity)

### Storage

Schemas are stored in a compacted Kafka topic:
\`\`\`
Topic: _schemas
Partitions: 1 (required for ordering)
Replication Factor: 3
Cleanup Policy: compact
\`\`\`

### High Availability

In case of primary failure:
1. Secondary instances detect leader loss via Kafka
2. New leader elected within ~30 seconds
3. Read traffic unaffected (all instances serve reads)
4. Write traffic blocked during election (~30s)
5. Producers/consumers with cached schemas unaffected

## Schema Lifecycle

### Registration

\`\`\`bash
# Register a new schema
curl -X POST http://schema-registry:8081/subjects/{subject}/versions \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d '{"schema": "<avro-schema-json>", "schemaType": "AVRO"}'

# Response: {"id": 42}
\`\`\`

### Subject Naming Convention

\`\`\`
{topic-name}-{key|value}
Example: edp.events.ecommerce.orders-value
\`\`\`

### Compatibility Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| BACKWARD (default) | New schema can read old data | Most cases |
| FORWARD | Old schema can read new data | Consumer-first deploys |
| FULL | Both backward and forward | Strict environments |
| NONE | No compatibility check | Development only |

### Evolution Rules for BACKWARD Compatibility

Allowed changes:
- Add optional fields (with default values)
- Remove fields that have defaults
- Add new enum values (with default)

Disallowed changes:
- Remove required fields
- Change field types (int → string)
- Rename fields
- Remove enum values referenced by existing data

### Schema Review Process

All schema changes go through code review:
1. Developer creates PR with schema change
2. CI runs compatibility check against registry
3. Data Platform team reviews
4. After merge, CI registers schema in staging registry
5. Integration tests validate
6. Manual promotion to production registry

## Common Operations

### Viewing Schema Details

\`\`\`bash
# List all subjects
curl http://schema-registry:8081/subjects

# Get latest version
curl http://schema-registry:8081/subjects/{subject}/versions/latest

# Get specific version
curl http://schema-registry:8081/subjects/{subject}/versions/{version}

# Check compatibility
curl -X POST http://schema-registry:8081/compatibility/subjects/{subject}/versions/latest \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d '{"schema": "<new-schema-json>"}'
\`\`\`

### Troubleshooting

**Issue: Schema registration fails with 409**
- Cause: Incompatible schema evolution
- Resolution: Check compatibility mode, ensure backward compatibility
- If intentional breaking change: coordinate consumer updates first

**Issue: High Schema Registry latency**
- Check: Primary instance health, Kafka connectivity
- Check: _schemas topic lag (should be 0)
- Action: Restart instances if leader election stuck

**Issue: Producers failing with "Schema not found"**
- Check: Schema registered for correct subject name
- Check: Subject naming convention matches topic config
- Check: Schema Registry accessible from producer network

## Backup and Recovery

### Backup Strategy

The _schemas topic IS the backup (compacted, replicated).

Additional safety:
- Weekly full schema export to S3
- Git repository with all registered schemas
- Schema registration CI validates against both

### Disaster Recovery

If Schema Registry is completely lost:
1. Deploy new instances
2. Point to existing Kafka cluster (_schemas topic still has data)
3. New instances bootstrap from _schemas topic
4. No data loss (schemas are in Kafka)

If _schemas topic is lost:
1. Restore from latest S3 export
2. Re-register schemas from Git repository
3. Verify: compare registered schemas against producer expectations
4. This is a P1 incident — all producers may fail during recovery

## Monitoring

\`\`\`
schema_registry_registered_count
schema_registry_request_latency_ms{method, status}
schema_registry_leader_status{instance}
schema_registry_kafka_lag
\`\`\`

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| No Leader | No primary instance for >60s | P1 |
| High Latency | p99 >500ms for 5 min | P2 |
| Registration Failures | >5 failures in 10 min | P2 |
| Kafka Lag | _schemas lag >0 for >5 min | P3 |
`,
));


newDocs.push(makeDoc(
  "gamma-svc-monitoring", "document",
  "Service Spec: EDP Monitoring & Alerting Stack",
  "services", "phase-3",
  `# Service Specification: EDP Monitoring & Alerting Stack

## Overview

The Enterprise Data Platform monitoring stack provides end-to-end observability across all EDP
services. It covers metrics collection, log aggregation, distributed tracing, alerting, and
on-call management.

## Architecture

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Metrics | Prometheus + Thanos | Time series collection, long-term storage |
| Logs | Loki + Promtail | Structured log aggregation |
| Traces | Tempo + OpenTelemetry | Distributed tracing |
| Dashboards | Grafana | Visualization, exploration |
| Alerts | Alertmanager | Alert routing, grouping, silencing |
| On-call | PagerDuty | Incident notification, escalation |
| SLO tracking | Sloth | SLO definition, burn rate alerts |

### Data Flow

\`\`\`
Services → Prometheus (scrape) → Thanos Sidecar → Thanos Store → Thanos Query
Services → Promtail (push) → Loki → Grafana
Services → OTel Collector → Tempo → Grafana
Alertmanager → PagerDuty / Slack / Email
\`\`\`

## Metrics Architecture

### Prometheus Federation

\`\`\`
                    Thanos Query (global view)
                         |
            ┌────────────┼────────────┐
         Thanos       Thanos       Thanos
         Sidecar      Sidecar      Sidecar
            |            |            |
       Prometheus   Prometheus   Prometheus
       (cluster-1)  (cluster-2)  (infra)
\`\`\`

### Retention

| Tier | Resolution | Retention | Storage |
|------|-----------|-----------|---------|
| Hot | Raw (15s) | 24 hours | Prometheus local |
| Warm | 5 min avg | 30 days | Thanos Compact |
| Cold | 1 hour avg | 1 year | S3 (Glacier) |

### Standard Metric Labels

All EDP services MUST expose metrics with these labels:
\`\`\`
service: <service-name>
environment: <dev|staging|production>
cluster: <k8s-cluster-name>
version: <service-version>
\`\`\`

### Key EDP Metrics

**Event Flow Metrics:**
\`\`\`
edp_events_produced_total{service, topic, status}
edp_events_consumed_total{service, topic, status}
edp_events_dlq_total{service, topic}
edp_consumer_lag{service, topic, partition}
edp_event_end_to_end_latency_seconds{source, sink, quantile}
\`\`\`

**Infrastructure Metrics:**
\`\`\`
kafka_broker_messages_in_total{broker}
kafka_broker_bytes_in_total{broker, topic}
kafka_topic_partitions{topic}
kafka_under_replicated_partitions{topic}
kafka_consumer_group_lag{group, topic}
\`\`\`

## Alerting Strategy

### Alert Tiers

| Tier | Response Time | Notification | Examples |
|------|--------------|--------------|----------|
| P1 (Critical) | <15 min | PagerDuty page | Data loss, cluster down, safety violation |
| P2 (High) | <1 hour | PagerDuty + Slack | DLQ spike, high consumer lag, degraded perf |
| P3 (Medium) | <4 hours | Slack only | Elevated error rates, schema issues |
| P4 (Low) | Next business day | Slack (weekly digest) | Capacity planning, optimization |

### SLO-Based Alerting

Each service defines SLOs; Sloth generates multi-window burn rate alerts:

\`\`\`yaml
# edp-ingest SLO
slos:
  - name: edp-ingest-availability
    objective: 99.95
    sli:
      events:
        error_query: sum(rate(edp_ingest_events_total{status=~"5.."}[{{.window}}]))
        total_query: sum(rate(edp_ingest_events_total[{{.window}}]))
    alerting:
      page_alert:
        labels:
          severity: critical
          team: edp-platform
      ticket_alert:
        labels:
          severity: warning
          team: edp-platform
\`\`\`

### Alert Routing

\`\`\`yaml
# Alertmanager config
route:
  receiver: slack-edp
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: pagerduty-edp
      continue: true
    - match:
        severity: critical
      receiver: slack-edp-critical
    - match:
        team: edp-platform
      receiver: slack-edp-platform
    - match:
        team: edp-consumers
      receiver: slack-edp-consumers
\`\`\`

## Logging

### Log Levels

| Level | Use | Examples |
|-------|-----|---------|
| ERROR | Action required | Failed event processing, connection errors |
| WARN | Attention needed | DLQ events, rate limit hits, retry attempts |
| INFO | Normal operations | Event processed, config loaded, health check |
| DEBUG | Troubleshooting | Schema validation details, lookup results |

### Structured Log Format

All EDP services use JSON structured logs:
\`\`\`json
{
  "timestamp": "2025-12-15T10:30:45.123Z",
  "level": "error",
  "logger": "edp.ingest.producer",
  "message": "Failed to produce event to Kafka",
  "service": "edp-ingest",
  "trace_id": "abc123",
  "event_id": "evt_456",
  "topic": "edp.events.ecommerce.orders",
  "error": "org.apache.kafka.common.errors.RecordTooLargeException",
  "record_size_bytes": 2097152,
  "max_allowed_bytes": 1048576
}
\`\`\`

### Log Retention

| Environment | Retention |
|-------------|-----------|
| Production | 30 days (Loki), 90 days (S3) |
| Staging | 7 days (Loki only) |
| Development | 3 days (Loki only) |

## Distributed Tracing

### Trace Propagation

All EDP events carry trace context:
- W3C \`traceparent\` header (HTTP)
- \`edp-trace-id\` Kafka header
- Correlated with \`X-EDP-Correlation-ID\` business ID

### Trace Sampling

\`\`\`yaml
sampling:
  default_rate: 0.01  # 1% of all traces
  rules:
    - service: edp-ingest
      error: true
      rate: 1.0  # 100% of errors
    - service: edp-ingest
      latency_gt: 500ms
      rate: 1.0  # 100% of slow requests
    - service: edp-consumer
      dlq: true
      rate: 1.0  # 100% of DLQ events
\`\`\`

## Dashboards

### Standard Dashboards

Every EDP service gets auto-provisioned dashboards:

1. **Service Overview**: Request rate, error rate, latency percentiles
2. **Event Flow**: Production/consumption rates, lag, DLQ
3. **Dependencies**: Circuit breaker states, external call latencies
4. **Resources**: CPU, memory, GC, connection pools

### EDP Platform Dashboard

Global view of the entire platform:
- Total event throughput (all topics)
- Cluster health (broker status, partition balance)
- Consumer lag (all groups)
- Error rates (by service)
- SLO status (all services)
- Active alerts

## On-Call

### Rotation

\`\`\`
Primary: Weekly rotation (Mon 09:00 → Mon 09:00)
Secondary: Same week, different person
Escalation: Primary → Secondary → Engineering Manager → VP Engineering
\`\`\`

### Runbook Index

All P1/P2 alerts link to runbooks:
- Each alert has a \`runbook_url\` annotation
- Runbooks are in the \`runbooks/\` directory of the EDP repository
- Runbooks are reviewed quarterly
`,
));


newDocs.push(makeDoc(
  "gamma-svc-data-lake", "document",
  "Service Spec: Data Lake Sink Connector (edp-lake-sink)",
  "services", "phase-2",
  `# Service Specification: Data Lake Sink Connector (edp-lake-sink)

## Overview

The Data Lake Sink Connector streams events from Kafka topics to the analytical data lake
(S3 + Apache Iceberg format). It provides the bridge between the operational event stream
and the analytical/BI layer.

## Architecture

### Sink Strategy

Events are written to S3 in Apache Iceberg table format:
- Partitioned by date (day) and source system
- Compacted hourly (small files → larger files)
- Iceberg metadata maintained in Hive Metastore (Glue-compatible)

### Data Format

\`\`\`
s3://edp-data-lake/
  warehouse/
    edp.events.ecommerce.orders/
      data/
        date=2025-12-15/
          source=web/
            part-00001.parquet
            part-00002.parquet
          source=mobile/
            part-00003.parquet
      metadata/
        snap-1234.avro
        v1.metadata.json
\`\`\`

### File Format

| Property | Value |
|----------|-------|
| Format | Apache Parquet |
| Compression | Snappy |
| Target file size | 128 MB |
| Row group size | 128 MB |
| Bloom filter | On partition key columns |

## Processing

### Flush Strategy

Events are buffered in memory and flushed to S3 when:
- Buffer reaches 50,000 events
- Buffer age exceeds 5 minutes
- Memory pressure exceeds 80%

### Exactly-Once to Data Lake

The sink connector uses Kafka consumer offsets + Iceberg atomic commits:
1. Consume batch of events
2. Write to staging location in S3
3. Commit to Iceberg table (atomic metadata update)
4. Commit Kafka offsets
5. If step 3 fails: abort, reprocess batch
6. If step 4 fails: next batch will dedup via Iceberg snapshot

### Schema Mapping

Avro schemas from the event stream are mapped to Iceberg schemas:
- Avro primitives → Iceberg primitives (direct mapping)
- Avro unions → Iceberg optionals
- Nested records → Iceberg structs
- Arrays → Iceberg lists
- Maps → Iceberg maps

Schema evolution in Iceberg follows the same rules as Avro:
- New optional columns added automatically
- Column type promotion: int → long, float → double
- Renamed columns mapped via column IDs

## Table Maintenance

### Compaction

Hourly compaction job:
\`\`\`sql
CALL system.rewrite_data_files(
  table => 'edp.events.ecommerce.orders',
  strategy => 'binpack',
  options => map('target-file-size-bytes', '134217728')
)
\`\`\`

### Snapshot Expiration

\`\`\`sql
CALL system.expire_snapshots(
  table => 'edp.events.ecommerce.orders',
  older_than => TIMESTAMP '2025-12-01 00:00:00'
)
\`\`\`

### Orphan File Cleanup

Weekly job to remove files not referenced by any snapshot:
\`\`\`sql
CALL system.remove_orphan_files(
  table => 'edp.events.ecommerce.orders',
  older_than => TIMESTAMP '2025-12-08 00:00:00'
)
\`\`\`

## Monitoring

\`\`\`
edp_lake_sink_events_written_total{topic, table}
edp_lake_sink_files_created_total{topic, table}
edp_lake_sink_flush_latency_seconds{topic, quantile}
edp_lake_sink_s3_errors_total{topic, error_type}
edp_lake_sink_iceberg_commit_latency_seconds{quantile}
edp_lake_sink_buffer_events{topic}
edp_lake_sink_compaction_duration_seconds{table}
\`\`\`

### Data Quality Checks

Hourly validation:
- Row count in Iceberg vs events consumed from Kafka
- Schema drift detection (new columns, type changes)
- Null rate per column (alert on anomalous increase)
- Duplicate detection (by event_id)
- Freshness check (latest event timestamp vs current time)

## Access Control

### Read Access

Data lake tables are queried via:
- **Trino/Presto**: Ad-hoc analytics, dashboards
- **Spark**: Batch processing, ML training
- **Athena**: Quick queries from AWS console

Access control:
- IAM roles per team (read-only to specific databases)
- Table-level Ranger policies (production)
- Column-level masking for PII (see Compliance Spec)

### Write Access

Only the sink connector writes to data lake tables:
- Service account with S3 write + Iceberg commit permissions
- No direct S3 writes from other services
- All writes go through the connector (audit trail)

## Disaster Recovery

If the sink connector fails:
1. Consumer lag increases (Kafka retains events for 48 hours)
2. Alert fires when lag >30 min (P2)
3. Fix and restart connector
4. Connector catches up from last committed offset
5. No data loss (within retention window)

If S3 is unavailable:
1. Connector buffers in memory (up to 80% memory)
2. When buffer full, stops consuming (backpressure)
3. Kafka retains events
4. When S3 recovers, connector flushes buffer + resumes
`,
));


newDocs.push(makeDoc(
  "gamma-svc-gateway", "document",
  "Service Spec: API Gateway & Event Proxy (edp-gateway)",
  "services", "phase-1",
  `# Service Specification: API Gateway & Event Proxy (edp-gateway)

## Overview

The EDP Gateway provides a unified API entry point for external and internal clients to interact
with the Enterprise Data Platform. It handles authentication, authorization, rate limiting,
request validation, and routing to backend services.

## Architecture

### Gateway Layers

\`\`\`
Client → TLS Termination (Envoy) → Authentication → Authorization → Rate Limit → Route
                                                                                    │
                                  ┌────────────────┬───────────────┬────────────────┤
                                  ↓                ↓               ↓                ↓
                            edp-ingest      edp-query       edp-admin        edp-stream
\`\`\`

### Technology Stack

- **Envoy Proxy**: L7 proxy, TLS termination, load balancing
- **ext_authz filter**: Authentication + authorization (custom gRPC service)
- **rate limit service**: Token bucket per client, distributed via Redis
- **Custom Lua filters**: Request transformation, header enrichment

## Authentication

### API Key Authentication (External Clients)

\`\`\`
X-EDP-API-Key: edp_live_<32-char-hex>
\`\`\`

API keys are:
- Hashed with bcrypt, stored in PostgreSQL
- Associated with a client ID, team, and permissions
- Rotatable without downtime (grace period for old key)
- Rate-limited independently

### OAuth2/OIDC (Internal Services)

Internal services authenticate via JWT tokens from the corporate IDP:
\`\`\`
Authorization: Bearer <jwt>
\`\`\`

Token validation:
- JWKS endpoint cached locally (refreshed every 5 min)
- Required claims: sub, iss, aud, exp, edp_roles
- Audience must include "edp-gateway"

### mTLS (Service Mesh)

Within the Kubernetes cluster, services use mTLS via Istio:
- Automatic certificate rotation (24-hour validity)
- Identity verified via SPIFFE ID
- No additional authentication needed for mesh traffic

## Authorization

### RBAC Model

\`\`\`yaml
roles:
  edp-producer:
    permissions:
      - action: write
        resources: ["events/{source}/*"]
  edp-consumer:
    permissions:
      - action: read
        resources: ["events/*", "schemas/*"]
  edp-admin:
    permissions:
      - action: "*"
        resources: ["*"]
  edp-viewer:
    permissions:
      - action: read
        resources: ["events/*", "schemas/*", "metrics/*"]
\`\`\`

### Resource-Level Authorization

Each API endpoint maps to a resource:
\`\`\`
POST /v1/events/{source}/{entity} → events/{source}/{entity}:write
GET /v1/events/{source}/{entity} → events/{source}/{entity}:read
GET /v1/schemas/{subject} → schemas/{subject}:read
POST /v1/admin/topics → admin/topics:write
\`\`\`

## Routing

### Endpoint Catalog

| Path | Method | Backend | Description |
|------|--------|---------|-------------|
| /v1/events/{source}/{entity} | POST | edp-ingest | Produce events |
| /v1/events/{source}/{entity} | GET | edp-query | Query events |
| /v1/schemas/{subject} | GET | schema-registry | Get schemas |
| /v1/schemas/{subject}/versions | POST | schema-registry | Register schema |
| /v1/admin/topics | GET/POST | edp-admin | Topic management |
| /v1/stream/{topic} | GET (SSE) | edp-stream | Real-time event stream |
| /v1/health | GET | (local) | Gateway health |
| /v1/metrics | GET | (local) | Prometheus metrics |

### Load Balancing

- Round-robin across healthy backend instances
- Health checks: HTTP GET every 5 seconds
- Unhealthy after 3 consecutive failures
- Healthy after 2 consecutive successes
- Circuit breaker: open after 5 failures in 30 seconds

## Rate Limiting

### Global Limits

| Tier | Requests/sec | Burst | Events/sec |
|------|-------------|-------|------------|
| Free | 10 | 50 | 100 |
| Basic | 100 | 500 | 1,000 |
| Pro | 1,000 | 5,000 | 10,000 |
| Enterprise | Custom | Custom | Custom |

### Response Headers

\`\`\`
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1734567890
Retry-After: 30  (only when rate limited)
\`\`\`

## Observability

### Metrics

\`\`\`
edp_gateway_requests_total{method, path, status, client}
edp_gateway_request_duration_seconds{method, path, quantile}
edp_gateway_auth_decisions_total{method, decision}
edp_gateway_rate_limit_hits_total{client, tier}
edp_gateway_backend_health{backend, status}
edp_gateway_active_connections{protocol}
\`\`\`

### Access Logs

All requests are logged with:
- Client ID, source IP, user agent
- Request method, path, query params
- Response status, body size
- Processing time
- Auth decision (allow/deny, reason)
- Rate limit status

### Audit Trail

Write operations (POST, PUT, DELETE) generate audit events:
- Sent to \`edp.audit.gateway\` Kafka topic
- Includes request body hash (not body itself)
- Retained for 90 days (compliance requirement)

## Deployment

\`\`\`yaml
replicas: 3 (min) / 10 (max)
cpu:
  request: 1000m
  limit: 4000m
memory:
  request: 1Gi
  limit: 2Gi
\`\`\`

### TLS Configuration

- TLS 1.3 only (1.2 deprecated, 1.1/1.0 rejected)
- Cipher suites: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
- Certificate rotation: automatic via cert-manager + Let's Encrypt
- HSTS: enabled (max-age=31536000)
`,
));


newDocs.push(makeDoc(
  "gamma-svc-cdc", "document",
  "Service Spec: Change Data Capture Pipeline (edp-cdc)",
  "services", "phase-2",
  `# Service Specification: Change Data Capture Pipeline (edp-cdc)

## Overview

The Change Data Capture (CDC) pipeline captures database changes from source systems and streams
them into the Enterprise Data Platform as events. It uses Debezium connectors running on
Kafka Connect to capture row-level changes from PostgreSQL, MySQL, and MongoDB databases.

## Architecture

### Pipeline Flow

\`\`\`
Source DB → Debezium Connector → Kafka Connect → edp.cdc.{source}.{table} → edp-transform → edp.events.{source}.{entity}
\`\`\`

### Kafka Connect Cluster

- 3 Connect workers (distributed mode)
- Running Debezium 2.5 connectors
- Offsets, configs, and status stored in Kafka:
  - \`connect-offsets\` (compacted, RF=3)
  - \`connect-configs\` (compacted, RF=3)
  - \`connect-status\` (compacted, RF=3)

## Supported Sources

### PostgreSQL (Logical Replication)

\`\`\`json
{
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "database.hostname": "orders-db.internal",
  "database.port": "5432",
  "database.user": "debezium",
  "database.password": "\${file:/run/secrets/debezium-pg}",
  "database.dbname": "orders",
  "plugin.name": "pgoutput",
  "publication.name": "edp_publication",
  "slot.name": "edp_debezium",
  "table.include.list": "public.orders,public.order_items,public.customers",
  "topic.prefix": "edp.cdc.orders",
  "snapshot.mode": "initial",
  "heartbeat.interval.ms": 10000,
  "transforms": "route,unwrap",
  "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
  "transforms.route.regex": "edp\\\\.cdc\\\\.orders\\\\.(.*)",
  "transforms.route.replacement": "edp.cdc.orders.$1",
  "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
  "transforms.unwrap.add.fields": "op,source.ts_ms,source.lsn"
}
\`\`\`

### MySQL (Binlog)

\`\`\`json
{
  "connector.class": "io.debezium.connector.mysql.MySqlConnector",
  "database.hostname": "payments-db.internal",
  "database.port": "3306",
  "database.user": "debezium",
  "database.password": "\${file:/run/secrets/debezium-mysql}",
  "database.server.id": "10001",
  "topic.prefix": "edp.cdc.payments",
  "table.include.list": "payments.transactions,payments.refunds",
  "snapshot.mode": "when_needed",
  "binlog.row.value.options": "PARTIAL_JSON"
}
\`\`\`

### MongoDB (Change Streams)

\`\`\`json
{
  "connector.class": "io.debezium.connector.mongodb.MongoDbConnector",
  "mongodb.connection.string": "mongodb://debezium:\${file:/run/secrets/debezium-mongo}@mongo-rs:27017/?replicaSet=edp",
  "topic.prefix": "edp.cdc.catalog",
  "collection.include.list": "catalog.products,catalog.categories",
  "snapshot.mode": "initial"
}
\`\`\`

## Change Event Format

### Debezium Envelope

\`\`\`json
{
  "before": { "id": 123, "status": "pending", "total": 99.99 },
  "after": { "id": 123, "status": "confirmed", "total": 99.99 },
  "source": {
    "version": "2.5.0",
    "connector": "postgresql",
    "name": "edp.cdc.orders",
    "ts_ms": 1734567890123,
    "snapshot": "false",
    "db": "orders",
    "schema": "public",
    "table": "orders",
    "lsn": 123456789
  },
  "op": "u",  // c=create, u=update, d=delete, r=read (snapshot)
  "ts_ms": 1734567890456
}
\`\`\`

### After Unwrap Transform

\`\`\`json
{
  "id": 123,
  "status": "confirmed",
  "total": 99.99,
  "__op": "u",
  "__source_ts_ms": 1734567890123,
  "__lsn": 123456789
}
\`\`\`

## Operational Procedures

### Adding a New CDC Source

1. Create database user with replication privileges
2. Configure replication slot (PostgreSQL) or enable binlog (MySQL)
3. Register Debezium connector via Kafka Connect REST API
4. Initial snapshot runs automatically (can take hours for large tables)
5. Monitor: snapshot progress, lag, error count
6. After snapshot: connector switches to streaming mode

### Handling Schema Changes

DDL changes in source databases:
- **Add column**: Automatically captured, schema evolves in registry
- **Rename column**: Treated as drop + add (potential data issue)
- **Drop column**: Automatically captured, null in new events
- **Change column type**: May cause connector failure, requires restart

Best practice: Coordinate DDL changes with CDC team:
1. Announce DDL change in #edp-changes Slack channel
2. Wait for ack from CDC operator
3. Apply DDL
4. Verify connector health
5. Verify downstream consumers handle new schema

### Connector Failures

If a connector fails:
1. Check connector status: \`GET /connectors/{name}/status\`
2. Check task logs: \`GET /connectors/{name}/tasks/0/status\`
3. Common failures:
   - Replication slot dropped → re-snapshot required
   - Database connection lost → auto-retry (up to max.retries)
   - Schema change incompatible → restart with schema update
   - WAL retention exceeded → re-snapshot required

### Replication Lag

Monitor CDC lag: \`source.ts_ms\` vs current time

| Lag | Severity | Action |
|-----|----------|--------|
| <30s | Normal | None |
| 30s-5min | Warning | Monitor, may be transient |
| 5min-30min | High | Check connector tasks, database load |
| >30min | Critical | Potential data loss risk, escalate |

## Security

- Debezium users have SELECT + REPLICATION only (no INSERT/UPDATE/DELETE)
- Credentials stored in Vault, mounted as files
- SSL/TLS for all database connections
- Network policies restrict connector pods to database endpoints only
- CDC events may contain PII — same masking rules as event ingestion
`,
));


newDocs.push(makeDoc(
  "gamma-svc-query", "document",
  "Service Spec: Event Query Service (edp-query)",
  "services", "phase-3",
  `# Service Specification: Event Query Service (edp-query)

## Overview

The Event Query Service provides a read API for querying events stored in the Enterprise Data
Platform. It supports both real-time queries (from Kafka + Redis) and historical queries
(from the data lake via Trino).

## API

### Real-Time Query (Last 48 Hours)

\`\`\`
GET /v1/events/{source}/{entity}
  ?after=<iso-timestamp>
  &before=<iso-timestamp>
  &entity_id=<id>
  &correlation_id=<id>
  &limit=100
  &cursor=<opaque-cursor>
\`\`\`

Response:
\`\`\`json
{
  "events": [...],
  "cursor": "eyJvZmZzZXQiOjEwMH0=",
  "has_more": true,
  "query_mode": "realtime"
}
\`\`\`

### Historical Query (Beyond 48 Hours)

Same API, automatically routes to data lake when:
- \`after\` timestamp is >48 hours ago
- No entity_id filter (broad query)
- Query spans more than 48 hours

\`\`\`json
{
  "events": [...],
  "cursor": "eyJwYWdlIjoyfQ==",
  "has_more": false,
  "query_mode": "historical",
  "query_engine": "trino",
  "execution_time_ms": 2340
}
\`\`\`

### Event Replay

\`\`\`
POST /v1/events/{source}/{entity}/replay
{
  "from": "2025-12-01T00:00:00Z",
  "to": "2025-12-15T23:59:59Z",
  "target_topic": "edp.replay.{service}.{entity}",
  "filter": {
    "entity_id": ["id1", "id2"],
    "event_type": ["order_created", "order_updated"]
  },
  "rate_limit_events_per_second": 1000
}
\`\`\`

## Architecture

### Query Routing

\`\`\`
                       Query Router
                          │
            ┌─────────────┼─────────────┐
            ↓             ↓             ↓
      Redis Cache    Kafka (recent)   Trino (historical)
      (entity lookup)  (stream scan)   (data lake query)
\`\`\`

### Redis Layer (Sub-Second Queries)

For entity-level queries:
- Key: \`edp:entity:{source}:{entity}:{entity_id}\`
- Value: Latest N events (sorted set by timestamp)
- TTL: 24 hours
- Populated by consumer sidecar on edp-query instances

### Kafka Layer (Real-Time Scan)

For time-range queries within retention window:
- Uses admin client to find offsets for time range
- Creates temporary consumer group
- Scans partitions in parallel
- Filters events server-side
- Timeout: 30 seconds

### Trino Layer (Historical)

For queries beyond Kafka retention:
- Translates API query to Trino SQL
- Queries Iceberg tables on data lake
- Pushes predicates to Parquet (partition pruning + predicate pushdown)
- Result streaming back to client

## Performance

| Query Type | Latency (p50) | Latency (p99) | Max Results |
|-----------|---------------|---------------|-------------|
| Redis entity lookup | 5ms | 20ms | 100 |
| Kafka time scan (1 min) | 200ms | 1s | 10,000 |
| Kafka time scan (1 hour) | 2s | 10s | 100,000 |
| Trino historical (1 day) | 3s | 15s | 1,000,000 |
| Trino historical (30 days) | 10s | 60s | 10,000,000 |

### Caching

Query results are cached for repeated queries:
- Cache key: hash of query parameters
- Cache TTL: 60 seconds (real-time), 5 minutes (historical)
- Cache invalidation: not needed (append-only data)

## Monitoring

\`\`\`
edp_query_requests_total{source, entity, mode, status}
edp_query_latency_seconds{source, entity, mode, quantile}
edp_query_results_count{source, entity, mode}
edp_query_redis_hit_ratio{source, entity}
edp_query_trino_execution_seconds{source, entity, quantile}
edp_query_replay_events_total{source, entity, status}
edp_query_replay_active{source, entity}
\`\`\`
`,
));


// ============================================================
// Deep-Dive Design Documents (~4K tokens each)
// ============================================================

newDocs.push(makeDoc(
  "gamma-design-exactly-once", "document",
  "Design Doc: Exactly-Once Event Processing — Implementation Details",
  "architecture", "phase-2",
  `# Design Doc: Exactly-Once Event Processing

## Context

ADR-005 decided to implement exactly-once semantics for the EDP. This document provides the
detailed implementation design covering all layers of the stack.

## Problem Statement

Financial events (payments, refunds, settlements) require exactly-once processing guarantees.
Duplicate processing can lead to:
- Double charges to customers
- Incorrect financial reporting
- Regulatory compliance violations (SOX, PCI-DSS)

## Solution Overview

The exactly-once guarantee spans three layers:

1. **Producer → Kafka**: Kafka producer idempotency
2. **Kafka → Consumer**: Kafka transactions
3. **Consumer → Sink**: Transactional outbox pattern

### Layer 1: Producer Idempotency

Kafka producer configuration:
\`\`\`yaml
enable.idempotence: true
acks: all
retries: Integer.MAX_VALUE
max.in.flight.requests.per.connection: 5
\`\`\`

This guarantees:
- Each produce is assigned a sequence number
- Broker deduplicates by (PID, sequence)
- No duplicates even with retries
- Ordering maintained within partition

Note: Producer idempotency is per-session. A producer restart gets a new PID.
For cross-session deduplication, we use the idempotency key in Redis (see Ingestion Service spec).

### Layer 2: Kafka Transactions

For read-process-write pipelines (e.g., edp-transform):

\`\`\`java
consumer.subscribe(inputTopics);
producer.initTransactions();

while (true) {
    ConsumerRecords<String, Event> records = consumer.poll(Duration.ofMillis(100));

    producer.beginTransaction();
    try {
        for (ConsumerRecord<String, Event> record : records) {
            Event transformed = transform(record.value());
            producer.send(new ProducerRecord<>(outputTopic, record.key(), transformed));
        }
        // Commit consumer offsets within the same transaction
        producer.sendOffsetsToTransaction(
            currentOffsets(records),
            consumer.groupMetadata()
        );
        producer.commitTransaction();
    } catch (Exception e) {
        producer.abortTransaction();
        // Consumer will re-fetch from last committed offset
    }
}
\`\`\`

Transaction guarantees:
- Output records and consumer offsets are committed atomically
- On failure, both are rolled back
- Downstream consumers with \`isolation.level: read_committed\` only see committed records

### Transaction IDs

Each transactional producer needs a stable \`transactional.id\`:
\`\`\`
transactional.id: edp.tx.{service}.{input-topic}.{partition}
\`\`\`

This ensures:
- Fencing of zombie producers (old instances with same tx.id)
- Automatic abort of in-flight transactions from previous incarnation
- Exactly one active producer per partition

### Layer 3: Transactional Outbox

For consumers that write to external stores (databases, APIs):

\`\`\`sql
-- In the same database transaction:
BEGIN;
  -- Process the event
  UPDATE orders SET status = 'confirmed' WHERE id = 123;

  -- Record the offset
  INSERT INTO kafka_offsets (topic, partition, offset, consumer_group)
  VALUES ('edp.events.payments.transactions', 7, 456789, 'payment-processor')
  ON CONFLICT (topic, partition, consumer_group)
  DO UPDATE SET offset = EXCLUDED.offset;
COMMIT;
\`\`\`

On restart:
1. Read committed offsets from database
2. Seek consumer to those offsets
3. Resume processing (no duplicates, no gaps)

## Performance Impact

### Overhead

| Component | Latency Overhead | Throughput Impact |
|-----------|-----------------|-------------------|
| Producer idempotency | ~0ms | ~0% |
| Kafka transactions | +5-10ms per batch | -10% to -20% |
| Transactional outbox | +2-5ms per event | -5% to -10% |

### Tuning

Transaction batch size is the key tuning parameter:
- Small batches: lower latency, more transaction overhead
- Large batches: higher latency, better throughput
- Recommended: 100-1000 events per transaction, 100ms max batch time

## Testing Strategy

### Unit Tests

- Verify transaction commit/abort semantics
- Verify offset tracking in outbox
- Verify zombie fencing (two producers, same tx.id)

### Integration Tests

- Start transaction, produce, commit → verify consumer reads
- Start transaction, produce, abort → verify consumer doesn't read
- Kill producer mid-transaction → verify new producer fences old one
- Kill consumer mid-batch → verify restart from correct offset

### Chaos Tests

- Network partition between consumer and Kafka during transaction
- Database failure during outbox write
- Schema Registry unavailable during deserialization
- Kafka broker failure during transaction

## Rollout Plan

Phase 1: Producer idempotency (already enabled for all producers)
Phase 2: Kafka transactions for edp-transform (financial pipelines only)
Phase 3: Transactional outbox for payment-processor
Phase 4: Extend to all financial consumers

## Risks

| Risk | Mitigation |
|------|-----------|
| Transaction timeout kills long batches | Reduce batch size for slow consumers |
| Dead transaction blocks partition | Transaction timeout = 60s, auto-abort after |
| Outbox table grows unbounded | Periodic cleanup of old offsets |
| Two instances with same tx.id = fencing | Container orchestrator ensures single instance per partition |
`,
));


newDocs.push(makeDoc(
  "gamma-design-data-governance", "document",
  "Design Doc: Data Governance Framework for EDP",
  "governance", "phase-4",
  `# Design Doc: Data Governance Framework for Enterprise Data Platform

## Context

As the EDP handles data from multiple business domains (ecommerce, payments, logistics, HR),
we need a comprehensive data governance framework to ensure data quality, privacy compliance,
and discoverability.

## Data Catalog

### Technology: DataHub (LinkedIn Open Source)

Selected over alternatives:
- Apache Atlas: Too Hadoop-centric, complex deployment
- Amundsen: Lighter but less feature-rich
- DataHub: Best balance of features, active community, Kafka-native

### Metadata Ingestion

Sources of metadata:
1. **Schema Registry**: Event schemas, versions, compatibility rules
2. **Iceberg Catalog**: Table schemas, partitions, statistics
3. **dbt models**: Transformation lineage, documentation, tests
4. **PagerDuty**: Ownership, on-call information
5. **GitHub**: Code ownership (CODEOWNERS), documentation

### Data Lineage

Tracked at two levels:

**Technical lineage** (automated):
- Kafka topic → topic relationships (via Connect/Transform configs)
- Database → Kafka (via CDC connector configs)
- Kafka → Data Lake (via sink connector configs)
- dbt model dependencies (via dbt manifest)

**Business lineage** (manual + automated):
- Business process → data domain mapping
- Data product ownership
- Compliance classification (PII, financial, health)

### Data Quality

Quality rules defined per dataset:
\`\`\`yaml
dataset: edp.events.ecommerce.orders
quality_rules:
  - name: order-completeness
    type: completeness
    columns: [order_id, customer_id, total, created_at]
    threshold: 0.999  # 99.9% non-null
  - name: order-freshness
    type: freshness
    max_age: 1h
  - name: order-volume
    type: volume
    min_records_per_hour: 1000
    max_records_per_hour: 100000
  - name: order-schema
    type: schema_drift
    baseline: "2025-12-01"
    max_new_columns: 5
  - name: total-positive
    type: custom_sql
    query: "SELECT COUNT(*) FROM {table} WHERE total <= 0"
    max_failures: 10
\`\`\`

Quality scores:
- Calculated hourly per dataset
- Published as metrics (\`edp_data_quality_score{dataset}\`)
- Alert on score drop below threshold
- Dashboard showing quality trends

## Privacy & Compliance

### PII Classification

All event fields are classified:
\`\`\`
Level 0: Public (product names, categories)
Level 1: Internal (order totals, timestamps)
Level 2: Confidential (email, phone, IP address)
Level 3: Restricted (SSN, credit card, health data)
\`\`\`

Classification is stored in:
- Schema Registry (field-level annotations)
- DataHub (propagated via lineage)
- Iceberg table properties (column-level)

### PII Processing Rules

| Level | At Rest | In Transit | Access | Retention |
|-------|---------|-----------|--------|-----------|
| 0 | No encryption | TLS | All teams | Indefinite |
| 1 | Disk encryption | TLS | Authenticated | 2 years |
| 2 | Field encryption | TLS + field encryption | Need-to-know | 1 year |
| 3 | Tokenization | TLS + tokenization | Explicit approval | 90 days |

### GDPR Compliance

Right to Erasure (RTBE) flow:
1. Data subject request received via DPO portal
2. Request stored in \`edp.compliance.erasure-requests\` topic
3. Erasure worker identifies all events containing subject's PII
4. For Kafka: events already past retention window (no action needed for <48h data)
5. For Data Lake: Iceberg delete files created for matching rows
6. For Redis: keys matching subject ID deleted
7. For external systems: erasure API called
8. Completion logged to audit trail
9. DPO notified via email

### Data Retention

| Data Tier | Retention | Enforcement |
|-----------|-----------|-------------|
| Kafka (hot) | 48 hours | Topic config (retention.ms) |
| Redis (cache) | 24 hours | TTL on keys |
| Data Lake (warm) | 2 years | Iceberg snapshot expiration |
| Data Lake (cold) | 7 years | S3 lifecycle policy |
| Audit logs | 7 years | Immutable storage (S3 Object Lock) |

## Access Control

### Self-Service Access

Teams request access via DataHub:
1. Browse datasets in catalog
2. Request access (specifying use case)
3. Data owner reviews and approves/denies
4. Access provisioned automatically:
   - Kafka: ACLs updated
   - Data Lake: IAM role updated
   - APIs: API key scope updated
5. Access reviewed quarterly (automated reminder)

### Audit Trail

All data access is logged:
- Who accessed what data, when, from where
- Query text (for Trino/SQL queries)
- Result row count
- Purpose (from access request)
- Stored in immutable audit log (S3 Object Lock)
- Retained for 7 years (regulatory requirement)

## Data Products

### Product Definition

Each data product has:
\`\`\`yaml
product:
  name: Customer Orders
  domain: ecommerce
  owner: ecommerce-platform-team
  tier: tier-1  # SLO commitment level
  description: "Real-time order events from all channels"
  slo:
    availability: 99.95%
    freshness: <5 minutes
    quality_score: >0.99
  interfaces:
    - type: kafka_topic
      name: edp.events.ecommerce.orders
    - type: iceberg_table
      name: edp.warehouse.ecommerce.orders
    - type: api
      path: /v1/events/ecommerce/orders
  documentation:
    - url: https://docs.internal/edp/customer-orders
    - url: https://datahub.internal/dataset/edp.events.ecommerce.orders
\`\`\`

### Product Quality SLO

Each tier has different SLO commitments:

| Tier | Availability | Freshness | Quality | Response Time |
|------|-------------|-----------|---------|---------------|
| Tier 1 | 99.95% | <5 min | >99% | <1s |
| Tier 2 | 99.9% | <30 min | >95% | <5s |
| Tier 3 | 99.5% | <2 hours | >90% | <30s |

## Implementation Plan

Phase 1: DataHub deployment + Schema Registry integration (4 weeks)
Phase 2: PII classification of existing schemas (2 weeks)
Phase 3: Data quality rules for tier-1 products (3 weeks)
Phase 4: Self-service access portal (4 weeks)
Phase 5: GDPR erasure automation (3 weeks)
Phase 6: Data lineage automation (ongoing)
`,
));


newDocs.push(makeDoc(
  "gamma-design-disaster-recovery", "document",
  "Design Doc: EDP Disaster Recovery Plan",
  "operations", "phase-5",
  `# Design Doc: Enterprise Data Platform Disaster Recovery Plan

## Context

The EDP is a critical platform processing financial, operational, and compliance-relevant data.
This document defines the disaster recovery (DR) strategy for complete and partial failures.

## Recovery Objectives

| Component | RPO (Recovery Point) | RTO (Recovery Time) |
|-----------|---------------------|---------------------|
| Kafka cluster | 0 (replicated) | 30 minutes |
| Schema Registry | 0 (stored in Kafka) | 15 minutes |
| PostgreSQL (source DBs) | 5 minutes (WAL streaming) | 1 hour |
| Data Lake (S3/Iceberg) | 1 hour (Iceberg snapshots) | 2 hours |
| Redis (cache) | N/A (can be rebuilt) | 10 minutes |
| Monitoring stack | N/A (can be rebuilt) | 30 minutes |

## Failure Scenarios

### Scenario 1: Single Kafka Broker Failure

**Impact**: Partitions on failed broker become temporarily unavailable
**Detection**: Broker health check fails, under-replicated partitions alert
**Recovery**:
1. Automatic leader election for affected partitions (~10s)
2. Under-replicated partitions detected by monitoring
3. If broker recovers: automatic catch-up from replicas
4. If broker lost: replace broker, reassign partitions

**Data loss**: None (min.insync.replicas = 2, replication factor = 3)

### Scenario 2: Complete Kafka Cluster Failure

**Impact**: All event processing stops
**Detection**: All brokers unreachable, circuit breakers open across all services
**Recovery**:
1. Assess cause (network, infrastructure, data corruption)
2. If infrastructure (e.g., power): wait for recovery, brokers auto-start
3. If data corruption: restore from Tiered Storage (S3)
4. If complete loss: rebuild cluster from scratch

**Recovery steps (complete loss)**:
\`\`\`bash
# 1. Deploy new Kafka cluster (via Terraform)
terraform apply -target=module.kafka

# 2. Wait for cluster to form (KRaft controller election)
kafka-metadata.sh --snapshot /var/kafka/metadata/__cluster_metadata-0/quorum-state

# 3. Restore topic configurations from Git
./scripts/restore-topic-configs.sh

# 4. Restore Schema Registry data
# _schemas topic recreated by restore script
./scripts/restore-schema-registry.sh

# 5. CDC connectors will re-snapshot source databases
# (offset reset to beginning for each connector)

# 6. Event producers will retry (circuit breaker will close)
# Some events may be in DLQ during outage

# 7. Data lake sink will catch up from Kafka
# (gap in data lake = duration of outage)
\`\`\`

**Data loss**: Events produced during outage stored in producer DLQ/retry

### Scenario 3: Data Lake Corruption

**Impact**: Historical queries return incorrect data, BI reports affected
**Detection**: Data quality checks fail, user reports
**Recovery**:
1. Identify corrupted tables/partitions
2. Use Iceberg time travel to roll back to known-good snapshot
3. Re-process from Kafka if within retention window
4. If beyond retention: restore from S3 backup (hourly snapshots)

\`\`\`sql
-- Roll back to previous snapshot
CALL system.rollback_to_snapshot('edp.warehouse.ecommerce.orders', 12345678);

-- Or roll back to a timestamp
CALL system.rollback_to_timestamp('edp.warehouse.ecommerce.orders', TIMESTAMP '2025-12-14 23:00:00');
\`\`\`

### Scenario 4: Region-Wide Outage (AWS us-east-1)

**Impact**: All EDP services unavailable
**Detection**: Automatic (health checks from external monitoring)
**Recovery**:
1. DNS failover to DR region (us-west-2) — automated via Route53 health checks
2. DR Kafka cluster (MirrorMaker 2 async replication, ~30s lag)
3. DR Schema Registry (synced via MM2, _schemas topic mirrored)
4. DR databases (PostgreSQL streaming replication, ~5 min lag)
5. DR data lake (S3 cross-region replication, ~1 hour lag)

**RPO**: 30 seconds (Kafka), 5 minutes (database), 1 hour (data lake)
**RTO**: 15 minutes (DNS TTL) + 30 minutes (service startup)

### Scenario 5: Security Breach / Data Exfiltration

**Impact**: Potential data exposure, compliance violation
**Detection**: Security monitoring, audit log analysis, user report
**Response**:
1. Invoke security incident response plan (SIRP)
2. Isolate affected systems (network segmentation)
3. Assess scope of exposure
4. Rotate all credentials (API keys, database passwords, certificates)
5. Rebuild affected systems from known-good state
6. Notify affected parties (GDPR: 72-hour window)
7. Post-incident review and remediation

## DR Testing

### Quarterly Tests

| Test | Scope | Expected Outcome |
|------|-------|------------------|
| Broker failure | Kill one broker in staging | Automatic recovery <5 min |
| Consumer failure | Kill all instances of one consumer | Rebalance <2 min, no data loss |
| Schema Registry failure | Kill primary SR instance | Automatic leader election <30s |
| Network partition | Split staging cluster | Partitions with quorum continue, minority pauses |
| Region failover | Simulate us-east-1 failure | DR active within 45 min |

### Annual Tests

| Test | Scope | Expected Outcome |
|------|-------|------------------|
| Full cluster rebuild | Destroy and rebuild staging Kafka | Operational within 4 hours |
| Data lake restore | Corrupt data lake, restore from backup | Restored within 6 hours |
| Credential rotation | Rotate all credentials simultaneously | <5 min service disruption |

## Communication Plan

During an incident:
1. **#edp-incidents** Slack channel: Real-time updates
2. **Status page**: External stakeholder updates
3. **PagerDuty**: On-call engineer notification
4. **Email**: Executive summary (for P1 incidents)

Escalation:
- 0-15 min: Primary on-call engineer
- 15-30 min: Secondary on-call + team lead
- 30-60 min: Engineering manager
- 60+ min: VP Engineering + stakeholder communication
`,
));


newDocs.push(makeDoc(
  "gamma-design-capacity", "document",
  "Design Doc: EDP Capacity Planning Model",
  "operations", "phase-5",
  `# Design Doc: EDP Capacity Planning Model

## Context

The Enterprise Data Platform must handle current load and plan for 3x growth over the next
18 months. This document defines the capacity model and scaling strategy.

## Current Load Profile

### Event Volume

| Source | Events/sec (avg) | Events/sec (peak) | Event Size (avg) | Daily Volume |
|--------|-----------------|-------------------|-------------------|-------------|
| E-commerce | 2,000 | 15,000 | 1.2 KB | 172M events |
| Payments | 500 | 5,000 | 0.8 KB | 43M events |
| Logistics | 1,000 | 8,000 | 1.5 KB | 86M events |
| IoT/Sensors | 5,000 | 30,000 | 0.3 KB | 432M events |
| User Analytics | 3,000 | 20,000 | 0.5 KB | 259M events |
| CDC (all sources) | 1,500 | 10,000 | 1.0 KB | 129M events |
| **Total** | **13,000** | **88,000** | **0.8 KB (avg)** | **1.12B events** |

### Data Growth

| Store | Daily Growth | Monthly Growth | 18-Month Projection |
|-------|-------------|----------------|---------------------|
| Kafka (48h retention) | 86 GB | N/A (rolling) | 258 GB (3x) |
| Data Lake (Parquet) | 25 GB | 750 GB | 13.5 TB |
| Redis (cache) | N/A (fixed) | N/A (fixed) | 64 GB |
| PostgreSQL (metadata) | 500 MB | 15 GB | 270 GB |

## Kafka Cluster Sizing

### Current Cluster

- 5 brokers, 3 controllers (KRaft mode)
- Each broker: 8 vCPU, 32 GB RAM, 2 TB NVMe SSD
- Network: 10 Gbps per broker

### Capacity Calculations

**Disk throughput per broker:**
\`\`\`
Write: 13,000 events/s × 0.8 KB × 3 (replication) / 5 brokers = 6.2 MB/s per broker
Read: ~3x write (consumers + replication) = 18.6 MB/s per broker
Total I/O: ~25 MB/s per broker (well within NVMe capability)
\`\`\`

**Disk space per broker:**
\`\`\`
Daily production: 13,000 × 86,400 × 0.8 KB = 898 GB/day (pre-replication)
With replication (RF=3): 2,694 GB/day across cluster = 539 GB/day per broker
48-hour retention: 1,078 GB per broker
Available: 2,000 GB per broker → 46% utilization
\`\`\`

**Network per broker:**
\`\`\`
Ingest: 6.2 MB/s = 49.6 Mbps
Replication: 4.1 MB/s = 32.8 Mbps (2 replicas × 2.05 MB/s)
Consumer reads: ~18.6 MB/s = 148.8 Mbps
Total: ~231 Mbps per broker (2.3% of 10 Gbps)
\`\`\`

### 3x Growth Plan

At 3x load (39,000 events/s avg, 264,000 peak):
- Disk I/O: 75 MB/s per broker → add 2 brokers (7 total)
- Disk space: 1,617 GB per broker (with 7 brokers) → upgrade to 4 TB NVMe
- Network: 693 Mbps per broker → still well within 10 Gbps
- RAM: Increase page cache → 64 GB per broker

**Scaling triggers:**
| Metric | Warning | Scale-Up |
|--------|---------|----------|
| Disk utilization | >60% | >75% |
| Network utilization | >40% | >60% |
| CPU utilization | >60% | >75% |
| Consumer lag (all groups) | >5 min | >15 min |
| Produce latency (p99) | >50ms | >100ms |

## Service Scaling

### Horizontal Scaling

| Service | Current | 3x Target | Scaling Factor |
|---------|---------|-----------|----------------|
| edp-ingest | 3 pods | 10 pods | Events/sec per pod |
| edp-transform | 12 pods | 36 pods | Partitions to process |
| edp-consumer (per svc) | 4 pods | 12 pods | Partitions per topic |
| edp-gateway | 3 pods | 10 pods | Request rate |
| edp-query | 3 pods | 8 pods | Query concurrency |
| edp-lake-sink | 4 pods | 12 pods | Write throughput |

### Auto-Scaling Rules

\`\`\`yaml
# HPA for edp-ingest
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: edp-ingest
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: edp-ingest
  minReplicas: 3
  maxReplicas: 15
  metrics:
    - type: Pods
      pods:
        metric:
          name: edp_ingest_events_total
        target:
          type: AverageValue
          averageValue: "5000"  # Scale when >5000 events/s per pod
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
\`\`\`

## Cost Model

### Current Monthly Cost

| Component | Instances | Cost/Instance | Monthly Total |
|-----------|----------|---------------|---------------|
| Kafka brokers | 5 | $800 | $4,000 |
| KRaft controllers | 3 | $400 | $1,200 |
| K8s workers (services) | 10 | $600 | $6,000 |
| Redis cluster | 3 | $300 | $900 |
| S3 (data lake) | N/A | $0.023/GB | $600 |
| Trino cluster | 3 | $500 | $1,500 |
| Monitoring | 3 | $400 | $1,200 |
| Network (inter-AZ) | N/A | $0.01/GB | $500 |
| **Total** | | | **$15,900/mo** |

### 3x Growth Cost

| Component | Change | New Monthly |
|-----------|--------|-------------|
| Kafka brokers | +2 (larger) | $7,000 |
| K8s workers | +15 | $15,000 |
| S3 | 3x growth | $1,800 |
| Trino | +2 (larger) | $3,500 |
| Other | ~1.5x | $5,700 |
| **Total** | | **$33,000/mo** |

**Cost per million events**: $0.47 (current) → $0.28 (at 3x scale)

## Capacity Review Cadence

- **Weekly**: Automated capacity dashboard review (threshold alerts)
- **Monthly**: Engineering review of growth trends
- **Quarterly**: Formal capacity planning meeting with projected 6-month needs
- **Annually**: Full capacity model refresh with 18-month projections
`,
));


newDocs.push(makeDoc(
  "gamma-design-migration-strategy", "document",
  "Design Doc: Legacy System Migration Strategy",
  "architecture", "phase-1",
  `# Design Doc: Legacy System Migration Strategy

## Context

The Enterprise Data Platform replaces the existing point-to-point integration architecture.
This document defines the migration strategy for moving ~45 existing integrations to the EDP.

## Current State

### Existing Architecture

\`\`\`
┌──────────┐     HTTP    ┌──────────┐
│ System A │─────────────│ System B │
└──────────┘             └──────────┘
     │                        │
     │ FTP (nightly)          │ SOAP
     ↓                        ↓
┌──────────┐     DB Link ┌──────────┐
│ System C │─────────────│ System D │
└──────────┘             └──────────┘
\`\`\`

Problems:
- 45 point-to-point integrations
- No central visibility
- No schema governance
- Inconsistent error handling
- Nightly batch processes (up to 12-hour delay)
- 3 different data formats (XML, CSV, JSON)
- No monitoring (failures discovered by end users)

### Target Architecture

\`\`\`
┌──────────┐  events  ┌─────┐  events  ┌──────────┐
│ System A │─────────→│ EDP │────────→│ System B │
└──────────┘          │     │          └──────────┘
                      │     │
┌──────────┐  CDC     │     │  events  ┌──────────┐
│ System C │─────────→│     │────────→│ System D │
└──────────┘          └─────┘          └──────────┘
\`\`\`

## Migration Waves

### Wave 0: Foundation (Complete)
- EDP infrastructure deployed
- Kafka cluster operational
- Schema Registry configured
- Monitoring stack running
- Gateway operational
- ✅ Duration: 8 weeks

### Wave 1: E-commerce (In Progress)
Priority: Highest revenue impact

Integrations to migrate:
1. Order system → Payment system (HTTP → Kafka events)
2. Order system → Warehouse (FTP → CDC + events)
3. Payment system → Finance (DB link → CDC + events)
4. Warehouse → Logistics (SOAP → events)

Migration pattern per integration:
1. Deploy CDC connector for source system
2. Deploy transformation pipeline
3. Deploy consumer adapter for target system
4. Run in shadow mode (parallel with existing integration)
5. Validate data parity (automated comparison)
6. Switch over (with rollback plan)
7. Decommission old integration (after 2-week soak)

Estimated duration: 6 weeks

### Wave 2: Payments & Finance
Integrations: 8
Regulatory considerations: PCI-DSS, SOX audit trail
Estimated duration: 8 weeks (extra time for compliance)

### Wave 3: Logistics & Warehousing
Integrations: 12
Challenge: Legacy systems with limited API support
Estimated duration: 8 weeks

### Wave 4: HR & Admin
Integrations: 7
Privacy considerations: Employee PII (GDPR Level 3)
Estimated duration: 4 weeks

### Wave 5: Analytics & Reporting
Integrations: 10
Pattern: All batch → streaming migration
Estimated duration: 6 weeks

## Migration Patterns

### Pattern A: API → Event (Synchronous to Asynchronous)

For integrations currently using HTTP/SOAP:
1. Source system publishes events instead of calling target API
2. Target system consumes events and processes asynchronously
3. If synchronous response needed: request/reply pattern via Kafka

### Pattern B: File Transfer → CDC + Event

For integrations currently using FTP/SFTP:
1. Deploy CDC connector on source database
2. Transform CDC events to business events
3. Target system consumes events in real-time
4. Benefits: from 24-hour delay to <1 minute

### Pattern C: Database Link → CDC

For integrations using shared databases or DB links:
1. Deploy CDC connector on source database
2. Create materialized view in target database (via consumer)
3. Eventually: target system reads from own database
4. Eliminates cross-system database coupling

## Rollback Strategy

Each migration has a rollback plan:
- **Shadow period** (2 weeks): Both old and new run simultaneously
- **Quick rollback** (1 hour): Re-enable old integration, disable new
- **Data reconciliation**: Compare records processed during switchover
- **Rollback trigger**: Any data discrepancy >0.01% or latency >5x baseline

## Success Criteria

Each migration is considered successful when:
1. Data parity: >99.99% match between old and new paths
2. Latency: Within 2x of old path (real-time replaces batch: automatic win)
3. Error rate: <0.01% of events
4. No manual intervention needed for 7 consecutive days
5. Old integration safely decommissioned

## Timeline

| Wave | Start | End | Status |
|------|-------|-----|--------|
| Wave 0 | 2025-01 | 2025-03 | ✅ Complete |
| Wave 1 | 2025-04 | 2025-05 | 🔄 In Progress |
| Wave 2 | 2025-06 | 2025-07 | Planned |
| Wave 3 | 2025-08 | 2025-09 | Planned |
| Wave 4 | 2025-10 | 2025-10 | Planned |
| Wave 5 | 2025-11 | 2025-12 | Planned |

Total migration duration: ~12 months
`,
));


// ============================================================
// Meeting Notes / RFCs (~3K tokens each)
// ============================================================

newDocs.push(makeDoc(
  "gamma-rfc-retention-policy", "document",
  "RFC: Event Retention Policy — 48h vs 72h vs 7d",
  "governance", "phase-4",
  `# RFC: Event Retention Policy for Enterprise Data Platform

## Status: UNDER REVIEW

**Author**: Data Platform Team
**Reviewers**: Security, Compliance, Infrastructure, Finance
**Created**: 2025-10-15
**Updated**: 2025-11-20

## Summary

This RFC proposes standardizing event retention in Kafka at 48 hours for all topics,
with exceptions for compliance-mandated topics. It addresses the ongoing debate about
whether to extend retention to 72 hours or 7 days.

## Background

Current retention policy (ADR-007): 48 hours for all topics.
Proposed change (ADR-008 DRAFT): 72 hours for operational topics, 48 hours for analytics.

The debate has been ongoing since October. Key stakeholders have different requirements:

### Arguments for 48 Hours (Current)

1. **Cost**: Kafka storage directly proportional to retention
   - Current: 86 GB per broker (48h)
   - 72h: 129 GB per broker (+50%)
   - 7d: 301 GB per broker (+250%)
2. **Simplicity**: One retention policy, no topic-level exceptions
3. **Data lake covers longer queries**: Events older than 48h queryable from Iceberg
4. **Faster recovery**: Less data to replay after consumer restart

### Arguments for 72 Hours (Proposed)

1. **Weekend coverage**: 48h misses events produced Friday evening by Monday morning
2. **Incident investigation**: Most incidents discovered within 72 hours
3. **Consumer lag tolerance**: More buffer for consumer failures
4. **CDC re-snapshot avoidance**: 72h allows most connectors to catch up without re-snapshot

### Arguments for 7 Days (Not Formally Proposed)

1. **Compliance**: Some regulations require 7-day operational data retention
2. **Flexibility**: Covers any reasonable consumer downtime
3. **Cost is manageable**: Additional ~215 GB per broker is not prohibitive

## Analysis

### Cost Impact

| Retention | Storage/Broker | Monthly Cost (5 brokers) | Monthly Cost (7 brokers, 3x) |
|-----------|---------------|--------------------------|------------------------------|
| 48h | 86 GB | $215 | $430 |
| 72h | 129 GB | $323 | $645 |
| 7d | 301 GB | $753 | $1,505 |

Storage cost is relatively small compared to total EDP cost ($15,900/mo).

### Operational Impact

| Scenario | 48h | 72h | 7d |
|----------|-----|-----|-----|
| Consumer down Friday→Monday | Re-snapshot | OK | OK |
| Incident investigation (typical) | Sometimes too short | Usually sufficient | Always sufficient |
| CDC connector failure | Risk of re-snapshot | Lower risk | Very low risk |
| Backup/restore time | ~30 min | ~45 min | ~2 hours |
| Cluster rebalance time | ~15 min | ~20 min | ~45 min |

### Compliance Review

From Legal/Compliance team:
- GDPR: Does not mandate minimum retention, but requires "no longer than necessary"
- PCI-DSS: Transaction data must be available for investigation — 7 days recommended
- SOX: Financial data audit trail — covered by data lake retention, not Kafka
- HIPAA: Not currently applicable (no health data in EDP)

## Recommendation

**Tiered retention:**

| Topic Category | Retention | Rationale |
|---------------|-----------|-----------|
| Financial (payments, settlements) | 7 days | PCI-DSS, high-value investigations |
| Operational (orders, logistics) | 72 hours | Weekend coverage, incident response |
| Analytics (clickstream, sensors) | 48 hours | High volume, cost-sensitive |
| CDC change events | 72 hours | Connector resilience |
| Internal (transform, DLQ) | 24 hours | Not needed longer, high volume |

## Open Questions

1. Should we use Kafka tiered storage (S3) for cost-effective long retention?
2. How does retention interact with GDPR erasure requests? (Events in retention can't be deleted)
3. Should DLQ topics have longer retention than regular topics?

## Next Steps

- [ ] Collect feedback from all stakeholders by 2025-12-01
- [ ] Update cost projections with tiered storage option
- [ ] Legal to confirm PCI-DSS retention requirements
- [ ] Present final recommendation at Architecture Review Board
`,
));


newDocs.push(makeDoc(
  "gamma-meeting-schema-debate", "document",
  "Meeting Notes: Avro vs Protobuf Schema Format Decision",
  "architecture", "phase-4",
  `# Meeting Notes: Schema Format Decision

## Meeting Details
- **Date**: 2025-11-05
- **Attendees**: Data Platform Team, Backend Engineering, Mobile Team, ML Team
- **Duration**: 90 minutes
- **Scribe**: Jane Kim

## Background

The current EDP uses Apache Avro for all event schemas (per ADR-002). The mobile team has
proposed switching to Protocol Buffers (Protobuf) for new services, citing better tooling
and smaller wire size. This meeting discusses the trade-offs.

## Current State (Avro)

As documented in ADR-002 and the Protobuf proposal (SPEC-PROTO-001):

**Pros of current Avro setup:**
- Schema Registry integration is battle-tested
- JSON-compatible serialization for debugging
- Schema evolution rules well-understood
- All existing consumers expect Avro
- GenAvro codegen for Java/Kotlin works well

**Cons reported by teams:**
- Mobile: Avro libraries for Swift/Kotlin are limited
- ML: Avro → DataFrame conversion requires intermediate step
- DevEx: Schema Registry CLI is clunky
- Performance: Avro reflection-based deserialization is slower than Protobuf

## Protobuf Proposal Summary

**Wire format improvements:**
- 20-40% smaller than Avro binary for typical events
- Deterministic field ordering (Avro allows reordering)
- Better backward/forward compatibility semantics

**Tooling improvements:**
- First-class support in all languages (protoc plugins)
- gRPC integration (if we ever expose streaming APIs)
- buf CLI for linting, breaking change detection, code gen
- Generated code is more ergonomic than Avro

**Schema Registry support:**
- Confluent Schema Registry supports Protobuf (since 5.5)
- Same compatibility checking semantics
- Can coexist with Avro in the same registry

## Discussion

### Backend Engineering (Mark Chen)
"We have 120+ Avro schemas registered. Migration cost is non-trivial. The performance argument
isn't convincing — our bottleneck is Kafka I/O, not serialization."

### Mobile Team (Sarah Li)
"We're building a new mobile data SDK. Protobuf support is native in both iOS and Android.
We tried the Avro Swift library and it's unmaintained. For us this is blocking."

### ML Team (Raj Patel)
"We'd prefer Arrow format honestly, but between Avro and Protobuf, Protobuf is easier to convert.
However, we're fine with either — we have conversion layers regardless."

### Data Platform (Alex Thompson)
"The Schema Registry supports both. The real question is: do we want two serialization formats
in the same platform? That doubles the schema governance complexity."

### Architecture (Wei Liu)
"We could allow Protobuf for new topics while keeping Avro for existing. The transformation
pipeline would need to handle both — is that a significant effort?"

### Data Platform Response
"edp-transform already uses generic records internally. Supporting both input formats adds
complexity in the deserialization layer but doesn't affect transformation logic. Estimate:
2 weeks of development + 1 week testing."

## Key Points of Debate

1. **One format vs two**: Some participants argued for picking one; others argued coexistence
   is manageable with Schema Registry.

2. **Migration cost**: Migrating 120+ schemas is a 3-month project with risk of regression.
   No one volunteered to own this.

3. **Mobile SDK is blocking**: The mobile team's launch is blocked on this decision.
   They need a schema format supported in Swift/Kotlin without third-party maintenance risk.

4. **Wire size**: The 20-40% reduction matters for mobile (bandwidth-constrained), not for
   server-to-server (network is not the bottleneck).

5. **Governance complexity**: Managing compatibility rules across two formats requires
   tooling investment. buf for Protobuf, existing tools for Avro.

## Decisions

### Agreed
- Mobile team can use Protobuf for NEW topics published from mobile SDK
- Topic naming: \`edp.events.mobile.{entity}\` (new namespace)
- Schema Registry will store both Avro and Protobuf schemas
- All Protobuf schemas must pass buf lint checks before registration

### NOT Agreed (Deferred)
- Whether to migrate existing Avro schemas to Protobuf
- Whether new server-side services should use Protobuf
- Timeline for deprecating Avro (if ever)

### Action Items

| Action | Owner | Deadline |
|--------|-------|----------|
| Protobuf Schema Registry config | Data Platform | 2025-11-15 |
| buf CI integration | Data Platform | 2025-11-22 |
| Mobile SDK schema design | Mobile Team | 2025-11-30 |
| edp-transform dual-format support | Data Platform | 2025-12-15 |
| Update ADR-002 with Protobuf exception | Architecture | 2025-11-10 |

## Follow-Up

Next meeting: 2025-12-01 to review progress on action items and discuss whether Protobuf
should become the default for new server-side services.
`,
));


newDocs.push(makeDoc(
  "gamma-rfc-consumer-isolation", "document",
  "RFC: Consumer Isolation Tiers for Multi-Tenant EDP",
  "architecture", "phase-2",
  `# RFC: Consumer Isolation Tiers

## Status: APPROVED (2025-09-20)

## Summary

Defines three isolation tiers for EDP consumers, from shared infrastructure (Tier 1) to
dedicated Kafka clusters (Tier 3). Each tier has different SLOs, costs, and use cases.

## Problem

As the EDP scales to 20+ consuming services, we're seeing:
- Noisy neighbours: One consumer's lag triggers alerts for all
- Different SLO requirements: Financial services need higher guarantees
- Cost pressure: Not all consumers need dedicated resources
- Compliance: Some data must be physically isolated

## Proposed Tiers

### Tier 1: Shared (Default)

- Shared Kafka cluster
- Shared consumer infrastructure (K8s namespace: edp-consumers)
- Best-effort processing
- SLO: 99.5% availability, <30 min consumer lag

Use cases:
- Analytics consumers
- Non-critical enrichment pipelines
- Development/staging environments

Cost: Included in EDP platform fee

### Tier 2: Isolated (By Request)

- Shared Kafka cluster (with resource quotas per consumer group)
- Dedicated K8s namespace (resource limits, network policies)
- Guaranteed processing capacity
- SLO: 99.9% availability, <5 min consumer lag

Use cases:
- Order processing
- Logistics routing
- Real-time inventory

Kafka quotas:
\`\`\`
consumer_byte_rate: 10485760  # 10 MB/s per consumer group
request_percentage: 20  # Max 20% of broker request capacity
\`\`\`

Cost: $500/month per consumer group

### Tier 3: Dedicated (Compliance/Critical)

- Dedicated Kafka cluster (separate brokers)
- Dedicated K8s namespace + node pool (dedicated hardware)
- Physical isolation for compliance
- SLO: 99.95% availability, <1 min consumer lag

Use cases:
- Payment processing (PCI-DSS)
- Healthcare data (HIPAA)
- Critical financial reporting (SOX)

Infrastructure:
\`\`\`
Dedicated Kafka: 3 brokers, 1 controller
Dedicated nodes: 3 K8s worker nodes
Network: Dedicated VPC peering, no shared routes
Storage: Encrypted at rest with dedicated KMS key
\`\`\`

Cost: $3,000/month per consumer group

## Implementation

### Phase 1: Tier 1 + Tier 2 (Q1 2026)

1. Implement Kafka client quotas for consumer groups
2. Create K8s namespace template with resource limits
3. Build self-service onboarding (Terraform module)
4. Deploy monitoring per consumer group (existing metrics + group-level dashboards)

### Phase 2: Tier 3 (Q2 2026)

1. Multi-cluster Kafka management (Kubernetes operator)
2. Cross-cluster MirrorMaker 2 for data replication
3. Compliance documentation per cluster
4. Annual audit process for Tier 3 consumers

## Migration

Existing consumers:
- All current consumers assigned Tier 1 by default
- Payment-processor promoted to Tier 3 immediately (PCI-DSS)
- Order-enrichment promoted to Tier 2 (revenue-critical)
- No breaking changes — consumer code unchanged, only infrastructure

## Cost Summary

| Year 1 | Tier 1 | Tier 2 | Tier 3 |
|--------|--------|--------|--------|
| Consumers | 15 | 4 | 1 |
| Monthly cost | $0 | $2,000 | $3,000 |
| Annual cost | $0 | $24,000 | $36,000 |

Total Year 1 incremental cost: $60,000 (vs $0 today)
Covered by platform fee increase: $250/month per consuming team

## Approval

Approved by Architecture Review Board on 2025-09-20.
Implementation tracked in JIRA epic EDP-2345.
`,
));


newDocs.push(makeDoc(
  "gamma-meeting-incident-retro", "document",
  "Incident Retrospective: Double-Processing Event — INC-2025-456",
  "incidents", "phase-4",
  `# Incident Retrospective: INC-2025-456 — Double-Processing Event

## Summary

On 2025-11-22, the payment-processor consumer processed 847 payment events twice, resulting in
847 duplicate charges totaling $234,567.89. The issue was caused by a Kafka consumer group
rebalance during a deployment, combined with a bug in the idempotency check.

## Timeline (All times UTC)

- **14:00** - Payment-processor deployment started (rolling update)
- **14:02** - Consumer group rebalance triggered by new pods joining
- **14:02-14:05** - Partitions reassigned, offset commits from old pods lost
- **14:05** - New pods start consuming from last committed offset (5 minutes behind)
- **14:05-14:15** - 847 events re-processed (events from 13:57-14:02)
- **14:15** - Idempotency check SHOULD have caught duplicates but didn't (bug)
- **14:30** - Finance team notices duplicate charges in settlement batch
- **14:35** - Alert fires: "Anomalous payment volume detected"
- **14:40** - On-call engineer begins investigation
- **14:55** - Root cause identified: idempotency Redis TTL had expired for affected events
- **15:00** - Payment-processor scaled down to stop processing
- **15:15** - Refund process initiated for 847 affected customers
- **15:30** - Idempotency bug fix deployed (increased TTL from 1 hour to 24 hours)
- **16:00** - Payment-processor restarted with fix
- **18:00** - All 847 refunds processed
- **18:30** - Incident closed

## Root Cause

Two issues combined:

**Issue 1: Unsafe rebalance**
The payment-processor was configured with \`CooperativeStickyAssignor\` but the deployment
strategy created too many new pods at once, causing a full rebalance. Offsets committed
by dying pods were lost (committed to a pod that was shutting down, never reached Kafka).

**Issue 2: Idempotency TTL too short**
The deduplication cache in Redis had a TTL of 1 hour. Events processed at 13:57-14:02 had
their dedup entries created at processing time. By 14:05 (when re-processing started),
entries from 13:57-14:00 had expired (>1 hour old). The re-processed events were treated
as new.

## Impact

- 847 customers charged twice ($234,567.89 in duplicate charges)
- 847 refunds issued ($234,567.89 + $4,200 in goodwill credits)
- Customer trust impact: 23 support tickets, 3 social media complaints
- Engineering time: ~20 person-hours for investigation + fix + refund
- Financial: Net cost $4,200 (goodwill credits) + engineering time

## Corrective Actions

| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| Increase dedup TTL to 24 hours | Payment Team | 2025-11-22 | ✅ Done |
| Add deployment guard (max 1 pod change at a time) | Platform | 2025-12-01 | ✅ Done |
| Implement transactional outbox (ADR-005) | Payment Team | 2026-01-15 | In Progress |
| Add anomaly detection on payment volume | Data Platform | 2025-12-15 | ✅ Done |
| Pre-commit offset verification in consumer framework | Platform | 2026-01-01 | In Progress |
| Chaos test: consumer rebalance during deployment | QA | 2025-12-15 | Planned |

## Lessons Learned

1. **Dedup TTL must exceed maximum rebalance time + consumer lag**: The 1-hour TTL was set
   arbitrarily. It should be at least 48 hours (Kafka retention) to cover worst case.

2. **Financial consumers need Tier 3 isolation**: This incident wouldn't have happened with
   dedicated infrastructure (no rebalance from other consumers).

3. **Exactly-once processing is not optional for payments**: The current at-least-once +
   idempotency approach is fragile. ADR-005 (transactional outbox) should be prioritized.

4. **Deployment guards should be default for critical services**: The consumer framework
   should enforce safe deployment strategies.

5. **Anomaly detection should have caught this faster**: 847 duplicate payments in 10 minutes
   is a clear anomaly. The alert fired 15 minutes late because the detection window was 30 min.
`,
));


newDocs.push(makeDoc(
  "gamma-meeting-q4-review", "document",
  "Q4 2025 Architecture Review Board Notes — EDP Status",
  "governance", "before-phase-1",
  `# Q4 2025 Architecture Review Board — EDP Status Review

## Meeting Details
- **Date**: 2025-12-20
- **Attendees**: CTO, VP Engineering, Architecture Board, Data Platform Lead, Security Lead
- **Duration**: 2 hours

## Executive Summary

The Enterprise Data Platform is on track for full production readiness by end of Q1 2026.
Wave 1 (e-commerce) migration is 80% complete. Key risks: schema governance complexity
(Avro + Protobuf) and consumer isolation timeline.

## Status Update

### Infrastructure (Green)

- Kafka cluster: 5 brokers, KRaft mode, operational since January 2025
- Schema Registry: 120+ schemas registered, 99.99% availability
- Monitoring: Full observability stack (Prometheus + Grafana + Loki + Tempo)
- Data Lake: Iceberg tables, 2.5 TB, query latency within targets

### Migration (Yellow)

- Wave 0: ✅ Complete
- Wave 1: 🟡 80% (4 of 5 integrations migrated)
  - Order→Payment: ✅
  - Order→Warehouse: ✅
  - Payment→Finance: 🟡 In shadow mode (data parity at 99.97%, target 99.99%)
  - Warehouse→Logistics: ✅
  - Order→Analytics: Not started (deprioritized to Wave 5)
- Waves 2-5: On track for H1 2026

### Security (Green)

- mTLS: Enabled for all Kafka clients
- PII classification: 85% of schemas classified
- Audit trail: Operational
- Penetration test: Passed (October 2025)

### Incidents (Yellow)

Three incidents since September:
1. INC-2025-456: Double-processing (847 events, $234K refunded) — ROOT CAUSE: dedup TTL
2. Schema Registry outage (2 hours) — ROOT CAUSE: ZooKeeper→KRaft migration issue
3. Consumer lag spike (30 min) — ROOT CAUSE: broker disk full on broker-3

All three have corrective actions in progress.

## Key Decisions

### Decision 1: Approve Protobuf Exception (ADR-002 Amendment)

**Approved** — Mobile team may use Protobuf for new topics under \`edp.events.mobile.*\`
Conditions:
- buf lint must pass for all Protobuf schemas
- Schema Registry compatibility checks enforced
- Transform pipeline must support dual format by 2026-01-15
- Server-side services continue with Avro (no migration)

### Decision 2: Consumer Isolation Tier 3 for Payments

**Approved** — Dedicated Kafka cluster for payment-processor consumer
- Budget: $3,000/month
- Timeline: Q1 2026
- Driven by INC-2025-456 and PCI-DSS requirements

### Decision 3: Retention Policy (Deferred)

**Deferred to January** — Waiting for:
- Legal confirmation on PCI-DSS requirements
- Cost analysis of tiered storage option
- Stakeholder feedback collection (deadline: 2026-01-15)

## Action Items

| Action | Owner | Deadline |
|--------|-------|----------|
| Wave 1 Payment→Finance to 99.99% | Data Platform | 2026-01-10 |
| Consumer isolation Tier 3 deployment | Infrastructure | 2026-02-01 |
| PII classification to 100% | Security | 2026-01-31 |
| edp-transform Protobuf support | Data Platform | 2026-01-15 |
| Data governance framework proposal | Data Platform | 2026-02-01 |
| Retention policy final decision | Architecture Board | 2026-01-20 |

## Budget Review

| Item | Q4 2025 Actual | Q1 2026 Budget |
|------|---------------|----------------|
| Infrastructure | $47,700 | $53,000 (Tier 3 cluster) |
| Engineering (7 FTE) | $280,000 | $280,000 |
| Software licenses | $12,000 | $15,000 (buf + DataHub) |
| **Total** | **$339,700** | **$348,000** |

## Next Review

Q1 2026 Review scheduled for 2026-03-20.
Focus areas: Wave 2 readiness, consumer isolation validation, retention policy implementation.
`,
));


// ============================================================
// Operational Playbooks (~3K tokens each)
// ============================================================

newDocs.push(makeDoc(
  "gamma-playbook-broker-failure", "document",
  "Playbook: Kafka Broker Failure Response",
  "operations", "phase-3",
  `# Playbook: Kafka Broker Failure Response

## Trigger

- Alert: \`KafkaBrokerDown\` (broker health check failed for >60 seconds)
- Alert: \`KafkaUnderReplicatedPartitions\` (>0 for >5 minutes)
- Dashboard: Broker showing as offline in Kafka Manager

## Severity Assessment

| Condition | Severity | Response |
|-----------|----------|----------|
| 1 broker down, no under-replicated partitions | P3 | Monitor, self-heal expected |
| 1 broker down, under-replicated partitions | P2 | Investigate, manual intervention may be needed |
| 2+ brokers down | P1 | Immediate response, potential data loss risk |
| All brokers down | P0 | Full platform outage, all-hands |

## Step 1: Assess the Situation

\`\`\`bash
# Check broker status
kafka-broker-api-versions.sh --bootstrap-server kafka-1:9092,kafka-2:9092,kafka-3:9092

# Check cluster metadata
kafka-metadata.sh --snapshot /var/kafka/metadata/__cluster_metadata-0/quorum-state

# Check under-replicated partitions
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions

# Check offline partitions
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --unavailable-partitions

# Check controller
kafka-metadata.sh --snapshot /var/kafka/metadata/__cluster_metadata-0/quorum-state | grep -i leader
\`\`\`

## Step 2: Diagnose Root Cause

### Common Causes

**Disk Full:**
\`\`\`bash
df -h /var/kafka/data
# If >95%: delete old segments (topic retention will handle this)
# Emergency: increase retention.ms temporarily
kafka-configs.sh --alter --entity-type topics --entity-name __consumer_offsets \\
  --add-config retention.ms=3600000
\`\`\`

**Out of Memory:**
\`\`\`bash
# Check broker JVM heap
jstat -gc $(pgrep -f kafka.Kafka)
# If heap exhausted: restart with increased -Xmx
# Temporary: reduce log.retention.bytes to free page cache
\`\`\`

**Network Issues:**
\`\`\`bash
# Check connectivity between brokers
nc -zv kafka-1 9092
nc -zv kafka-2 9092
nc -zv kafka-3 9092

# Check for network partition
# If brokers can't reach each other: contact infrastructure team
\`\`\`

**JVM Crash:**
\`\`\`bash
# Check for crash dump
ls -la /var/kafka/logs/hs_err_*.log
# If present: file JVM bug report, restart broker
\`\`\`

## Step 3: Recovery

### Single Broker Recovery

\`\`\`bash
# Restart the broker
systemctl restart kafka

# Wait for recovery
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions
# Should show decreasing count as replicas catch up

# Monitor recovery time
# Expected: ~1 minute per GB of data to replicate
\`\`\`

### Broker Replacement (if hardware failure)

\`\`\`bash
# 1. Provision new broker instance
terraform apply -target=module.kafka.aws_instance.broker[2]

# 2. Install Kafka (same version, same config)
ansible-playbook deploy-kafka-broker.yml -l new-broker

# 3. Update cluster metadata
# New broker will auto-register with KRaft controller

# 4. Reassign partitions from old broker to new
kafka-reassign-partitions.sh --bootstrap-server kafka-1:9092 \\
  --reassignment-json-file reassignment.json --execute

# 5. Verify partition balance
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe | grep -c "Isr: .*new-broker-id"
\`\`\`

## Step 4: Verify Recovery

\`\`\`bash
# Verify all partitions are in-sync
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions
# Expected output: (empty = all in sync)

# Verify producer latency returned to normal
curl -s http://prometheus:9090/api/v1/query?query=kafka_request_latency_p99 | jq .

# Verify consumer lag is decreasing
curl -s http://prometheus:9090/api/v1/query?query=kafka_consumer_group_lag | jq .
\`\`\`

## Step 5: Post-Incident

- Update #edp-incidents with resolution details
- If P1/P0: schedule post-mortem within 48 hours
- Review broker alerting thresholds
- Update capacity planning if near limits

## Contacts

| Role | Person | Phone | Slack |
|------|--------|-------|-------|
| Kafka Lead | Alex Thompson | +1-555-0123 | @alex.t |
| Infrastructure | Wei Liu | +1-555-0456 | @wei.l |
| On-call Escalation | PagerDuty | N/A | N/A |
`,
));


newDocs.push(makeDoc(
  "gamma-playbook-consumer-lag", "document",
  "Playbook: Consumer Lag Investigation & Resolution",
  "operations", "phase-3",
  `# Playbook: Consumer Lag Investigation & Resolution

## Trigger

- Alert: \`EdpConsumerLagWarning\` (lag >10,000 records or >5 min)
- Alert: \`EdpConsumerLagCritical\` (lag >100,000 records or >30 min)
- Dashboard: Consumer group lag increasing steadily

## Step 1: Identify Affected Consumer

\`\`\`bash
# List all consumer groups and their lag
kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --list

# Check specific consumer group
kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \\
  --describe --group edp.consumer.payment-processor.production

# Output columns:
# TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID  HOST  CLIENT-ID
\`\`\`

Key observations:
- Is lag uniform across partitions? → Processing issue
- Is lag concentrated on specific partitions? → Hot partition or stuck consumer
- Is lag increasing or stable? → Active problem vs historical catchup

## Step 2: Diagnose Root Cause

### Cause A: Consumer Processing Slow

Symptoms: All partitions have similar lag, lag increasing steadily

Investigation:
\`\`\`bash
# Check consumer processing metrics
curl -s "http://prometheus:9090/api/v1/query?query=edp_consumer_processing_latency_seconds{quantile='0.99'}"

# Check consumer error rate
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_consumer_records_processed_total{status='error'}[5m])"

# Check downstream dependency latency (database, API, etc.)
curl -s "http://prometheus:9090/api/v1/query?query=edp_consumer_dependency_latency_seconds{quantile='0.99'}"
\`\`\`

Fix options:
1. Scale up consumer instances (if partition count allows)
2. Investigate slow downstream dependency
3. Temporarily increase batch size to catch up
4. Skip non-critical processing steps during catchup

### Cause B: Consumer Crashed/Stuck

Symptoms: One or more partitions with very high lag, specific consumer-id missing

Investigation:
\`\`\`bash
# Check consumer pod status
kubectl get pods -n edp-consumers -l app=payment-processor

# Check consumer logs
kubectl logs -n edp-consumers payment-processor-0 --tail=100

# Check for OOM kills
kubectl describe pod -n edp-consumers payment-processor-0 | grep -A5 "Last State"
\`\`\`

Fix options:
1. Restart stuck pod: \`kubectl delete pod payment-processor-0\`
2. If OOM: increase memory limit
3. If crash loop: check logs, fix bug, deploy

### Cause C: Kafka Broker Issues

Symptoms: All consumer groups lagging, broker metrics abnormal

Investigation:
\`\`\`bash
# Check broker request latency
curl -s "http://prometheus:9090/api/v1/query?query=kafka_request_latency_p99"

# Check network handler utilization
curl -s "http://prometheus:9090/api/v1/query?query=kafka_network_processor_avg_idle_percent"

# Check under-replicated partitions
kafka-topics.sh --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions
\`\`\`

Fix: Follow "Kafka Broker Failure Response" playbook

### Cause D: Upstream Spike

Symptoms: Lag appeared suddenly, producer rate shows spike

Investigation:
\`\`\`bash
# Check producer rate
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_ingest_events_total[5m])"

# Compare to baseline
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_ingest_events_total[5m])/rate(edp_ingest_events_total[1d])"
\`\`\`

Fix: Usually self-resolving if spike is temporary. If sustained:
1. Contact upstream source team
2. Scale consumers if permanent increase
3. Enable rate limiting on ingestion if needed

## Step 3: Catchup Acceleration

If lag is >30 minutes and increasing:

\`\`\`bash
# Option 1: Scale up consumers
kubectl scale deployment payment-processor -n edp-consumers --replicas=12

# Option 2: Temporarily reduce processing (skip enrichment)
kubectl set env deployment/payment-processor SKIP_ENRICHMENT=true

# Option 3: Temporarily increase batch size
kubectl set env deployment/payment-processor MAX_POLL_RECORDS=2000

# After catchup, revert:
kubectl scale deployment payment-processor -n edp-consumers --replicas=4
kubectl set env deployment/payment-processor SKIP_ENRICHMENT-
kubectl set env deployment/payment-processor MAX_POLL_RECORDS=500
\`\`\`

## Step 4: Verify Recovery

\`\`\`bash
# Watch lag decrease
watch -n 5 "kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \\
  --describe --group edp.consumer.payment-processor.production 2>/dev/null | tail -1"

# Expected: LAG column should be decreasing
# Catchup rate: (events/sec consumed) - (events/sec produced)
# Estimated catchup time: current_lag / catchup_rate
\`\`\`

## Escalation

| Lag Duration | Action |
|-------------|--------|
| >5 min | Investigate (this playbook) |
| >30 min | Page on-call if not already investigating |
| >2 hours | Escalate to team lead |
| >4 hours | Escalate to engineering manager |
| >8 hours | Executive notification |
`,
));


newDocs.push(makeDoc(
  "gamma-playbook-schema-migration", "document",
  "Playbook: Schema Migration & Compatibility Management",
  "operations", "phase-1",
  `# Playbook: Schema Migration & Compatibility Management

## Overview

This playbook covers safe schema evolution for EDP event schemas. All schema changes must
maintain backward compatibility (default) to avoid breaking downstream consumers.

## Before You Start

### Pre-Flight Checklist

1. [ ] Schema change reviewed by Data Platform team
2. [ ] Compatibility check passed locally
3. [ ] All downstream consumers identified (check DataHub lineage)
4. [ ] Downstream teams notified (if breaking or complex change)
5. [ ] Integration tests updated for new schema
6. [ ] Rollback plan documented

### Identify Downstream Consumers

\`\`\`bash
# Using DataHub API
curl -s "http://datahub:8080/api/v2/graphql" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "{ dataset(urn: \\"urn:li:dataset:(urn:li:dataPlatform:kafka,edp.events.ecommerce.orders,PROD)\\") { downstreamLineage { entities { urn type } } } }"}'

# Using Kafka consumer groups (less accurate)
kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 --list | grep orders
\`\`\`

## Safe Changes (No Coordination Required)

### Adding an Optional Field

\`\`\`json
// Before (v2)
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "total", "type": "double"}
  ]
}

// After (v3) — adding optional field with default
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "total", "type": "double"},
    {"name": "currency", "type": ["null", "string"], "default": null}
  ]
}
\`\`\`

Steps:
1. Register new schema version
2. Deploy producer with new schema
3. Consumers automatically handle new field (ignored if not used)

### Removing a Field with Default

\`\`\`json
// Remove field that has a default value
// Old consumers will use the default when reading new records
\`\`\`

Steps:
1. Verify field has default value in current schema
2. Remove field from producer code
3. Register new schema (compatibility check will pass)
4. Deploy producer

## Complex Changes (Coordination Required)

### Changing Field Type (Breaking)

Cannot be done directly. Instead:

1. Add new field with new type (e.g., \`total_v2\` as \`decimal\`)
2. Populate both old and new fields during transition period
3. Consumers migrate to new field
4. After all consumers migrated: deprecate old field
5. After deprecation period: remove old field

Timeline: Minimum 30 days for deprecation

### Renaming a Field (Breaking)

Cannot be done with Avro (field names are part of the wire format).

Workaround:
1. Add new field with new name
2. Populate both during transition
3. Consumers migrate
4. Deprecate old field

### Adding a Required Field (Breaking)

Never add required fields without defaults. Instead:
1. Add as optional with default
2. All producers populate the field
3. After confirming 100% population: change to required in NEXT schema version

## Compatibility Testing

### Local Check

\`\`\`bash
# Check compatibility before registration
curl -X POST http://schema-registry:8081/compatibility/subjects/edp.events.ecommerce.orders-value/versions/latest \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d '{"schema": "<new-schema-json>"}'

# Response:
# {"is_compatible": true}   → Safe to proceed
# {"is_compatible": false}  → STOP, review change
\`\`\`

### CI Integration

The CI pipeline automatically:
1. Extracts schema from PR diff
2. Runs compatibility check against staging registry
3. Runs unit tests with old data + new schema
4. Runs unit tests with new data + old consumer code
5. Reports results as PR check

### Integration Test

\`\`\`bash
# Run schema integration tests
./scripts/test-schema-evolution.sh \\
  --subject edp.events.ecommerce.orders-value \\
  --old-version latest \\
  --new-version path/to/new-schema.avsc

# Tests:
# 1. Old producer → New consumer (forward)
# 2. New producer → Old consumer (backward)
# 3. Old data in Kafka → New consumer (backward)
# 4. New data in Kafka → Old consumer (forward)
\`\`\`

## Emergency: Incompatible Schema Deployed

If an incompatible schema was registered and is causing consumer failures:

\`\`\`bash
# 1. Identify the problematic schema version
curl http://schema-registry:8081/subjects/edp.events.ecommerce.orders-value/versions

# 2. Delete the bad version (soft delete)
curl -X DELETE http://schema-registry:8081/subjects/edp.events.ecommerce.orders-value/versions/5

# 3. Hard delete (if needed)
curl -X DELETE "http://schema-registry:8081/subjects/edp.events.ecommerce.orders-value/versions/5?permanent=true"

# 4. Roll back producer to previous schema version
kubectl rollback deployment edp-ingest

# 5. Verify consumers recovering
kafka-consumer-groups.sh --describe --group edp.consumer.order-enrichment.production
\`\`\`

## Monitoring Schema Health

\`\`\`
# Number of subjects
schema_registry_registered_count

# Schema registration rate (should be low, spikes = potential issue)
rate(schema_registry_request_total{method="POST", status="200"}[5m])

# Compatibility check failures (should be zero in production)
rate(schema_registry_compatibility_check_total{result="incompatible"}[5m])
\`\`\`
`,
));


newDocs.push(makeDoc(
  "gamma-playbook-data-quality", "document",
  "Playbook: Data Quality Issue Investigation",
  "operations", "phase-3",
  `# Playbook: Data Quality Issue Investigation

## Trigger

- Alert: \`EdpDataQualityDrop\` (quality score below threshold)
- Report: Business team reports incorrect data in dashboards/reports
- Monitoring: Anomaly detection flags unusual data patterns

## Step 1: Identify the Scope

### Which datasets are affected?

\`\`\`bash
# Check quality scores for all datasets
curl -s "http://prometheus:9090/api/v1/query?query=edp_data_quality_score" | jq '.data.result[] | {dataset: .metric.dataset, score: .value[1]}'

# Check recent quality rule failures
curl -s "http://prometheus:9090/api/v1/query?query=increase(edp_data_quality_failures_total[1h])" | jq '.data.result[] | select(.value[1] > "0")'
\`\`\`

### What type of quality issue?

| Issue Type | Detection | Common Cause |
|-----------|-----------|-------------|
| Completeness | High null rates | Producer bug, schema change |
| Freshness | No new events | Producer down, Kafka issue |
| Volume | Anomalous count | Load spike, duplicate processing |
| Schema drift | New/changed columns | Uncoordinated schema change |
| Accuracy | Business rule violation | Logic bug, data corruption |

## Step 2: Trace the Data Flow

Follow the event from source to sink:

\`\`\`
Source System → Ingestion → Kafka → Transform → Consumer → Sink (DB/Lake)
\`\`\`

For each stage, check:

### Ingestion Layer
\`\`\`bash
# Check ingestion metrics
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_ingest_events_total{status='error'}[5m])"
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_ingest_schema_validation_errors_total[5m])"
\`\`\`

### Kafka Layer
\`\`\`bash
# Check topic data
kafka-console-consumer.sh --bootstrap-server kafka-1:9092 \\
  --topic edp.events.ecommerce.orders \\
  --from-beginning --max-messages 10 \\
  --property print.timestamp=true \\
  --property print.key=true
\`\`\`

### Transform Layer
\`\`\`bash
# Check transform pipeline metrics
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_transform_filtered_events_total[5m])"
curl -s "http://prometheus:9090/api/v1/query?query=edp_transform_stage_latency_seconds{quantile='0.99'}"
\`\`\`

### Consumer/Sink Layer
\`\`\`bash
# Check consumer processing metrics
curl -s "http://prometheus:9090/api/v1/query?query=rate(edp_consumer_records_processed_total{status='error'}[5m])"

# Check for DLQ events
kafka-console-consumer.sh --bootstrap-server kafka-1:9092 \\
  --topic edp.dlq.order-enrichment.orders \\
  --from-beginning --max-messages 5
\`\`\`

## Step 3: Common Scenarios & Fixes

### Scenario A: Null Fields in Events

Root cause investigation:
1. Check if source system sends null: trace a specific event ID
2. Check if schema change removed required field
3. Check if transform pipeline has a bug in field mapping

Fix:
- If source bug: notify source team, add null check in transform
- If schema issue: rollback schema version (see Schema Migration playbook)
- If transform bug: fix pipeline, replay affected events

### Scenario B: Duplicate Events

Root cause investigation:
1. Check producer idempotency key uniqueness
2. Check consumer processing for non-idempotent operations
3. Check for recent consumer rebalance (see INC-2025-456)

Fix:
- Add/fix deduplication at consumer level
- If already processed: generate compensating events
- Review dedup cache TTL settings

### Scenario C: Missing Events (Volume Drop)

Root cause investigation:
1. Check producer event rate: is it actually producing less?
2. Check ingestion rate: events being rejected?
3. Check consumer lag: events in Kafka but not consumed?
4. Check transform filter: events being filtered out?

Fix depends on root cause:
- Producer issue: contact source team
- Ingestion rejection: check DLQ, fix schema
- Consumer lag: follow Consumer Lag playbook
- Transform filter: review filter rules

### Scenario D: Stale Data (Freshness)

Root cause investigation:
1. Check latest event timestamp vs current time
2. Check producer health
3. Check CDC connector status (if CDC source)
4. Check for network issues between source and EDP

\`\`\`bash
# Check latest event timestamp
kafka-run-class.sh kafka.tools.GetOffsetShell \\
  --broker-list kafka-1:9092 \\
  --topic edp.events.ecommerce.orders \\
  --time -1  # Latest offset

# Check CDC connector status
curl -s http://kafka-connect:8083/connectors/edp-cdc-orders/status | jq .
\`\`\`

## Step 4: Remediation

### Data Replay (if events exist in Kafka)

\`\`\`bash
# Replay events from Kafka to sink
curl -X POST http://edp-query:8080/v1/events/ecommerce/orders/replay \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "2025-12-14T00:00:00Z",
    "to": "2025-12-14T23:59:59Z",
    "target_topic": "edp.replay.order-enrichment.orders",
    "rate_limit_events_per_second": 5000
  }'
\`\`\`

### Data Backfill (if events not in Kafka)

If events are beyond Kafka retention:
1. Query data lake for affected time range
2. Generate correction events
3. Produce to appropriate topic
4. Consumer processes corrections

### Quarantine Bad Data

If bad data reached the sink:
\`\`\`sql
-- Mark affected rows in database
UPDATE orders SET data_quality_flag = 'quarantined'
WHERE created_at BETWEEN '2025-12-14 10:00' AND '2025-12-14 12:00'
  AND source = 'edp-ingest';

-- Notify data consumers
INSERT INTO data_quality_events (dataset, severity, message, affected_range)
VALUES ('orders', 'critical', 'Data quarantined due to quality issue',
        '2025-12-14T10:00:00Z/2025-12-14T12:00:00Z');
\`\`\`

## Step 5: Prevention

After resolving the issue:
1. Add or tighten quality rules for the affected scenario
2. Add integration test covering the failure case
3. Update this playbook if new scenario discovered
4. Schedule review with source team if external dependency
`,
));


newDocs.push(makeDoc(
  "gamma-playbook-security-incident", "document",
  "Playbook: EDP Security Incident Response",
  "security", "phase-5",
  `# Playbook: EDP Security Incident Response

## Trigger

- Alert: Unusual data access pattern detected
- Alert: Unauthorized API key usage
- Alert: mTLS certificate validation failure spike
- Report: Security team flags suspicious activity
- Report: Third-party security audit finding

## Severity Classification

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| S1 (Critical) | Active data breach or exploitation | <15 min | Data exfiltration, unauthorized access to PII |
| S2 (High) | Confirmed vulnerability, not yet exploited | <1 hour | Exposed credentials, misconfigured ACL |
| S3 (Medium) | Potential vulnerability, unconfirmed | <4 hours | Suspicious access pattern, unusual API usage |
| S4 (Low) | Informational, no immediate risk | Next business day | Failed auth attempts, policy violation |

## Step 1: Initial Assessment (First 15 Minutes)

### Gather Context

\`\`\`bash
# Check audit logs for recent suspicious activity
curl -s "http://loki:3100/loki/api/v1/query_range" \\
  --data-urlencode "query={service=\\"edp-gateway\\"} |= \\"auth_decision=deny\\"" \\
  --data-urlencode "start=$(date -d '1 hour ago' +%s)000000000" \\
  --data-urlencode "end=$(date +%s)000000000"

# Check for unusual access patterns
curl -s "http://prometheus:9090/api/v1/query?query=sum(rate(edp_gateway_requests_total{status=~'4..'}[5m])) by (client)"

# Check for certificate issues
curl -s "http://prometheus:9090/api/v1/query?query=rate(envoy_ssl_connection_error_total[5m])"
\`\`\`

### Determine Scope

- Which systems are affected?
- What data may be exposed?
- Is the attack ongoing?
- Is there lateral movement?

## Step 2: Containment

### For API Key Compromise

\`\`\`bash
# Revoke compromised API key immediately
curl -X DELETE "http://edp-admin:8080/v1/admin/api-keys/KEY_ID" \\
  -H "Authorization: Bearer <admin-token>"

# Block source IP (if identifiable)
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-suspicious-ip
  namespace: edp-gateway
spec:
  podSelector:
    matchLabels:
      app: edp-gateway
  ingress:
    - from:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - SUSPICIOUS_IP/32
EOF
\`\`\`

### For Service Account Compromise

\`\`\`bash
# Rotate service account credentials
vault write auth/kubernetes/role/edp-ingest \\
  bound_service_account_names=edp-ingest-sa \\
  bound_service_account_namespaces=edp \\
  policies=edp-producer \\
  ttl=1h

# Force credential rotation
kubectl rollout restart deployment/edp-ingest -n edp
\`\`\`

### For Data Exfiltration

1. Identify the data access path (API, direct DB, Kafka consumer)
2. Revoke access immediately
3. Capture network logs for forensic analysis
4. Isolate affected pods/services
5. Do NOT delete evidence — preserve for investigation

## Step 3: Investigation

### Log Analysis

\`\`\`bash
# Export relevant logs for forensic analysis
curl -s "http://loki:3100/loki/api/v1/query_range" \\
  --data-urlencode "query={namespace=\\"edp\\"}" \\
  --data-urlencode "start=START_TIMESTAMP" \\
  --data-urlencode "end=END_TIMESTAMP" \\
  --data-urlencode "limit=10000" > forensic-logs.json

# Analyze access patterns
cat forensic-logs.json | jq '.data.result[].values[][] | fromjson | select(.client_id == "SUSPECT_CLIENT")'
\`\`\`

### Data Impact Assessment

1. **What data was accessed?**
   - Query audit logs for read operations by compromised identity
   - Check Kafka consumer group offsets (how much data was consumed)
   - Check data lake query history (Trino audit logs)

2. **PII exposure?**
   - Cross-reference accessed topics/tables with PII classification
   - If Level 2+ PII accessed: GDPR notification clock starts (72 hours)

3. **Integrity impact?**
   - Were any events modified or produced by the attacker?
   - Check for unexpected schema registrations
   - Verify topic ACLs haven't been modified

## Step 4: Eradication

Once the attack vector is fully understood:

1. Patch the vulnerability that allowed access
2. Rotate ALL credentials that may have been exposed
3. Review and tighten ACLs and network policies
4. Deploy additional monitoring for the attack vector
5. Verify fix with penetration test

## Step 5: Recovery

1. Verify all systems operational
2. Verify no residual unauthorized access
3. Restore any quarantined data (after integrity verification)
4. Monitor closely for 72 hours (attacker may retry)

## Step 6: Post-Incident

### Within 24 Hours

- Initial incident report to CISO
- Regulatory notification assessment (GDPR: 72-hour window)
- Customer notification assessment

### Within 7 Days

- Full incident report (timeline, root cause, impact, remediation)
- Post-mortem meeting with all involved teams
- Corrective action items (with deadlines and owners)

### Within 30 Days

- Verify all corrective actions completed
- Update security policies and playbooks
- Update threat model
- Share lessons learned (anonymized) with broader engineering

## Communication

### Internal
- **#security-incidents** (Slack): Real-time updates
- **CISO**: Direct message for S1/S2
- **Legal**: Notify for any PII exposure

### External
- **Affected customers**: Only after legal review
- **Regulators**: Per GDPR/PCI-DSS requirements
- **Status page**: Generic notice (no technical details)

## Emergency Contacts

| Role | Person | Available |
|------|--------|-----------|
| Security Lead | Maria Garcia | 24/7 (PagerDuty) |
| CISO | James Park | Business hours + PagerDuty for S1 |
| Legal (Privacy) | Jennifer Chen | Business hours |
| Infrastructure | Wei Liu | 24/7 (PagerDuty) |
`,
));


// ============================================================
// Load existing corpus and merge
// ============================================================

const corpusPath = join(resolve(import.meta.dirname), "corpus.json");
const existing = JSON.parse(readFileSync(corpusPath, "utf-8"));
const existingDocs: CorpusDoc[] = existing.documents ?? existing;

const merged = [...existingDocs, ...newDocs];
const totalTokens = merged.reduce((sum, d) => sum + d.tokens, 0);
const newTokens = newDocs.reduce((sum, d) => sum + d.tokens, 0);

console.error(`Existing: ${existingDocs.length} docs, ~${existingDocs.reduce((s, d) => s + d.tokens, 0)} tokens`);
console.error(`Added: ${newDocs.length} docs, ~${newTokens} tokens`);
console.error(`Total: ${merged.length} docs, ~${totalTokens} tokens`);

writeFileSync(corpusPath, JSON.stringify({ documents: merged }, null, 2));
console.error("Written merged corpus to corpus.json");
