#!/usr/bin/env tsx
// Gamma Fixture Generator — Enterprise Data Platform migration corpus
//
// Generates ~107K tokens of realistic technical documentation:
// - 8 ADRs, 5 incident reports, 6 tech specs, 4 runbooks, 3 compliance docs, 4 team docs
// - 3 needle documents (critical facts buried in long docs)
// - 2 contradictory document pairs
// - 2 stale documents (old timestamps, superseded info)
//
// Usage: npx tsx generate-corpus.ts > corpus.json

import { writeFileSync } from "node:fs";
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

const docs: CorpusDoc[] = [];

// ============================================================
// ADRs (~3K tokens each = ~24K total)
// ============================================================

docs.push(makeDoc(
  "gamma-adr-001", "decision",
  "ADR-001: Apache Kafka for Event Streaming",
  "streaming", "before-phase-1",
  `# ADR-001: Apache Kafka for Event Streaming

## Status: Accepted
## Date: 2025-09-15

## Context

The Enterprise Data Platform needs a distributed event streaming system to:
- Handle 500K events/second peak throughput from 12 source systems
- Provide exactly-once delivery guarantees for financial transactions
- Support event replay for reprocessing and disaster recovery
- Enable real-time analytics pipelines alongside batch processing

Three alternatives were evaluated:
1. **Apache Kafka** — industry standard, mature ecosystem, strong exactly-once support via transactions
2. **Apache Pulsar** — multi-tenancy, tiered storage, but smaller community and operational complexity
3. **Amazon Kinesis** — managed, but vendor lock-in and 1MB record limit problematic for some events

## Decision

We will use **Apache Kafka** (Confluent Platform 7.6) with the following configuration:

### Cluster Topology
- 5 brokers across 3 availability zones (2-2-1 distribution)
- ZooKeeper-less mode (KRaft) for metadata management
- min.insync.replicas = 2 for critical topics
- Replication factor = 3 for all production topics

### Topic Design
- \`edp.events.{source}.{entity}\` — source-partitioned event topics
- \`edp.changelog.{service}\` — compacted changelog topics for state stores
- \`edp.dlq.{service}\` — dead letter queues per consumer service
- Default partitions: 12 (matches peak consumer parallelism)
- Retention: 7 days for event topics, indefinite for changelog topics

### Serialization
- **Avro** with Confluent Schema Registry for all production topics
- Schema compatibility mode: BACKWARD (new schemas can read old data)
- Schema ID embedded in message header per Confluent wire format

### Security
- mTLS for inter-broker and client-broker communication
- SASL/SCRAM for client authentication
- ACLs for topic-level authorization
- Encryption at rest via dm-crypt on broker volumes

## Consequences
- Team needs Kafka expertise (2 engineers already certified)
- Schema Registry becomes a critical dependency
- ZooKeeper elimination simplifies operations but is newer (GA since Kafka 3.5)
- Avro serialization adds schema management overhead but prevents breaking changes`,
));

docs.push(makeDoc(
  "gamma-adr-002", "decision",
  "ADR-002: Event Schema Strategy — Avro with Schema Registry",
  "schema", "before-phase-1",
  `# ADR-002: Event Schema Strategy — Avro with Schema Registry

## Status: Accepted
## Date: 2025-09-20

## Context

Events flowing through the platform need a well-defined schema strategy to:
- Prevent breaking changes from propagating downstream
- Enable schema evolution without coordinated deployments
- Support efficient serialization for high-throughput pipelines
- Provide documentation and discovery of event contracts

### Alternatives Evaluated

1. **Apache Avro** — binary format, schema evolution with compatibility modes, integrates with Confluent Schema Registry
2. **Protocol Buffers (Protobuf)** — Google's binary format, strong typing, wider language support, gRPC integration
3. **JSON Schema** — human-readable, easy debugging, but no binary efficiency and weaker evolution guarantees

## Decision

We will use **Apache Avro** with Confluent Schema Registry.

### Why Avro Over Protobuf

The decision was close. Protobuf has superior language support and gRPC integration. However:

1. **Schema Registry integration**: Avro has first-class support in Confluent Schema Registry with automatic compatibility checking. Protobuf support exists but is less mature.
2. **Schema evolution**: Avro's BACKWARD/FORWARD/FULL compatibility modes provide stronger guarantees than Protobuf's field numbering approach.
3. **Kafka ecosystem**: Most Kafka tooling (Connect, Streams, ksqlDB) has deeper Avro integration.
4. **Team expertise**: 3 of 5 data engineers have production Avro experience; 0 have Protobuf in streaming contexts.

### Schema Naming Convention
- Namespace: \`com.edp.events.{domain}\`
- Name: \`{Entity}{Action}Event\` (e.g., \`OrderCreatedEvent\`, \`PaymentProcessedEvent\`)
- Version suffix not in the name — Schema Registry tracks versions

### Compatibility Rules
- BACKWARD compatibility is the default (new consumer code can read old messages)
- FULL compatibility required for financial transaction schemas
- Breaking changes require a new topic (not a new schema version)

### Schema Review Process
1. Schema changes submitted via PR to the \`edp-schemas\` repository
2. CI runs compatibility check against Schema Registry
3. Approved by domain owner + platform team
4. Deployed to Schema Registry via CD pipeline

## Consequences
- All producer/consumer teams must use Avro serialization
- Schema Registry availability becomes critical (deploy in HA mode)
- Binary format makes debugging harder (use Kafka UI or avro-tools CLI)
- Protobuf migration path exists via Schema Registry's multi-format support if needed later`,
));

docs.push(makeDoc(
  "gamma-adr-003", "decision",
  "ADR-003: PostgreSQL for Operational Data Store",
  "database", "before-phase-1",
  `# ADR-003: PostgreSQL for Operational Data Store

## Status: Accepted
## Date: 2025-10-01

## Context

The platform needs an operational data store (ODS) for:
- Materialised views of event stream aggregates
- Service state storage for consumer applications
- API query serving with sub-100ms P99 latency
- ACID guarantees for financial reconciliation

## Decision

We will use **PostgreSQL 16** with the following architecture:

### Cluster Configuration
- Primary + 2 streaming replicas (synchronous replication for financial tables, async for analytics)
- Connection pooling via PgBouncer (max 500 connections per pooler, 2 poolers)
- Automated failover via Patroni
- WAL archiving to S3 for PITR (7 days retention)

### Schema Design
- Schema-per-service isolation: \`order_service\`, \`payment_service\`, \`inventory_service\`
- Shared \`platform\` schema for cross-cutting concerns (audit log, feature flags)
- Partitioning: range-partitioned by month for \`events_log\` and \`audit_trail\` tables
- JSONB columns for flexible metadata (indexed via GIN)

### Data Retention
- **Hot data**: 90 days in primary tables
- **Warm data**: 90 days to 2 years in partitioned archive tables (same cluster, different tablespace on cheaper storage)
- **Cold data**: >2 years archived to Parquet in S3 via pg_dump + conversion pipeline
- Retention policy enforced by a nightly cron job that detaches and drops old partitions

### Monitoring
- pg_stat_statements for query performance tracking
- Custom metrics exported to Prometheus via postgres_exporter
- Alert thresholds: replication lag >5s (warn), >30s (critical), connection pool saturation >80%

## Consequences
- PostgreSQL operational expertise required (team has it)
- Schema migrations need careful coordination (use Flyway with versioned migrations)
- Connection pooling adds a layer of complexity (PgBouncer transaction mode)
- Partitioning requires upfront planning for date-range queries`,
));

docs.push(makeDoc(
  "gamma-adr-004", "decision",
  "ADR-004: Kubernetes Deployment Strategy",
  "infrastructure", "before-phase-1",
  `# ADR-004: Kubernetes Deployment Strategy

## Status: Accepted
## Date: 2025-10-10

## Context

The platform services need a deployment strategy that supports:
- Rolling updates with zero downtime
- Canary deployments for critical services
- Resource isolation between services
- Auto-scaling based on message lag and CPU

## Decision

We will deploy on **Kubernetes 1.29** (EKS) with the following strategy:

### Namespace Layout
- \`edp-prod\` — production workloads
- \`edp-staging\` — staging environment (identical config, 1/5 scale)
- \`edp-monitoring\` — Prometheus, Grafana, Alertmanager
- \`edp-kafka\` — Strimzi-managed Kafka cluster

### Deployment Strategy
- **Default**: RollingUpdate with maxSurge=1, maxUnavailable=0
- **Critical services** (payment-consumer, reconciliation): Blue-green via Argo Rollouts
- **Data pipelines**: Recreate strategy (single instance, no concurrent versions)

### Resource Management
- ResourceQuota per namespace: prevents runaway resource consumption
- PodDisruptionBudget: minAvailable=2 for all stateless services
- HPA: scale on Kafka consumer lag (custom metric) + CPU
- VPA in recommendation-only mode (applied during next deploy)

### Secrets Management
- Vault Agent sidecar for runtime secret injection
- No secrets in ConfigMaps or environment variables
- Rotation: Kafka credentials rotated quarterly, DB credentials monthly

### Networking
- Istio service mesh for mTLS between services
- NetworkPolicy: default-deny with explicit allow rules per service
- Ingress via ALB Ingress Controller with WAF rules

## Consequences
- Operational complexity of running Kubernetes (mitigated by managed EKS)
- Strimzi for Kafka on K8s adds another operator to manage
- Istio adds latency (~1-2ms per hop) and operational overhead
- Vault Agent sidecar pattern consumes additional memory per pod`,
));

