#!/usr/bin/env tsx
// Gamma Fixture — Second corpus expansion to reach ~107K tokens
//
// Adds bulk technical documentation to push total past 100K tokens.
// Run AFTER expand-corpus.ts:
//   npx tsx expand-corpus-2.ts

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

// Generate a realistic K8s manifest section
function k8sManifest(name: string, replicas: number, cpu: string, mem: string, port: number): string {
  return `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: edp
  labels:
    app: ${name}
    tier: platform
    version: v1.0.0
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: ${name}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "${port}"
    spec:
      serviceAccountName: ${name}-sa
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: ${name}
          image: registry.internal/edp/${name}:latest
          ports:
            - containerPort: ${port}
              name: http
              protocol: TCP
            - containerPort: ${port + 1}
              name: grpc
              protocol: TCP
          resources:
            requests:
              cpu: ${cpu}
              memory: ${mem}
            limits:
              cpu: "${parseInt(cpu) * 2}m"
              memory: "${parseInt(mem) * 2}Mi"
          env:
            - name: KAFKA_BOOTSTRAP_SERVERS
              valueFrom:
                configMapKeyRef:
                  name: edp-config
                  key: kafka.bootstrap.servers
            - name: SCHEMA_REGISTRY_URL
              valueFrom:
                configMapKeyRef:
                  name: edp-config
                  key: schema.registry.url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: ${name}-secrets
                  key: redis-url
            - name: DB_URL
              valueFrom:
                secretKeyRef:
                  name: ${name}-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /healthz
              port: ${port}
            initialDelaySeconds: 15
            periodSeconds: 20
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /readyz
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
          volumeMounts:
            - name: config
              mountPath: /etc/edp
              readOnly: true
            - name: tls
              mountPath: /etc/tls
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: ${name}-config
        - name: tls
          secret:
            secretName: ${name}-tls
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - ${name}
                topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: edp
spec:
  selector:
    app: ${name}
  ports:
    - name: http
      port: ${port}
      targetPort: ${port}
      protocol: TCP
    - name: grpc
      port: ${port + 1}
      targetPort: ${port + 1}
      protocol: TCP
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${name}
  namespace: edp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${name}
  minReplicas: ${replicas}
  maxReplicas: ${replicas * 5}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${name}
  namespace: edp
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: ${name}
`;
}

// Generate detailed API docs section
function apiEndpointDocs(service: string, endpoints: Array<{method: string; path: string; desc: string; params: string; response: string}>): string {
  let out = `## API Reference: ${service}\n\n`;
  for (const ep of endpoints) {
    out += `### ${ep.method} ${ep.path}\n\n`;
    out += `${ep.desc}\n\n`;
    out += `**Parameters:**\n${ep.params}\n\n`;
    out += `**Response:**\n\`\`\`json\n${ep.response}\n\`\`\`\n\n`;
    out += `**Error Codes:**\n`;
    out += `| Code | Description |\n|------|-------------|\n`;
    out += `| 400 | Invalid request parameters |\n`;
    out += `| 401 | Authentication required |\n`;
    out += `| 403 | Insufficient permissions |\n`;
    out += `| 404 | Resource not found |\n`;
    out += `| 429 | Rate limit exceeded |\n`;
    out += `| 500 | Internal server error |\n\n`;
  }
  return out;
}


const newDocs: CorpusDoc[] = [];

// ============================================================
// Infrastructure-as-Code Documentation (large, realistic docs)
// ============================================================

