#!/usr/bin/env tsx
// Gamma Fixture — Fourth corpus expansion (final push to 107K tokens)

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
  id: string, type: CorpusDoc["type"], title: string, domain: string,
  phase: string | number, content: string, metadata?: Record<string, unknown>,
): CorpusDoc {
  return { id, type, title, tokens: estimateTokens(content), domain, phase, content, metadata };
}

const newDocs: CorpusDoc[] = [];

// Generate Grafana dashboard JSON reference (~10K tokens)
function grafanaDashboard(title: string, panels: Array<{title: string; query: string; desc: string}>): string {
  let out = `# Grafana Dashboard: ${title}\n\n`;
  out += `## Dashboard Configuration\n\n`;
  out += `- **UID**: edp-${title.toLowerCase().replace(/\s+/g, '-')}\n`;
  out += `- **Folder**: EDP Dashboards\n`;
  out += `- **Refresh**: 30 seconds\n`;
  out += `- **Time Range**: Last 6 hours (default)\n`;
  out += `- **Variables**:\n`;
  out += `  - \`\$environment\`: production, staging, development\n`;
  out += `  - \`\$service\`: All EDP services\n`;
  out += `  - \`\$topic\`: All Kafka topics\n\n`;
  out += `## Panels\n\n`;
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    out += `### Panel ${i + 1}: ${p.title}\n\n`;
    out += `**Description**: ${p.desc}\n\n`;
    out += `**Query**:\n\`\`\`promql\n${p.query}\n\`\`\`\n\n`;
    out += `**Visualization**: Time series graph\n`;
    out += `**Thresholds**:\n`;
    out += `- Green: Normal operation\n`;
    out += `- Yellow: Warning threshold reached\n`;
    out += `- Red: Critical threshold exceeded\n\n`;
  }
  return out;
}