docs.push(makeDoc(
  "gamma-adr-005", "decision",
  "ADR-005: Consumer Offset Management and Exactly-Once Delivery",
  "streaming", "before-phase-1",
  `# ADR-005: Consumer Offset Management and Exactly-Once Delivery

## Status: Accepted
## Date: 2025-10-20

## Context

Financial transaction processing requires exactly-once delivery semantics. Events must not be processed twice (double-charge) or dropped (lost payment).

## Decision

### Consumer Pattern
We will use the **transactional outbox pattern** combined with **Kafka transactions**:

1. Consumer reads from Kafka topic
2. Processes the event within a database transaction
3. Commits Kafka offset and DB transaction atomically (via Kafka's transactional API)
4. If either fails, both are rolled back

### Implementation
- \`isolation.level = read_committed\` on all consumers
- \`enable.auto.commit = false\` — manual commit within transaction
- \`transactional.id\` per consumer instance (format: \`{service}-{partition}\`)
- Idempotency key stored in DB for deduplication (belt-and-suspenders)

### Dead Letter Queue
- Events that fail processing 3 times are routed to DLQ
- DLQ topic: \`edp.dlq.{service}\`
- DLQ events include: original event, error message, processing attempts, timestamp
- Alerts fire when DLQ depth exceeds 100 events
- Manual replay via CLI tool: \`edp-cli dlq replay --service {name} --from {offset}\`

### Consumer Group Strategy
- One consumer group per service
- Partition assignment: CooperativeSticky (minimize rebalance disruption)
- Max poll interval: 5 minutes (tuned for batch processing services)
- Session timeout: 30 seconds

## Consequences
- Transactional API adds ~10% latency overhead (acceptable for financial events)
- Consumer instances must have unique transactional IDs (managed by K8s StatefulSet ordinal)
- DLQ replay requires manual intervention (no auto-retry beyond 3 attempts)
- DB-level idempotency check adds a table lookup per event (indexed, <1ms)`,
));

docs.push(makeDoc(
  "gamma-adr-006", "decision",
  "ADR-006: Monitoring and Observability Stack",
  "observability", "before-phase-1",
  `# ADR-006: Monitoring and Observability Stack

## Status: Accepted
## Date: 2025-11-01

## Context

The platform needs comprehensive observability for:
- Real-time alerting on processing failures and latency spikes
- Distributed tracing across event pipelines
- Metric aggregation for capacity planning
- Log aggregation for debugging

## Decision

### Metrics: Prometheus + Grafana
- Prometheus scrapes all K8s pods via ServiceMonitor CRDs
- Key metrics: consumer lag, processing latency p50/p95/p99, error rate, throughput
- Grafana dashboards per service + platform-wide overview
- Alert rules in PrometheusRule CRDs, routed to PagerDuty via Alertmanager

### Tracing: OpenTelemetry + Jaeger
- OpenTelemetry SDK in all services (Java and Python)
- Trace context propagated via Kafka headers (\`traceparent\` key)
- Jaeger backend with Elasticsearch storage (14-day retention)
- Sampling: 100% for errors, 10% for successful events, 1% for health checks

### Logging: Fluentd + Elasticsearch + Kibana
- Structured JSON logging (no unstructured text logs)
- Log levels: ERROR always, WARN always, INFO in staging+prod, DEBUG in staging only
- Correlation ID (\`trace_id\`) in every log line
- Retention: 30 days in Elasticsearch, 90 days in S3 archive

### Alerting Tiers
| Tier | Response | Examples |
|------|----------|---------|
| P1 - Critical | Page on-call, 15min response | Consumer lag >10min, DLQ depth >1000, DB replication failure |
| P2 - High | Slack + ticket, 4h response | Consumer lag >5min, error rate >5%, cert expiry <7 days |
| P3 - Medium | Ticket, next business day | Disk usage >80%, node count drift, schema compatibility warning |
| P4 - Low | Weekly review | Slow queries >1s, resource request drift, dependency CVE |

## Consequences
- ELK stack is resource-intensive (dedicated monitoring nodes)
- OpenTelemetry instrumentation requires SDK integration in every service
- 100% error sampling may produce large trace volumes during incidents
- PagerDuty integration requires license ($$$)`,
));

docs.push(makeDoc(
  "gamma-adr-007", "decision",
  "ADR-007: Data Retention Policy — 48-Hour Event Replay Window",
  "compliance", "before-phase-1",
  `# ADR-007: Data Retention Policy — 48-Hour Event Replay Window

## Status: Accepted
## Date: 2025-11-10
## Superseded by: ADR-012 (if it exists)

## Context

The platform needs to define how long raw events are retained in Kafka topics for replay purposes. Competing requirements:
- Operations wants long retention for debugging and reprocessing
- Compliance wants minimum retention to limit data exposure
- Cost: 500K events/sec × 1KB average = ~40GB/hour of raw data

## Decision

Raw events in Kafka topics are retained for **48 hours**.

### Rationale
- 48 hours covers: two business days, most incident detection windows, weekend processing gaps
- After 48 hours, events are available in the data warehouse (batch pipeline runs every 6 hours)
- Compliance requirement: PII-containing events must be deletable within 72 hours of a GDPR deletion request
- 48-hour window means at most 48 hours of PII to scan during deletion

### Exceptions
- \`edp.events.financial.*\` topics: 7-day retention (regulatory requirement for audit trail)
- \`edp.changelog.*\` topics: indefinite (compacted, only latest value per key retained)
- DLQ topics: 30-day retention (allows investigation of processing failures)

## Consequences
- Operations must process replayable scenarios within 48 hours
- Batch reprocessing beyond 48 hours requires restoring from the data warehouse
- Storage cost: ~1.9TB at steady state (48h × 40GB/h)`,
  { stale: false },
));

// STALE document: contradicts ADR-007 with 72-hour window
docs.push(makeDoc(
  "gamma-adr-008-stale", "decision",
  "ADR-008: Extended Retention — 72-Hour Replay Window (DRAFT)",
  "compliance", "before-phase-1",
  `# ADR-008: Extended Retention — 72-Hour Replay Window

## Status: DRAFT (proposed, not yet accepted)
## Date: 2025-12-01
## Supersedes: ADR-007 (pending approval)

## Context

After two incidents where the 48-hour replay window was insufficient:
- INC-2025-142: Consumer bug discovered 52 hours after first bad event. Required warehouse restore.
- INC-2025-156: Weekend outage lasted 50 hours. Some events couldn't be replayed from Kafka.

The operations team has requested extending the replay window to 72 hours.

## Proposed Decision

Extend raw event retention from 48 hours to **72 hours**.

### Impact Analysis
- Storage increase: 1.9TB → 2.9TB (+1TB, ~$150/month on current storage)
- GDPR deletion window increases from 48h to 72h scanning window
- Compliance team has provisionally approved (pending formal sign-off)

### Open Questions
- Does the 72-hour window conflict with the data minimisation principle in the GDPR DPA?
- Should we tier retention by topic sensitivity instead of a blanket extension?
- Is this a band-aid? Should we invest in faster warehouse-based replay instead?

## Status
This ADR is in DRAFT status. It has not been accepted. The current retention policy remains ADR-007 (48 hours) until this is formally approved.

**DO NOT implement 72-hour retention until this ADR is accepted.**`,
  { stale: true, contradicts: "gamma-adr-007" },
));

// ============================================================
// Incident Reports (~2K tokens each = ~10K total)
// ============================================================

