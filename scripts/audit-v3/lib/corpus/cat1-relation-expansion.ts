/**
 * Cat 1 — Relation-Bootstrapped Retrieval
 *
 * Binary test: does the retrieval pipeline use artifact_relations to expand
 * the candidate set? Query vocabulary matches ONLY the original policy.
 * The amendment uses completely different terminology but has a supersedes
 * relation. If relation expansion works, the amendment appears. If not
 * (expected baseline), only the original appears.
 *
 * 8 docs, 1 query.
 */

import type { CorpusDocV2, CorpusRelation, LivingState, GroundTruth } from "../types-v3.js";
import { DOMAINS, TENANT_V3, docV3, dateMonthsAgo } from "../tenant.js";

// ── Original policy: uses "data residency" vocabulary ─────────────────────
const orig = docV3(
    "v3-rel-orig",
    DOMAINS.compliance,
    "Meridian Data Residency Framework v1",
    `# Meridian Data Residency Framework v1

## Purpose
This document establishes the data residency requirements for all Meridian Financial Services operations. All customer personally identifiable information (PII) must comply with geographic locality constraints imposed by applicable sovereignty requirements.

## Scope
- All production databases storing customer PII
- Backup and disaster recovery replicas
- Analytics and reporting pipelines that process PII

## Requirements

### 1. Geographic Locality
Customer data must reside in the same jurisdictional zone as the customer's registered address. European customers' data must remain within EU/EEA data centers. US customers' data must remain within continental US data centers.

### 2. Sovereignty Requirements
Each jurisdictional zone has specific data sovereignty requirements:
- **EU/EEA**: GDPR Article 44-49 compliance required for any cross-border transfer
- **US**: State-level privacy laws (CCPA, CPRA) govern data locality
- **APAC**: Country-specific requirements (PDPA, PIPL) must be individually assessed

### 3. Jurisdictional Controls
All data access must be logged with the accessor's jurisdiction. Cross-jurisdictional access requires explicit authorization from the Data Protection Officer.

## Enforcement
Quarterly audits verify data residency compliance. Violations are reported to the compliance committee within 24 hours.

Approved by: Carol Okonkwo, Compliance Manager
Effective: 2025-01-15`,
    "text/markdown",
    dateMonthsAgo(8),
);

// ── Amendment: uses COMPLETELY different vocabulary ────────────────────────
// No shared terms with "data residency", "geographic locality", "sovereignty",
// or "jurisdictional controls". This doc can ONLY be found via the supersedes
// relation edge, not via keyword or semantic similarity to the original.
const amend = docV3(
    "v3-rel-amend",
    DOMAINS.compliance,
    "Meridian Cross-Border Information Relay Protocol — Amendment 2025-Q3",
    `# Cross-Border Information Relay Protocol — Amendment 2025-Q3

## Overview
This amendment supersedes the previous framework and establishes updated protocols for transnational information relay between Meridian operational zones.

## Updated Provisions

### 1. Bilateral Flow Agreements
All transnational information relay operations must be governed by bilateral data flow agreements between participating zones. Each agreement specifies:
- Permitted relay categories (financial records, authentication tokens, aggregate metrics)
- Bandwidth and throughput constraints for relay channels
- Encryption cipher suites required for in-transit protection

### 2. Regulatory Harmonization
Where multiple regulatory regimes apply, Meridian adopts the mutual recognition principle:
- Zones with substantially equivalent protections may engage in unrestricted relay
- Zones lacking equivalence determination require enhanced safeguards and relay logging
- The Regulatory Harmonization Board reviews zone equivalence quarterly

### 3. Relay Channel Architecture
Technical implementation of relay channels must use dedicated VPN tunnels with:
- AES-256-GCM encryption for all relay payloads
- Certificate pinning with hardware-backed key storage
- Automatic circuit breaking if relay latency exceeds 500ms

## Effective Date
This amendment takes effect immediately upon publication and replaces all prior provisions governing information movement between operational zones.

Approved by: Paul Dubois, Regulatory Affairs
Effective: 2025-09-01`,
    "text/markdown",
    dateMonthsAgo(2),
);

// ── Supporting docs ───────────────────────────────────────────────────────
const support1 = docV3(
    "v3-rel-support1",
    DOMAINS.legal,
    "EU GDPR Adequacy Decision Reference Guide",
    `# EU GDPR Adequacy Decision Reference Guide

This guide summarizes the current adequacy decisions issued by the European Commission under GDPR Article 45. Countries with adequacy decisions include: Andorra, Argentina, Canada (commercial), Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, UK, Uruguay, and the US (Data Privacy Framework).

For transfers to non-adequate countries, Meridian must use Standard Contractual Clauses (SCCs) or Binding Corporate Rules (BCRs) as appropriate.

Last updated: 2025-06-15`,
    "text/markdown",
    dateMonthsAgo(4),
);

