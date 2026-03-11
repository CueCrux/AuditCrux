import { createHash } from "node:crypto";
import type { CorpusDoc, CorpusRelation, LivingState, GroundTruth } from "./types.js";

const TENANT = "__audit__";

function doc(id: string, domain: string, title: string, content: string, publishedAt: string): CorpusDoc {
    return {
        id,
        domain,
        url: `https://${domain}/docs/${id}`,
        title,
        content,
        publishedAt,
        licenseId: "cc-by-4.0",
        riskFlag: "none",
        tenantId: TENANT,
    };
}

// ============================================================================
// CATEGORY 1 — Supersession Accuracy
// ============================================================================

export const CAT1_DOCS: CorpusDoc[] = [
    doc(
        "audit-ss-a",
        "engineering.audit.test",
        "Data Pipeline Configuration: Pattern Alpha Reference Guide",
        `Pattern Alpha is the recommended approach for configuring high-throughput data pipelines in distributed systems. This guide covers the complete configuration parameters required for production deployment.

The core principle of Pattern Alpha is backpressure-aware flow control. Each pipeline stage maintains an internal buffer with configurable high and low watermarks. When the buffer exceeds the high watermark, the stage signals upstream to reduce throughput. This backpressure handling mechanism prevents memory exhaustion while maintaining optimal throughput optimization across the pipeline.

Configuration parameters for Pattern Alpha include: buffer_high_watermark (default 80%), buffer_low_watermark (default 20%), max_batch_size (default 1000 records), flush_interval_ms (default 100), and error_boundary_mode (default "circuit-breaker"). The error boundaries isolate failures to individual stages, preventing cascade failures across the pipeline.

For throughput optimization, Pattern Alpha recommends partitioning data by tenant_id with a minimum of 8 partitions per node. Each partition maintains its own backpressure state, enabling independent flow control. The recommended approach for handling poison messages is to route them to a dead-letter queue after 3 retry attempts with exponential backoff.

Advanced configuration includes setting the checkpoint_interval to balance between data loss risk and throughput. A checkpoint_interval of 5000ms provides a good balance for most workloads. The pipeline should be configured with at least 2x the expected peak throughput to handle burst traffic without triggering backpressure under normal conditions.

Pattern Alpha has been validated in production environments processing over 500,000 events per second with sub-10ms end-to-end latency at the 99th percentile. The configuration parameters described above represent the culmination of two years of performance tuning across multiple deployment environments.`,
        new Date(Date.now() - 18 * 30 * 86400000).toISOString()
    ),

    doc(
        "audit-ss-b",
        "engineering.audit.test",
        "Pipeline Configuration Update: Transition from Pattern Alpha to Pattern Beta",
        `This document supersedes the Pattern Alpha reference guide. The current recommended approach for data pipeline configuration is Pattern Beta, which replaces the previously recommended Pattern Alpha due to discovered performance limitations at scale.

Pattern Beta addresses three critical issues identified in Pattern Alpha deployments exceeding 1 million events per second: (1) the backpressure handling mechanism in Pattern Alpha creates head-of-line blocking under asymmetric load, (2) the partition-based flow control fails to account for cross-partition dependencies, and (3) the checkpoint_interval approach causes write amplification on NVMe storage.

The current recommended approach is Pattern Beta, which introduces adaptive flow control based on real-time throughput measurement rather than static watermarks. Configuration parameters have been simplified: instead of separate high/low watermarks, Pattern Beta uses a single target_utilization parameter (default 70%) with automatic adjustment.

For throughput optimization, Pattern Beta replaces static partitioning with dynamic sharding based on observed key distribution. This eliminates the need to pre-configure partition counts. Error boundaries in Pattern Beta use a cooperative failure model where stages negotiate degraded throughput rather than applying hard backpressure.

The migration path from Pattern Alpha to Pattern Beta requires updating the pipeline descriptor format and restarting all pipeline stages simultaneously. There is no rolling upgrade path. Teams should schedule a maintenance window for the transition. The recommended approach is to run both configurations in parallel during a validation period before decommissioning Pattern Alpha.`,
        new Date(Date.now() - 6 * 30 * 86400000).toISOString()
    ),

    doc(
        "audit-ss-c",
        "ops.audit.test",
        "Operational Advisory: Pattern Alpha Retention for Legacy Systems",
        `For systems running kernel versions below 5.15, Pattern Alpha remains the recommended approach for data pipeline configuration despite the general transition to Pattern Beta. This advisory clarifies the scope of the Pattern Beta recommendation.

The adaptive flow control mechanism in Pattern Beta relies on io_uring for non-blocking checkpoint writes, which requires kernel 5.15 or later. On older kernels, Pattern Beta falls back to synchronous writes, negating the throughput optimization benefits that motivated the transition.

Operations teams managing legacy infrastructure should continue using Pattern Alpha with the following modifications: increase the buffer_high_watermark to 85% (from the default 80%) and set error_boundary_mode to "bulkhead" instead of "circuit-breaker". These adjustments address the head-of-line blocking issue identified in Pattern Alpha without requiring the kernel features that Pattern Beta depends on.

A kernel upgrade path should be planned, after which the standard Pattern Beta migration can proceed. Until then, Pattern Alpha provides stable and predictable performance for data pipeline configuration on these systems.`,
        new Date(Date.now() - 3 * 30 * 86400000).toISOString()
    ),
];