docs.push(makeDoc(
  "gamma-inc-001", "incident",
  "INC-2025-089: Schema Registry Outage — Consumer Deserialization Failures",
  "streaming", "before-phase-1",
  `# INC-2025-089: Schema Registry Outage

## Severity: P1
## Duration: 2025-08-15 14:22 UTC to 2025-08-15 16:45 UTC (2h 23m)
## Impact: All Kafka consumers failed to deserialize events for 2h 23m

## Timeline
- 14:22 — Schema Registry primary node OOM killed (memory leak in schema cache)
- 14:23 — Consumers begin failing with AvroDeserializationException
- 14:25 — PagerDuty alert fires: "Consumer lag >10min on 8 topics"
- 14:30 — On-call identifies Schema Registry as the cause
- 14:35 — Attempt to restart Schema Registry — fails (Kafka topic __schemas has 4GB of data, load takes 8 minutes)
- 14:43 — Schema Registry comes online but immediately OOMs again
- 14:50 — Root cause identified: schema cache not bounded, accumulated 45K schema versions
- 15:10 — Hotfix deployed: max.schemas.per.subject=1000, schema.cache.size=10000
- 15:25 — Schema Registry stable, consumers begin processing backlog
- 16:45 — All consumer lag cleared, platform fully recovered

## Root Cause
The Schema Registry was configured with unbounded schema caching. Over 6 months of operation, the cache accumulated 45K schema versions consuming 3.2GB of heap. A GC pause triggered an OOM kill.

## Action Items
1. [DONE] Bound schema cache size (max 10K entries, LRU eviction)
2. [DONE] Add memory usage alert for Schema Registry (>70% heap)
3. [TODO] Evaluate Schema Registry HA deployment (currently single-node)
4. [TODO] Add circuit breaker to consumers: fall back to cached schema on Registry failure
5. [DONE] Runbook update: Schema Registry recovery procedure

## Lessons Learned
- Schema Registry is a critical dependency — needs HA treatment
- Consumer deserialization failure is a total stop, not a degradation
- 45K schema versions over 6 months suggests schema hygiene issues — review CI/CD pipeline`,
));

docs.push(makeDoc(
  "gamma-inc-002", "incident",
  "INC-2025-112: Double-Processing After Consumer Rebalance",
  "streaming", "before-phase-1",
  `# INC-2025-112: Double-Processing After Consumer Rebalance

## Severity: P2
## Duration: 2025-09-22 09:15 to 2025-09-22 10:30 UTC (1h 15m)
## Impact: 847 payment events processed twice, 12 customers charged double

## Timeline
- 09:15 — K8s HPA scales payment-consumer from 3 to 5 pods
- 09:16 — Consumer group rebalance triggered (EagerRebalance strategy)
- 09:17 — During rebalance, 2 partitions reassigned; new consumer starts from last committed offset
- 09:18 — 847 events between last commit and rebalance point reprocessed
- 09:20 — Idempotency check catches 835 events, but 12 slip through (idempotency key expired)
- 09:30 — Finance team reports 12 duplicate charges
- 09:45 — Root cause identified: auto-commit interval (5s) + rebalance = events committed to Kafka but not yet to DB
- 10:00 — Affected transactions reversed manually
- 10:30 — All customers refunded

## Root Cause
The payment-consumer was using Kafka's auto-commit (default 5s interval). During a rebalance:
1. Events were processed and committed to the database
2. But the Kafka offset commit hadn't happened yet (still within the 5s window)
3. The new consumer for the reassigned partitions re-read from the last committed offset
4. 847 events were reprocessed; 12 passed the idempotency check because their keys had expired from the dedup table

## Action Items
1. [DONE] Switch to manual offset commit within DB transaction (ADR-005 pattern)
2. [DONE] Extend idempotency key TTL from 24h to 7 days
3. [DONE] Switch from EagerRebalance to CooperativeSticky (ADR-005)
4. [TODO] Add duplicate detection alert (>1% reprocessing rate)

## Financial Impact
- 12 duplicate charges totalling $4,237.89
- All refunded within 75 minutes of detection
- No regulatory reporting required (below $10K threshold)`,
));

docs.push(makeDoc(
  "gamma-inc-003", "incident",
  "INC-2025-142: 52-Hour Delayed Bug Discovery — Replay Window Exceeded",
  "operations", "before-phase-1",
  `# INC-2025-142: Delayed Bug Discovery — Replay Window Exceeded

## Severity: P2
## Duration: 2025-10-28 to 2025-10-30
## Impact: 23K events required warehouse-based reprocessing instead of Kafka replay

## Summary
A bug in the inventory-consumer silently dropped quantity-update events with negative values. The bug was deployed on Monday morning and not discovered until Wednesday afternoon (52 hours later), exceeding the 48-hour Kafka retention window.

## Timeline
- Monday 08:00 — Deploy inventory-consumer v2.3.1 (contained the bug)
- Monday 08:15 — First negative-quantity event silently dropped (no error, no DLQ)
- Wednesday 12:00 — Warehouse reconciliation job detects inventory discrepancies
- Wednesday 14:30 — Root cause identified: consumer v2.3.1 parseInt() silently ignores negative values
- Wednesday 15:00 — Kafka replay attempted — events older than 48h already purged
- Wednesday 16:00 — Warehouse-based replay initiated (6 hours to complete)
- Wednesday 22:00 — All 23K events reprocessed from warehouse data

## Root Cause
JavaScript parseInt() returns NaN for negative numbers when the string includes a minus sign in unexpected position. The consumer treated NaN as "no update needed" and silently skipped the event.

## Action Items
1. [DONE] Fix parseInt() → proper number parsing with validation
2. [DONE] Add negative-value test cases to consumer test suite
3. [IN PROGRESS] ADR-008 proposed: extend retention to 72 hours (pending approval)
4. [TODO] Implement event count reconciliation alerting (source count vs consumer count)

## Lessons Learned
- Silent failures are worse than loud failures
- 48-hour replay window is tight for bugs that manifest gradually
- Warehouse-based replay works but takes 6 hours instead of minutes`,
));

docs.push(makeDoc(
  "gamma-inc-004", "incident",
  "INC-2025-178: Kafka Broker Disk Full — Topic Partition Offline",
  "infrastructure", "before-phase-1",
  `# INC-2025-178: Kafka Broker Disk Full

## Severity: P1
## Duration: 2025-11-15 03:12 to 2025-11-15 05:45 UTC
## Impact: 3 topic partitions offline for 2.5 hours

## Summary
Broker-3 ran out of disk space at 03:12 UTC, causing 3 partitions to go offline. This affected the order-events and payment-events topics. Producers failed with NOT_ENOUGH_REPLICAS and consumers stalled.

## Root Cause
Log retention cleanup job was configured for 7 days on financial topics but the disk was sized for 48-hour retention. Financial topics had grown to 3.2x the expected size due to a schema change that added a large metadata field.

## Action Items
1. [DONE] Emergency disk expansion (500GB → 1TB on broker-3)
2. [DONE] Add disk usage alerting at 70% (warn) and 85% (critical)
3. [DONE] Right-size disks for 7-day financial topic retention
4. [TODO] Implement tiered storage (move old segments to S3)

## NEEDLE: The broker-3 emergency disk expansion was done by resizing the EBS volume from 500GB to 1TB using the AWS CLI command: \`aws ec2 modify-volume --volume-id vol-0a1b2c3d4e5f --size 1024\`. The volume ID for broker-3 is vol-0a1b2c3d4e5f. This is documented here in case we need to do it again.`,
  { needle: true, needleKey: "vol-0a1b2c3d4e5f" },
));

docs.push(makeDoc(
  "gamma-inc-005", "incident",
  "INC-2025-201: Certificate Expiry — mTLS Failure Across Cluster",
  "security", "before-phase-1",
  `# INC-2025-201: Certificate Expiry — mTLS Failure

## Severity: P1
## Duration: 2025-12-01 00:01 to 2025-12-01 02:30 UTC
## Impact: All inter-broker communication failed for 2.5 hours

## Summary
The Kafka inter-broker mTLS certificate expired at midnight on December 1st. This was a 1-year certificate issued on December 1st, 2024 and nobody set up renewal monitoring.

## Root Cause
Manual certificate management. No automation for certificate rotation. The P2 alert for "cert expiry <7 days" was configured for ingress certificates but not Kafka inter-broker certificates.

## Action Items
1. [DONE] Emergency certificate renewal
2. [DONE] Migrate to cert-manager for all Kafka certificates (90-day auto-rotation)
3. [DONE] Add certificate expiry monitoring for ALL certificates (not just ingress)
4. [DONE] Runbook: certificate emergency renewal procedure

## NEEDLE: The Kafka inter-broker certificate is stored in K8s secret \`kafka-broker-tls\` in namespace \`edp-kafka\`. The certificate authority is the internal CA at \`vault:pki/issue/kafka-broker\`. Renewal command: \`vault write pki/issue/kafka-broker common_name="kafka-broker.edp-kafka.svc.cluster.local" ttl=2160h\``,
  { needle: true, needleKey: "kafka-broker-tls" },
));

// ============================================================
// Technical Specs (~5K tokens each = ~30K total)
// ============================================================

