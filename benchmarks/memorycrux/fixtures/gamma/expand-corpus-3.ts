#!/usr/bin/env tsx
// Gamma Fixture — Third corpus expansion to reach ~107K tokens
// Adds large technical reference documents.

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

// Generate a block of realistic configuration/reference text
function configBlock(service: string, entries: Array<[string, string, string]>): string {
  let out = `### ${service} Configuration Reference\n\n`;
  out += `| Property | Default | Description |\n|----------|---------|-------------|\n`;
  for (const [prop, def, desc] of entries) {
    out += `| \`${prop}\` | ${def} | ${desc} |\n`;
  }
  return out;
}

const newDocs: CorpusDoc[] = [];

newDocs.push(makeDoc(
  "gamma-ref-kafka-config", "document",
  "Kafka Configuration Reference — All Broker, Producer, Consumer Settings",
  "infrastructure", "before-phase-1",
  `# Kafka Configuration Reference — Enterprise Data Platform

## Overview

This document provides the complete Kafka configuration reference for the EDP deployment.
All settings are documented with their current production values, defaults, and the rationale
for any overrides.

## Broker Configuration

### Core Settings

| Property | Production Value | Default | Rationale |
|----------|-----------------|---------|-----------|
| \`broker.id\` | auto-generated | -1 | KRaft auto-assigns |
| \`process.roles\` | broker,controller | - | Combined mode for 5-node cluster |
| \`controller.quorum.voters\` | 0@kafka-0:9093,1@kafka-1:9093,2@kafka-2:9093 | - | 3 controllers for quorum |
| \`listeners\` | CLIENT://:9092,CONTROLLER://:9093 | - | Separate client and controller ports |
| \`inter.broker.listener.name\` | CLIENT | - | Replication uses client listener |
| \`controller.listener.names\` | CONTROLLER | - | Controller-only listener |
| \`listener.security.protocol.map\` | CLIENT:SSL,CONTROLLER:SSL | - | mTLS everywhere |
| \`num.network.threads\` | 8 | 3 | Increased for high throughput |
| \`num.io.threads\` | 16 | 8 | Increased for NVMe SSDs |
| \`socket.send.buffer.bytes\` | 1048576 | 102400 | 1MB send buffer |
| \`socket.receive.buffer.bytes\` | 1048576 | 102400 | 1MB receive buffer |
| \`socket.request.max.bytes\` | 104857600 | 104857600 | 100MB max request |

### Log Settings

| Property | Production Value | Default | Rationale |
|----------|-----------------|---------|-----------|
| \`log.dirs\` | /var/kafka/data | /tmp/kafka-logs | Dedicated NVMe mount |
| \`num.partitions\` | 12 | 1 | Default for new topics |
| \`default.replication.factor\` | 3 | 1 | All topics replicated 3x |
| \`min.insync.replicas\` | 2 | 1 | Require 2 acks for durability |
| \`log.retention.ms\` | 172800000 | 604800000 | 48 hours (not 7 days) |
| \`log.retention.bytes\` | -1 | -1 | No size-based retention |
| \`log.segment.bytes\` | 1073741824 | 1073741824 | 1GB segments |
| \`log.segment.ms\` | 86400000 | 604800000 | Roll daily (not weekly) |
| \`log.cleanup.policy\` | delete | delete | Default delete policy |
| \`log.cleaner.enable\` | true | true | Required for compacted topics |
| \`log.cleaner.threads\` | 4 | 1 | More threads for faster compaction |
| \`log.cleaner.io.max.bytes.per.second\` | Infinity | Infinity | No I/O throttle |
| \`compression.type\` | lz4 | producer | Force LZ4 on broker side |

### Replication Settings

| Property | Production Value | Default | Rationale |
|----------|-----------------|---------|-----------|
| \`replica.lag.time.max.ms\` | 30000 | 30000 | 30s before replica removed from ISR |
| \`replica.fetch.max.bytes\` | 10485760 | 1048576 | 10MB fetch for faster catch-up |
| \`replica.fetch.wait.max.ms\` | 500 | 500 | Default |
| \`num.replica.fetchers\` | 4 | 1 | Parallel replication |
| \`replica.socket.receive.buffer.bytes\` | 1048576 | 65536 | Larger receive buffer |
| \`unclean.leader.election.enable\` | false | false | Never allow data loss |
| \`auto.leader.rebalance.enable\` | true | true | Auto-rebalance leaders |
| \`leader.imbalance.per.broker.percentage\` | 10 | 10 | Trigger rebalance at 10% imbalance |
| \`leader.imbalance.check.interval.seconds\` | 300 | 300 | Check every 5 minutes |

### Transaction Settings

| Property | Production Value | Default | Rationale |
|----------|-----------------|---------|-----------|
| \`transaction.state.log.replication.factor\` | 3 | 3 | Match topic replication |
| \`transaction.state.log.min.isr\` | 2 | 2 | Match topic ISR |
| \`transaction.max.timeout.ms\` | 900000 | 900000 | 15 minutes max transaction |
| \`transactional.id.expiration.ms\` | 604800000 | 604800000 | 7 days |

### Group Coordinator Settings

| Property | Production Value | Default | Rationale |
|----------|-----------------|---------|-----------|
| \`offsets.topic.replication.factor\` | 3 | 3 | Match topic replication |
| \`offsets.topic.num.partitions\` | 50 | 50 | Default |
| \`offsets.retention.minutes\` | 10080 | 10080 | 7 days offset retention |
| \`group.initial.rebalance.delay.ms\` | 3000 | 3000 | Wait for consumers to join |
| \`group.min.session.timeout.ms\` | 6000 | 6000 | Minimum session timeout |
| \`group.max.session.timeout.ms\` | 1800000 | 1800000 | 30 minutes max |

### JVM Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| \`-Xmx\` | 12g | ~37.5% of 32GB RAM |
| \`-Xms\` | 12g | Match max for predictable GC |
| \`-XX:+UseG1GC\` | enabled | Default for Java 21 |
| \`-XX:MaxGCPauseMillis\` | 20 | Low GC pauses |
| \`-XX:+ExplicitGCInvokesConcurrent\` | enabled | Don't stop-the-world on System.gc() |
| \`-Djava.net.preferIPv4Stack\` | true | IPv4 only |
| \`KAFKA_HEAP_OPTS\` | -Xmx12g -Xms12g | Set via environment |

### Monitoring (JMX)

| Property | Value |
|----------|-------|
| \`KAFKA_JMX_PORT\` | 9999 |
| \`KAFKA_JMX_HOSTNAME\` | localhost |
| JMX Exporter | Port 7071 (Prometheus) |
| Metrics Reporter | JMX + Prometheus |

## Producer Configuration

### Standard Producer (edp-ingest)

| Property | Value | Rationale |
|----------|-------|-----------|
| \`acks\` | all | Maximum durability |
| \`retries\` | 2147483647 | Infinite retries |
| \`retry.backoff.ms\` | 100 | Start at 100ms |
| \`retry.backoff.max.ms\` | 10000 | Cap at 10 seconds |
| \`max.in.flight.requests.per.connection\` | 5 | Kafka idempotency limit |
| \`enable.idempotence\` | true | Exactly-once producing |
| \`compression.type\` | lz4 | Best throughput/ratio |
| \`batch.size\` | 65536 | 64KB batches |
| \`linger.ms\` | 10 | Wait up to 10ms for batching |
| \`buffer.memory\` | 67108864 | 64MB producer buffer |
| \`max.block.ms\` | 30000 | Block 30s when buffer full |
| \`delivery.timeout.ms\` | 120000 | 2 minute delivery timeout |
| \`request.timeout.ms\` | 30000 | 30 second request timeout |
| \`max.request.size\` | 1048576 | 1MB max message size |
| \`metadata.max.age.ms\` | 300000 | Refresh metadata every 5 min |

### Transactional Producer (edp-transform)

Same as standard plus:

| Property | Value | Rationale |
|----------|-------|-----------|
| \`transactional.id\` | edp.tx.{service}.{topic}.{partition} | Unique per partition |
| \`transaction.timeout.ms\` | 60000 | 1 minute transaction timeout |
| \`max.in.flight.requests.per.connection\` | 1 | Required for transactions |

## Consumer Configuration

### Standard Consumer

| Property | Value | Rationale |
|----------|-------|-----------|
| \`group.id\` | edp.consumer.{service}.{env} | Naming convention |
| \`auto.offset.reset\` | earliest | Process all events |
| \`enable.auto.commit\` | false | Manual commit after processing |
| \`max.poll.records\` | 500 | Batch size per poll |
| \`max.poll.interval.ms\` | 300000 | 5 min max processing time |
| \`session.timeout.ms\` | 45000 | 45 second session timeout |
| \`heartbeat.interval.ms\` | 15000 | Heartbeat every 15 seconds |
| \`fetch.min.bytes\` | 1024 | 1KB minimum fetch |
| \`fetch.max.wait.ms\` | 500 | Wait up to 500ms |
| \`max.partition.fetch.bytes\` | 1048576 | 1MB per partition per fetch |
| \`partition.assignment.strategy\` | CooperativeStickyAssignor | Incremental rebalance |
| \`isolation.level\` | read_committed | Only read committed (for transactions) |

### Exactly-Once Consumer

Same as standard plus:

| Property | Value | Rationale |
|----------|-------|-----------|
| \`isolation.level\` | read_committed | Required for transactions |
| \`enable.auto.commit\` | false | Offsets committed in transaction |

## Connect Configuration

### Worker Settings

| Property | Value | Rationale |
|----------|-------|-----------|
| \`bootstrap.servers\` | kafka-0:9092,...,kafka-4:9092 | All brokers |
| \`group.id\` | edp-connect-cluster | Worker group |
| \`key.converter\` | org.apache.kafka.connect.json.JsonConverter | Default key format |
| \`value.converter\` | io.confluent.connect.avro.AvroConverter | Avro for values |
| \`value.converter.schema.registry.url\` | http://schema-registry:8081 | Schema Registry |
| \`config.storage.topic\` | edp-connect-configs | Config storage |
| \`config.storage.replication.factor\` | 3 | Replicated |
| \`offset.storage.topic\` | edp-connect-offsets | Offset storage |
| \`offset.storage.replication.factor\` | 3 | Replicated |
| \`status.storage.topic\` | edp-connect-status | Status storage |
| \`status.storage.replication.factor\` | 3 | Replicated |
| \`offset.flush.interval.ms\` | 10000 | Flush offsets every 10 seconds |
| \`plugin.path\` | /opt/kafka/plugins | Connector JARs |

## Topic Naming Convention

### Pattern

\`\`\`
edp.{type}.{source}.{entity}

Types:
  events   - Business events (primary data flow)
  cdc      - Change data capture events
  dlq      - Dead letter queue
  retry    - Retry topics
  replay   - Event replay topics
  internal - Internal platform topics (changelog, repartition)
  audit    - Audit trail events
  test     - Test/development topics
\`\`\`

### Current Topics

| Topic | Partitions | RF | Retention | Purpose |
|-------|-----------|-----|-----------|---------|
| edp.events.ecommerce.orders | 12 | 3 | 48h | Order events |
| edp.events.ecommerce.customers | 12 | 3 | 48h | Customer events |
| edp.events.payments.transactions | 12 | 3 | 7d | Payment events (PCI) |
| edp.events.payments.refunds | 6 | 3 | 7d | Refund events (PCI) |
| edp.events.logistics.shipments | 12 | 3 | 48h | Shipment events |
| edp.events.logistics.tracking | 12 | 3 | 48h | Tracking updates |
| edp.events.iot.sensors | 24 | 3 | 48h | Sensor data (high volume) |
| edp.events.analytics.clickstream | 24 | 3 | 24h | Clickstream (high volume) |
| edp.events.mobile.events | 12 | 3 | 48h | Mobile SDK events (Protobuf) |
| edp.cdc.orders.orders | 12 | 3 | 72h | CDC from orders DB |
| edp.cdc.orders.order_items | 12 | 3 | 72h | CDC from order_items |
| edp.cdc.orders.customers | 6 | 3 | 72h | CDC from customers |
| edp.cdc.payments.transactions | 12 | 3 | 72h | CDC from payments |
| edp.dlq.{service}.{entity} | 1 | 3 | 7d | DLQ per service/entity |
| edp.retry.{service}.{entity} | 3 | 3 | 24h | Retry per service/entity |
| edp.audit.gateway | 6 | 3 | 90d | Gateway audit trail |
| edp.audit.schema-changes | 1 | 3 | 90d | Schema change audit |
| _schemas | 1 | 3 | compact | Schema Registry storage |
| edp-connect-configs | 1 | 3 | compact | Connect configs |
| edp-connect-offsets | 25 | 3 | compact | Connect offsets |
| edp-connect-status | 5 | 3 | compact | Connect status |

### Partition Strategy

| Source Volume | Partitions | Rationale |
|-------------|-----------|-----------|
| <1000 events/sec | 6 | 2 per consumer instance (3 instances) |
| 1000-5000 events/sec | 12 | 3-4 per consumer instance |
| 5000-20000 events/sec | 24 | 4-6 per consumer instance |
| >20000 events/sec | 48 | 8+ per consumer instance |

## ACL Reference

### Service ACLs

| Principal | Resource | Operation | Permission |
|-----------|----------|-----------|------------|
| User:edp-ingest | Topic:edp.events.* | WRITE | ALLOW |
| User:edp-ingest | Topic:edp.dlq.ingest.* | WRITE | ALLOW |
| User:edp-transform | Topic:edp.events.* | READ | ALLOW |
| User:edp-transform | Topic:edp.events.* | WRITE | ALLOW |
| User:edp-transform | Group:edp.consumer.transform.* | READ | ALLOW |
| User:edp-consumer-{svc} | Topic:edp.events.{subscribed} | READ | ALLOW |
| User:edp-consumer-{svc} | Group:edp.consumer.{svc}.* | READ | ALLOW |
| User:edp-consumer-{svc} | Topic:edp.dlq.{svc}.* | WRITE | ALLOW |
| User:edp-lake-sink | Topic:edp.events.* | READ | ALLOW |
| User:edp-lake-sink | Group:edp.consumer.lake-sink.* | READ | ALLOW |
| User:edp-cdc | Topic:edp.cdc.* | WRITE | ALLOW |
| User:edp-cdc | Group:edp-connect-cluster | READ | ALLOW |
| User:edp-admin | Topic:* | ALL | ALLOW |
| User:edp-admin | Group:* | ALL | ALLOW |
| User:edp-admin | Cluster:* | ALL | ALLOW |
`,
));