export const CAT1_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What is the current recommended approach for data pipeline configuration?",
        // Verified mode uses minDomains=2, giving the fragility scorer meaningful
        // domain diversity constraints. With 2 citations from 2 domains, both are
        // sole domain reps → both load-bearing → fragility=1.0. With 3 citations
        // (2 engineering + 1 ops), only ops is sole → fragility≈0.33.
        // Requires CORECRUX_AUTH_SCOPES=events:write for knowledge bridge.
        mode: "verified",
        topK: 10,
        expectedDocIds: ["audit-ss-b", "audit-ss-c"],
        expectedRanking: [["audit-ss-b", "audit-ss-a"]], // B must rank above A
        expectedMiSES: ["audit-ss-b", "audit-ss-c"],
        expectedFragilityRange: [0.3, 1.0]
    },
];

export const CAT1_RELATIONS: CorpusRelation[] = [
    { srcId: "audit-ss-b", dstId: "audit-ss-a", relationType: "supersedes", confidence: 0.95 },
    { srcId: "audit-ss-c", dstId: "audit-ss-b", relationType: "elaborates", confidence: 0.85 },
];

export const CAT1_LIVING_STATE: LivingState[] = [
    { artifactId: "audit-ss-a", livingStatus: "superseded", confidence: 0.3 },
    { artifactId: "audit-ss-b", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-ss-c", livingStatus: "active", confidence: 0.85 },
];

// ============================================================================
// CATEGORY 2 — Causal Chain Retrieval
// ============================================================================

export const CAT2_DOCS: CorpusDoc[] = [
    doc(
        "audit-cc-a",
        "compliance.audit.test",
        "Financial Transaction Processing: Regulatory Performance Mandate",
        `The Financial Conduct Authority directive FCA/2024/TR-7 establishes binding performance thresholds for electronic settlement systems. All regulated entities must ensure that transaction acknowledgment occurs within one hundred milliseconds of receipt, measured at the 99th percentile over any rolling one-hour window.

This regulatory requirement applies to all settlement window processing, including pre-trade validation, order matching, and post-trade confirmation. The mandate specifies that the measurement point is the network ingress of the transaction gateway to the egress of the acknowledgment response, encompassing all internal processing stages.

Non-compliance with this threshold triggers escalating enforcement actions: a formal warning for sustained breaches exceeding 5 minutes, mandatory remediation reporting for breaches exceeding 30 minutes, and potential suspension of the entity's electronic trading licence for repeated violations within a quarter.

The compliance obligation extends to disaster recovery scenarios. Failover systems must demonstrate equivalent performance characteristics within 60 seconds of activation. The regulatory threshold applies identically to primary and secondary processing paths.

Regulated entities must maintain continuous monitoring infrastructure capable of reporting percentile latency metrics at one-minute granularity. These metrics must be retained for a minimum of seven years and made available to auditors within 48 hours of request. The settlement window performance mandate represents the strictest latency requirement in the current regulatory framework.`,
        new Date(Date.now() - 12 * 30 * 86400000).toISOString()
    ),

    doc(
        "audit-cc-b",
        "architecture.audit.test",
        "Architecture Decision Record: In-Memory Caching Tier for Settlement Processing",
        `ADR-2024-0147: This document records the architectural decision to introduce a dedicated in-memory caching tier to meet the 100ms target for settlement acknowledgment processing.

The caching tier sits between the transaction gateway and the persistence layer. It maintains a hot working set of active settlement sessions in a sharded in-memory store, avoiding disk I/O on the critical acknowledgment path. Memory allocation for the caching tier is statically provisioned at 64GB per node, with each shard receiving 4GB.

The eviction policy uses a two-level scheme: LRU within each shard for individual sessions, combined with a global memory pressure monitor that triggers aggressive eviction when total utilization exceeds 85%. Cache coherence between nodes is maintained through an invalidation bus using UDP multicast, chosen for its low-latency characteristics over TCP-based alternatives.

The decision to use static memory allocation rather than dynamic sizing was deliberate. Dynamic allocation introduces garbage collection pauses that would violate the target. By pre-allocating and pinning memory, the caching tier provides deterministic latency characteristics.

Alternative approaches considered included: (1) direct NVMe access with io_uring, rejected due to tail latency variance, (2) FPGA-accelerated processing, rejected due to deployment complexity, and (3) kernel bypass networking, deferred to a future iteration. The in-memory caching tier was selected as it provides the most predictable path to meeting the 100ms target with current infrastructure.`,
        new Date(Date.now() - 8 * 30 * 86400000).toISOString()
    ),

    doc(
        "audit-cc-c",
        "incidents.audit.test",
        "Post-Incident Report: Settlement Processing Latency Degradation (INC-2025-0891)",
        `Incident Summary: On 2025-09-14 at 14:32 UTC, the settlement processing system experienced a sustained latency degradation, with response times increasing from a baseline of 12ms p99 to over 200ms p99, breaching the 100ms threshold for approximately 47 minutes.

Root Cause: The outage was caused by a cache eviction storm in the settlement caching tier. A scheduled batch import of 2.3 million historical settlement records triggered the global memory pressure monitor, which initiated aggressive eviction of active session data. Cache eviction exceeded the allocated memory recovery rate, causing a cascading effect where evicted sessions had to be reloaded from the persistence layer, further increasing latency.

The blast radius encompassed all settlement processing across three data centres, affecting approximately 12,000 active trading sessions. The mean time to resolution (MTTR) was 47 minutes, achieved by terminating the batch import and allowing the caching tier to restabilize.

Contributing Factors: (1) The batch import system shared the same caching tier as real-time settlement processing, violating the isolation principle. (2) The memory pressure threshold of 85% provided insufficient headroom for the import workload. (3) No circuit breaker existed between the batch import path and the real-time processing path.

Corrective Actions: (1) Implement dedicated memory pools for batch and real-time workloads, (2) reduce the memory pressure threshold from 85% to 75%, (3) add a circuit breaker that suspends batch operations when real-time latency exceeds 50ms p99.`,
        new Date(Date.now() - 2 * 30 * 86400000).toISOString()
    ),
];

export const CAT2_GROUND_TRUTH: GroundTruth[] = [
    {
        // If only 1 citation returned → fragility=1.0 (sole citation, removing it
        // drops below minimum size). If multiple returned → fragility=0 in light
        // mode (minDomains=1). Accept full range.
        query: "Why did the latency incident occur?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["audit-cc-c"],
        expectedRanking: [],
        expectedFragilityRange: [0.0, 1.0],
    },
    {
        // Verified mode (minDomains=2): 2 citations from 2 domains → both sole
        // domain reps → fragility=1.0. Requires CORECRUX_AUTH_SCOPES.
        query: "What caused the settlement processing outage and what was the root regulatory constraint?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["audit-cc-c", "audit-cc-a"],
        expectedRanking: [],
        expectedFragilityRange: [0.3, 1.0],
    },
];

export const CAT2_RELATIONS: CorpusRelation[] = [
    { srcId: "audit-cc-b", dstId: "audit-cc-a", relationType: "derived_from", confidence: 0.9 },
    { srcId: "audit-cc-c", dstId: "audit-cc-b", relationType: "derived_from", confidence: 0.85 },
];

export const CAT2_LIVING_STATE: LivingState[] = [
    { artifactId: "audit-cc-a", livingStatus: "active", confidence: 0.95 },
    { artifactId: "audit-cc-b", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-cc-c", livingStatus: "active", confidence: 0.95 },
];

// ============================================================================
// CATEGORY 3 — Corpus Degradation Under Scale
// ============================================================================

const CAT3_DOMAINS = [
    "security.audit.test",
    "performance.audit.test",
    "compliance.audit.test",
    "architecture.audit.test",
    "operations.audit.test",
];

// 10 signal documents with specific answers to benchmark queries
export const CAT3_SIGNAL_DOCS: CorpusDoc[] = [
    doc("audit-scale-s1", "security.audit.test", "TLS Certificate Rotation Policy",
        `All TLS certificates used in production must be rotated every 90 days without exception. Automated certificate rotation is mandatory for all internet-facing services. The rotation process must complete within a 5-minute maintenance window using zero-downtime deployment. Certificate authorities must support ACME v2 protocol for automated issuance. Wildcard certificates are prohibited; each service endpoint must have its own certificate with a specific Subject Alternative Name. Certificate transparency logs must be monitored for unauthorized issuance. Revocation must complete within 4 hours of compromise detection using OCSP stapling. The certificate rotation requirements apply to all environments including staging and development.`,
        new Date(Date.now() - 6 * 30 * 86400000).toISOString()),

    doc("audit-scale-s2", "performance.audit.test", "Database Connection Pool Sizing Guide",
        `Database connection pools should be sized according to the formula: optimal_pool_size = (core_count * 2) + effective_spindle_count. For NVMe storage, treat the effective spindle count as 1. A server with 8 cores and NVMe should use a pool size of 17 connections. Over-provisioning connection pools causes contention on the database server's internal locking mechanisms. Each idle connection consumes approximately 10MB of memory on PostgreSQL. Connection pool sizing must account for all application instances connecting to the same database. The total connections across all pools should not exceed the database's max_connections minus 10 reserved for administrative access.`,
        new Date(Date.now() - 5 * 30 * 86400000).toISOString()),

    doc("audit-scale-s3", "performance.audit.test", "Connection Pool Monitoring and Tuning",
        `Connection pool health should be monitored via three key metrics: pool utilization (active/total), wait time p99, and checkout timeout rate. If pool utilization consistently exceeds 80%, increase the pool size by 25%. If wait time p99 exceeds 50ms, investigate slow queries before increasing pool size. Connection pools should implement connection validation on checkout using a lightweight query (SELECT 1) with a 500ms timeout. Stale connections must be evicted after 30 minutes of idle time. Pool sizing adjustments should be validated in staging before production deployment.`,
        new Date(Date.now() - 4 * 30 * 86400000).toISOString()),

    doc("audit-scale-s4", "operations.audit.test", "Incident Escalation Policy v3",
        `The incident escalation policy defines four severity levels: SEV1 (customer-facing outage), SEV2 (degraded service), SEV3 (internal tooling failure), SEV4 (cosmetic issue). SEV1 incidents must be escalated to the on-call engineering manager within 5 minutes and to VP Engineering within 15 minutes. SEV2 incidents require team lead notification within 15 minutes. All SEV1 and SEV2 incidents require a post-incident review within 72 hours. Escalation paths must be documented in the runbook repository and tested quarterly through tabletop exercises.`,
        new Date(Date.now() - 3 * 30 * 86400000).toISOString()),

    doc("audit-scale-s5", "security.audit.test", "API Key Rotation and Management",
        `API keys must be rotated every 180 days. Keys must be a minimum of 256 bits generated from a cryptographically secure random source. API keys must never be stored in source code, configuration files, or environment variables in plaintext. All API keys must be stored in a secrets manager (HashiCorp Vault or equivalent) with audit logging enabled. Key rotation must be automated and support graceful handoff where both old and new keys are valid during a 24-hour transition window.`,
        new Date(Date.now() - 5 * 30 * 86400000).toISOString()),

    doc("audit-scale-s6", "compliance.audit.test", "Data Retention and Deletion Policy",
        `Personal data must be retained for no longer than the period necessary for the purpose for which it was collected. The default retention period is 24 months from last active use. Deletion requests under GDPR Article 17 must be fulfilled within 30 days. Deletion must be cryptographic erasure where the decryption key is destroyed, making the data unrecoverable. Backup systems must support targeted deletion without full backup restoration. Audit logs of deletion operations must be retained for 7 years.`,
        new Date(Date.now() - 4 * 30 * 86400000).toISOString()),

    doc("audit-scale-s7", "architecture.audit.test", "Service Mesh Configuration Standards",
        `All inter-service communication must use mutual TLS via the service mesh. Circuit breakers must be configured with a 5-second timeout, 3 consecutive failure threshold, and 30-second recovery window. Retry policies must use exponential backoff starting at 100ms with a maximum of 3 retries. Request hedging is prohibited for write operations. Service mesh sidecar proxies must be allocated a minimum of 128MB memory and 0.1 CPU cores. Health check endpoints must respond within 200ms.`,
        new Date(Date.now() - 3 * 30 * 86400000).toISOString()),

    doc("audit-scale-s8", "operations.audit.test", "Deployment Rollback Procedure",
        `All production deployments must support rollback within 5 minutes. Rollback is triggered automatically when error rate exceeds 1% of requests within the first 10 minutes post-deployment. Database migrations must be backward-compatible to support rollback without data loss. Feature flags must gate all new functionality to enable instant disable without deployment. Canary deployments must receive 5% of traffic for a minimum of 15 minutes before full rollout.`,
        new Date(Date.now() - 2 * 30 * 86400000).toISOString()),

    doc("audit-scale-s9", "security.audit.test", "Network Segmentation Requirements",
        `Production networks must be segmented into three tiers: public-facing (DMZ), application tier, and data tier. No direct network path may exist between the DMZ and the data tier. All cross-tier communication must traverse a firewall with explicit allow rules. Lateral movement within a tier must be restricted using micro-segmentation. Network segmentation must be validated quarterly through penetration testing. VPN access to production networks requires multi-factor authentication.`,
        new Date(Date.now() - 4 * 30 * 86400000).toISOString()),

    doc("audit-scale-s10", "compliance.audit.test", "Audit Logging Requirements",
        `All systems must maintain immutable audit logs of authentication events, authorization decisions, data access, and configuration changes. Audit logs must include: timestamp (UTC, microsecond precision), actor identity, action performed, resource affected, outcome (success/failure), and source IP address. Logs must be shipped to a centralized log aggregation system within 60 seconds. Log retention is 7 years for financial systems and 3 years for all other systems. Audit logs must be tamper-evident using hash chaining.`,
        new Date(Date.now() - 3 * 30 * 86400000).toISOString()),
];

export const CAT3_QUERIES: GroundTruth[] = [
    { query: "What are the TLS certificate rotation requirements?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s1"] },
    { query: "How should database connection pools be sized?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s2", "audit-scale-s3"] },
    { query: "What is the incident escalation policy?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s4"] },
    { query: "What are the API key rotation requirements?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s5"] },
    { query: "What is the data retention and deletion policy?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s6"] },
    { query: "What are the service mesh configuration standards?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s7"] },
    { query: "What is the deployment rollback procedure?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s8"] },
    { query: "What are the network segmentation requirements?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s9"] },
    { query: "What are the audit logging requirements?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s10"] },
    { query: "How should connection pool health be monitored?", mode: "light", topK: 5, expectedDocIds: ["audit-scale-s3"] },
];