docs.push(makeDoc(
  "gamma-spec-event-schema", "document",
  "Event Schema Specification — Standard Event Envelope",
  "schema", "before-phase-1",
  `# Event Schema Specification — Standard Event Envelope

## Version: 2.1
## Last Updated: 2025-11-20

## Overview

All events on the Enterprise Data Platform MUST conform to the Standard Event Envelope. This document defines the envelope structure, required fields, and extension mechanisms.

## Envelope Structure

\`\`\`avro
{
  "namespace": "com.edp.events",
  "type": "record",
  "name": "EventEnvelope",
  "fields": [
    {"name": "event_id", "type": "string", "doc": "UUID v7 (time-ordered)"},
    {"name": "event_type", "type": "string", "doc": "Fully qualified event type (e.g., com.edp.events.order.OrderCreated)"},
    {"name": "source", "type": "string", "doc": "Source system identifier"},
    {"name": "timestamp", "type": "long", "logicalType": "timestamp-millis"},
    {"name": "correlation_id", "type": "string", "doc": "Distributed tracing correlation ID"},
    {"name": "causation_id", "type": ["null", "string"], "default": null, "doc": "ID of the event that caused this event"},
    {"name": "schema_version", "type": "int", "doc": "Schema version number"},
    {"name": "partition_key", "type": "string", "doc": "Kafka partition key (usually entity ID)"},
    {"name": "payload", "type": "bytes", "doc": "Avro-encoded domain event payload"},
    {"name": "metadata", "type": {"type": "map", "values": "string"}, "default": {}, "doc": "Key-value metadata"}
  ]
}
\`\`\`

## Required Fields

| Field | Required | Validation |
|-------|----------|-----------|
| event_id | Yes | UUID v7 format |
| event_type | Yes | Must match registered schema name |
| source | Yes | Must be in the source system registry |
| timestamp | Yes | Must be within 5 minutes of server time |
| correlation_id | Yes | UUID format |
| schema_version | Yes | Must match Schema Registry version |
| partition_key | Yes | Non-empty string |
| payload | Yes | Valid Avro per registered schema |

## Event Types Registry

### Order Domain
- \`com.edp.events.order.OrderCreated\`
- \`com.edp.events.order.OrderConfirmed\`
- \`com.edp.events.order.OrderCancelled\`
- \`com.edp.events.order.OrderFulfilled\`

### Payment Domain
- \`com.edp.events.payment.PaymentInitiated\`
- \`com.edp.events.payment.PaymentProcessed\`
- \`com.edp.events.payment.PaymentFailed\`
- \`com.edp.events.payment.RefundInitiated\`
- \`com.edp.events.payment.RefundCompleted\`

### Inventory Domain
- \`com.edp.events.inventory.StockUpdated\`
- \`com.edp.events.inventory.StockReserved\`
- \`com.edp.events.inventory.StockReleased\`
- \`com.edp.events.inventory.LowStockAlert\`

### Shipping Domain
- \`com.edp.events.shipping.ShipmentCreated\`
- \`com.edp.events.shipping.ShipmentDispatched\`
- \`com.edp.events.shipping.ShipmentDelivered\`
- \`com.edp.events.shipping.DeliveryFailed\`

## Versioning Rules

1. Adding a new optional field with a default value: compatible (minor version bump)
2. Removing a field: incompatible (major version bump, new topic)
3. Changing a field type: incompatible (major version bump, new topic)
4. Adding a new enum value: compatible if using string (incompatible if using Avro enum)

## Metadata Standards

Reserved metadata keys:
- \`edp.tenant_id\` — multi-tenant isolation
- \`edp.environment\` — prod/staging/dev
- \`edp.retry_count\` — number of processing retries
- \`edp.dead_lettered_at\` — timestamp when sent to DLQ
- \`edp.original_topic\` — original topic before DLQ

## Payload Size Limits

- Soft limit: 512KB (triggers a warning log)
- Hard limit: 1MB (rejected by the validating producer interceptor)
- Events exceeding soft limit should use the claim-check pattern (store payload in S3, send reference)`,
));

docs.push(makeDoc(
  "gamma-spec-consumer-api", "document",
  "Consumer Service API Specification",
  "api", "before-phase-1",
  `# Consumer Service API Specification

## Version: 1.0
## Last Updated: 2025-10-15

## Overview

Each consumer service on the Enterprise Data Platform exposes a standard management API for operational control. This spec defines the required endpoints.

## Base URL

\`http://{service-name}.edp-prod.svc.cluster.local:8080\`

## Required Endpoints

### GET /health

Health check endpoint. Returns 200 if the service is healthy.

Response:
\`\`\`json
{
  "status": "healthy",
  "checks": {
    "kafka": {"status": "up", "consumer_group": "payment-consumer", "lag": 0},
    "database": {"status": "up", "pool_available": 45, "pool_total": 50},
    "schema_registry": {"status": "up", "cached_schemas": 127}
  },
  "uptime_seconds": 86400
}
\`\`\`

### GET /metrics

Prometheus metrics endpoint. Must expose:
- \`edp_consumer_events_processed_total{topic, partition, status}\`
- \`edp_consumer_event_processing_duration_seconds{topic, quantile}\`
- \`edp_consumer_lag{topic, partition, consumer_group}\`
- \`edp_consumer_errors_total{topic, error_type}\`
- \`edp_consumer_dlq_depth{service}\`
- Standard Go/Java runtime metrics

### POST /admin/pause

Pause event consumption. Used during maintenance windows.

Request:
\`\`\`json
{"reason": "Planned maintenance window", "duration_minutes": 30}
\`\`\`

Response: 200 OK

### POST /admin/resume

Resume event consumption after a pause.

### POST /admin/replay

Trigger a replay from a specific offset.

Request:
\`\`\`json
{
  "topic": "edp.events.payment.PaymentProcessed",
  "partition": 3,
  "from_offset": 1000000,
  "to_offset": 1001000,
  "dry_run": true
}
\`\`\`

### GET /admin/state

Return consumer state including partition assignments, current offsets, and processing statistics.

## Authentication

Admin endpoints (/admin/*) require a service token with the \`admin:consumer\` scope. Health and metrics endpoints are unauthenticated.

## Error Format

All errors follow RFC 9457 Problem Details format (see ADR-003).`,
));

docs.push(makeDoc(
  "gamma-spec-data-model", "document",
  "PostgreSQL Data Model — Order and Payment Services",
  "database", "before-phase-1",
  `# PostgreSQL Data Model — Order and Payment Services

## Version: 3.2
## Last Updated: 2025-11-25

## Schema: order_service

### Table: orders

\`\`\`sql
CREATE TABLE order_service.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  total_amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  items JSONB NOT NULL DEFAULT '[]',
  shipping_address JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_orders_customer ON order_service.orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_status ON order_service.orders (status) WHERE status NOT IN ('delivered', 'cancelled');
CREATE INDEX idx_orders_tenant ON order_service.orders (tenant_id, created_at DESC);
\`\`\`

### Table: order_events (audit trail)

\`\`\`sql
CREATE TABLE order_service.order_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  order_id UUID NOT NULL REFERENCES order_service.orders(id),
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  kafka_offset BIGINT,
  kafka_partition INT,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
\`\`\`

Monthly partitions created by automated job:
\`\`\`sql
CREATE TABLE order_service.order_events_2026_01
  PARTITION OF order_service.order_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
\`\`\`

## Schema: payment_service

### Table: payments

\`\`\`sql
CREATE TABLE payment_service.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method JSONB NOT NULL,
  gateway_reference VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_payments_order ON payment_service.payments (order_id);
CREATE INDEX idx_payments_customer ON payment_service.payments (customer_id, created_at DESC);
CREATE INDEX idx_payments_status ON payment_service.payments (status) WHERE status IN ('pending', 'processing');
\`\`\`

### Table: refunds

\`\`\`sql
CREATE TABLE payment_service.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payment_service.payments(id),
  amount_cents BIGINT NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  gateway_reference VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
\`\`\`

## Schema: platform

### Table: idempotency_keys

\`\`\`sql
CREATE TABLE platform.idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  service VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX idx_idemp_expires ON platform.idempotency_keys (expires_at);
\`\`\`

Cleanup job runs hourly: \`DELETE FROM platform.idempotency_keys WHERE expires_at < now()\`

## Migration Strategy

All migrations use Flyway with the following naming convention:
\`V{version}__{description}.sql\` (e.g., \`V001__create_orders_table.sql\`)

Migrations are applied automatically on service startup. Destructive migrations (DROP, ALTER TYPE) require manual approval via the #platform-migrations Slack channel.`,
));