newDocs.push(makeDoc(
  "gamma-infra-k8s-manifests", "document",
  "EDP Kubernetes Deployment Manifests — Complete Reference",
  "infrastructure", "phase-3",
  `# EDP Kubernetes Deployment Manifests

## Overview

This document contains the complete Kubernetes manifest reference for all EDP services.
All services run in the \`edp\` namespace with standardized configuration patterns.

## Common Configuration

### ConfigMap: edp-config
\`\`\`yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: edp-config
  namespace: edp
data:
  kafka.bootstrap.servers: "kafka-0.kafka.edp.svc.cluster.local:9092,kafka-1.kafka.edp.svc.cluster.local:9092,kafka-2.kafka.edp.svc.cluster.local:9092,kafka-3.kafka.edp.svc.cluster.local:9092,kafka-4.kafka.edp.svc.cluster.local:9092"
  schema.registry.url: "http://schema-registry.edp.svc.cluster.local:8081"
  prometheus.pushgateway: "http://pushgateway.monitoring.svc.cluster.local:9091"
  loki.url: "http://loki.monitoring.svc.cluster.local:3100"
  tempo.endpoint: "tempo.monitoring.svc.cluster.local:4317"
  consul.url: "http://consul.edp.svc.cluster.local:8500"
  environment: "production"
  log.level: "info"
  log.format: "json"
\`\`\`

### Namespace
\`\`\`yaml
apiVersion: v1
kind: Namespace
metadata:
  name: edp
  labels:
    istio-injection: enabled
    team: data-platform
\`\`\`

### Network Policy (Default Deny)
\`\`\`yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: edp
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
\`\`\`

## Service Deployments

### edp-ingest (Event Ingestion)
${k8sManifest("edp-ingest", 3, "500", "512", 8080)}

### edp-transform (Transformation Pipeline)
${k8sManifest("edp-transform", 4, "1000", "1024", 8090)}

### edp-consumer-framework (Consumer Base)
${k8sManifest("edp-consumer", 4, "250", "256", 8070)}

### edp-gateway (API Gateway)
${k8sManifest("edp-gateway", 3, "1000", "1024", 8443)}

### edp-query (Event Query Service)
${k8sManifest("edp-query", 3, "500", "512", 8060)}

### edp-lake-sink (Data Lake Connector)
${k8sManifest("edp-lake-sink", 4, "500", "1024", 8050)}

### edp-cdc (Change Data Capture)
${k8sManifest("edp-cdc", 3, "500", "512", 8040)}

### edp-admin (Administration Service)
${k8sManifest("edp-admin", 2, "250", "256", 8030)}

## Kafka StatefulSet

\`\`\`yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: edp
spec:
  serviceName: kafka
  replicas: 5
  podManagementPolicy: Parallel
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      terminationGracePeriodSeconds: 300
      containers:
        - name: kafka
          image: confluentinc/cp-kafka:7.6.0
          ports:
            - containerPort: 9092
              name: client
            - containerPort: 9093
              name: controller
          resources:
            requests:
              cpu: "4"
              memory: 16Gi
            limits:
              cpu: "8"
              memory: 32Gi
          env:
            - name: KAFKA_PROCESS_ROLES
              value: "broker,controller"
            - name: KAFKA_LISTENERS
              value: "CLIENT://:9092,CONTROLLER://:9093"
            - name: KAFKA_INTER_BROKER_LISTENER_NAME
              value: "CLIENT"
            - name: KAFKA_CONTROLLER_LISTENER_NAMES
              value: "CONTROLLER"
            - name: KAFKA_LOG_DIRS
              value: "/var/kafka/data"
            - name: KAFKA_NUM_PARTITIONS
              value: "12"
            - name: KAFKA_DEFAULT_REPLICATION_FACTOR
              value: "3"
            - name: KAFKA_MIN_INSYNC_REPLICAS
              value: "2"
            - name: KAFKA_LOG_RETENTION_MS
              value: "172800000"
            - name: KAFKA_LOG_SEGMENT_BYTES
              value: "1073741824"
            - name: KAFKA_COMPRESSION_TYPE
              value: "lz4"
            - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
              value: "false"
            - name: KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS
              value: "3000"
            - name: KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR
              value: "3"
            - name: KAFKA_TRANSACTION_STATE_LOG_MIN_ISR
              value: "2"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "3"
            - name: KAFKA_JMX_PORT
              value: "9999"
            - name: KAFKA_HEAP_OPTS
              value: "-Xmx12g -Xms12g"
          volumeMounts:
            - name: data
              mountPath: /var/kafka/data
            - name: tls
              mountPath: /etc/kafka/tls
              readOnly: true
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 2Ti
\`\`\`

## Redis Cluster

\`\`\`yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: edp
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7.2-alpine
          ports:
            - containerPort: 6379
          command:
            - redis-server
            - "--cluster-enabled"
            - "yes"
            - "--cluster-config-file"
            - "/data/nodes.conf"
            - "--cluster-node-timeout"
            - "5000"
            - "--appendonly"
            - "yes"
            - "--maxmemory"
            - "8gb"
            - "--maxmemory-policy"
            - "allkeys-lru"
          resources:
            requests:
              cpu: "1"
              memory: 8Gi
            limits:
              cpu: "2"
              memory: 16Gi
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 50Gi
\`\`\`
`,
));