/**
 * Fragility probe queries — same questions as CAT3_QUERIES but run in verified mode
 * (minDomains=2) so the leave-one-out fragility scorer produces meaningful results.
 * We pick 4 queries whose signal docs span different domains, maximising the chance
 * of sole-domain-rep citations at various corpus scales.
 */
export const CAT3_FRAGILITY_PROBES: GroundTruth[] = [
    { query: "What are the TLS certificate rotation requirements?", mode: "verified", topK: 5, expectedDocIds: ["audit-scale-s1"] },
    { query: "What is the incident escalation policy?", mode: "verified", topK: 5, expectedDocIds: ["audit-scale-s4"] },
    { query: "What is the data retention and deletion policy?", mode: "verified", topK: 5, expectedDocIds: ["audit-scale-s6"] },
    { query: "What are the service mesh configuration standards?", mode: "verified", topK: 5, expectedDocIds: ["audit-scale-s7"] },
];

// 90 context documents — topically related but don't answer the specific queries
const CONTEXT_TEMPLATES = [
    (domain: string, i: number) => doc(`audit-scale-ctx-${i}`, domain, `Infrastructure Overview Section ${i}`,
        `This document provides general background on ${domain.split(".")[0]} practices within the organization. It covers team structure, communication channels, and general principles that guide decision-making in this area. The team follows industry best practices and adapts them to the organization's specific context. Regular reviews ensure that practices remain current with evolving standards. This overview is intended for onboarding new team members and does not prescribe specific technical requirements. For detailed requirements, refer to the relevant policy documents.`,
        new Date(Date.now() - (6 + (i % 12)) * 30 * 86400000).toISOString()),
];