// Protobuf alternative doc (CONTRADICTS ADR-002 which chose Avro)
docs.push(makeDoc(
  "gamma-spec-protobuf-proposal", "document",
  "Technical Proposal: Migrate to Protocol Buffers",
  "schema", "before-phase-1",
  `# Technical Proposal: Migrate to Protocol Buffers

## Author: Alex Chen (Platform Team)
## Date: 2025-12-15
## Status: PROPOSED (not accepted)

## Motivation

After 3 months of running Avro in production, several pain points have emerged:

1. **Avro tooling is Java-centric**: Our Python and Go services struggle with Avro libraries. The Python fastavro library has memory leaks under high throughput (see INC-2025-167).
2. **Schema Registry is a single point of failure**: INC-2025-089 showed that Schema Registry outage = total platform outage.
3. **Binary debugging is painful**: Avro binary format requires the schema to decode, making Kafka topic debugging with standard tools impossible.
4. **gRPC adoption blocked**: We want to use gRPC for the new real-time pricing service, but Avro doesn't integrate with gRPC's IDL.

## Proposal

Migrate from Avro to **Protocol Buffers (Protobuf)** for event serialization.

### Migration Strategy
1. Schema Registry already supports Protobuf (since Confluent Platform 7.0)
2. Dual-write period: producers emit both Avro and Protobuf for 2 weeks
3. Consumer migration: update one service at a time during the dual-write window
4. Post-migration: decommission Avro schemas

### Benefits
- Superior multi-language support (official Google libraries for Java, Python, Go, Rust)
- Self-describing .proto files (human-readable IDL)
- gRPC integration for future services
- Better backwards compatibility via field numbering (no schema version tracking needed)

### Risks
- **Migration complexity**: 12 services × 34 event types = significant effort
- **ADR-002 conflict**: This proposal contradicts the accepted decision to use Avro
- **Schema Registry compatibility**: Protobuf compatibility checking is less mature than Avro
- **Team knowledge**: Team has 0 production Protobuf experience

## Estimated Effort
- 3 engineers × 4 weeks = 12 person-weeks
- Risk: high (touching all producers and consumers simultaneously)

## Recommendation
This proposal should be evaluated in Q2 2026 after the platform stabilises. Implementing during the current migration phase adds unacceptable risk.

**NOTE: THIS PROPOSAL HAS NOT BEEN ACCEPTED. The current standard remains Avro per ADR-002.**`,
  { contradicts: "gamma-adr-002" },
));

docs.push(makeDoc(
  "gamma-spec-security-model", "document",
  "Platform Security Model — mTLS, SASL, and Authorization",
  "security", "before-phase-1",
  `# Platform Security Model

## Version: 1.3
## Last Updated: 2025-11-30

## Overview

The Enterprise Data Platform implements defense-in-depth security across all communication channels.

## Transport Security

### Inter-Broker Communication
- Protocol: TLS 1.3
- Certificate: Issued by internal Vault PKI (vault:pki/issue/kafka-broker)
- Rotation: Every 90 days via cert-manager
- Key size: RSA 4096-bit (will migrate to ECDSA P-384 in Q2 2026)

### Client-Broker Communication
- Protocol: TLS 1.3 with mutual authentication (mTLS)
- Client certificates: Issued per-service by Vault PKI
- Rotation: Every 90 days
- Trust chain: Internal CA → Intermediate CA → Service certificate

### Schema Registry
- Protocol: HTTPS (TLS 1.3)
- Authentication: mTLS for write operations, API key for read operations
- Read API key rotated quarterly

## Authentication

### Kafka SASL
- Mechanism: SCRAM-SHA-512
- Credentials stored in Vault at \`kv/edp/{service}/kafka-credentials\`
- Rotation: Quarterly, automated via Vault dynamic credentials
- Fallback: If Vault is unavailable, services use cached credentials (max 24h stale)

### Service-to-Service
- All HTTP APIs require JWT bearer token
- Tokens issued by the platform auth service (shared secret for internal services)
- Token expiry: 1 hour for automated services, 15 minutes for user-facing

## Authorization

### Kafka ACLs
- Principle of least privilege: each service gets access only to its topics
- Producer ACLs: WRITE on specific topics only
- Consumer ACLs: READ on specific topics + consumer group
- Admin ACLs: restricted to platform team service account

### Database Authorization
- Schema-level isolation: each service's database user can only access its own schema
- Platform schema: read-only access for services, write access for platform jobs
- Superuser: restricted to migration runner and DBA access

## Secret Management

All secrets managed by HashiCorp Vault:
- Kafka credentials: \`kv/edp/{service}/kafka-credentials\`
- Database credentials: \`database/creds/edp-{service}\`
- TLS certificates: \`pki/issue/{service}\`
- API keys: \`kv/edp/{service}/api-keys\`

## NEEDLE: The Vault root token for the EDP cluster is rotated monthly and stored in the physical safe in Building C, Floor 3, Room 312. The combination to access the safe is managed by the CTO and VP Engineering (dual-control). The backup unseal keys are split across 5 keyholders with a threshold of 3 (Shamir's Secret Sharing). Keyholders: Alice (VP Eng), Bob (CTO), Charlie (Lead SRE), David (Security Lead), Eve (Compliance Officer).`,
  { needle: true, needleKey: "Building C Floor 3 Room 312" },
));

docs.push(makeDoc(
  "gamma-spec-capacity", "document",
  "Capacity Planning — Q1 2026 Projections",
  "infrastructure", "before-phase-1",
  `# Capacity Planning — Q1 2026

## Current State (2025-12-20)

| Resource | Current | Peak | Capacity | Headroom |
|----------|---------|------|----------|----------|
| Kafka throughput | 180K msg/s | 320K msg/s | 500K msg/s | 36% |
| Kafka storage | 1.9TB | - | 5TB | 62% |
| PostgreSQL connections | 280 | 420 | 500 | 16% |
| PostgreSQL storage | 450GB | - | 2TB | 77% |
| K8s nodes | 12 | - | 20 (ASG max) | 40% |
| Consumer lag (p99) | 2.3s | 8.1s | 300s (SLO) | 97% |

## Q1 2026 Projections

Based on planned feature launches:
- **Real-time pricing** (Feb): +50K msg/s, +2 consumer services
- **International expansion** (Mar): +100K msg/s from 3 new markets, +1 Kafka partition per topic
- **Audit log enhancement** (Jan): +200GB PostgreSQL storage

### Projected State (End of Q1 2026)

| Resource | Projected | Capacity | Action Needed |
|----------|-----------|----------|---------------|
| Kafka throughput | 430K msg/s | 500K msg/s | Add 2 brokers by Feb (14% headroom) |
| Kafka storage | 3.2TB | 5TB | OK for Q1 |
| PostgreSQL connections | 520 | 500 | CRITICAL: Increase PgBouncer pool OR add read replicas |
| PostgreSQL storage | 750GB | 2TB | OK for Q1 |
| K8s nodes | 16 | 20 | Request ASG increase to 30 |

## Action Items
1. [P0] Increase PgBouncer max connections from 500 to 750 before International launch
2. [P1] Add 2 Kafka brokers before Real-time pricing launch (broker-6, broker-7)
3. [P2] Request K8s ASG max increase from 20 to 30
4. [P3] Evaluate read replicas for order-service queries (currently 60% of DB load)`,
));

// ============================================================
// Runbooks (~4K tokens each = ~16K total)
// ============================================================

docs.push(makeDoc(
  "gamma-runbook-deploy", "document",
  "Runbook: Consumer Service Deployment",
  "operations", "before-phase-1",
  `# Runbook: Consumer Service Deployment

## Prerequisites
- Access to ArgoCD dashboard (https://argocd.internal.edp.com)
- K8s cluster credentials (\`edp-prod\` context)
- Kafka CLI tools installed (\`kafka-consumer-groups.sh\`)
- PagerDuty access for incident creation

## Standard Deployment (Rolling Update)

### 1. Pre-deployment Checks
\`\`\`bash
# Check current consumer lag
kubectl exec -n edp-kafka kafka-0 -- kafka-consumer-groups.sh \\
  --bootstrap-server kafka-0:9092 --group {service}-consumer --describe

# Verify no active incidents
curl -s https://pagerduty.com/api/v2/incidents?statuses[]=triggered \\
  -H "Authorization: Token $PD_TOKEN" | jq '.incidents | length'

# Check Schema Registry health
curl -s https://schema-registry.edp-prod:8081/subjects | jq length
\`\`\`

### 2. Deploy via ArgoCD
\`\`\`bash
# Sync the application
argocd app sync {service} --prune

# Monitor rollout
kubectl rollout status deployment/{service} -n edp-prod --timeout=300s
\`\`\`

### 3. Post-deployment Verification
\`\`\`bash
# Check consumer group is stable
kubectl exec -n edp-kafka kafka-0 -- kafka-consumer-groups.sh \\
  --bootstrap-server kafka-0:9092 --group {service}-consumer --describe

# Verify no error spike in last 5 minutes
kubectl logs -n edp-prod deployment/{service} --since=5m | grep -c ERROR

# Check Grafana dashboard for anomalies
# Dashboard: https://grafana.internal.edp.com/d/edp-consumer-overview
\`\`\`

## Canary Deployment (Blue-Green via Argo Rollouts)

For critical services (payment-consumer, reconciliation):

### 1. Initiate Canary
\`\`\`bash
# Update image tag in Argo Rollout
kubectl argo rollouts set image {service} {service}={image}:{tag} -n edp-prod

# Watch rollout progress
kubectl argo rollouts get rollout {service} -n edp-prod --watch
\`\`\`

### 2. Canary Analysis (automated)
- 10% traffic for 5 minutes
- Check: error rate <1%, latency p99 <500ms, no DLQ events
- Auto-promote if checks pass
- Auto-rollback if checks fail

### 3. Manual Promotion (if auto-promote disabled)
\`\`\`bash
kubectl argo rollouts promote {service} -n edp-prod
\`\`\`

## Rollback

### Immediate Rollback
\`\`\`bash
# Via ArgoCD
argocd app rollback {service}

# Via kubectl (standard deployment)
kubectl rollout undo deployment/{service} -n edp-prod

# Via Argo Rollouts (canary)
kubectl argo rollouts abort {service} -n edp-prod
\`\`\`

### Post-Rollback
1. Check consumer group rebalance completed
2. Verify lag is decreasing
3. Create incident if rollback was due to production impact`,
));