newDocs.push(makeDoc(
  "gamma-ref-error-codes", "document",
  "EDP Error Code Reference — Complete Error Catalog",
  "services", "before-phase-1",
  `# EDP Error Code Reference — Complete Error Catalog

## Overview

All EDP services use a standardized error code format:
\`EDP-{SERVICE}-{CATEGORY}-{NUMBER}\`

Services: ING (ingest), TRF (transform), CON (consumer), GW (gateway), QRY (query), LSK (lake-sink), CDC (cdc), ADM (admin)
Categories: VAL (validation), AUTH (authentication), NET (network), SER (serialization), KFK (kafka), DB (database), CFG (configuration), INT (internal)

## Ingestion Errors (EDP-ING-*)

### Validation Errors (EDP-ING-VAL-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-ING-VAL-001 | Schema validation failed | Event payload doesn't match registered schema | Check event format against schema definition |
| EDP-ING-VAL-002 | Unknown schema version | Schema version header not found in registry | Register schema before producing |
| EDP-ING-VAL-003 | Required field missing | Required field is null or absent | Include all required fields per schema |
| EDP-ING-VAL-004 | Type mismatch | Field type doesn't match schema | Check field types (e.g., string vs integer) |
| EDP-ING-VAL-005 | Payload too large | Event exceeds max.request.size (1MB) | Split into smaller events or increase limit |
| EDP-ING-VAL-006 | Invalid source system | Source system ID not registered | Register source system via admin API |
| EDP-ING-VAL-007 | Invalid entity type | Entity type not registered for source | Register entity type via admin API |
| EDP-ING-VAL-008 | Custom validation failed | Application-specific validation rule failed | Check custom validation rules for this source/entity |
| EDP-ING-VAL-009 | Batch too large | Batch exceeds 1000 events | Split batch into smaller chunks |
| EDP-ING-VAL-010 | Invalid idempotency key | Idempotency key format invalid | Use UUID v4 format |
| EDP-ING-VAL-011 | Duplicate event | Idempotency key already processed | Event already ingested (no action needed) |
| EDP-ING-VAL-012 | Schema evolution rejected | New schema is not backward compatible | Review schema compatibility rules |

### Kafka Errors (EDP-ING-KFK-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-ING-KFK-001 | Kafka unavailable | Cannot connect to any broker | Check Kafka cluster health |
| EDP-ING-KFK-002 | Topic not found | Target topic doesn't exist | Create topic via admin API |
| EDP-ING-KFK-003 | Produce timeout | Kafka didn't ack within timeout | Check broker load, network |
| EDP-ING-KFK-004 | Buffer full | Producer buffer exhausted | Reduce production rate or increase buffer |
| EDP-ING-KFK-005 | Authorization failed | Producer not authorized for topic | Check ACLs |
| EDP-ING-KFK-006 | Record too large | After compression, still exceeds limit | Reduce event size |
| EDP-ING-KFK-007 | Broker not available for topic | Partition leader unavailable | Wait for leader election |

### Network Errors (EDP-ING-NET-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-ING-NET-001 | Schema Registry unavailable | Circuit breaker open | Check SR health, cached schemas still work |
| EDP-ING-NET-002 | Redis unavailable | Dedup cache unavailable | Events still processed (dedup degraded) |
| EDP-ING-NET-003 | DNS resolution failed | Cannot resolve service hostname | Check DNS, CoreDNS pods |
| EDP-ING-NET-004 | TLS handshake failed | Certificate issue | Check cert expiry, CA trust |
| EDP-ING-NET-005 | Connection refused | Target service not listening | Check target service health |

## Gateway Errors (EDP-GW-*)

### Authentication Errors (EDP-GW-AUTH-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-GW-AUTH-001 | Invalid API key | API key not recognized | Check key format, registration |
| EDP-GW-AUTH-002 | API key expired | Key has been revoked or expired | Rotate to new key |
| EDP-GW-AUTH-003 | Invalid JWT | JWT validation failed | Check token, issuer, audience |
| EDP-GW-AUTH-004 | JWT expired | Token past expiry time | Refresh token |
| EDP-GW-AUTH-005 | Missing credentials | No API key or JWT provided | Include authentication header |
| EDP-GW-AUTH-006 | Insufficient permissions | Authenticated but not authorized | Request additional permissions |
| EDP-GW-AUTH-007 | Rate limit exceeded | Client exceeded rate limit | Reduce request rate, check tier |
| EDP-GW-AUTH-008 | IP not allowed | Client IP not in allowlist | Contact admin to add IP |
| EDP-GW-AUTH-009 | mTLS required | Endpoint requires mTLS | Configure client certificate |
| EDP-GW-AUTH-010 | Client certificate invalid | mTLS cert validation failed | Check cert chain, expiry |

## Transform Errors (EDP-TRF-*)

### Processing Errors (EDP-TRF-VAL-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-TRF-VAL-001 | Transform expression failed | Expression evaluation error | Check transform expression syntax |
| EDP-TRF-VAL-002 | Lookup failed | External lookup returned error | Check lookup source availability |
| EDP-TRF-VAL-003 | Lookup timeout | Lookup didn't respond in time | Increase timeout or check source latency |
| EDP-TRF-VAL-004 | Filter condition invalid | Filter expression syntax error | Fix filter expression in pipeline config |
| EDP-TRF-VAL-005 | Aggregate window expired | Event arrived after window + grace | Event sent to late-arrivals topic |
| EDP-TRF-VAL-006 | State store error | RocksDB read/write failed | Check disk space, restart pod |
| EDP-TRF-VAL-007 | Schema mismatch | Input event doesn't match expected schema | Check source topic schema version |
| EDP-TRF-VAL-008 | Null key | Partition key is null (required for stateful ops) | Ensure source events have keys |

### Pipeline Errors (EDP-TRF-CFG-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-TRF-CFG-001 | Pipeline not found | Pipeline config file missing | Deploy pipeline configuration |
| EDP-TRF-CFG-002 | Pipeline version mismatch | Running version differs from expected | Redeploy pipeline |
| EDP-TRF-CFG-003 | Invalid stage configuration | Stage config has errors | Check pipeline YAML syntax |
| EDP-TRF-CFG-004 | Lookup source not configured | Referenced lookup source not defined | Add lookup source configuration |

## Consumer Errors (EDP-CON-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-CON-VAL-001 | Deserialization failed | Cannot deserialize event | Check schema version compatibility |
| EDP-CON-VAL-002 | Processing failed | Handler threw exception | Check consumer logs for stack trace |
| EDP-CON-VAL-003 | Retry exhausted | Event failed all retry attempts | Check DLQ for event details |
| EDP-CON-VAL-004 | Poison pill detected | Same event failed 3+ times | Event sent to DLQ, partition continues |
| EDP-CON-KFK-001 | Rebalance in progress | Consumer group rebalancing | Wait for rebalance to complete |
| EDP-CON-KFK-002 | Commit failed | Offset commit rejected | Check consumer group state |
| EDP-CON-KFK-003 | Session timeout | Consumer poll interval exceeded | Process events faster or increase timeout |
| EDP-CON-DB-001 | Sink write failed | Database write error | Check DB connectivity, schema |
| EDP-CON-DB-002 | Outbox commit failed | Transactional outbox write failed | Check DB transaction log |
| EDP-CON-NET-001 | Downstream unavailable | Target service/API not responding | Check downstream service health |

## CDC Errors (EDP-CDC-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-CDC-DB-001 | Replication slot dropped | PostgreSQL slot was deleted | Restart connector (will re-snapshot) |
| EDP-CDC-DB-002 | WAL retention exceeded | Source DB recycled WAL before CDC read | Re-snapshot required |
| EDP-CDC-DB-003 | Connection lost | Cannot connect to source database | Check DB health, network |
| EDP-CDC-DB-004 | Permission denied | CDC user lacks replication permission | Grant replication privilege |
| EDP-CDC-VAL-001 | Schema change detected | DDL change in source table | Verify connector handles new schema |
| EDP-CDC-VAL-002 | Incompatible schema change | Breaking DDL change | Coordinate schema migration |
| EDP-CDC-KFK-001 | Connector task failed | Kafka Connect task crashed | Restart task via Connect REST API |
| EDP-CDC-KFK-002 | Config store error | Cannot read/write connector config | Check Connect config topic |

## Query Service Errors (EDP-QRY-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-QRY-VAL-001 | Invalid time range | Start time after end time | Fix query parameters |
| EDP-QRY-VAL-002 | Result set too large | Query would return too many results | Add filters or reduce time range |
| EDP-QRY-VAL-003 | Invalid cursor | Pagination cursor expired or malformed | Restart query from beginning |
| EDP-QRY-NET-001 | Trino unavailable | Historical query engine down | Check Trino cluster health |
| EDP-QRY-NET-002 | Trino timeout | Historical query took too long | Narrow query scope |
| EDP-QRY-NET-003 | Redis cache miss | Entity not in cache | Falls back to Kafka scan |
| EDP-QRY-KFK-001 | Topic not found | Queried topic doesn't exist | Check topic name |
| EDP-QRY-KFK-002 | Kafka scan timeout | Real-time scan exceeded 30s | Narrow time range |

## Data Lake Sink Errors (EDP-LSK-*)

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| EDP-LSK-NET-001 | S3 unavailable | Cannot write to S3 | Check AWS S3 status, credentials |
| EDP-LSK-NET-002 | S3 write failed | Individual file write failed | Retry (automatic) |
| EDP-LSK-VAL-001 | Iceberg commit failed | Table metadata conflict | Retry commit (automatic) |
| EDP-LSK-VAL-002 | Schema mapping failed | Cannot map Avro to Iceberg | Check schema compatibility |
| EDP-LSK-VAL-003 | Compaction failed | File compaction error | Check Iceberg table health |
| EDP-LSK-INT-001 | Buffer overflow | In-memory buffer exceeded limit | Backpressure applied, consuming paused |

## Troubleshooting Guide

### Common Scenarios

**"My events aren't appearing in the consumer"**
1. Check producer logs for errors (EDP-ING-KFK-*)
2. Check consumer lag for your group: \`kafka-consumer-groups.sh --describe --group {group}\`
3. Check DLQ topic for your consumer: \`edp.dlq.{service}.{entity}\`
4. Check if consumer is running: \`kubectl get pods -l app={consumer}\`

**"Schema registration is failing"**
1. Check compatibility: POST to /compatibility endpoint first
2. Review schema evolution rules for your compatibility level
3. Check if Schema Registry is accessible: \`curl http://schema-registry:8081/subjects\`
4. Check error code (usually EDP-ING-VAL-002 or EDP-ING-VAL-012)

**"High consumer lag"**
1. Check consumer processing time: consumer metrics dashboard
2. Check for errors in consumer logs (EDP-CON-*)
3. Check downstream dependencies (database, API)
4. Scale consumers if processing is slow: \`kubectl scale deployment/{consumer}\`
5. Follow the Consumer Lag Investigation playbook

**"Events arriving with wrong schema"**
1. Check which schema version was used: event header X-EDP-Schema-Version
2. Check Schema Registry for latest version: GET /subjects/{subject}/versions/latest
3. Check producer code for schema version pinning
4. Verify consumer can handle both old and new schema versions
`,
));