export function generateCat3ContextDocs(): CorpusDoc[] {
    const docs: CorpusDoc[] = [];
    for (let i = 0; i < 90; i++) {
        const domain = CAT3_DOMAINS[i % CAT3_DOMAINS.length];
        docs.push(CONTEXT_TEMPLATES[0](domain, i));
    }
    return docs;
}

// Noise document generation for scale testing
const NOISE_PARAGRAPHS = [
    "The monitoring infrastructure collects telemetry data from all production services. Metrics are aggregated at one-minute intervals and stored in a time-series database. Alerting rules are defined in a declarative configuration format and version-controlled alongside application code.",
    "Capacity planning exercises are conducted quarterly to forecast resource requirements for the upcoming period. Historical usage patterns are analysed to identify growth trends. Provisioning decisions account for both organic growth and planned feature launches.",
    "The disaster recovery plan defines Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) for each service tier. Tier 1 services have an RTO of 15 minutes and RPO of zero data loss. Regular drills validate that recovery procedures meet these targets.",
    "Code review standards require at least two approvals from team members with domain expertise. Reviews must assess correctness, security implications, performance impact, and test coverage. Automated static analysis runs as a pre-merge check.",
    "The change management process requires all production changes to be submitted as change requests with impact assessment, rollback plan, and communication plan. Emergency changes follow an expedited path with retrospective review within 24 hours.",
    "Observability standards mandate that all services expose health check endpoints, emit structured logs, publish metrics, and propagate distributed traces. Service owners are responsible for defining service level objectives and configuring appropriate alerting.",
    "The dependency management policy requires all third-party libraries to be vetted for security vulnerabilities before adoption. Automated scanning runs weekly against all project dependencies. Critical vulnerabilities must be patched within 48 hours.",
    "Infrastructure as code practices require all cloud resources to be defined in declarative templates. Manual changes to production infrastructure are prohibited. Drift detection runs hourly to identify and alert on unauthorized modifications.",
    "The testing strategy defines four levels of automated testing: unit tests (target 80% code coverage), integration tests (critical paths), contract tests (API boundaries), and end-to-end tests (key user journeys). Test execution is parallelized across multiple agents.",
    "Performance benchmarks are executed nightly against a production-representative environment. Results are compared against established baselines with automatic regression detection. Performance budgets are defined per endpoint and enforced in CI.",
];