docs.push(makeDoc(
  "gamma-runbook-kafka-recovery", "document",
  "Runbook: Kafka Cluster Recovery Procedures",
  "operations", "before-phase-1",
  `# Runbook: Kafka Cluster Recovery Procedures

## Scenario 1: Single Broker Failure

### Symptoms
- Under-replicated partitions alert
- Producer latency increase (if min.insync.replicas affected)
- Broker metrics disappear from Prometheus

### Recovery Steps
1. Check broker status: \`kubectl get pod kafka-{n} -n edp-kafka\`
2. If CrashLoopBackOff: check logs for OOM, disk full, or config errors
3. If disk full: follow Scenario 4 (Disk Full Recovery)
4. If OOM: increase memory limit in StatefulSet, restart pod
5. After restart: verify partition reassignment completes
6. Check ISR (in-sync replicas) restored: \`kafka-metadata.sh --snapshot /var/kafka-logs/__cluster_metadata-0/00000000000000000000.log --cluster-id {id}\`

### Expected Recovery Time: 5-15 minutes (automatic)

## Scenario 2: Schema Registry Outage

### Symptoms
- Consumer deserialization errors (AvroDeserializationException)
- Producer serialization errors
- Schema Registry health check failing

### Recovery Steps
1. Check Schema Registry pod: \`kubectl get pod schema-registry-0 -n edp-kafka\`
2. Check logs: \`kubectl logs schema-registry-0 -n edp-kafka --tail=100\`
3. If OOM: increase heap to 4GB (\`SCHEMA_REGISTRY_HEAP_OPTS: -Xmx4g\`)
4. If __schemas topic issue: check topic health in Kafka
5. Restart: \`kubectl delete pod schema-registry-0 -n edp-kafka\`
6. Wait for schema cache to warm (2-5 minutes for 10K schemas)
7. Verify: \`curl https://schema-registry:8081/subjects | jq length\`

### Expected Recovery Time: 5-10 minutes
### See also: INC-2025-089 for detailed timeline of a past Schema Registry outage

## Scenario 3: Consumer Group Rebalance Storm

### Symptoms
- Frequent rebalance logs: "Rebalance triggered"
- Consumer lag spiking
- No events being processed despite healthy consumers

### Recovery Steps
1. Check if HPA is rapidly scaling: \`kubectl get hpa {service} -n edp-prod\`
2. If scaling storm: set HPA min=max temporarily
3. Check session.timeout.ms and max.poll.interval.ms settings
4. If individual consumer keeps restarting: check for OOM or processing timeout
5. Force stable state: scale to known-good replica count, wait for single rebalance

## Scenario 4: Disk Full Recovery

### Symptoms
- Broker log: "Log directory /var/kafka-logs is full"
- Partitions going offline

### Recovery Steps
1. Identify affected broker: check Prometheus for \`kafka_log_size_bytes\`
2. Emergency space recovery:
   \`\`\`bash
   # Delete oldest log segments on affected broker
   kubectl exec kafka-{n} -n edp-kafka -- find /var/kafka-logs -name "*.log" -mtime +2 -delete
   \`\`\`
3. Expand PVC (if dynamic provisioning):
   \`\`\`bash
   kubectl patch pvc data-kafka-{n} -n edp-kafka -p '{"spec":{"resources":{"requests":{"storage":"1Ti"}}}}'
   \`\`\`
4. Monitor partition recovery
5. Post-incident: review retention settings and capacity projections`,
));

docs.push(makeDoc(
  "gamma-runbook-db-migration", "document",
  "Runbook: Database Schema Migration",
  "database", "before-phase-1",
  `# Runbook: Database Schema Migration

## Prerequisites
- Flyway CLI installed
- Database credentials from Vault: \`vault read database/creds/edp-{service}-migration\`
- Migration PR approved in #platform-migrations Slack channel
- Change window: Tuesday or Thursday, 10:00-14:00 UTC (low-traffic period)

## Standard Migration (Non-Destructive)

### 1. Pre-migration
\`\`\`bash
# Verify migration files
flyway info -url="jdbc:postgresql://edp-db:5432/{service}" -user="$DB_USER" -password="$DB_PASS"

# Check current version
flyway info | tail -5

# Dry run (Flyway Pro only)
flyway migrate -dryRunOutput=migration-plan.sql
\`\`\`

### 2. Execute Migration
\`\`\`bash
# Apply pending migrations
flyway migrate -url="jdbc:postgresql://edp-db:5432/{service}" -user="$DB_USER" -password="$DB_PASS"

# Verify
flyway info | tail -5
\`\`\`

### 3. Post-migration
- Verify application health
- Check slow query log for new slow queries
- Monitor replication lag (should settle <1s within 5 minutes)

## Destructive Migration (DROP, ALTER TYPE, etc.)

**REQUIRES EXPLICIT APPROVAL** in #platform-migrations

### Additional Steps
1. Create a backup of affected tables BEFORE migration:
   \`\`\`bash
   pg_dump -t {schema}.{table} -f backup-{table}-$(date +%Y%m%d).sql edp-db
   \`\`\`
2. Schedule downtime window if migration locks tables for >5 seconds
3. Monitor lock waits during migration: \`SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock'\`
4. Have rollback migration ready (V{n+1}__rollback_{description}.sql)

## Rollback

### Flyway Undo (if available)
\`\`\`bash
flyway undo -url="jdbc:postgresql://edp-db:5432/{service}" -user="$DB_USER" -password="$DB_PASS"
\`\`\`

### Manual Rollback
1. Apply the prepared rollback migration
2. Or restore from the pre-migration backup
3. Restart affected services

## Emergency: Wrong Database Targeted

If a migration was accidentally applied to the wrong database:
1. **STOP** — do not attempt to fix it in the wrong database
2. Create an incident (P1 if production data affected)
3. Restore from backup
4. Root cause: how did the wrong connection string get used?`,
));

docs.push(makeDoc(
  "gamma-runbook-incident-response", "document",
  "Runbook: Platform Incident Response",
  "operations", "before-phase-1",
  `# Runbook: Platform Incident Response

## Severity Definitions

| Severity | Definition | Response Time | Examples |
|----------|-----------|---------------|---------|
| P1 | Platform-wide outage or data loss | 15 min | Kafka cluster down, DB corruption, security breach |
| P2 | Service degradation affecting customers | 4 hours | Consumer lag >10min, partial outage, double-processing |
| P3 | Issue affecting internal operations | Next business day | Monitoring gap, non-critical bug, performance degradation |
| P4 | Minor issue, no impact | Weekly review | Tech debt, documentation gap, non-urgent improvement |

## Incident Response Process

### 1. Detection
- PagerDuty alert (automated)
- Customer report (support ticket)
- Internal discovery (monitoring dashboard)

### 2. Triage
1. Assess severity using the table above
2. Create incident in PagerDuty: \`pd-cli incident create --title "{description}" --severity {P1|P2|P3|P4}\`
3. If P1/P2: open a Slack war room in #incident-response

### 3. Communication
- P1: Update status page every 15 minutes
- P2: Update status page every 30 minutes
- Stakeholder notification: template in #incident-templates

### 4. Investigation
1. Check dashboards: https://grafana.internal.edp.com/d/edp-overview
2. Check logs: Kibana search with correlation_id if available
3. Check recent deployments: \`argocd app list --output json | jq '.[] | select(.status.sync.status != "Synced")'\`
4. Check recent config changes: \`git log --oneline --since="6 hours ago" infra/\`

### 5. Resolution
1. Apply fix or rollback
2. Verify recovery via dashboards and health checks
3. Clear the PagerDuty incident

### 6. Post-Incident
- Write post-mortem within 48 hours (template: docs/templates/postmortem.md)
- Create action items as Jira tickets
- Present at weekly platform review

## Escalation Path

| Step | Contact | When |
|------|---------|------|
| 1 | On-call SRE | Immediate (PagerDuty) |
| 2 | Platform Team Lead | If P1 not resolved in 30 min |
| 3 | VP Engineering | If P1 not resolved in 2 hours |
| 4 | CTO | If P1 with data loss or security breach |`,
));