newDocs.push(makeDoc(
  "gamma-ref-runbook-index", "document",
  "EDP Runbook Index — All Operational Procedures",
  "operations", "before-phase-1",
  `# EDP Runbook Index — All Operational Procedures

## Overview

This document indexes all operational runbooks for the Enterprise Data Platform.
Runbooks are linked from alert annotations and should be the first reference during incidents.

## Platform Operations

### Kafka

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Broker Failure Response](./playbook-broker-failure.md) | KafkaBrokerDown | P1/P2 | 2025-12-01 |
| [Consumer Lag Investigation](./playbook-consumer-lag.md) | EdpConsumerLagWarning/Critical | P2/P3 | 2025-11-15 |
| [Cluster Expansion](./kafka-cluster-expansion.md) | Capacity Warning | P4 | 2025-10-01 |
| [Topic Management](./kafka-topic-management.md) | N/A (manual) | N/A | 2025-11-01 |
| [ACL Management](./kafka-acl-management.md) | N/A (manual) | N/A | 2025-09-15 |
| [Partition Rebalance](./kafka-partition-rebalance.md) | LeaderImbalance | P3 | 2025-10-15 |
| [Rolling Restart](./kafka-rolling-restart.md) | N/A (maintenance) | N/A | 2025-11-01 |
| [Tiered Storage Operations](./kafka-tiered-storage.md) | TieredStorageError | P2 | 2025-12-10 |

### Schema Registry

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Schema Registry Failure](./schema-registry-failure.md) | SchemaRegistryNoLeader | P1 | 2025-11-20 |
| [Schema Migration](./playbook-schema-migration.md) | N/A (manual) | N/A | 2025-12-01 |
| [Compatibility Override](./schema-compatibility-override.md) | N/A (emergency) | N/A | 2025-10-01 |

### Kafka Connect / CDC

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Connector Failure](./connect-connector-failure.md) | ConnectTaskFailed | P2 | 2025-11-15 |
| [CDC Re-snapshot](./cdc-resnapshot.md) | CDCSlotDropped | P2 | 2025-10-15 |
| [Adding New CDC Source](./cdc-new-source.md) | N/A (manual) | N/A | 2025-11-01 |
| [Connect Worker Restart](./connect-worker-restart.md) | ConnectWorkerDown | P2 | 2025-09-01 |

### Data Lake

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Sink Connector Failure](./lake-sink-failure.md) | LakeSinkDown | P2 | 2025-11-01 |
| [Table Compaction](./lake-table-compaction.md) | CompactionFailed | P3 | 2025-10-01 |
| [Snapshot Expiration](./lake-snapshot-expiration.md) | N/A (scheduled) | N/A | 2025-10-01 |
| [Data Backfill](./lake-data-backfill.md) | N/A (manual) | N/A | 2025-11-15 |
| [Trino Query Optimization](./trino-query-optimization.md) | TrinoSlowQuery | P4 | 2025-09-01 |

## Service Operations

### edp-ingest

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [High Error Rate](./ingest-high-error-rate.md) | IngestErrorRate | P2 | 2025-12-01 |
| [Rate Limiting](./ingest-rate-limiting.md) | IngestRateLimitHigh | P3 | 2025-11-01 |
| [Circuit Breaker Open](./ingest-circuit-breaker.md) | IngestCircuitBreakerOpen | P2 | 2025-11-15 |
| [DLQ Investigation](./ingest-dlq-investigation.md) | IngestDLQHigh | P2 | 2025-12-01 |

### edp-transform

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Pipeline Failure](./transform-pipeline-failure.md) | TransformPipelineDown | P2 | 2025-11-15 |
| [Lookup Cache Miss](./transform-lookup-cache.md) | TransformCacheMissHigh | P3 | 2025-10-01 |
| [State Store Issues](./transform-state-store.md) | TransformStateStoreError | P2 | 2025-11-01 |
| [Late Events](./transform-late-events.md) | TransformLateEventsHigh | P3 | 2025-10-15 |

### edp-gateway

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Gateway High Latency](./gateway-high-latency.md) | GatewayLatencyHigh | P2 | 2025-12-01 |
| [Authentication Failures](./gateway-auth-failures.md) | GatewayAuthFailureRate | P3 | 2025-11-01 |
| [TLS Certificate Rotation](./gateway-tls-rotation.md) | GatewayCertExpiring | P2 | 2025-10-15 |

### edp-query

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Query Timeout](./query-timeout.md) | QueryTimeoutRate | P3 | 2025-11-01 |
| [Redis Cache Failure](./query-redis-failure.md) | QueryRedisCacheDown | P2 | 2025-10-15 |
| [Trino Connection Issues](./query-trino-issues.md) | QueryTrinoDown | P2 | 2025-11-15 |

## Security Operations

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Security Incident Response](./playbook-security-incident.md) | SecurityAlert | P1 | 2025-12-01 |
| [Credential Rotation](./security-credential-rotation.md) | CredentialExpiring | P2 | 2025-11-15 |
| [Certificate Renewal](./security-cert-renewal.md) | CertExpiringSoon | P2 | 2025-10-01 |
| [Audit Log Review](./security-audit-review.md) | N/A (weekly) | N/A | 2025-11-01 |
| [PII Breach Response](./security-pii-breach.md) | PIIExposureAlert | P1 | 2025-12-01 |

## Data Quality Operations

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [Data Quality Investigation](./playbook-data-quality.md) | EdpDataQualityDrop | P2 | 2025-12-01 |
| [Event Replay](./data-event-replay.md) | N/A (manual) | N/A | 2025-11-15 |
| [Data Reconciliation](./data-reconciliation.md) | N/A (scheduled) | N/A | 2025-10-01 |
| [GDPR Erasure](./data-gdpr-erasure.md) | GDPRErasureRequest | P2 | 2025-12-01 |

## Infrastructure Operations

| Runbook | Trigger Alert | Priority | Last Updated |
|---------|--------------|----------|-------------|
| [EKS Node Scaling](./infra-eks-scaling.md) | EKSNodePressure | P3 | 2025-11-01 |
| [EBS Volume Expansion](./infra-ebs-expansion.md) | DiskSpaceWarning | P3 | 2025-10-15 |
| [Network Troubleshooting](./infra-network-troubleshoot.md) | NetworkLatencyHigh | P2 | 2025-11-01 |
| [DNS Resolution Issues](./infra-dns-issues.md) | DNSResolutionFailed | P2 | 2025-09-15 |

## Disaster Recovery

| Runbook | Trigger | Priority | Last Updated |
|---------|---------|----------|-------------|
| [Complete DR Plan](./design-disaster-recovery.md) | RegionDown | P0 | 2025-12-15 |
| [Kafka Cluster Rebuild](./dr-kafka-rebuild.md) | ClusterLoss | P0 | 2025-11-01 |
| [Data Lake Restore](./dr-datalake-restore.md) | DataCorruption | P1 | 2025-10-01 |
| [Region Failover](./dr-region-failover.md) | RegionDown | P0 | 2025-12-01 |

## Emergency Contacts

| Role | Name | Phone | Availability |
|------|------|-------|-------------|
| Data Platform Lead | Alex Thompson | +1-555-0123 | 24/7 via PagerDuty |
| Infrastructure Lead | Wei Liu | +1-555-0456 | 24/7 via PagerDuty |
| Security Lead | Maria Garcia | +1-555-0789 | 24/7 via PagerDuty |
| DBA | David Park | +1-555-0321 | Business hours + on-call |
| Engineering Manager | Jennifer Chen | +1-555-0654 | Business hours |
| VP Engineering | James Park | +1-555-0987 | Escalation only |

## On-Call Schedule

- **Primary rotation**: Weekly (Mon 09:00 UTC → Mon 09:00 UTC)
- **Secondary rotation**: Same week, different person
- **Handoff meeting**: Monday 09:00 UTC (15 minutes)
- **On-call documentation**: Must document all incidents in #edp-incidents
- **Post-mortem**: Required for P1/P2 within 48 hours
`,
));