newDocs.push(makeDoc(
  "gamma-infra-terraform", "document",
  "EDP Infrastructure — Terraform Module Reference",
  "infrastructure", "phase-5",
  `# EDP Infrastructure — Terraform Module Reference

## Overview

The EDP infrastructure is managed via Terraform with the following module structure:

\`\`\`
terraform/
  modules/
    kafka/          # Kafka cluster (EC2 + EBS)
    networking/     # VPC, subnets, security groups
    monitoring/     # Prometheus, Grafana, Loki
    data-lake/      # S3 buckets, Glue catalog, Athena
    kubernetes/     # EKS cluster, node groups
    security/       # IAM roles, KMS keys, certificates
    dns/            # Route53, health checks
  environments/
    production/
    staging/
    development/
\`\`\`

## Module: kafka

### Inputs

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| broker_count | number | 5 | Number of Kafka brokers |
| controller_count | number | 3 | Number of KRaft controllers |
| broker_instance_type | string | "r6i.2xlarge" | EC2 instance type for brokers |
| controller_instance_type | string | "m6i.xlarge" | EC2 instance type for controllers |
| broker_volume_size_gb | number | 2000 | EBS volume size per broker |
| broker_volume_type | string | "gp3" | EBS volume type |
| broker_volume_iops | number | 6000 | EBS IOPS (gp3) |
| broker_volume_throughput | number | 400 | EBS throughput MB/s (gp3) |
| vpc_id | string | - | VPC ID |
| subnet_ids | list(string) | - | Subnet IDs for broker placement |
| kafka_version | string | "3.7.0" | Apache Kafka version |
| enable_tiered_storage | bool | false | Enable S3 tiered storage |
| tiered_storage_bucket | string | "" | S3 bucket for tiered storage |
| tags | map(string) | {} | Additional tags |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| bootstrap_servers | string | Kafka bootstrap server list |
| broker_ids | list(string) | EC2 instance IDs |
| broker_private_ips | list(string) | Private IP addresses |
| security_group_id | string | SG for Kafka cluster |
| dns_name | string | Route53 DNS name |

### Example Usage

\`\`\`hcl
module "kafka" {
  source = "../../modules/kafka"

  broker_count          = 5
  controller_count      = 3
  broker_instance_type  = "r6i.2xlarge"
  broker_volume_size_gb = 2000
  broker_volume_iops    = 6000

  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids

  enable_tiered_storage = true
  tiered_storage_bucket = module.data_lake.tiered_storage_bucket

  tags = {
    Environment = "production"
    Team        = "data-platform"
    CostCenter  = "CC-1234"
  }
}
\`\`\`

### Resources Created

| Resource | Count | Purpose |
|----------|-------|---------|
| aws_instance (broker) | 5 | Kafka broker instances |
| aws_instance (controller) | 3 | KRaft controller instances |
| aws_ebs_volume | 5 | Broker data volumes |
| aws_volume_attachment | 5 | Attach volumes to brokers |
| aws_security_group | 1 | Kafka cluster SG |
| aws_security_group_rule | 8 | Ingress/egress rules |
| aws_route53_record | 8 | DNS records for each node |
| aws_iam_role | 2 | Broker + controller IAM roles |
| aws_iam_instance_profile | 2 | Instance profiles |
| aws_kms_key | 1 | Encryption key for EBS |
| aws_cloudwatch_metric_alarm | 15 | Monitoring alarms |

## Module: networking

### VPC Design

\`\`\`
10.0.0.0/16 (VPC)
  10.0.0.0/20   - Public subnet AZ-a (NAT, ALB)
  10.0.16.0/20  - Public subnet AZ-b
  10.0.32.0/20  - Public subnet AZ-c
  10.0.64.0/20  - Private subnet AZ-a (EDP services)
  10.0.80.0/20  - Private subnet AZ-b
  10.0.96.0/20  - Private subnet AZ-c
  10.0.128.0/20 - Data subnet AZ-a (Kafka, DBs)
  10.0.144.0/20 - Data subnet AZ-b
  10.0.160.0/20 - Data subnet AZ-c
  10.0.192.0/20 - Management subnet (monitoring, admin)
\`\`\`

### Security Groups

| SG Name | Purpose | Ingress | Egress |
|---------|---------|---------|--------|
| edp-kafka | Kafka brokers | 9092-9093 from edp-services, edp-kafka | All |
| edp-services | EDP application pods | 8000-9000 from edp-gateway | Kafka, Redis, DB |
| edp-gateway | API Gateway | 443 from 0.0.0.0/0 | edp-services |
| edp-redis | Redis cluster | 6379 from edp-services | 6379 from edp-redis |
| edp-db | PostgreSQL | 5432 from edp-services, edp-cdc | 5432 from edp-db |
| edp-monitoring | Monitoring stack | 3000,9090 from edp-management | All |

## Module: data-lake

### S3 Buckets

| Bucket | Purpose | Lifecycle |
|--------|---------|-----------|
| edp-data-lake-{env} | Iceberg tables | IA after 90d, Glacier after 365d |
| edp-kafka-tiered-{env} | Kafka tiered storage | Delete after 30d |
| edp-checkpoints-{env} | Flink/Transform checkpoints | Delete after 7d |
| edp-backups-{env} | Schema + config backups | Glacier after 30d |
| edp-audit-{env} | Audit logs (immutable) | Object Lock, retain 7 years |

### Glue Catalog

\`\`\`hcl
resource "aws_glue_catalog_database" "edp" {
  name = "edp_warehouse"

  create_table_default_permission {
    permissions = ["ALL"]
    principal {
      data_lake_principal_identifier = "IAM_ALLOWED_PRINCIPALS"
    }
  }
}
\`\`\`

## Module: kubernetes (EKS)

### Node Groups

| Group | Instance Type | Min | Max | Labels |
|-------|-------------|-----|-----|--------|
| edp-platform | m6i.2xlarge | 4 | 15 | tier=platform |
| edp-compute | c6i.4xlarge | 2 | 10 | tier=compute |
| edp-monitoring | m6i.xlarge | 2 | 4 | tier=monitoring |
| edp-dedicated | r6i.2xlarge | 2 | 4 | tier=dedicated, isolation=tier3 |

### Add-ons

| Add-on | Version | Purpose |
|--------|---------|---------|
| vpc-cni | 1.16 | Pod networking |
| coredns | 1.11 | DNS resolution |
| kube-proxy | 1.29 | Service networking |
| aws-ebs-csi-driver | 1.28 | EBS volumes |
| metrics-server | 0.7 | HPA metrics |
| cluster-autoscaler | 1.29 | Node scaling |
| cert-manager | 1.14 | TLS certificates |
| external-dns | 0.14 | DNS management |
| istio | 1.21 | Service mesh |

## Module: security

### KMS Keys

| Key Alias | Purpose | Rotation |
|-----------|---------|----------|
| edp/kafka/ebs | Kafka broker EBS encryption | Annual |
| edp/s3/data-lake | Data lake S3 encryption | Annual |
| edp/s3/audit | Audit log encryption | Annual |
| edp/rds | Database encryption | Annual |
| edp/secrets | Secrets Manager encryption | Annual |

### IAM Roles

| Role | Services | Key Permissions |
|------|----------|-----------------|
| edp-kafka-broker | EC2 (Kafka) | S3 (tiered storage), KMS (EBS), CloudWatch |
| edp-service | EKS pods | S3 (data lake), KMS, Secrets Manager |
| edp-lake-sink | EKS pods | S3 (data lake write), Glue (catalog update) |
| edp-monitoring | EKS pods | CloudWatch (read), S3 (Thanos write) |
| edp-cdc | EKS pods | Secrets Manager (DB credentials) |

## Cost Optimization

### Reserved Instances

| Component | On-Demand | 1yr Reserved | 3yr Reserved | Savings |
|-----------|----------|-------------|-------------|---------|
| Kafka brokers (5x r6i.2xlarge) | $3,600/mo | $2,340/mo | $1,620/mo | 55% |
| EKS nodes (10x m6i.2xlarge) | $7,200/mo | $4,680/mo | $3,240/mo | 55% |
| Total compute | $10,800/mo | $7,020/mo | $4,860/mo | 55% |

### Spot Instances

Non-critical workloads eligible for Spot:
- edp-transform (stateless, restartable)
- edp-lake-sink (catches up after interruption)
- edp-monitoring (non-critical)

Estimated savings with 30% Spot mix: $1,500/mo
`,
));


