/**
 * Cat 3 — BM25 vs Vector Contribution Decomposition
 *
 * 3 doc classes × 4 docs = 12 docs, 6 queries.
 *
 * K-class: Rare unique terms (BM25-favored). Vector search may miss these
 *   because the rare terms don't have strong semantic representations.
 * V-class: Paraphrased content with ZERO keyword overlap to the query.
 *   Only vector search can find these via semantic similarity.
 * H-class: Both keyword-matchable AND semantically similar.
 *   Both retrieval lanes should contribute.
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

// ── K-class: Keyword-favored (rare unique terms) ─────────────────────────

const kDocs: CorpusDocV2[] = [
    docV3("v3-bm25-k1", DOMAINS.security, "XK7-Bravo HSM Protocol",
        `The XK7-Bravo protocol mandates FIPS-140-3 Level 2 validation for all HSM modules deployed in the settlement-engine namespace. Each HSM must be provisioned with a unique device certificate issued by the Meridian PKI root CA. The XK7-Bravo compliance check runs weekly and reports to the security dashboard. Non-compliant HSMs are quarantined within 4 hours of detection. Current deployment: 12 HSM units across 3 availability zones, all XK7-Bravo certified as of 2025-08-01.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-bm25-k2", DOMAINS.platform, "ZetaQueue Runbook RB-2025-0417",
        `Runbook RB-2025-0417: ZetaQueue Consumer Lag Response

When Prometheus alert ZetaQueue99thPctLatency fires:
1. Check zeta-queue consumer lag metric via Grafana dashboard "ZetaQueue Overview"
2. If lag > 10,000 messages: scale consumer group from 3 to 8 pods
3. If lag > 50,000 messages: engage on-call SRE and check for upstream producer burst
4. Verify zeta-queue partition balance — uneven partitions cause hot-spot lag
5. Check for stuck consumers using the /admin/consumers endpoint
6. If consumer restart needed: rolling restart via kubectl rollout restart deployment/zeta-consumer

Escalation: If lag doesn't decrease within 15 minutes of scaling, page the platform team lead.
Owner: Nathan Brooks, DevOps Engineer`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-bm25-k3", DOMAINS.eng, "Jumio API Version Configuration",
        `Configuration key meridian.kyc.provider.jumio.api_version must be set to 4.2.1 for all production environments. The upgrade from Jumio API v3.8 to v4.2.1 was completed on 2025-06-15 as part of Project Beacon. Key configuration details:

- Environment variable: JUMIO_API_VERSION=4.2.1
- Endpoint: https://netverify.com/api/v4/
- Authentication: OAuth2 client credentials flow
- Webhook callback: https://api.meridian.com/webhooks/kyc/jumio
- Timeout: 30 seconds for verification requests
- Retry policy: 3 retries with exponential backoff (1s, 2s, 4s)

Contact: Alice Chen, Staff Engineer (Project Beacon lead)`,
        "text/plain", dateMonthsAgo(4)),

    docV3("v3-bm25-k4", DOMAINS.eng, "Settlement Reconciliation Errors",
        `Error code ERR_SETTLE_RECON_MISMATCH indicates a reconciliation discrepancy between the Meridian settlement-engine and the external clearing house. This error triggers when the daily batch settlement totals diverge by more than EUR 0.01.

Error handling procedure:
1. ERR_SETTLE_RECON_MISMATCH logged to settlement_errors table with batch_id and discrepancy_amount
2. Automated retry of the affected batch after 5 minutes
3. If retry fails: escalate to settlement-ops team via PagerDuty
4. Settlement-ops must resolve within 4 hours per SLA with clearing house
5. Root cause must be documented in post-incident review

Common causes: timezone drift in batch cutoff times, duplicate transaction inclusion, FX rate staleness.`,
        "text/plain", dateMonthsAgo(1)),
];

// ── V-class: Vector-favored (paraphrased, zero keyword overlap) ──────────

const vDocs: CorpusDocV2[] = [
    docV3("v3-vec-v1", DOMAINS.security, "Caller Identity Verification Framework",
        `Every external-facing service endpoint must validate caller identity using cryptographic proof of authorization before processing any request. The verification framework operates on a zero-trust principle where no network location confers implicit trust.

Callers present a time-limited bearer credential obtained through an OAuth2-compliant authorization server. The credential contains claims about the caller's identity, permitted operations, and temporal validity. Service endpoints validate these credentials against the authorization server's public signing keys, which are cached locally with a 15-minute refresh interval.

Credential lifecycle management requires periodic renewal. The maximum validity period is 90 calendar days, after which the caller must obtain fresh credentials through the re-authorization flow. Inactive credentials are automatically revoked after 30 days of non-use.

This framework applies to all third-party integrations, partner APIs, and internal service-to-service communication in the production environment.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-vec-v2", DOMAINS.security, "Production Anomaly Escalation Procedures",
        `When a production anomaly is detected through automated monitoring or manual observation, the on-call engineer follows a structured escalation procedure designed to minimize customer impact and ensure timely resolution.

The escalation framework defines four tiers of anomaly severity. The lowest tier covers minor degradation affecting less than 1% of traffic. The second tier addresses partial service disruption visible to multiple customer segments. The third tier encompasses full service unavailability for one or more critical functions. The highest tier is reserved for data integrity concerns or security breaches.

For each tier, the procedure specifies notification recipients, response time expectations, communication cadence, and post-resolution documentation requirements. The on-call engineer is empowered to escalate at any point if the situation exceeds their assessment of the current tier.

All anomalies at tier two and above require a retrospective analysis within 72 hours of resolution, documenting root cause, timeline, customer impact, and preventive measures.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-vec-v3", DOMAINS.platform, "Persistent State Protection Strategy",
        `Persistent state is periodically captured to durable storage with point-in-time recovery capability maintained for the preceding thirty calendar days. The capture process operates on two cadences: a comprehensive snapshot occurs once every twenty-four hours during the maintenance window, and incremental state changes are continuously archived at sub-minute granularity.

The durable storage tier employs encryption at rest using industry-standard symmetric ciphers. Geographic redundancy is maintained by replicating captured state to a secondary location in a different failure domain.

Recovery procedures are validated quarterly through simulated failure exercises. The target time to restore service from a comprehensive snapshot is forty-five minutes for the primary production instance. Point-in-time recovery to any arbitrary moment within the thirty-day window is supported through replay of incremental state changes on top of the nearest comprehensive snapshot.`,
        "text/plain", dateMonthsAgo(4)),

    docV3("v3-vec-v4", DOMAINS.platform, "System Health Indicator Evaluation",
        `System health indicators are continuously evaluated against predetermined tolerance bands to identify deviations requiring operator attention. The evaluation framework monitors latency distribution percentiles, throughput capacity utilization, and error classification rates.

Three severity classifications govern the response protocol. The advisory classification triggers asynchronous notification to the operations channel when latency distributions exceed the tolerance band at the ninety-fifth percentile. The urgent classification triggers synchronous paging of the duty responder when the ninety-ninth percentile exceeds the tolerance band. The highest classification activates the full incident response protocol when sustained degradation exceeds the emergency threshold.

Evaluation windows vary by classification: advisory assessments use a five-minute aggregation period, urgent assessments use the same five-minute period with stricter thresholds, and emergency assessments use a one-minute period for rapid detection.

Error classification monitoring operates independently with proportional thresholds calibrated to baseline traffic volumes.`,
        "text/plain", dateMonthsAgo(2)),
];

// ── H-class: Hybrid (keyword + semantic match) ──────────────────────────

const hDocs: CorpusDocV2[] = [
    docV3("v3-hyb-h1", DOMAINS.security, "API Key Rotation Policy",
        `The API key rotation policy requires all service API keys to be rotated every 90 days. The rotation process is automated through the Meridian key management service and follows these steps:

1. New API key generated with unique prefix (mk_prod_...)
2. New key distributed to consuming services via Vault KV store
3. Both old and new keys valid during 7-day transition window
4. Old key revoked after transition window expires
5. Rotation event logged to audit trail with timestamp and operator

Emergency rotation can be triggered manually if a key compromise is suspected. Emergency rotations bypass the transition window and immediately revoke the old key.

Key tiers: production keys rotate every 90 days, staging keys every 180 days, development keys every 365 days.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-hyb-h2", DOMAINS.security, "Incident Response Playbook v3",
        `The incident response playbook defines a four-tier severity classification system for production incidents at Meridian Financial Services.

Tier 1 (Low): Minor degradation affecting <1% of traffic. On-call acknowledges within 30 minutes.
Tier 2 (Medium): Partial disruption visible to multiple segments. On-call responds within 15 minutes. Status page updated.
Tier 3 (High): Full unavailability of a critical service. Incident commander assigned within 10 minutes. Customer communication within 30 minutes.
Tier 4 (Critical): Data integrity or security breach. Full executive notification. External communication within 1 hour.

Post-incident: Tier 2+ require retrospective within 72 hours. Tier 3+ require executive summary. Tier 4 requires board notification.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-hyb-h3", DOMAINS.platform, "Database Backup Strategy",
        `The database backup strategy uses daily full snapshots and hourly WAL archiving to ensure data durability for all Meridian production databases.

Full snapshots: pg_basebackup at 02:00 UTC daily. Stored in S3 with AES-256 encryption. Retained for 30 days.
WAL archiving: Continuous, archived every 60 seconds. Retained for 7 days. Enables point-in-time recovery.

Recovery targets:
- RTO (Recovery Time Objective): 45 minutes from latest full snapshot
- RPO (Recovery Point Objective): < 60 seconds (WAL granularity)

Cross-region replication to us-west-2 for disaster recovery. Quarterly DR drills validate recovery procedures.`,
        "text/plain", dateMonthsAgo(4)),

    docV3("v3-hyb-h4", DOMAINS.platform, "Alerting Threshold Configuration",
        `The alerting threshold configuration specifies monitoring thresholds for all Meridian production services:

Latency alerts:
- Warning: p95 latency > 200ms (5-minute evaluation window)
- Critical: p99 latency > 500ms (5-minute evaluation window)
- Emergency: p99 latency > 2000ms (1-minute evaluation window)

Error rate alerts:
- Warning: 5xx error rate > 0.1% (5-minute window)
- Critical: 5xx error rate > 1.0% (3-minute window)

Notification routing:
- Warning → Slack #ops-alerts
- Critical → PagerDuty on-call rotation
- Emergency → PagerDuty + SMS to SRE lead

Thresholds reviewed quarterly and adjusted based on baseline traffic patterns.`,
        "text/plain", dateMonthsAgo(2)),
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT3_DOCS: CorpusDocV2[] = [...kDocs, ...vDocs, ...hDocs];

export const CAT3_GROUND_TRUTH: GroundTruth[] = [
    // K-class queries: use rare terms that only BM25 can match
    {
        query: "What is the XK7-Bravo protocol for FIPS-140-3 HSM validation?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-bm25-k1"],
    },
    {
        query: "What does runbook RB-2025-0417 say about ZetaQueue99thPctLatency alert response?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-bm25-k2"],
    },
    // V+H queries: use natural language that matches V-class semantically
    // and H-class both semantically and by keyword
    {
        query: "What is the API key rotation policy at Meridian?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-vec-v1", "v3-hyb-h1"],
    },
    {
        query: "What is the incident response playbook and severity classification?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-vec-v2", "v3-hyb-h2"],
    },
    {
        query: "What is the database backup strategy and recovery objectives?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-vec-v3", "v3-hyb-h3"],
    },
    {
        query: "What are the alerting threshold configurations for latency and error rates?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-vec-v4", "v3-hyb-h4"],
    },
];

/** Helper: classify a doc ID into K/V/H class */
export function getDocClass(docId: string): "bm25" | "vector" | "hybrid" | "unknown" {
    if (docId.startsWith("v3-bm25-")) return "bm25";
    if (docId.startsWith("v3-vec-")) return "vector";
    if (docId.startsWith("v3-hyb-")) return "hybrid";
    return "unknown";
}