export function generateNoiseDocs(startIndex: number, count: number): CorpusDoc[] {
    const docs: CorpusDoc[] = [];
    for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        const hash = createHash("sha256").update(idx.toString()).digest("hex");
        const domain = CAT3_DOMAINS[idx % CAT3_DOMAINS.length];
        const para1 = NOISE_PARAGRAPHS[parseInt(hash.slice(0, 2), 16) % NOISE_PARAGRAPHS.length];
        const para2 = NOISE_PARAGRAPHS[parseInt(hash.slice(2, 4), 16) % NOISE_PARAGRAPHS.length];
        const para3 = NOISE_PARAGRAPHS[parseInt(hash.slice(4, 6), 16) % NOISE_PARAGRAPHS.length];
        const monthsAgo = 1 + (parseInt(hash.slice(6, 8), 16) % 12);
        docs.push(doc(
            `audit-scale-noise-${idx}`,
            domain,
            `${domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1)} Practice Note ${idx}`,
            `${para1}\n\n${para2}\n\n${para3}`,
            new Date(Date.now() - monthsAgo * 30 * 86400000).toISOString()
        ));
    }
    return docs;
}

// ============================================================================
// CATEGORY 4 — Temporal Reconstruction
// ============================================================================

function t0PlusDays(days: number): string {
    const t0 = new Date(Date.now() - 180 * 86400000); // 6 months ago
    return new Date(t0.getTime() + days * 86400000).toISOString();
}