newDocs.push(makeDoc(
  "gamma-api-reference", "document",
  "EDP API Reference — Complete Endpoint Documentation",
  "services", "phase-1",
  `# EDP API Reference — Complete Endpoint Documentation

## Base URL

Production: \`https://api.edp.internal/v1\`
Staging: \`https://api.edp-staging.internal/v1\`

## Authentication

All requests require authentication via one of:
- API Key: \`X-EDP-API-Key: edp_live_<key>\`
- JWT: \`Authorization: Bearer <jwt>\`
- mTLS: Client certificate (for service mesh traffic)

${apiEndpointDocs("Event Ingestion", [
  {
    method: "POST",
    path: "/v1/events/{source}/{entity}",
    desc: "Produce a single event to the EDP. The event is validated against the registered Avro schema and produced to the corresponding Kafka topic.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| source | path | string | yes | Source system identifier |
| entity | path | string | yes | Entity type |
| X-EDP-Schema-Version | header | string | yes | Schema version fingerprint |
| X-EDP-Idempotency-Key | header | string | no | Idempotency key (UUID) |
| X-EDP-Source-System | header | string | no | Source system name |
| X-EDP-Partition-Key | header | string | no | Custom partition key |
| body | body | binary/json | yes | Event payload |`,
    response: `{
  "event_id": "evt_1234567890abcdef",
  "topic": "edp.events.ecommerce.orders",
  "partition": 7,
  "offset": 123456789,
  "timestamp": "2025-12-15T10:30:45.123Z",
  "schema_version": 3
}`
  },
  {
    method: "POST",
    path: "/v1/events/{source}/{entity}/batch",
    desc: "Produce a batch of events. Maximum 1000 events per batch. Events are validated individually and produced atomically (all or none).",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| source | path | string | yes | Source system identifier |
| entity | path | string | yes | Entity type |
| X-EDP-Schema-Version | header | string | yes | Schema version |
| body | body | array | yes | Array of event payloads |`,
    response: `{
  "events": [
    {"event_id": "evt_abc", "partition": 3, "offset": 100},
    {"event_id": "evt_def", "partition": 7, "offset": 200}
  ],
  "count": 2,
  "topic": "edp.events.ecommerce.orders"
}`
  },
])}

${apiEndpointDocs("Event Query", [
  {
    method: "GET",
    path: "/v1/events/{source}/{entity}",
    desc: "Query events by time range, entity ID, or correlation ID. Automatically routes to real-time (Kafka/Redis) or historical (Trino/Iceberg) based on query parameters.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| source | path | string | yes | Source system |
| entity | path | string | yes | Entity type |
| after | query | ISO8601 | no | Start timestamp |
| before | query | ISO8601 | no | End timestamp |
| entity_id | query | string | no | Filter by entity ID |
| correlation_id | query | string | no | Filter by correlation ID |
| event_type | query | string | no | Filter by event type |
| limit | query | integer | no | Max results (default 100, max 10000) |
| cursor | query | string | no | Pagination cursor |`,
    response: `{
  "events": [
    {
      "event_id": "evt_abc123",
      "source": "ecommerce",
      "entity": "orders",
      "entity_id": "ord_456",
      "event_type": "order_created",
      "timestamp": "2025-12-15T10:30:45.123Z",
      "schema_version": 3,
      "payload": {"order_id": "ord_456", "total": 99.99}
    }
  ],
  "cursor": "eyJvZmZzZXQiOjEwMH0=",
  "has_more": true,
  "query_mode": "realtime",
  "count": 100
}`
  },
  {
    method: "POST",
    path: "/v1/events/{source}/{entity}/replay",
    desc: "Replay events from a time range to a target topic. Useful for reprocessing after consumer fixes or for populating new consumers.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| source | path | string | yes | Source system |
| entity | path | string | yes | Entity type |
| from | body | ISO8601 | yes | Start timestamp |
| to | body | ISO8601 | yes | End timestamp |
| target_topic | body | string | yes | Target replay topic |
| filter.entity_id | body | array | no | Filter by entity IDs |
| filter.event_type | body | array | no | Filter by event types |
| rate_limit_events_per_second | body | integer | no | Rate limit (default 1000) |`,
    response: `{
  "replay_id": "rpl_789xyz",
  "status": "started",
  "estimated_events": 50000,
  "target_topic": "edp.replay.order-enrichment.orders",
  "rate_limit": 1000,
  "estimated_duration_seconds": 50
}`
  },
])}

${apiEndpointDocs("Schema Management", [
  {
    method: "GET",
    path: "/v1/schemas/{subject}",
    desc: "Get the latest schema for a subject. Returns the Avro or Protobuf schema definition.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| subject | path | string | yes | Schema subject (e.g., edp.events.ecommerce.orders-value) |`,
    response: `{
  "subject": "edp.events.ecommerce.orders-value",
  "version": 5,
  "id": 42,
  "schemaType": "AVRO",
  "schema": "{...}",
  "compatibility": "BACKWARD",
  "references": []
}`
  },
  {
    method: "GET",
    path: "/v1/schemas/{subject}/versions",
    desc: "List all versions of a schema subject.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| subject | path | string | yes | Schema subject |`,
    response: `{
  "subject": "edp.events.ecommerce.orders-value",
  "versions": [1, 2, 3, 4, 5]
}`
  },
  {
    method: "POST",
    path: "/v1/schemas/{subject}/versions",
    desc: "Register a new schema version. Must pass compatibility check against existing versions.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| subject | path | string | yes | Schema subject |
| schema | body | string | yes | Schema definition (JSON string) |
| schemaType | body | string | no | AVRO (default) or PROTOBUF |
| references | body | array | no | Schema references |`,
    response: `{
  "id": 43,
  "version": 6
}`
  },
  {
    method: "POST",
    path: "/v1/schemas/{subject}/compatibility",
    desc: "Check if a schema is compatible with the latest version without registering it.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| subject | path | string | yes | Schema subject |
| schema | body | string | yes | Schema definition to check |
| schemaType | body | string | no | AVRO or PROTOBUF |`,
    response: `{
  "is_compatible": true,
  "messages": []
}`
  },
])}