newDocs.push(makeDoc(
  "gamma-ref-grafana-dashboards", "document",
  "EDP Grafana Dashboard Reference — All Monitoring Panels",
  "operations", "phase-3",
  grafanaDashboard("EDP Platform Overview", [
    { title: "Total Event Throughput", query: "sum(rate(edp_ingest_events_total[5m])) by (source)", desc: "Total events ingested per second, broken down by source system. Shows the overall health and load of the platform." },
    { title: "Event Throughput by Topic", query: "sum(rate(edp_ingest_events_total[5m])) by (topic)", desc: "Events per second per Kafka topic. Helps identify which topics are most active." },
    { title: "Ingestion Latency (p99)", query: "histogram_quantile(0.99, sum(rate(edp_ingest_latency_seconds_bucket[5m])) by (le, source))", desc: "99th percentile latency for event ingestion, from HTTP request receipt to Kafka produce acknowledgment." },
    { title: "Ingestion Latency (p50/p95/p99)", query: "histogram_quantile(0.50, sum(rate(edp_ingest_latency_seconds_bucket[5m])) by (le))\nhistogram_quantile(0.95, sum(rate(edp_ingest_latency_seconds_bucket[5m])) by (le))\nhistogram_quantile(0.99, sum(rate(edp_ingest_latency_seconds_bucket[5m])) by (le))", desc: "Multi-percentile latency view showing the distribution of ingestion times." },
    { title: "Error Rate", query: "sum(rate(edp_ingest_events_total{status!='2xx'}[5m])) / sum(rate(edp_ingest_events_total[5m])) * 100", desc: "Percentage of failed event ingestion attempts. Target: <0.1%." },
    { title: "DLQ Events", query: "sum(rate(edp_ingest_dlq_events_total[5m])) by (source, entity)", desc: "Events being sent to dead letter queues. Any sustained rate indicates processing issues." },
    { title: "Schema Validation Errors", query: "sum(rate(edp_ingest_schema_validation_errors_total[5m])) by (source, entity, error_type)", desc: "Schema validation failures by type. Common types: missing_field, type_mismatch, unknown_schema." },
    { title: "Consumer Lag (All Groups)", query: "sum(kafka_consumer_group_lag) by (group)", desc: "Total consumer lag per consumer group. Shows how far behind each consumer is from the latest offset." },
    { title: "Consumer Lag (Time-Based)", query: "edp_consumer_lag_seconds", desc: "Estimated time lag in seconds for each consumer group. More meaningful than record count for variable-rate topics." },
    { title: "Kafka Broker Health", query: "up{job='kafka'}", desc: "Broker availability. Each broker should show 1 (up). 0 indicates broker is down." },
    { title: "Under-Replicated Partitions", query: "kafka_under_replicated_partitions", desc: "Count of under-replicated partitions per broker. Should always be 0. Non-zero indicates replication issues." },
    { title: "Kafka Disk Usage", query: "kafka_log_size_bytes / kafka_log_max_bytes * 100", desc: "Disk utilization percentage per broker. Alert at 75%, critical at 90%." },
    { title: "Kafka Network I/O", query: "rate(kafka_server_socket_bytes_in_total[5m])\nrate(kafka_server_socket_bytes_out_total[5m])", desc: "Network bytes in/out per broker. Used for capacity planning." },
    { title: "Kafka CPU Usage", query: "rate(process_cpu_seconds_total{job='kafka'}[5m])", desc: "CPU utilization per broker process. Should stay below 60% sustained." },
    { title: "Schema Registry Availability", query: "up{job='schema-registry'}", desc: "Schema Registry instance availability. At least 1 instance must be up for reads, primary for writes." },
    { title: "Schema Registry Latency", query: "histogram_quantile(0.99, sum(rate(schema_registry_request_latency_ms_bucket[5m])) by (le, method))", desc: "Schema Registry request latency by method (GET, POST). Typically <10ms." },
    { title: "Active Consumer Groups", query: "count(kafka_consumer_group_state{state='Stable'})", desc: "Count of consumer groups in Stable state. Decrease indicates rebalancing or failures." },
    { title: "Connect Connector Status", query: "kafka_connect_connector_state", desc: "Status of each Kafka Connect connector. RUNNING=1, PAUSED=2, FAILED=3." },
    { title: "Data Lake Write Rate", query: "sum(rate(edp_lake_sink_events_written_total[5m])) by (table)", desc: "Events written to data lake per second per Iceberg table." },
    { title: "Data Lake Freshness", query: "time() - edp_lake_sink_latest_event_timestamp", desc: "Seconds since the most recent event was written to the data lake. Should be <600 (10 min)." },
    { title: "Redis Cache Hit Ratio", query: "rate(edp_query_redis_hits_total[5m]) / (rate(edp_query_redis_hits_total[5m]) + rate(edp_query_redis_misses_total[5m]))", desc: "Redis cache hit ratio for entity lookups. Target: >95%." },
    { title: "Gateway Request Rate", query: "sum(rate(edp_gateway_requests_total[5m])) by (method, status)", desc: "API gateway request rate by HTTP method and status code." },
    { title: "Gateway Auth Decisions", query: "sum(rate(edp_gateway_auth_decisions_total[5m])) by (decision)", desc: "Authentication decisions (allow/deny). Spike in denials may indicate attack or misconfiguration." },
    { title: "Rate Limit Hits", query: "sum(rate(edp_gateway_rate_limit_hits_total[5m])) by (client, tier)", desc: "Rate limit activations per client and tier. Frequent hits suggest tier upgrade needed." },
    { title: "SLO Budget Remaining", query: "1 - (sum(rate(edp_ingest_events_total{status!='2xx'}[30d])) / sum(rate(edp_ingest_events_total[30d])) / 0.0005)", desc: "Error budget remaining as a percentage. Budget is based on 99.95% availability target." },
    { title: "Circuit Breaker States", query: "edp_ingest_circuit_breaker_state", desc: "Circuit breaker state per dependency. 0=closed (healthy), 1=half-open, 2=open (failing)." },
    { title: "Transform Pipeline Throughput", query: "sum(rate(edp_transform_output_events_total[5m])) by (pipeline)", desc: "Events processed per second per transformation pipeline." },
    { title: "Transform Lookup Latency", query: "histogram_quantile(0.99, sum(rate(edp_transform_lookup_latency_seconds_bucket[5m])) by (le, pipeline, stage))", desc: "External lookup latency in transform pipelines. High values indicate slow dependencies." },
    { title: "Transform Cache Hit Ratio", query: "edp_transform_lookup_cache_hit_ratio", desc: "Cache hit ratio for transform pipeline lookups. Low ratio causes high latency." },
    { title: "Trino Query Execution Time", query: "histogram_quantile(0.99, sum(rate(edp_query_trino_execution_seconds_bucket[5m])) by (le))", desc: "Historical query execution time via Trino. Long queries may need optimization." },
    { title: "Active Replay Operations", query: "edp_query_replay_active", desc: "Currently running event replay operations. Should be monitored to avoid overloading consumers." },
  ]) + `\n## Dashboard Links\n\n` +
  `| Dashboard | URL | Purpose |\n|-----------|-----|--------|\n` +
  `| Platform Overview | /d/edp-overview | High-level platform health |\n` +
  `| Service Detail | /d/edp-service-detail | Per-service deep dive |\n` +
  `| Kafka Cluster | /d/edp-kafka | Kafka broker metrics |\n` +
  `| Consumer Lag | /d/edp-consumer-lag | Consumer group lag |\n` +
  `| Data Lake | /d/edp-data-lake | Iceberg table metrics |\n` +
  `| Schema Registry | /d/edp-schema-registry | Schema operations |\n` +
  `| SLO Status | /d/edp-slo | SLO burn rates |\n` +
  `| Cost Analysis | /d/edp-cost | Infrastructure costs |\n` +
  `| Security | /d/edp-security | Auth, TLS, audit |\n` +
  `| CDC Pipeline | /d/edp-cdc | CDC connector status |\n`,
));