const support2 = docV3(
    "v3-rel-support2",
    DOMAINS.infra,
    "Meridian Data Center Location Matrix",
    `# Data Center Location Matrix

| Zone | Provider | Region | Tier | Status |
|------|----------|--------|------|--------|
| EU-Primary | AWS | eu-west-1 (Ireland) | Production | Active |
| EU-DR | AWS | eu-central-1 (Frankfurt) | DR | Standby |
| US-Primary | AWS | us-east-1 (Virginia) | Production | Active |
| US-DR | AWS | us-west-2 (Oregon) | DR | Standby |
| APAC-Primary | AWS | ap-southeast-1 (Singapore) | Production | Active |

All zones maintain dedicated encryption keys managed by AWS KMS with customer-managed CMKs. Cross-region replication is disabled by default and requires DPO approval to enable.`,
    "text/markdown",
    dateMonthsAgo(6),
);

// ── Noise docs (unrelated content) ───────────────────────────────────────
const noise1 = docV3(
    "v3-rel-noise1",
    DOMAINS.eng,
    "Payment Service Circuit Breaker Configuration",
    `The payment-service uses Hystrix-compatible circuit breakers with the following defaults: error threshold 50%, sleep window 5000ms, volume threshold 20 requests. The circuit opens after 10 consecutive failures and half-opens after the sleep window expires. Metrics are exported to Prometheus via the /actuator/prometheus endpoint.`,
    "text/plain",
    dateMonthsAgo(5),
);

const noise2 = docV3(
    "v3-rel-noise2",
    DOMAINS.platform,
    "Kubernetes Pod Autoscaling Policy",
    `HPA configuration for production namespaces: minReplicas=2, maxReplicas=10, targetCPUUtilization=70%, scaleDownStabilizationWindow=300s. VPA is disabled in production. Custom metrics scaling uses the payment-queue-depth metric from Prometheus with a target value of 100 messages per pod.`,
    "text/plain",
    dateMonthsAgo(3),
);

const noise3 = docV3(
    "v3-rel-noise3",
    DOMAINS.security,
    "Quarterly Penetration Test Summary Q2 2025",
    `Executive summary of Q2 2025 penetration test conducted by CrowdStrike. 3 critical findings (all remediated): SQL injection in legacy reporting endpoint, SSRF in webhook relay, and insufficient rate limiting on password reset. 12 medium findings, 28 low findings. Full remediation achieved within 30-day SLA.`,
    "text/plain",
    dateMonthsAgo(4),
);

const noise4 = docV3(
    "v3-rel-noise4",
    DOMAINS.product,
    "Feature Flag Rollout Schedule Q4 2025",
    `Planned feature flag rollouts for Q4: multi-currency-wallet (10% → 50% → 100% over 6 weeks), enhanced-kyc-flow (staff → beta → GA), real-time-notifications (A/B test in US market). All flags managed via LaunchDarkly with automatic kill-switch if error rate exceeds 1%.`,
    "text/plain",
    dateMonthsAgo(1),
);

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT1_DOCS: CorpusDocV2[] = [
    orig, amend, support1, support2, noise1, noise2, noise3, noise4,
];

export const CAT1_RELATIONS: CorpusRelation[] = [
    { srcId: "v3-rel-amend", dstId: "v3-rel-orig", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v3-rel-support1", dstId: "v3-rel-orig", relationType: "supports", confidence: 0.8 },
    { srcId: "v3-rel-support2", dstId: "v3-rel-orig", relationType: "supports", confidence: 0.7 },
];

export const CAT1_LIVING_STATES: LivingState[] = [
    { artifactId: "v3-rel-orig", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "v3-rel-amend", livingStatus: "active", confidence: 0.95 },
    { artifactId: "v3-rel-support1", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v3-rel-support2", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v3-rel-noise1", livingStatus: "active", confidence: 0.7 },
    { artifactId: "v3-rel-noise2", livingStatus: "active", confidence: 0.7 },
    { artifactId: "v3-rel-noise3", livingStatus: "active", confidence: 0.7 },
    { artifactId: "v3-rel-noise4", livingStatus: "active", confidence: 0.7 },
];

/**
 * Ground truth: query uses vocabulary from the ORIGINAL policy only.
 * The amendment has zero keyword overlap — it can only be found via
 * relation expansion (which is NOT currently implemented).
 */
export const CAT1_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What is the current data residency framework at Meridian? What are the geographic locality and sovereignty requirements?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-rel-orig"],
        // If relation expansion were active, v3-rel-amend would also appear
        // and should rank ABOVE v3-rel-orig (since it supersedes it).
    },
];

/**
 * The amendment doc ID — checked separately to determine if relation
 * expansion is working (binary indicator).
 */
export const RELATION_EXPANSION_TARGET = "v3-rel-amend";