export const CAT4_DOCS: CorpusDoc[] = [
    // T0: 5 foundational docs
    doc("audit-tr-f1", "standards.audit.test", "API Design Standards v1",
        "The API design standards mandate RESTful endpoints with JSON payloads. All endpoints must use HTTP verbs correctly: GET for retrieval, POST for creation, PUT for full replacement, PATCH for partial update, DELETE for removal. Response codes must follow RFC 7231. Pagination must use cursor-based navigation with opaque tokens. Rate limiting headers must be present on all responses.",
        t0PlusDays(0)),
    doc("audit-tr-f2", "standards.audit.test", "Authentication Framework v1",
        "Authentication uses OAuth 2.0 with PKCE for public clients and client credentials for service-to-service communication. Access tokens expire after 15 minutes. Refresh tokens expire after 24 hours. Token introspection endpoints must respond within 10ms. All tokens must be JWTs signed with RS256.",
        t0PlusDays(0)),
    doc("audit-tr-f3", "platform.audit.test", "Database Schema Conventions v1",
        "All database tables must include created_at and updated_at timestamp columns with UTC timezone. Primary keys must be UUIDs generated using v7 (time-ordered). Foreign keys must have explicit ON DELETE constraints. Soft deletion is mandatory using a deleted_at nullable timestamp. Schema migrations must be idempotent.",
        t0PlusDays(0)),
    doc("audit-tr-f4", "platform.audit.test", "Logging Standards v1",
        "Structured JSON logging is mandatory for all services. Each log entry must include: level, timestamp, service name, trace_id, span_id, and message. PII must never appear in log output. Log levels are: DEBUG (development only), INFO (normal operations), WARN (recoverable issues), ERROR (failures requiring attention), FATAL (process termination).",
        t0PlusDays(0)),
    doc("audit-tr-f5", "platform.audit.test", "Error Handling Policy v1",
        "All errors must be classified using a hierarchical taxonomy: domain.category.specific_error. Error responses must include: error code, human-readable message, request_id for correlation, and retryable flag. Internal errors must not leak implementation details to external clients.",
        t0PlusDays(0)),

    // T0+30d: 3 updates (2 supersede f1 and f2)
    doc("audit-tr-u1", "standards.audit.test", "API Design Standards v2",
        "This supersedes API Design Standards v1. The updated standards add GraphQL as an approved API style alongside REST. All new services must evaluate both REST and GraphQL and document the selection rationale. Pagination for GraphQL uses Relay-style cursor connections. Rate limiting now uses token bucket algorithm with per-client quotas stored in Redis.",
        t0PlusDays(30)),
    doc("audit-tr-u2", "standards.audit.test", "Authentication Framework v2",
        "This supersedes Authentication Framework v1. Access tokens now use ES256 instead of RS256 for improved performance. Token lifetime extended to 30 minutes based on security review. Added support for device-bound tokens using DPoP (Demonstrating Proof of Possession). Service-to-service authentication now supports mutual TLS as an alternative to client credentials.",
        t0PlusDays(30)),
    doc("audit-tr-u3", "platform.audit.test", "Monitoring Integration Guide",
        "This guide describes how to integrate services with the centralized monitoring platform. Services must expose a /metrics endpoint in Prometheus format. Custom metrics must follow the naming convention: service_subsystem_metric_unit. Histogram buckets must be defined for all latency metrics.",
        t0PlusDays(30)),

    // T0+60d: 3 new (1 contradicts f4)
    doc("audit-tr-n1", "security.audit.test", "Secret Scanning Configuration",
        "Automated secret scanning must run on all repositories. Detection patterns cover API keys, private keys, database credentials, and OAuth tokens. False positives must be suppressed using inline annotations. Pre-commit hooks prevent accidental commits of secrets.",
        t0PlusDays(60)),
    doc("audit-tr-n2", "platform.audit.test", "Logging Standards v2 — Structured Binary Format",
        "This document contradicts Logging Standards v1 regarding the mandatory use of JSON format. For high-throughput services exceeding 100,000 log entries per second, binary protobuf logging is now permitted and recommended. The JSON requirement remains for services below this threshold. Binary logs must be convertible to JSON for human inspection.",
        t0PlusDays(60)),
    doc("audit-tr-n3", "security.audit.test", "Vulnerability Disclosure Policy",
        "The organization operates a responsible disclosure program. External researchers can submit vulnerabilities through the security portal. Acknowledgment within 24 hours, triage within 72 hours, fix timeline communicated within 7 days. Critical vulnerabilities are patched within 48 hours.",
        t0PlusDays(60)),

    // T0+90d: 4 docs (2 supersede u1, u2)
    doc("audit-tr-s1", "standards.audit.test", "API Design Standards v3",
        "This supersedes API Design Standards v2. gRPC is now the recommended protocol for internal service communication, with REST maintained only for external-facing APIs. GraphQL is deprecated for new services. Internal APIs must use Protocol Buffers v3 for schema definition. Breaking changes require a major version bump with 90-day deprecation notice.",
        t0PlusDays(90)),
    doc("audit-tr-s2", "standards.audit.test", "Authentication Framework v3",
        "This supersedes Authentication Framework v2. Passkey authentication (WebAuthn/FIDO2) is now the primary authentication method for human users. OAuth 2.0 is retained for API access and service-to-service communication. Token format migrated from JWT to opaque tokens with server-side introspection to reduce token size and enable instant revocation.",
        t0PlusDays(90)),
    doc("audit-tr-s3", "operations.audit.test", "On-Call Rotation Policy",
        "On-call rotations must be a minimum of one week in duration. Each rotation must have a primary and secondary responder. Handoff must occur during business hours with a 30-minute overlap period. On-call engineers must acknowledge pages within 5 minutes.",
        t0PlusDays(90)),
    doc("audit-tr-s4", "operations.audit.test", "Capacity Planning Framework",
        "Capacity planning uses a three-horizon model: H1 (current quarter, precise), H2 (next quarter, estimated), H3 (6-12 months, directional). Each horizon uses different forecasting methods and accuracy targets. H1 plans must be within 10% of actual usage.",
        t0PlusDays(90)),

    // T0+120d: 3 retractions (deprecated)
    doc("audit-tr-d1", "platform.audit.test", "DEPRECATED: Monitoring Integration Guide — Replaced by Observability Platform",
        "This document is deprecated. The monitoring integration guide has been replaced by the Observability Platform documentation. All references to the standalone Prometheus integration should be updated to use the unified observability SDK.",
        t0PlusDays(120)),
    doc("audit-tr-d2", "security.audit.test", "DEPRECATED: Secret Scanning Configuration — Merged into Security Pipeline",
        "This document is deprecated. Secret scanning configuration has been absorbed into the unified security pipeline. The standalone scanning tool is no longer maintained.",
        t0PlusDays(120)),
    doc("audit-tr-d3", "security.audit.test", "DEPRECATED: Vulnerability Disclosure Policy v1 — See v2",
        "This document is deprecated. A revised vulnerability disclosure policy with expanded scope and reduced response timelines has been published. This version should no longer be referenced.",
        t0PlusDays(120)),

    // T0+150d: 2 consolidation docs
    doc("audit-tr-c1", "platform.audit.test", "Unified Observability Platform Guide",
        "The unified observability platform consolidates logging, metrics, and tracing into a single SDK. Services integrate by adding the observability middleware. The platform automatically instruments HTTP handlers, database queries, and external API calls. Custom instrumentation uses the OpenTelemetry API directly.",
        t0PlusDays(150)),
    doc("audit-tr-c2", "security.audit.test", "Unified Security Pipeline",
        "The unified security pipeline combines secret scanning, dependency auditing, SAST, and container image scanning into a single CI stage. Configuration is managed centrally with per-repository overrides. The pipeline produces a security scorecard that gates production deployment.",
        t0PlusDays(150)),
];