${apiEndpointDocs("Administration", [
  {
    method: "GET",
    path: "/v1/admin/topics",
    desc: "List all Kafka topics with configuration and metrics.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| prefix | query | string | no | Filter by topic prefix |
| include_metrics | query | boolean | no | Include partition/offset metrics |`,
    response: `{
  "topics": [
    {
      "name": "edp.events.ecommerce.orders",
      "partitions": 12,
      "replication_factor": 3,
      "retention_ms": 172800000,
      "compression_type": "lz4",
      "metrics": {
        "messages_per_sec": 2345,
        "bytes_per_sec": 2812400,
        "consumer_groups": 5
      }
    }
  ],
  "count": 47
}`
  },
  {
    method: "POST",
    path: "/v1/admin/topics",
    desc: "Create a new Kafka topic. Requires admin role.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| name | body | string | yes | Topic name (must follow naming convention) |
| partitions | body | integer | no | Number of partitions (default 12) |
| replication_factor | body | integer | no | Replication factor (default 3) |
| retention_ms | body | integer | no | Retention in ms (default 172800000) |
| compression_type | body | string | no | Compression (default lz4) |
| config | body | object | no | Additional Kafka topic configs |`,
    response: `{
  "name": "edp.events.payments.transactions",
  "partitions": 12,
  "replication_factor": 3,
  "status": "created"
}`
  },
  {
    method: "GET",
    path: "/v1/admin/consumer-groups",
    desc: "List all consumer groups with lag information.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| prefix | query | string | no | Filter by group prefix |
| state | query | string | no | Filter by state (Stable, Empty, Dead) |`,
    response: `{
  "groups": [
    {
      "group_id": "edp.consumer.payment-processor.production",
      "state": "Stable",
      "members": 4,
      "topics": ["edp.events.payments.transactions"],
      "total_lag": 245,
      "max_lag_partition": 3
    }
  ],
  "count": 22
}`
  },
  {
    method: "GET",
    path: "/v1/admin/connectors",
    desc: "List all Kafka Connect connectors with status.",
    params: `| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| type | query | string | no | Filter by type (source, sink) |
| state | query | string | no | Filter by state (RUNNING, PAUSED, FAILED) |`,
    response: `{
  "connectors": [
    {
      "name": "edp-cdc-orders",
      "type": "source",
      "class": "io.debezium.connector.postgresql.PostgresConnector",
      "state": "RUNNING",
      "worker": "connect-0",
      "tasks": [
        {"id": 0, "state": "RUNNING", "worker": "connect-0"}
      ]
    }
  ],
  "count": 8
}`
  },
])}

## Streaming API

### Server-Sent Events (SSE)

\`\`\`
GET /v1/stream/{topic}
  Accept: text/event-stream
  X-EDP-API-Key: edp_live_<key>
  X-EDP-Consumer-Group: <group-id>  (optional, creates new group if not specified)
  X-EDP-Start-Offset: latest|earliest|<timestamp>  (optional, default: latest)
\`\`\`

Response (event stream):
\`\`\`
event: edp.event
id: edp.events.ecommerce.orders:7:123456
data: {"event_id":"evt_abc","entity_id":"ord_456","payload":{...}}

event: edp.event
id: edp.events.ecommerce.orders:3:123457
data: {"event_id":"evt_def","entity_id":"ord_789","payload":{...}}

event: edp.heartbeat
data: {"timestamp":"2025-12-15T10:30:50.000Z"}

\`\`\`

### WebSocket

\`\`\`
ws://api.edp.internal/v1/ws/events/{source}/{entity}
\`\`\`

Message format:
\`\`\`json
{
  "type": "subscribe",
  "topics": ["edp.events.ecommerce.orders"],
  "filter": {
    "entity_id": ["ord_456"]
  },
  "start_offset": "latest"
}
\`\`\`

## Rate Limits

| Tier | Requests/sec | Events/sec | Concurrent Streams |
|------|-------------|------------|-------------------|
| Free | 10 | 100 | 1 |
| Basic | 100 | 1,000 | 5 |
| Pro | 1,000 | 10,000 | 20 |
| Enterprise | Custom | Custom | Custom |

## Common Response Headers

| Header | Description |
|--------|-------------|
| X-Request-ID | Unique request identifier |
| X-RateLimit-Limit | Request rate limit |
| X-RateLimit-Remaining | Remaining requests |
| X-RateLimit-Reset | Rate limit reset timestamp |
| X-EDP-Region | Processing region |
| X-EDP-Trace-ID | Distributed trace ID |
`,
));


newDocs.push(makeDoc(
  "gamma-testing-strategy", "document",
  "EDP Testing Strategy — Comprehensive Quality Assurance Plan",
  "governance", "phase-5",
  `# EDP Testing Strategy — Comprehensive Quality Assurance Plan

## Overview

This document defines the testing strategy for all EDP services, covering unit tests,
integration tests, contract tests, performance tests, and chaos engineering.

## Test Pyramid

\`\`\`
                    /\\
                   /  \\
                  / E2E \\
                 /  (10)  \\
                /──────────\\
               / Integration \\
              /    (100)      \\
             /────────────────\\
            /   Contract (50)   \\
           /────────────────────\\
          /     Unit (500+)      \\
         /────────────────────────\\
\`\`\`

### Distribution by Service

| Service | Unit | Contract | Integration | E2E | Total |
|---------|------|----------|-------------|-----|-------|
| edp-ingest | 120 | 15 | 30 | 3 | 168 |
| edp-transform | 95 | 10 | 25 | 2 | 132 |
| edp-consumer | 80 | 8 | 20 | 2 | 110 |
| edp-gateway | 60 | 12 | 15 | 3 | 90 |
| edp-query | 70 | 5 | 20 | 2 | 97 |
| edp-lake-sink | 45 | 5 | 15 | 1 | 66 |
| edp-cdc | 35 | 5 | 10 | 1 | 51 |
| edp-admin | 30 | 5 | 10 | 1 | 46 |
| **Total** | **535** | **65** | **145** | **15** | **760** |

## Unit Tests

### Coverage Requirements

| Component | Minimum Coverage | Target |
|-----------|-----------------|--------|
| Business logic | 90% | 95% |
| Data transformation | 95% | 100% |
| Error handling | 85% | 90% |
| Configuration | 80% | 85% |

### Patterns

**Schema Validation:**
\`\`\`kotlin
@Test
fun \`valid order event passes validation\`() {
    val schema = loadSchema("edp.events.ecommerce.orders-value")
    val event = OrderEvent(
        orderId = "ord_123",
        customerId = "cust_456",
        total = 99.99,
        items = listOf(OrderItem("SKU-001", 2, 49.995))
    )
    val result = validator.validate(event, schema)
    assertThat(result.isValid).isTrue()
}

@Test
fun \`missing required field fails validation\`() {
    val event = mapOf("total" to 99.99)  // missing orderId
    val result = validator.validate(event, schema)
    assertThat(result.isValid).isFalse()
    assertThat(result.errors).contains("Missing required field: orderId")
}
\`\`\`

**Transformation Pipeline:**
\`\`\`kotlin
@Test
fun \`order enrichment adds customer tier\`() {
    val pipeline = loadPipeline("order-enrichment")
    val input = RawOrder(orderId = "ord_123", customerId = "cust_456")
    val lookupMock = mockk<LookupService> {
        every { lookup("cust_456") } returns CustomerData(tier = "premium", region = "US-EAST")
    }

    val output = pipeline.process(input, lookupMock)
    assertThat(output.customerTier).isEqualTo("premium")
    assertThat(output.region).isEqualTo("US-EAST")
}
\`\`\`

## Contract Tests (Pact)

### Provider Contracts

Each EDP service publishes its API contract:
\`\`\`
pacts/
  edp-ingest/
    provider.json       # Provider contract
    consumer-*.json     # Consumer expectations
  edp-query/
    provider.json
    consumer-*.json
\`\`\`

### Consumer-Driven Contract Tests

Downstream consumers publish their expectations:
1. Consumer writes Pact test (what I expect from provider)
2. Pact file published to Pact Broker
3. Provider verifies against all consumer Pacts
4. "Can I deploy?" check before release

### Schema Contract Tests

Schema Registry compatibility IS a contract test:
\`\`\`bash
# Verify producer schema is compatible with all consumer expectations
curl -X POST http://schema-registry/compatibility/subjects/{subject}/versions/latest \\
  -d '{"schema": "<new-schema>"}'
\`\`\`

## Integration Tests

### Test Infrastructure

Tests run against real (containerized) dependencies:
\`\`\`yaml
# docker-compose.test.yml
services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    environment:
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: CLIENT://:9092,CONTROLLER://:9093
  schema-registry:
    image: confluentinc/cp-schema-registry:7.6.0
    depends_on: [kafka]
  redis:
    image: redis:7.2-alpine
  postgres:
    image: postgres:16-alpine
  testcontainers-init:
    image: testcontainers/init
\`\`\`

### Test Categories

**1. Schema Evolution Tests:**
- Register v1 schema, produce events
- Register v2 schema (backward compatible change)
- Verify v1 consumer can read v2 events
- Verify v2 consumer can read v1 events

**2. End-to-End Flow Tests:**
- Produce event via HTTP → verify in Kafka topic
- Produce event → verify transformation output
- Produce event → verify data lake write
- Produce CDC event → verify downstream consumption

**3. Failure Scenario Tests:**
- Schema Registry unavailable: verify circuit breaker, cached schemas work
- Kafka broker failure: verify producer retry, consumer rebalance
- Redis failure: verify graceful degradation of dedup cache
- Database failure: verify CDC connector recovery

**4. Performance Baseline Tests:**
- Single event latency (p50, p95, p99)
- Batch throughput (events/sec)
- Consumer processing rate
- Schema validation overhead

## Performance Tests

### Load Test Profiles

\`\`\`yaml
# k6 load test profile
scenarios:
  steady_state:
    executor: "constant-arrival-rate"
    rate: 10000  # events per second
    duration: "30m"
    preAllocatedVUs: 100

  spike:
    executor: "ramping-arrival-rate"
    startRate: 10000
    stages:
      - target: 50000
        duration: "1m"
      - target: 50000
        duration: "5m"
      - target: 10000
        duration: "1m"
    preAllocatedVUs: 500

  soak:
    executor: "constant-arrival-rate"
    rate: 10000
    duration: "4h"
    preAllocatedVUs: 100
\`\`\`

### SLO Validation Thresholds

\`\`\`yaml
thresholds:
  http_req_duration:
    - "p(99) < 200"      # p99 latency < 200ms
    - "p(95) < 100"      # p95 latency < 100ms
  http_req_failed:
    - "rate < 0.001"     # Error rate < 0.1%
  iteration_duration:
    - "avg < 50"         # Average iteration < 50ms
  edp_events_produced:
    - "count > 18000000" # At least 10K events/sec for 30 min
\`\`\`

### Performance Regression Detection

CI pipeline runs abbreviated load test on every PR:
- 1000 events/sec for 5 minutes
- Compare p99 latency against baseline (last release)
- Alert if >10% regression
- Block merge if >25% regression

## Chaos Engineering

### Chaos Experiments

| Experiment | Target | Expected Outcome |
|-----------|--------|------------------|
| Kill Kafka broker | 1 of 5 brokers | No data loss, <30s recovery |
| Network partition | Split cluster | Minority pauses, majority continues |
| Fill broker disk | 1 broker at 95% | Alert fires, log cleaner activates |
| Kill Schema Registry | Primary instance | Leader election <30s, reads unaffected |
| Redis failure | All Redis nodes | Consumers continue (dedup degraded) |
| Slow network | 500ms latency injection | Circuit breakers open, graceful degradation |
| CPU stress | Transform pod | HPA scales up, throughput maintained |
| Memory leak | Consumer pod | OOM kill, restart, rebalance |

### Chaos Schedule

| Frequency | Environment | Experiments |
|-----------|-------------|-------------|
| Daily | Staging | Random pod kill (any service) |
| Weekly | Staging | Broker failure, network partition |
| Monthly | Production | Single non-critical pod kill |
| Quarterly | Production | Full broker failure simulation |

### Chaos Tooling

- **Chaos Mesh**: Kubernetes-native chaos engineering
- **Litmus**: Kafka-specific chaos experiments
- **Custom scripts**: Application-level failure injection

## CI/CD Pipeline

\`\`\`
PR Created
  ↓
Unit Tests (parallel, <2 min)
  ↓
Contract Tests (<1 min)
  ↓
Integration Tests (containerized, <10 min)
  ↓
Performance Baseline (<5 min)
  ↓
Security Scan (Snyk, <3 min)
  ↓
PR Approved + Merged
  ↓
Build + Push Image
  ↓
Deploy to Staging
  ↓
Full Integration Suite (<30 min)
  ↓
Abbreviated Load Test (<10 min)
  ↓
Chaos Test (random) (<5 min)
  ↓
Deploy to Production (canary 5%)
  ↓
Monitor 15 minutes
  ↓
Full rollout (25% → 50% → 100%)
\`\`\`

## Test Data Management

### Strategies

| Layer | Strategy | Cleanup |
|-------|----------|---------|
| Unit | In-memory fixtures | Automatic (GC) |
| Contract | Pact fixtures | Automatic |
| Integration | Docker volumes | Destroyed per run |
| Performance | Synthetic data generator | Topic retention |
| E2E | Dedicated test topics | TTL-based cleanup |

### Synthetic Data Generator

\`\`\`bash
./scripts/generate-test-data.sh \\
  --source ecommerce \\
  --entity orders \\
  --count 1000000 \\
  --rate 10000 \\
  --schema-version latest \\
  --target-topic edp.test.ecommerce.orders
\`\`\`
`,
));


newDocs.push(makeDoc(
  "gamma-onboarding-guide-detailed", "document",
  "EDP Developer Onboarding — Complete Setup & First Event Guide",
  "team", "before-phase-1",
  `# EDP Developer Onboarding — Complete Setup & First Event Guide

## Welcome to the Enterprise Data Platform!

This guide will walk you through setting up your local development environment and producing
your first event to the EDP. Expected time: ~2 hours.

## Prerequisites

- Docker Desktop (v4.25+) with Kubernetes enabled
- kubectl (v1.29+)
- Helm (v3.14+)
- Java 21 or Kotlin (for JVM services)
- Node.js 20+ (for JS/TS services)
- Access to the EDP GitHub organization
- VPN connected to internal network

## Step 1: Clone Repositories

\`\`\`bash
# Main EDP repositories
git clone git@github.com:edp/edp-platform.git
git clone git@github.com:edp/edp-schemas.git
git clone git@github.com:edp/edp-services.git

# Local development tooling
git clone git@github.com:edp/edp-dev-tools.git
\`\`\`

## Step 2: Start Local EDP

\`\`\`bash
cd edp-dev-tools
make start-local
\`\`\`

This starts:
- Kafka (3 brokers, KRaft mode) on ports 9092-9094
- Schema Registry on port 8081
- Redis on port 6379
- PostgreSQL on port 5432
- Prometheus on port 9090
- Grafana on port 3000 (admin/admin)
- Kafka UI on port 8080

### Verify Local Setup

\`\`\`bash
# Check Kafka is running
docker compose ps

# List topics (should be empty except internal topics)
kafka-topics.sh --bootstrap-server localhost:9092 --list

# Check Schema Registry
curl http://localhost:8081/subjects

# Check Kafka UI
open http://localhost:8080
\`\`\`

## Step 3: Register Your First Schema

\`\`\`bash
cd edp-schemas

# Create a new schema
cat > schemas/tutorial/hello-world-value.avsc << 'SCHEMA'
{
  "type": "record",
  "name": "HelloWorld",
  "namespace": "com.edp.tutorial",
  "fields": [
    {"name": "message", "type": "string"},
    {"name": "sender", "type": "string"},
    {"name": "timestamp", "type": "long", "logicalType": "timestamp-millis"}
  ]
}
SCHEMA

# Register the schema
curl -X POST http://localhost:8081/subjects/edp.events.tutorial.hello-world-value/versions \\
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
  -d "{\\\"schema\\\": $(jq -Rs . < schemas/tutorial/hello-world-value.avsc)}"

# Expected output: {"id":1}
\`\`\`

## Step 4: Create Topic

\`\`\`bash
kafka-topics.sh --bootstrap-server localhost:9092 \\
  --create \\
  --topic edp.events.tutorial.hello-world \\
  --partitions 3 \\
  --replication-factor 1

# Verify
kafka-topics.sh --bootstrap-server localhost:9092 \\
  --describe --topic edp.events.tutorial.hello-world
\`\`\`

## Step 5: Produce Your First Event

### Using the EDP CLI

\`\`\`bash
cd edp-dev-tools

# Install EDP CLI
npm install -g @edp/cli

# Produce an event
edp produce \\
  --topic edp.events.tutorial.hello-world \\
  --schema-id 1 \\
  --data '{"message": "Hello EDP!", "sender": "onboarding-guide", "timestamp": 1734567890123}'

# Expected output:
# Produced to edp.events.tutorial.hello-world partition=0 offset=0
\`\`\`

### Using Java/Kotlin

\`\`\`kotlin
import io.confluent.kafka.serializers.KafkaAvroSerializer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerRecord

fun main() {
    val props = Properties().apply {
        put("bootstrap.servers", "localhost:9092")
        put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer")
        put("value.serializer", KafkaAvroSerializer::class.java)
        put("schema.registry.url", "http://localhost:8081")
    }

    val producer = KafkaProducer<String, GenericRecord>(props)

    val schema = SchemaBuilder.record("HelloWorld")
        .namespace("com.edp.tutorial")
        .fields()
        .requiredString("message")
        .requiredString("sender")
        .requiredLong("timestamp")
        .endRecord()

    val record = GenericRecordBuilder(schema)
        .set("message", "Hello from Kotlin!")
        .set("sender", "onboarding-guide")
        .set("timestamp", System.currentTimeMillis())
        .build()

    val future = producer.send(
        ProducerRecord("edp.events.tutorial.hello-world", "tutorial-key", record)
    )

    val metadata = future.get()
    println("Produced to partition=\${metadata.partition()} offset=\${metadata.offset()}")

    producer.close()
}
\`\`\`

## Step 6: Consume Events

\`\`\`bash
# Using kafka console consumer
kafka-avro-console-consumer.sh \\
  --bootstrap-server localhost:9092 \\
  --topic edp.events.tutorial.hello-world \\
  --from-beginning \\
  --property schema.registry.url=http://localhost:8081

# Expected output:
# {"message":"Hello EDP!","sender":"onboarding-guide","timestamp":1734567890123}
\`\`\`

## Step 7: View in Monitoring

1. Open Grafana: http://localhost:3000 (admin/admin)
2. Navigate to Dashboards > EDP > Service Overview
3. You should see your events in the "Events Produced" panel

## Next Steps

### Integrate Your Service

See the [Service Integration Guide](../integration-guide.md) for:
- Choosing between HTTP and gRPC ingestion
- Setting up consumer groups
- Schema design best practices
- Error handling patterns

### Access Production

1. Request API key: [EDP Portal](https://edp.internal/portal)
2. VPN must be connected for production access
3. Your first production events should go to staging first
4. See [Production Checklist](../production-checklist.md)

### Get Help

- **Slack**: #edp-support (response within 4 hours)
- **Slack**: #edp-engineering (for technical discussions)
- **Documentation**: https://docs.internal/edp
- **DataHub**: https://datahub.internal (data catalog)
- **On-call**: PagerDuty (for production issues only)

## FAQ

**Q: How do I debug event production failures?**
A: Check the DLQ topic \`edp.dlq.{source}.{entity}\` for rejected events with error details.

**Q: How long are events retained in Kafka?**
A: 48 hours by default. For longer queries, use the data lake (via edp-query API).

**Q: Can I produce events directly to Kafka without the gateway?**
A: In development, yes. In production, all events MUST go through the gateway for
authentication, validation, and rate limiting.

**Q: How do I request a new topic?**
A: Submit a topic request via the EDP Portal. Include: source system, entity name,
expected volume, schema, and consumer list. Turnaround: 1 business day.

**Q: What happens if my consumer is down?**
A: Events are retained in Kafka for 48 hours. When your consumer restarts, it resumes
from the last committed offset. If down >48 hours, you'll need a replay from the data lake.

**Q: How do I monitor my consumer's lag?**
A: Grafana dashboard "Consumer Lag" shows real-time lag per consumer group.
Alert thresholds are automatically configured for all consumer groups.
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
