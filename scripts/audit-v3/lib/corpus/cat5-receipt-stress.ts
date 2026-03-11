/**
 * Cat 5 — Receipt Chain Stress Test
 *
 * 2 seed docs (different domains for minDomains=2), 50 generated queries.
 * Tests receipt verification latency at increasing chain depths up to the
 * CTE limit of 50. Runs in verified mode only (mode-independent).
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

// ── Seed Documents ──────────────────────────────────────────────────────

const seedA = docV3(
    "v3-rcpt-a",
    DOMAINS.security,
    "Meridian Production Access Control Matrix",
    `# Production Access Control Matrix

## Overview
This document defines the production environment access control matrix for all Meridian Financial Services engineering staff. Access is granted on a least-privilege basis and reviewed quarterly.

## Access Tiers

### Tier 1 — Read-Only Observability
- Grafana dashboards (all teams)
- Kibana log search (filtered to team namespace)
- Prometheus metric explorer
- Granted to: All engineers after onboarding

### Tier 2 — Application Debugging
- kubectl exec (read-only containers)
- Database read replicas (SELECT only)
- Distributed tracing (Jaeger)
- Granted to: Senior engineers + on-call rotation

### Tier 3 — Application Management
- kubectl apply/delete (non-system namespaces)
- Feature flag management (LaunchDarkly)
- Cache invalidation (Redis FLUSHDB on staging only)
- Granted to: Tech leads + SRE team

### Tier 4 — Infrastructure Administration
- Terraform apply (with approval workflow)
- Database DDL on production primary
- Vault secret management
- Network policy modifications
- Granted to: SRE leads + VP Engineering (break-glass)

## Audit Requirements
All Tier 3+ actions logged to immutable audit trail. Tier 4 actions require pre-approval via ServiceNow ticket. Quarterly access review removes stale grants.

Approved by: Diana Walsh, VP Engineering
Last reviewed: 2025-10-01`,
    "text/markdown",
    dateMonthsAgo(3),
);

const seedB = docV3(
    "v3-rcpt-b",
    DOMAINS.platform,
    "Meridian SLA Definitions and Measurement",
    `# SLA Definitions and Measurement

## Service Level Agreements

### Availability SLA
- Target: 99.95% monthly uptime (measured per calendar month, UTC)
- Measurement: Synthetic health checks from 3 regions every 30 seconds
- Exclusions: Scheduled maintenance windows (max 4 hours/month, announced 72h ahead)
- Penalty: 10% service credit per 0.1% below target

### Latency SLA
- p50: < 100ms end-to-end
- p95: < 300ms end-to-end
- p99: < 1000ms end-to-end
- Measurement: Server-side request duration histogram (Prometheus)

### Data Durability SLA
- Target: 99.999999% (8 nines) annual durability
- Measurement: Bit-rot detection via weekly checksum validation
- Backup: Daily snapshots + continuous WAL archiving (RPO < 60 seconds)
- Recovery: RTO < 45 minutes from latest snapshot

### Incident Response SLA
- Tier 1 (Low): Acknowledge within 30 minutes
- Tier 2 (Medium): Respond within 15 minutes, status page update
- Tier 3 (High): Incident commander within 10 minutes
- Tier 4 (Critical): Full executive notification within 1 hour

## Measurement Infrastructure
All SLA metrics exported to the Meridian Observability Platform (Prometheus + Grafana). Monthly SLA reports generated automatically on the 1st of each month and distributed to stakeholders.

Approved by: James Okafor, CTO
Effective: 2025-07-01`,
    "text/markdown",
    dateMonthsAgo(4),
);

// ── Query Generator ─────────────────────────────────────────────────────

const TOPIC_A_PARAPHRASES = [
    "What are the production access tiers at Meridian?",
    "How is production access controlled for engineering staff?",
    "What permissions does the Tier 2 access level grant?",
    "Who can run Terraform apply in production?",
    "What are the audit requirements for Tier 3 actions?",
    "How often is production access reviewed?",
    "What is the break-glass procedure for infrastructure access?",
    "Which teams have kubectl apply permissions?",
    "What is the least-privilege access model at Meridian?",
    "How are stale access grants handled?",
    "What does Tier 1 read-only observability include?",
    "Who approves Tier 4 infrastructure administration?",
    "What ServiceNow workflow governs production changes?",
    "How is the production access control matrix structured?",
    "What database access do senior engineers have?",
    "How does the on-call rotation affect access levels?",
    "What logging is required for privileged production actions?",
    "Which namespace restrictions apply to Tier 3 access?",
    "How does Meridian enforce least-privilege in production?",
    "What is the quarterly access review process?",
    "What Redis operations are permitted on staging?",
    "How is Vault secret management access controlled?",
    "What network policy changes require Tier 4 access?",
    "Who has DDL access on the production primary database?",
    "What is the immutable audit trail for Tier 3+ actions?",
];

const TOPIC_B_PARAPHRASES = [
    "What are the SLA definitions for Meridian services?",
    "What is the monthly uptime target for Meridian?",
    "How is availability measured across regions?",
    "What latency percentiles does the SLA specify?",
    "What is the data durability target?",
    "How does Meridian ensure RPO under 60 seconds?",
    "What incident response times does the SLA require?",
    "How are SLA credits calculated for downtime?",
    "What is the scheduled maintenance window policy?",
    "How are SLA metrics reported to stakeholders?",
    "What Prometheus metrics track the availability SLA?",
    "What is the recovery time objective for snapshots?",
    "How is bit-rot detected in the durability SLA?",
    "What synthetic health checks measure uptime?",
    "When is the Tier 3 incident commander required?",
    "What does the monthly SLA report contain?",
    "How are latency SLAs measured server-side?",
    "What exclusions apply to the availability SLA?",
    "What is the penalty for missing the uptime target?",
    "How does WAL archiving support the RPO target?",
    "What is the 8-nines durability commitment?",
    "How quickly must Tier 4 executive notification occur?",
    "What Grafana dashboards show SLA compliance?",
    "How are checksum validations scheduled?",
    "What is the end-to-end p99 latency target?",
];

/** Generate 50 queries: 25 per topic, interleaved */
export function generateReceiptQueries(): GroundTruth[] {
    const queries: GroundTruth[] = [];
    for (let i = 0; i < 25; i++) {
        queries.push({
            query: TOPIC_A_PARAPHRASES[i],
            mode: "verified",
            topK: 10,
            expectedDocIds: ["v3-rcpt-a"],
        });
        queries.push({
            query: TOPIC_B_PARAPHRASES[i],
            mode: "verified",
            topK: 10,
            expectedDocIds: ["v3-rcpt-b"],
        });
    }
    return queries;
}

/** Depth checkpoints to measure latency */
export const RECEIPT_DEPTH_CHECKPOINTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT5_DOCS: CorpusDocV2[] = [seedA, seedB];