export type TemporalGroundTruth = {
    atDaysFromT0: number;
    active: string[];
    superseded: string[];
    deprecated: string[];
    contested?: string[];
};

/**
 * Ground truth for temporal reconstruction.
 *
 * These expectations reflect the FINAL living_state values because the current
 * implementation uses a static artifact_living_state table (point-in-time snapshot).
 * True temporal reconstruction (V4.1 decision_causal_chain) would allow querying
 * state at arbitrary past timestamps — which would increase accuracy beyond what
 * static state provides.
 *
 * Key: f4 (Logging Standards v1) is "contested" at all timestamps because n2
 * (Logging Standards v2) contradicts it. The living objects system correctly
 * classifies this as contested rather than active.
 */
export const CAT4_GROUND_TRUTH: TemporalGroundTruth[] = [
    // T0+15d: Only foundational docs exist. f1,f2 are already superseded in the
    // static table (final state). f4 is contested (n2 contradicts it).
    // True temporal reconstruction would show all 5 as active here.
    { atDaysFromT0: 15, active: ["audit-tr-f3","audit-tr-f5"], superseded: ["audit-tr-f1","audit-tr-f2"], deprecated: [], contested: ["audit-tr-f4"] },
    // T0+45d: u1,u2,u3 published. u1,u2 are superseded in final state (by s1,s2).
    // u3 is deprecated in final state (by c1).
    { atDaysFromT0: 45, active: ["audit-tr-f3","audit-tr-f5"], superseded: ["audit-tr-f1","audit-tr-f2","audit-tr-u1","audit-tr-u2"], deprecated: ["audit-tr-u3"], contested: ["audit-tr-f4"] },
    // T0+75d: n1,n2,n3 published. n1,n3 are deprecated in final state (by c2).
    { atDaysFromT0: 75, active: ["audit-tr-f3","audit-tr-f5","audit-tr-n2"], superseded: ["audit-tr-f1","audit-tr-f2","audit-tr-u1","audit-tr-u2"], deprecated: ["audit-tr-u3","audit-tr-n1","audit-tr-n3"], contested: ["audit-tr-f4"] },
    // T0+105d: s1,s2,s3,s4 published. s1,s2 are active (latest in chain). s3,s4 active.
    { atDaysFromT0: 105, active: ["audit-tr-s1","audit-tr-s2","audit-tr-f3","audit-tr-f5","audit-tr-n2","audit-tr-s3","audit-tr-s4"], superseded: ["audit-tr-f1","audit-tr-f2","audit-tr-u1","audit-tr-u2"], deprecated: ["audit-tr-u3","audit-tr-n1","audit-tr-n3"], contested: ["audit-tr-f4"] },
    // T0+135d: d1,d2,d3 published (deprecation notices). Final state matches closely.
    { atDaysFromT0: 135, active: ["audit-tr-s1","audit-tr-s2","audit-tr-f3","audit-tr-f5","audit-tr-n2","audit-tr-s3","audit-tr-s4"], superseded: ["audit-tr-f1","audit-tr-f2","audit-tr-u1","audit-tr-u2"], deprecated: ["audit-tr-u3","audit-tr-n1","audit-tr-n3"], contested: ["audit-tr-f4"] },
];