newDocs.push(makeDoc(
  "gamma-ref-slo-dashboard", "document",
  "EDP SLO Dashboard — Service Level Objectives Reference",
  "governance", "phase-3",
  `# EDP SLO Dashboard — Service Level Objectives Reference

## Overview

This document defines all Service Level Objectives (SLOs) for the Enterprise Data Platform.
SLOs are monitored continuously via Sloth + Prometheus, with multi-window burn rate alerting.

## Platform-Wide SLOs

### Event Pipeline End-to-End

| SLO | Objective | Window | Measurement |
|-----|-----------|--------|-------------|
| Availability | 99.95% | 30 days | Successful event deliveries / total attempted |
| Latency (e2e) | p99 < 5 seconds | 30 days | Time from ingestion to consumer delivery |
| Data Loss | 0% | 30 days | Events accepted but not delivered within 48h |
| Freshness | < 5 minutes | 30 days | Lag between event timestamp and consumer processing |

### Data Integrity

| SLO | Objective | Window | Measurement |
|-----|-----------|--------|-------------|
| Schema Compliance | 100% | 30 days | Events passing schema validation / total events |
| Deduplication | 99.99% | 30 days | Unique events / total events (after dedup) |
| Ordering (within partition) | 100% | 30 days | Events in correct order / total events |

## Service-Level SLOs

### edp-ingest

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.95% | 21.6 minutes | 99.97% (within budget) |
| Latency (p99) | < 200ms | N/A | 145ms (within target) |
| Schema Validation | 100% pass rate | 0 errors | 100% (on target) |
| DLQ Rate | < 0.01% | 112K events | 0.003% (within budget) |

**SLI Definitions:**
\`\`\`promql
# Availability SLI
sum(rate(edp_ingest_events_total{status="2xx"}[5m]))
/
sum(rate(edp_ingest_events_total[5m]))

# Latency SLI
histogram_quantile(0.99,
  sum(rate(edp_ingest_latency_seconds_bucket[5m])) by (le)
)

# DLQ Rate SLI
sum(rate(edp_ingest_dlq_events_total[5m]))
/
sum(rate(edp_ingest_events_total[5m]))
\`\`\`

### edp-transform

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.9% | 43.2 minutes | 99.95% (within budget) |
| Latency (p99) | < 500ms | N/A | 320ms (within target) |
| Transform Accuracy | 100% | 0 errors | 100% (on target) |
| Consumer Lag | < 5 minutes | N/A | 45 seconds (within target) |

### edp-gateway

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.99% | 4.3 minutes | 99.995% (within budget) |
| Latency (p99) | < 100ms | N/A | 45ms (within target) |
| Auth Decision | < 5ms (p99) | N/A | 2ms (within target) |

### edp-query (Real-Time)

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.9% | 43.2 minutes | 99.92% (within budget) |
| Entity Lookup (p99) | < 50ms | N/A | 22ms (within target) |
| Time Range Query (p99) | < 5 seconds | N/A | 3.2 seconds (within target) |

### edp-query (Historical via Trino)

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.5% | 3.6 hours | 99.7% (within budget) |
| Query (1 day, p99) | < 30 seconds | N/A | 15 seconds (within target) |
| Query (30 days, p99) | < 120 seconds | N/A | 60 seconds (within target) |

### edp-lake-sink

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.9% | 43.2 minutes | 99.95% (within budget) |
| Data Freshness | < 10 minutes | N/A | 6 minutes (within target) |
| Write Accuracy | 100% | 0 lost events | 100% (on target) |

### Schema Registry

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Read Availability | 99.99% | 4.3 minutes | 99.998% (within budget) |
| Write Availability | 99.9% | 43.2 minutes | 99.95% (within budget) |
| Read Latency (p99) | < 20ms | N/A | 5ms (within target) |

### Kafka Cluster

| SLO | Objective | Error Budget (30d) | Current Status |
|-----|-----------|-------------------|----------------|
| Availability | 99.99% | 4.3 minutes | 99.995% (within budget) |
| Produce Latency (p99) | < 50ms | N/A | 12ms (within target) |
| Under-Replicated | 0 partitions | 0 | 0 (on target) |
| Consumer Group Active | 100% | 0 dead groups | 100% (on target) |

## Error Budget Policy

### Budget Remaining > 50%

- Normal operations
- New feature development continues
- Planned maintenance allowed

### Budget Remaining 25-50%

- Increased monitoring (check dashboards 2x daily)
- No non-critical changes to affected service
- Planned maintenance requires team lead approval

### Budget Remaining < 25%

- All development paused for affected service
- Focus on reliability improvements
- Daily standup on SLO status
- No planned maintenance

### Budget Exhausted (0%)

- P1 incident declared
- All development paused across team
- Engineering manager daily review
- Post-mortem required for each new error
- Production freeze until budget recovery

## Burn Rate Alerting

### Multi-Window Burn Rates

| Window | Burn Rate | Budget Consumed | Severity |
|--------|-----------|-----------------|----------|
| 5m / 1h | 14.4x | 2% in 5 min | Page (P1) |
| 30m / 6h | 6x | 5% in 30 min | Page (P2) |
| 2h / 1d | 3x | 10% in 2 hours | Ticket (P3) |
| 6h / 3d | 1x | 10% in 6 hours | Ticket (P4) |

### Alert Example (edp-ingest availability)

\`\`\`yaml
groups:
  - name: edp-ingest-slo
    rules:
      - alert: EdpIngestAvailabilityBurnRateFast
        expr: |
          (
            sum(rate(edp_ingest_events_total{status!="2xx"}[5m]))
            /
            sum(rate(edp_ingest_events_total[5m]))
          ) > (14.4 * 0.0005)
          and
          (
            sum(rate(edp_ingest_events_total{status!="2xx"}[1h]))
            /
            sum(rate(edp_ingest_events_total[1h]))
          ) > (14.4 * 0.0005)
        for: 2m
        labels:
          severity: critical
          team: edp-platform
          slo: edp-ingest-availability
        annotations:
          summary: "EDP Ingest availability SLO burning fast (14.4x burn rate)"
          runbook_url: "https://runbooks.internal/edp/ingest-high-error-rate"
\`\`\`

## SLO Review Cadence

| Frequency | Scope | Participants |
|-----------|-------|-------------|
| Daily | Dashboard check | On-call engineer |
| Weekly | Budget status | Team standup |
| Monthly | SLO targets review | Platform team + stakeholders |
| Quarterly | SLO target adjustment | Architecture board |

## Historical SLO Performance

### Last 6 Months

| Service | Month | Availability | Latency p99 | Budget Used |
|---------|-------|-------------|-------------|-------------|
| edp-ingest | 2025-07 | 99.98% | 130ms | 40% |
| edp-ingest | 2025-08 | 99.97% | 142ms | 60% |
| edp-ingest | 2025-09 | 99.96% | 155ms | 80% |
| edp-ingest | 2025-10 | 99.99% | 125ms | 20% |
| edp-ingest | 2025-11 | 99.95% | 160ms | 100% ⚠️ |
| edp-ingest | 2025-12 | 99.97% | 145ms | 60% |

November budget exhaustion caused by INC-2025-456 (double processing incident).
Corrective actions reduced error rate in December.
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