newDocs.push(makeDoc(
  "gamma-ref-data-dictionary", "document",
  "EDP Data Dictionary — All Event Fields & Types",
  "governance", "before-phase-1",
  `# EDP Data Dictionary — All Event Fields & Types

## Overview

This document catalogs all event schemas in the Enterprise Data Platform, their fields,
types, and business definitions. It serves as the authoritative reference for data consumers
and producers.

## E-Commerce Domain

### Order Event (edp.events.ecommerce.orders)

| Field | Type | Required | Description | PII Level | Example |
|-------|------|----------|-------------|-----------|---------|
| order_id | string | yes | Unique order identifier | 0 | "ord_abc123" |
| customer_id | string | yes | Customer identifier | 1 | "cust_xyz789" |
| email | string | no | Customer email address | 2 | "user@example.com" |
| phone | string | no | Customer phone number | 2 | "+1-555-0123" |
| status | enum | yes | Order status | 0 | "confirmed" |
| created_at | timestamp-ms | yes | Order creation time | 0 | 1734567890123 |
| updated_at | timestamp-ms | yes | Last update time | 0 | 1734567899999 |
| total | decimal(10,2) | yes | Order total amount | 1 | 99.99 |
| currency | string | yes | ISO 4217 currency code | 0 | "USD" |
| tax | decimal(10,2) | no | Tax amount | 1 | 8.99 |
| discount | decimal(10,2) | no | Discount amount | 1 | 5.00 |
| shipping_cost | decimal(10,2) | no | Shipping cost | 1 | 9.99 |
| items | array<OrderItem> | yes | Line items | 0 | [...] |
| shipping_address | Address | no | Shipping address | 2 | {...} |
| billing_address | Address | no | Billing address | 2 | {...} |
| payment_method | string | no | Payment method type | 1 | "credit_card" |
| channel | string | no | Sales channel | 0 | "web" |
| source_system | string | yes | Originating system | 0 | "ecommerce" |
| correlation_id | string | no | Business correlation ID | 0 | "corr_abc123" |
| metadata | map<string,string> | no | Additional metadata | 0 | {"promo_code": "SAVE10"} |

**Nested Types:**

OrderItem:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sku | string | yes | Product SKU |
| name | string | yes | Product name |
| quantity | int | yes | Quantity ordered |
| price | decimal(10,2) | yes | Unit price |
| total | decimal(10,2) | yes | Line total (price × quantity) |
| category | string | no | Product category |
| variant | string | no | Product variant (size, color) |

Address:
| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| line1 | string | yes | Address line 1 | 2 |
| line2 | string | no | Address line 2 | 2 |
| city | string | yes | City | 1 |
| state | string | no | State/province | 1 |
| postal_code | string | yes | Postal/ZIP code | 2 |
| country | string | yes | ISO 3166-1 alpha-2 | 0 |

**Status Enum Values:**
| Value | Description | Terminal |
|-------|-------------|----------|
| pending | Order created, awaiting payment | No |
| confirmed | Payment received, processing | No |
| processing | Being prepared/picked | No |
| shipped | Handed to carrier | No |
| delivered | Confirmed delivered | Yes |
| cancelled | Cancelled by customer or system | Yes |
| refunded | Full or partial refund issued | Yes |
| returned | Returned by customer | Yes |

### Customer Event (edp.events.ecommerce.customers)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| customer_id | string | yes | Unique customer identifier | 1 |
| email | string | yes | Email address | 2 |
| name | string | no | Full name | 2 |
| phone | string | no | Phone number | 2 |
| tier | enum | yes | Customer tier | 0 |
| segment | string | no | Marketing segment | 0 |
| region | string | yes | Geographic region | 0 |
| created_at | timestamp-ms | yes | Account creation date | 0 |
| last_order_at | timestamp-ms | no | Last order timestamp | 1 |
| total_orders | int | no | Lifetime order count | 1 |
| total_spend | decimal(10,2) | no | Lifetime spend | 1 |
| preferences | map<string,string> | no | Customer preferences | 1 |
| consent | Consent | no | GDPR consent record | 0 |

**Tier Values:** free, basic, premium, enterprise

## Payments Domain

### Transaction Event (edp.events.payments.transactions)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| transaction_id | string | yes | Unique transaction ID | 1 |
| order_id | string | yes | Associated order ID | 1 |
| customer_id | string | yes | Customer ID | 1 |
| amount | decimal(10,2) | yes | Transaction amount | 1 |
| currency | string | yes | ISO 4217 currency code | 0 |
| type | enum | yes | Transaction type | 0 |
| status | enum | yes | Transaction status | 0 |
| payment_method | PaymentMethod | yes | Payment details | 3 |
| created_at | timestamp-ms | yes | Transaction time | 0 |
| settled_at | timestamp-ms | no | Settlement time | 0 |
| gateway | string | yes | Payment gateway | 0 |
| gateway_ref | string | yes | Gateway reference | 1 |
| risk_score | float | no | Fraud risk score (0-1) | 1 |
| ip_address | string | no | Client IP | 2 |
| device_fingerprint | string | no | Device fingerprint | 2 |

**Transaction Type Values:** charge, refund, void, capture, authorization

**Transaction Status Values:** pending, authorized, captured, settled, failed, refunded, voided

PaymentMethod:
| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| type | string | yes | Method type | 0 |
| last4 | string | no | Last 4 digits of card | 3 |
| brand | string | no | Card brand | 0 |
| exp_month | int | no | Expiry month | 3 |
| exp_year | int | no | Expiry year | 3 |
| token | string | no | Tokenized payment reference | 3 |

### Refund Event (edp.events.payments.refunds)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| refund_id | string | yes | Unique refund ID | 1 |
| transaction_id | string | yes | Original transaction | 1 |
| order_id | string | yes | Original order | 1 |
| amount | decimal(10,2) | yes | Refund amount | 1 |
| currency | string | yes | Currency code | 0 |
| reason | string | yes | Refund reason | 0 |
| status | enum | yes | Refund status | 0 |
| initiated_by | string | yes | Who initiated | 1 |
| initiated_at | timestamp-ms | yes | Initiation time | 0 |
| completed_at | timestamp-ms | no | Completion time | 0 |

## Logistics Domain

### Shipment Event (edp.events.logistics.shipments)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| shipment_id | string | yes | Unique shipment ID | 0 |
| order_id | string | yes | Associated order | 1 |
| carrier | string | yes | Carrier name | 0 |
| tracking_number | string | yes | Carrier tracking number | 0 |
| status | enum | yes | Shipment status | 0 |
| origin | ShipmentLocation | yes | Origin location | 1 |
| destination | ShipmentLocation | yes | Destination | 2 |
| estimated_delivery | timestamp-ms | no | ETA | 0 |
| actual_delivery | timestamp-ms | no | Actual delivery time | 0 |
| weight_kg | float | no | Package weight | 0 |
| dimensions | Dimensions | no | Package dimensions | 0 |
| items | array<ShipmentItem> | yes | Items in shipment | 0 |
| created_at | timestamp-ms | yes | Shipment creation time | 0 |
| updated_at | timestamp-ms | yes | Last update time | 0 |

**Shipment Status Values:** created, label_printed, picked_up, in_transit, out_for_delivery, delivered, returned, lost

### Tracking Event (edp.events.logistics.tracking)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| tracking_id | string | yes | Unique tracking event ID | 0 |
| shipment_id | string | yes | Associated shipment | 0 |
| tracking_number | string | yes | Carrier tracking number | 0 |
| status | string | yes | Tracking status code | 0 |
| description | string | yes | Status description | 0 |
| location | TrackingLocation | no | Current location | 0 |
| timestamp | timestamp-ms | yes | Event timestamp | 0 |
| carrier_event_id | string | no | Carrier's internal event ID | 0 |

## IoT/Sensors Domain

### Sensor Event (edp.events.iot.sensors)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| sensor_id | string | yes | Sensor identifier | 0 |
| device_id | string | yes | Device identifier | 0 |
| type | string | yes | Sensor type (temp, humidity, pressure, etc.) | 0 |
| value | double | yes | Sensor reading | 0 |
| unit | string | yes | Measurement unit | 0 |
| timestamp | timestamp-ms | yes | Reading timestamp | 0 |
| location | GeoPoint | no | Sensor location | 0 |
| quality | float | no | Data quality score (0-1) | 0 |
| battery_pct | float | no | Battery percentage | 0 |
| firmware_version | string | no | Device firmware | 0 |

## Analytics Domain

### Clickstream Event (edp.events.analytics.clickstream)

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| event_id | string | yes | Unique event ID | 0 |
| session_id | string | yes | User session ID | 1 |
| user_id | string | no | Authenticated user ID | 1 |
| anonymous_id | string | yes | Anonymous tracking ID | 1 |
| event_type | string | yes | Event type | 0 |
| page_url | string | yes | Page URL | 0 |
| referrer | string | no | Referrer URL | 0 |
| user_agent | string | yes | Browser user agent | 1 |
| ip_address | string | yes | Client IP | 2 |
| geo | GeoInfo | no | Geolocation data | 1 |
| device | DeviceInfo | no | Device information | 0 |
| properties | map<string,string> | no | Custom event properties | 0 |
| timestamp | timestamp-ms | yes | Event timestamp | 0 |

## Mobile Domain (Protobuf)

### Mobile Event (edp.events.mobile.events)

Note: This domain uses Protocol Buffers format (not Avro).

| Field | Type | Required | Description | PII Level |
|-------|------|----------|-------------|-----------|
| event_id | string | yes | Unique event ID | 0 |
| app_version | string | yes | Application version | 0 |
| platform | enum | yes | iOS, Android | 0 |
| device_model | string | yes | Device model | 0 |
| os_version | string | yes | OS version | 0 |
| user_id | string | no | Authenticated user ID | 1 |
| session_id | string | yes | App session ID | 1 |
| event_type | string | yes | Event type | 0 |
| screen_name | string | no | Current screen | 0 |
| action | string | no | User action | 0 |
| properties | map<string,string> | no | Custom properties | 0 |
| timestamp | int64 | yes | Unix timestamp ms | 0 |
| network_type | string | no | wifi, cellular, offline | 0 |
| battery_level | float | no | Battery percentage | 0 |
| locale | string | no | Device locale | 0 |

## Common Types

### GeoPoint
| Field | Type | Description |
|-------|------|-------------|
| latitude | double | Latitude (-90 to 90) |
| longitude | double | Longitude (-180 to 180) |

### GeoInfo
| Field | Type | Description |
|-------|------|-------------|
| country | string | ISO 3166-1 alpha-2 |
| region | string | State/province |
| city | string | City name |
| postal_code | string | Postal/ZIP code |
| timezone | string | IANA timezone |

### DeviceInfo
| Field | Type | Description |
|-------|------|-------------|
| type | string | desktop, mobile, tablet |
| browser | string | Browser name |
| browser_version | string | Browser version |
| os | string | Operating system |
| os_version | string | OS version |
| screen_width | int | Screen width pixels |
| screen_height | int | Screen height pixels |

## Schema Versioning

All schemas follow semantic versioning within the Schema Registry:
- Minor version bump: New optional fields added
- Major version bump: Schema structure change (new subject)

Current schema versions:
| Subject | Current Version | Last Updated |
|---------|----------------|-------------|
| edp.events.ecommerce.orders-value | v5 | 2025-12-01 |
| edp.events.ecommerce.customers-value | v3 | 2025-11-15 |
| edp.events.payments.transactions-value | v4 | 2025-12-10 |
| edp.events.payments.refunds-value | v2 | 2025-10-01 |
| edp.events.logistics.shipments-value | v3 | 2025-11-20 |
| edp.events.logistics.tracking-value | v2 | 2025-09-15 |
| edp.events.iot.sensors-value | v2 | 2025-10-01 |
| edp.events.analytics.clickstream-value | v4 | 2025-12-05 |
| edp.events.mobile.events-value | v1 | 2025-11-30 |
`,
));