// ============================================================
// Compliance Documents (~5K tokens each = ~15K total)
// ============================================================

docs.push(makeDoc(
  "gamma-compliance-gdpr", "document",
  "GDPR Compliance Requirements — Data Platform",
  "compliance", "before-phase-1",
  `# GDPR Compliance Requirements — Data Platform

## Applicable Regulations
- GDPR (EU General Data Protection Regulation)
- UK-GDPR (post-Brexit equivalent)
- Company Data Processing Agreement (DPA) v3.1

## Requirements for the Event Streaming Platform

### 1. Right to Erasure (Article 17)

When a deletion request is received:
1. **Kafka topics**: PII-containing events must be deletable within 72 hours
   - Current approach: tombstone messages + compaction for changelog topics
   - Event topics: PII masked in the payload after the retention window expires
   - **IMPORTANT**: The 48-hour retention window (ADR-007) means most event data is auto-purged. Only changelog topics and DB records need active deletion.

2. **PostgreSQL**: Direct deletion from all tables containing the customer's data
   - \`order_service.orders\` — anonymize customer_id, clear shipping_address
   - \`payment_service.payments\` — anonymize customer_id, clear payment_method
   - Audit trail: retained but anonymized (regulatory requirement to keep transaction records for 7 years)

3. **Elasticsearch**: Delete all log entries containing the customer's PII
   - Query: \`POST /logs-*/_delete_by_query {"query":{"match":{"customer_id":"{id}"}}}\`
   - This may take up to 24 hours due to index refresh intervals

### 2. Data Minimisation (Article 5(1)(c))

- Events MUST NOT contain more PII than necessary for processing
- Payment card numbers must be tokenized before entering the event stream
- Email addresses are allowed in order events but not in analytics events
- Metadata fields must not contain PII unless explicitly approved

### 3. Data Portability (Article 20)

- Customer data export in JSON format via the data-export-service
- Export includes: orders, payments, profile data, communication preferences
- Export request must be fulfilled within 30 days
- Export does not include internal analytics or derived data

### 4. Breach Notification (Article 33)

- Security breaches involving PII must be reported to the DPA within 72 hours
- The platform team must be able to determine breach scope within 24 hours
- Audit logging must capture all access to PII-containing tables

## Data Classification

| Classification | Examples | Kafka Retention | DB Retention | Encryption |
|---------------|---------|----------------|-------------|-----------|
| PII-High | Credit card tokens, SSN | 48h | 7 years (anonymized after 2) | At rest + in transit |
| PII-Medium | Email, name, address | 48h | 2 years | At rest + in transit |
| PII-Low | IP address, device ID | 48h | 90 days | In transit |
| Non-PII | Order amounts, item counts | 7 days | Indefinite | In transit |

## Compliance Monitoring
- Quarterly DPA review with legal team
- Annual penetration test of the platform
- Monthly PII scanning of new Kafka topics and DB tables
- Automated classification of new Avro schemas via CI pipeline`,
));

docs.push(makeDoc(
  "gamma-compliance-pci", "document",
  "PCI-DSS Requirements — Payment Processing",
  "compliance", "before-phase-1",
  `# PCI-DSS Requirements — Payment Processing

## Scope

The payment-consumer service and its dependencies are in scope for PCI-DSS Level 1 compliance.

## Relevant Requirements

### Requirement 3: Protect Stored Cardholder Data
- Raw card numbers (PAN) MUST NOT enter the event stream
- Card data is tokenized at the API gateway before any Kafka event is produced
- Token format: \`tok_{base62_hash}\` — no mathematical relationship to PAN
- The payment gateway (Stripe) handles all raw card processing

### Requirement 4: Encrypt Transmission of Cardholder Data
- All Kafka communication uses TLS 1.3 (mTLS for clients)
- All database connections use TLS 1.3
- No cardholder data transmitted over non-encrypted channels

### Requirement 6: Develop and Maintain Secure Systems
- All payment-consumer code changes require security review
- Dependency scanning via Snyk on every PR
- No known critical/high CVEs in production dependencies

### Requirement 8: Identify and Authenticate Access
- Service accounts use unique credentials per environment
- Credentials rotated quarterly (automated via Vault)
- No shared accounts or passwords

### Requirement 10: Track and Monitor All Access
- All access to payment data logged with: who, what, when, from where
- Logs retained for 12 months (hot) + 12 months (cold archive)
- Log integrity verified via cryptographic hashing

### Requirement 11: Regular Security Testing
- External penetration test annually
- Internal vulnerability scan quarterly
- Code review for all payment service changes

## Compensating Controls
- Kafka messages containing payment references are encrypted at the field level (beyond TLS)
- Field-level encryption uses AES-256-GCM with Vault-managed keys
- Encryption key rotation: every 90 days

## Audit Evidence
PCI-DSS audit evidence is maintained in the \`pci-evidence\` S3 bucket:
- \`s3://pci-evidence/network-diagrams/\`
- \`s3://pci-evidence/scan-reports/\`
- \`s3://pci-evidence/access-reviews/\`
- \`s3://pci-evidence/change-logs/\``,
));

docs.push(makeDoc(
  "gamma-compliance-soc2", "document",
  "SOC 2 Type II — Platform Controls",
  "compliance", "before-phase-1",
  `# SOC 2 Type II — Platform Controls

## Trust Service Criteria Coverage

### CC6.1: Logical Access Controls

| Control | Implementation | Evidence |
|---------|---------------|---------|
| Authentication | SASL/SCRAM for Kafka, JWT for APIs | Vault audit log |
| Authorization | Kafka ACLs, DB schema isolation | ACL configuration files |
| Least privilege | Per-service credentials, scoped ACLs | Service account matrix |
| MFA | Required for human access to production systems | SSO audit log |
| Access review | Quarterly review of all service accounts | Access review tickets |

### CC7.2: System Monitoring

| Control | Implementation | Evidence |
|---------|---------------|---------|
| Intrusion detection | Network policies + Falco on K8s | Falco alert log |
| Anomaly detection | Prometheus alerts for unusual patterns | Alert history |
| Log monitoring | Kibana dashboards + saved searches | Dashboard configs |
| Incident response | Documented runbook + PagerDuty integration | Incident records |

### CC8.1: Change Management

| Control | Implementation | Evidence |
|---------|---------------|---------|
| Code review | Required PR reviews (2 approvers) | GitHub PR records |
| Testing | CI/CD with unit + integration tests | Test reports |
| Deployment | ArgoCD GitOps (audit trail) | ArgoCD sync history |
| Rollback | Documented rollback procedures per service | Runbook + drill records |

### A1.2: Data Processing Integrity

| Control | Implementation | Evidence |
|---------|---------------|---------|
| Exactly-once delivery | Kafka transactions + idempotency | ADR-005, monitoring |
| Schema validation | Schema Registry compatibility checks | CI pipeline logs |
| Reconciliation | Daily balance reconciliation job | Reconciliation reports |
| Error handling | DLQ + alerting + manual replay | DLQ depth metrics |

## Audit Schedule
- SOC 2 Type II audit: annually in Q3
- Readiness assessment: Q1 (internal)
- Evidence collection: continuous, automated where possible
- Gap remediation: Q2 (before audit)`,
));

// ============================================================
// Team Knowledge (~3K tokens each = ~12K total)
// ============================================================

docs.push(makeDoc(
  "gamma-team-onboarding", "document",
  "Platform Team Onboarding Guide",
  "team", "before-phase-1",
  `# Platform Team Onboarding Guide

## Welcome

Welcome to the Enterprise Data Platform team. This guide covers everything you need to get productive.

## Access Setup (Day 1)

1. **Slack channels**: #edp-general, #edp-alerts, #edp-deployments, #incident-response
2. **GitHub**: Request access to \`edp-platform\`, \`edp-schemas\`, \`edp-infra\` repos
3. **K8s access**: Request \`edp-prod\` and \`edp-staging\` cluster credentials from SRE
4. **Vault access**: Request service-specific paths from Security team
5. **Grafana**: Auto-provisioned via SSO (edp-team role)
6. **PagerDuty**: Added to on-call rotation after 2 weeks

## Architecture Overview

The platform consists of:
- **Kafka cluster** (5 brokers, KRaft mode) — managed by Strimzi operator
- **Schema Registry** — Confluent Schema Registry (single node, HA planned)
- **PostgreSQL** (1 primary + 2 replicas) — managed by Patroni
- **12 consumer services** — Java 21 and Python 3.12
- **Kubernetes** (EKS 1.29) — 20 nodes across 3 AZs

## Key Decisions (read these ADRs)
1. ADR-001: Kafka for event streaming
2. ADR-002: Avro with Schema Registry
3. ADR-003: PostgreSQL for ODS
4. ADR-005: Exactly-once delivery pattern
5. ADR-006: Monitoring stack

## Development Workflow
1. Branch from \`main\`
2. Write code + tests
3. Open PR (2 reviewers required)
4. CI runs: lint, unit tests, integration tests, schema compatibility
5. Merge to \`main\` triggers ArgoCD sync to staging
6. Promotion to prod: manual ArgoCD sync after staging validation

## On-Call Rotation
- Weekly rotation (Monday 09:00 UTC to Monday 09:00 UTC)
- Primary + secondary on-call
- Escalation path documented in the incident response runbook
- Shadow on-call for first 2 rotations`,
));