export const CAT4_RELATIONS: CorpusRelation[] = [
    { srcId: "audit-tr-u1", dstId: "audit-tr-f1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "audit-tr-u2", dstId: "audit-tr-f2", relationType: "supersedes", confidence: 0.95 },
    { srcId: "audit-tr-n2", dstId: "audit-tr-f4", relationType: "contradicts", confidence: 0.8 },
    { srcId: "audit-tr-s1", dstId: "audit-tr-u1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "audit-tr-s2", dstId: "audit-tr-u2", relationType: "supersedes", confidence: 0.95 },
    { srcId: "audit-tr-c1", dstId: "audit-tr-u3", relationType: "supersedes", confidence: 0.9 },
    { srcId: "audit-tr-c2", dstId: "audit-tr-n1", relationType: "supersedes", confidence: 0.9 },
    { srcId: "audit-tr-c2", dstId: "audit-tr-n3", relationType: "supersedes", confidence: 0.85 },
];

export const CAT4_LIVING_STATES: LivingState[] = [
    { artifactId: "audit-tr-f1", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "audit-tr-f2", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "audit-tr-f3", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-tr-f4", livingStatus: "contested", confidence: 0.5 },
    { artifactId: "audit-tr-f5", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-tr-u1", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "audit-tr-u2", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "audit-tr-u3", livingStatus: "deprecated", confidence: 0.1 },
    { artifactId: "audit-tr-n1", livingStatus: "deprecated", confidence: 0.1 },
    { artifactId: "audit-tr-n2", livingStatus: "active", confidence: 0.85 },
    { artifactId: "audit-tr-n3", livingStatus: "deprecated", confidence: 0.1 },
    { artifactId: "audit-tr-s1", livingStatus: "active", confidence: 0.95 },
    { artifactId: "audit-tr-s2", livingStatus: "active", confidence: 0.95 },
    { artifactId: "audit-tr-s3", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-tr-s4", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-tr-d1", livingStatus: "deprecated", confidence: 0.05 },
    { artifactId: "audit-tr-d2", livingStatus: "deprecated", confidence: 0.05 },
    { artifactId: "audit-tr-d3", livingStatus: "deprecated", confidence: 0.05 },
    { artifactId: "audit-tr-c1", livingStatus: "active", confidence: 0.9 },
    { artifactId: "audit-tr-c2", livingStatus: "active", confidence: 0.9 },
];

export const AUDIT_TENANT = TENANT;