newDocs.push(makeDoc(
  "gamma-ref-compliance-matrix", "document",
  "EDP Compliance Requirements Matrix — GDPR, PCI-DSS, SOC 2, SOX",
  "compliance", "phase-5",
  `# EDP Compliance Requirements Matrix

## Overview

This document maps regulatory requirements to EDP controls and implementations.
It covers GDPR (data privacy), PCI-DSS (payment card security), SOC 2 (security controls),
and SOX (financial reporting integrity).

## GDPR (General Data Protection Regulation)

### Article 5: Principles

| Principle | EDP Implementation | Evidence |
|-----------|-------------------|----------|
| Lawfulness (5.1.a) | Consent tracking in customer events | Customer.consent field |
| Purpose limitation (5.1.b) | Data catalog purpose annotations | DataHub metadata |
| Data minimisation (5.1.c) | Schema review requires justification for PII fields | Schema review checklist |
| Accuracy (5.1.d) | Data quality rules per dataset | Quality score dashboard |
| Storage limitation (5.1.e) | Retention policies per data tier | Topic retention config |
| Integrity & confidentiality (5.1.f) | Encryption at rest and in transit | mTLS, EBS encryption, S3 encryption |
| Accountability (5.2) | Audit trail for all data access | edp.audit.* topics |

### Article 15: Right of Access

| Requirement | Implementation | SLA |
|-------------|---------------|-----|
| Provide copy of personal data | edp-query API filtered by customer_id | 24 hours |
| Information about processing | Data catalog + privacy notices | Available online |
| Recipients of data | DataHub lineage + consumer group list | 48 hours |

### Article 17: Right to Erasure

| Requirement | Implementation | SLA |
|-------------|---------------|-----|
| Delete personal data | GDPR erasure pipeline | 72 hours |
| Notify processors | Erasure event to all consumer topics | 24 hours |
| Kafka events | Events expire via retention (48h-7d) | Automatic |
| Data lake | Iceberg delete files | 24 hours |
| Redis cache | Key deletion by customer_id | 1 hour |
| Backup data | S3 lifecycle with Object Lock exemption | 30 days |

### Article 25: Data Protection by Design

| Requirement | Implementation |
|-------------|---------------|
| Pseudonymisation | Customer IDs are pseudonymous (no direct identity) |
| Field-level encryption | PII Level 2+ fields encrypted with Vault Transit |
| Tokenization | PII Level 3 fields (credit card) tokenized |
| Access control | RBAC with need-to-know for PII access |
| Audit logging | All PII access logged to immutable audit trail |

### Article 33: Breach Notification

| Requirement | Implementation | SLA |
|-------------|---------------|-----|
| Supervisory authority | Security incident playbook step 6 | 72 hours |
| Data subjects | Customer notification process | Without undue delay |
| Documentation | Incident report in audit trail | 24 hours |

## PCI-DSS v4.0

### Requirement 1: Network Security Controls

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 1.2.1 Network segmentation | VPC + security groups + NetworkPolicy | Compliant |
| 1.2.5 Services restricted by need | ACLs per consumer group | Compliant |
| 1.3.1 Inbound traffic restricted | API Gateway with authentication | Compliant |
| 1.3.2 Outbound traffic restricted | Egress NetworkPolicy per namespace | Compliant |

### Requirement 3: Protect Stored Account Data

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 3.1 Data retention minimized | 7-day retention for payment topics | Compliant |
| 3.3.1 SAD not stored after auth | No SAD in event payloads | Compliant |
| 3.4.1 PAN rendered unreadable | Tokenized via payment gateway | Compliant |
| 3.5.1 Key management procedures | Vault Transit for encryption keys | Compliant |

### Requirement 4: Encrypt Transmission

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 4.1 Strong cryptography for transmission | TLS 1.3 for all connections | Compliant |
| 4.2.1 PAN secured during transmission | mTLS between all Kafka clients | Compliant |

### Requirement 6: Develop Secure Systems

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 6.2.1 Secure development lifecycle | CI/CD with security scanning | Compliant |
| 6.3.1 Known vulnerabilities addressed | Snyk scanning, monthly patching | Compliant |
| 6.4.1 Public-facing apps protected | WAF on API Gateway | Compliant |

### Requirement 7: Restrict Access

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 7.1 Access limited to need | RBAC per service account | Compliant |
| 7.2.1 Access control system | Kafka ACLs + K8s RBAC | Compliant |
| 7.2.5 Access assigned per job function | Service accounts per consumer | Compliant |

### Requirement 8: Identify and Authenticate Access

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 8.2.1 Unique IDs for users | API keys per client, service accounts per pod | Compliant |
| 8.3.1 MFA for admin access | SSO with MFA for admin API | Compliant |
| 8.6.1 Service account management | Vault-managed, auto-rotated | Compliant |

### Requirement 10: Log and Monitor

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 10.1 Audit trail implemented | edp.audit.* Kafka topics | Compliant |
| 10.2.1 All access logged | Structured logging with user context | Compliant |
| 10.3 Audit trail protected | S3 Object Lock (immutable) | Compliant |
| 10.4 Audit trail reviewed | Weekly review by security team | Compliant |
| 10.6.1 Anomaly detection | Grafana alerts on unusual patterns | Compliant |
| 10.7 Audit trail retained | 1 year (Kafka) + 7 years (S3) | Compliant |

### Requirement 12: Organizational Policies

| Sub-Requirement | EDP Control | Status |
|-----------------|------------|--------|
| 12.3.1 Risk assessment | Annual risk assessment | Compliant |
| 12.5.2 Incident response plan | Security incident playbook | Compliant |
| 12.10 Incident response tested | Quarterly tabletop exercise | Compliant |

## SOC 2 Type II

### Trust Service Criteria

#### Security (Common Criteria)

| Criteria | Control | Evidence |
|----------|---------|----------|
| CC1.1 COSO principle | Security policies documented | Policy repository |
| CC2.1 Internal communication | Monthly security review | Meeting notes |
| CC3.1 Risk assessment | Quarterly risk assessment | Risk register |
| CC4.1 Monitoring activities | Continuous monitoring via Grafana | Dashboard screenshots |
| CC5.1 Control activities | Automated security controls | CI/CD pipeline config |
| CC6.1 Logical access | RBAC + ACLs | Access matrix |
| CC6.2 Access provisioning | Self-service + approval | Access request logs |
| CC6.3 Access removal | Automated on offboarding | HR integration |
| CC7.1 Change management | PR review + CI/CD | Git history |
| CC7.2 System changes | Deployment pipeline | Deployment logs |
| CC8.1 Vulnerability management | Snyk + monthly patches | Scan reports |

#### Availability

| Criteria | Control | Evidence |
|----------|---------|----------|
| A1.1 Capacity management | Capacity planning model | Planning documents |
| A1.2 Recovery procedures | DR plan + tested quarterly | Test results |
| A1.3 Recovery testing | Quarterly DR drills | Drill reports |

#### Processing Integrity

| Criteria | Control | Evidence |
|----------|---------|----------|
| PI1.1 Processing accuracy | Schema validation + data quality rules | Quality dashboards |
| PI1.2 Processing completeness | Consumer lag monitoring | Lag dashboards |
| PI1.3 Processing timeliness | SLO tracking | SLO reports |

#### Confidentiality

| Criteria | Control | Evidence |
|----------|---------|----------|
| C1.1 Confidential data identified | PII classification | Schema annotations |
| C1.2 Confidential data disposed | Retention policies | Topic configs |

## SOX (Sarbanes-Oxley)

### Section 302: CEO/CFO Certification

| Requirement | EDP Control |
|-------------|------------|
| Financial data accuracy | Exactly-once processing for payment events |
| Internal controls effective | Automated reconciliation between EDP and finance system |
| Material changes disclosed | Change audit trail in edp.audit.* topics |

### Section 404: Internal Controls Assessment

| Control | Implementation | Testing |
|---------|---------------|---------|
| Data integrity | Schema validation + dedup | Monthly reconciliation |
| Processing accuracy | Exactly-once semantics | Integration tests |
| Access controls | RBAC per financial data | Quarterly access review |
| Audit trail | Immutable audit logs | Annual audit |
| Change management | PR review + deployment pipeline | CI/CD audit |

## Compliance Calendar

| Frequency | Activity | Owner |
|-----------|----------|-------|
| Daily | Security alert review | On-call engineer |
| Weekly | Audit log review | Security team |
| Monthly | Vulnerability scanning + patching | Platform team |
| Quarterly | Risk assessment | Security + Platform |
| Quarterly | DR drill | Infrastructure + Platform |
| Quarterly | Access review | Security + HR |
| Semi-annual | Penetration test | External vendor |
| Annual | SOC 2 audit | External auditor |
| Annual | PCI-DSS assessment | QSA |
| As needed | GDPR DPIA | DPO + Legal |

## Audit Evidence Repository

All compliance evidence is stored in:
- **S3**: s3://edp-compliance-evidence/{year}/{quarter}/
- **Git**: edp-compliance repository (policies, procedures, checklists)
- **Grafana**: Dashboard screenshots archived monthly
- **PagerDuty**: Incident history and resolution times
- **Vault**: Credential rotation logs
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