docs.push(makeDoc(
  "gamma-team-conventions", "document",
  "Coding Conventions and Standards",
  "team", "before-phase-1",
  `# Coding Conventions and Standards

## Language-Specific

### Java (Consumer Services)
- Java 21 with virtual threads (Project Loom)
- Build: Gradle 8.x with version catalog
- Style: Google Java Style Guide (enforced by Checkstyle)
- Testing: JUnit 5 + Testcontainers for integration tests
- Logging: SLF4J with Logback, structured JSON output

### Python (Data Pipelines)
- Python 3.12+
- Package management: Poetry
- Style: Black formatter + Ruff linter
- Testing: pytest + testcontainers-python
- Type hints: required for all public functions

## Kafka Conventions
- Topic naming: \`edp.events.{domain}.{entity}\` (lowercase, dot-separated)
- Consumer group: \`{service-name}-consumer\`
- Transactional ID: \`{service-name}-{partition}\`
- Partition key: entity ID (ensures ordering within entity)

## Database Conventions
- Table naming: snake_case, plural (\`orders\`, \`payments\`)
- Column naming: snake_case (\`created_at\`, \`customer_id\`)
- Primary keys: UUID (gen_random_uuid())
- Timestamps: TIMESTAMPTZ (always UTC)
- Soft delete: \`deleted_at TIMESTAMPTZ\` column (never hard delete production data)

## API Conventions
- Error format: RFC 9457 Problem Details (ADR-003)
- Authentication: JWT bearer token in Authorization header
- Pagination: cursor-based (\`cursor\` + \`limit\` parameters)
- Versioning: URL path (/v1/, /v2/)
- Content-Type: application/json (application/problem+json for errors)

## Git Conventions
- Branch naming: \`{type}/{ticket}-{description}\` (e.g., \`feat/EDP-123-add-replay-endpoint\`)
- Commit messages: Conventional Commits (\`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`)
- PR title: ticket number + brief description
- Squash merge to main (preserve clean history)`,
));

docs.push(makeDoc(
  "gamma-team-architecture-faq", "document",
  "Architecture FAQ — Common Questions",
  "team", "before-phase-1",
  `# Architecture FAQ

## Q: Why Kafka instead of RabbitMQ?
A: Kafka provides event replay, exactly-once semantics, and handles our 500K msg/s throughput requirement. RabbitMQ is better for task queues but not for event streaming. See ADR-001.

## Q: Why Avro instead of JSON?
A: Binary efficiency (10x smaller), schema evolution guarantees, and Schema Registry integration. JSON was considered but rejected for production topics due to lack of schema enforcement. See ADR-002.

## Q: Why not Protobuf?
A: Close decision. Avro won because of deeper Kafka ecosystem integration and team expertise. A Protobuf migration proposal (gamma-spec-protobuf-proposal) exists but has NOT been accepted. See ADR-002.

## Q: How do we handle schema changes?
A: BACKWARD compatible changes (adding optional fields) are deployed normally. Breaking changes require a new topic. Schema compatibility is enforced by Schema Registry and checked in CI. See the Event Schema Specification.

## Q: What happens if Schema Registry goes down?
A: Total consumer failure until it recovers. This was demonstrated in INC-2025-089 (2.5 hour outage). HA deployment is planned but not yet implemented. Consumers should implement schema caching as a mitigation.

## Q: How long can we replay events?
A: 48 hours from Kafka (ADR-007). After that, replay from the data warehouse (takes ~6 hours). A proposal to extend to 72 hours (ADR-008) is in draft status but not yet accepted. The current policy is 48 hours.

## Q: What's the consumer lag SLO?
A: P99 consumer lag must be under 5 minutes. P1 alert fires at 10 minutes. Current P99 is 2.3 seconds.

## Q: How do we ensure exactly-once processing?
A: Kafka transactions + database transactions + idempotency keys. Belt and suspenders. See ADR-005.

## Q: Can I add a new consumer service?
A: Yes. Follow the consumer service template in \`edp-platform/templates/consumer-service/\`. You need: Kafka ACLs (request via #edp-access), a database schema, and a Helm chart. The service must expose the standard management API (see Consumer Service API Specification).

## Q: What about data retention and GDPR?
A: PII data has strict retention limits. See the GDPR Compliance Requirements document. Key point: the 48-hour Kafka retention means most PII is auto-purged. DB and Elasticsearch records need active deletion on request.`,
));

docs.push(makeDoc(
  "gamma-team-decision-log", "document",
  "Platform Decision Log — Q4 2025",
  "team", "before-phase-1",
  `# Platform Decision Log — Q4 2025

## 2025-10-05: Partition Count Standard
**Decision**: Default 12 partitions per topic.
**Rationale**: Matches our max consumer parallelism (12 instances). Can be increased later but not decreased.
**Participants**: Platform team (unanimous)

## 2025-10-12: Schema Compatibility Default
**Decision**: BACKWARD compatibility as default, FULL for financial schemas.
**Rationale**: BACKWARD allows new code to read old data, which covers 90% of our use cases. Financial schemas need FULL because both old and new consumers may run simultaneously during deployments.
**Participants**: Platform team + Finance engineering lead

## 2025-10-20: Consumer Group Strategy
**Decision**: CooperativeSticky assignment strategy for all consumer groups.
**Rationale**: Reduces rebalance disruption (incremental reassignment vs stop-the-world). Adopted after INC-2025-112 (double-processing incident).
**Participants**: Platform team

## 2025-11-01: Monitoring Stack Selection
**Decision**: Prometheus + Grafana + Jaeger + ELK.
**Rationale**: Team has existing expertise. Alternatives (Datadog, New Relic) evaluated but cost-prohibitive at our scale. See ADR-006.
**Participants**: Platform team + SRE team

## 2025-11-10: Retention Policy
**Decision**: 48-hour Kafka retention for event topics.
**Rationale**: Balances operational needs with compliance requirements. See ADR-007.
**Participants**: Platform team + Compliance team
**NOTE**: A proposal to extend to 72 hours (ADR-008) is under review.

## 2025-11-25: Database Migration Tool
**Decision**: Flyway (not Liquibase).
**Rationale**: SQL-first approach (Flyway) preferred over XML/YAML-based (Liquibase). Team has Flyway experience.
**Participants**: Platform team

## 2025-12-01: Certificate Management
**Decision**: Migrate to cert-manager for all certificates.
**Rationale**: INC-2025-201 (certificate expiry) demonstrated the risk of manual certificate management.
**Participants**: Platform team + Security team`,
));

// ============================================================
// STALE document (old, superseded by newer information)
// ============================================================

docs.push(makeDoc(
  "gamma-stale-topology", "document",
  "Kafka Cluster Topology (OUTDATED — January 2025)",
  "infrastructure", "before-phase-1",
  `# Kafka Cluster Topology — January 2025

**WARNING: This document may be outdated. It was last reviewed in January 2025.**

## Cluster Configuration
- 3 brokers (broker-1, broker-2, broker-3)
- ZooKeeper ensemble (3 nodes)
- Replication factor: 2
- min.insync.replicas: 1

## Topic Layout
- \`edp.events.{source}.{entity}\` — 6 partitions per topic
- Retention: 24 hours
- No DLQ topics (errors logged to file)

## Notes
- This was the initial cluster design from January 2025.
- The cluster has since been upgraded multiple times.
- Current topology: see ADR-001 (5 brokers, KRaft mode, replication factor 3)
- Current retention: see ADR-007 (48 hours, not 24)
- Current partitions: 12 per topic, not 6`,
  { stale: true },
));

// ============================================================
// Summary
// ============================================================

const totalTokens = docs.reduce((sum, d) => sum + d.tokens, 0);
console.error(`Generated ${docs.length} documents, ~${totalTokens} tokens`);

const corpus = { documents: docs };
writeFileSync(
  join(resolve(import.meta.dirname), "corpus.json"),
  JSON.stringify(corpus, null, 2),
);
console.error("Written to corpus.json");
