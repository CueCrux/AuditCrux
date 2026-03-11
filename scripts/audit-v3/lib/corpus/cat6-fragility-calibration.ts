/**
 * Cat 6 — Fragility Calibration
 *
 * 3 scenarios × {2,4,6} docs = 12 docs, 3 queries.
 * Tests whether leave-one-out fragility scoring produces distinguishable
 * scores for known domain distribution configurations.
 *
 * F1 (Maximum): 2 docs, each sole domain rep → fragility ~1.0
 * F2 (Moderate): 4 docs, mixed domains → fragility ~0.5
 * F3 (Low): 6 docs, redundant domains → fragility ~0.33
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

// ── F1: Maximum Fragility (2 docs, 2 unique domains) ───────────────────
// Each doc is the sole representative of its domain. Removing either
// breaks the minDomains=2 requirement → fragility should be ~1.0.

const f1Docs: CorpusDocV2[] = [
    docV3("v3-frag-f1a", DOMAINS.alpha, "Alpha Zone Encryption Standard",
        `The Alpha Zone Encryption Standard mandates AES-256-GCM for all data at rest within the alpha operational zone. Key management uses a dedicated HSM partition with automatic key rotation every 90 days. All encryption operations are logged to an append-only audit ledger. The standard applies to all databases, object stores, and message queues within the alpha zone perimeter. Compliance is verified through quarterly automated scans that check encryption status of every storage volume.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-frag-f1b", DOMAINS.beta, "Beta Zone Encryption Standard",
        `The Beta Zone Encryption Standard requires ChaCha20-Poly1305 for all data in transit between beta zone services. TLS 1.3 is mandatory with no fallback to earlier versions. Certificate rotation occurs every 60 days via an automated PKI pipeline. The standard covers all inter-service communication, external API endpoints, and webhook callbacks within the beta zone. Monthly penetration tests validate the encryption posture.`,
        "text/plain", dateMonthsAgo(2)),
];

// ── F2: Moderate Fragility (4 docs, 3 domains) ─────────────────────────
// 3 domains but one has redundancy. 2 of 4 docs are load-bearing
// (sole reps of their domains) → fragility ~0.5.

const f2Docs: CorpusDocV2[] = [
    docV3("v3-frag-f2a", DOMAINS.alpha, "Alpha Zone Network Segmentation Policy",
        `The Alpha Zone Network Segmentation Policy enforces microsegmentation at the pod level using Cilium network policies. All east-west traffic within the alpha zone requires mutual TLS authentication. Default-deny ingress and egress rules are applied to every namespace. Exceptions are granted via a pull-request-based workflow with mandatory security team review. Network flow logs are retained for 90 days in the SIEM.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-frag-f2b", DOMAINS.beta, "Beta Zone Network Segmentation Policy",
        `The Beta Zone Network Segmentation Policy uses Calico network policies for pod-level isolation. All inter-namespace traffic is denied by default. Allowed paths are defined in a central policy repository and synced via GitOps. Service mesh (Istio) enforces mTLS for all beta zone services. Network anomaly detection alerts trigger within 5 minutes of unusual traffic patterns.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-frag-f2c", DOMAINS.gamma, "Gamma Zone Network Segmentation Policy",
        `The Gamma Zone Network Segmentation Policy implements VLAN-based segmentation for legacy workloads that cannot use container-native networking. Firewall rules are managed via Terraform and reviewed monthly. Jump hosts are required for all administrative access to gamma zone systems. VPN tunnels between gamma and other zones use IPSec with AES-256 encryption.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-frag-f2d", DOMAINS.gamma, "Gamma Zone Network Monitoring Addendum",
        `Addendum to the Gamma Zone Network Segmentation Policy: All gamma zone network devices must export NetFlow v9 data to the central collector at 1-minute intervals. The collector aggregates flows and generates baseline traffic profiles. Deviations exceeding 2 standard deviations trigger automated alerts. Quarterly traffic analysis reports are shared with the security team for policy refinement.`,
        "text/plain", dateMonthsAgo(2)),
];

// ── F3: Low Fragility (6 docs, 4 domains) ──────────────────────────────
// 4 domains with redundancy in most. Only 2 of 6 are sole reps →
// fragility ~0.33.

const f3Docs: CorpusDocV2[] = [
    docV3("v3-frag-f3a", DOMAINS.alpha, "Alpha Zone Incident Response Runbook",
        `The Alpha Zone Incident Response Runbook defines the escalation path for security incidents affecting alpha zone infrastructure. Tier 1 incidents (information) require logging only. Tier 2 incidents (degradation) require on-call acknowledgment within 15 minutes. Tier 3 incidents (outage) trigger the full incident response team assembly within 10 minutes. Post-incident reviews are mandatory for Tier 2+ events.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-frag-f3b", DOMAINS.alpha, "Alpha Zone Incident Response Addendum",
        `Addendum: Alpha zone incidents involving customer PII exposure automatically escalate to Tier 3 regardless of traffic impact. The Data Protection Officer must be notified within 1 hour. Regulatory notification timelines (72 hours for GDPR, varies for other regimes) begin from the moment of confirmed PII exposure, not from incident detection.`,
        "text/plain", dateMonthsAgo(1)),

    docV3("v3-frag-f3c", DOMAINS.beta, "Beta Zone Incident Response Runbook",
        `The Beta Zone Incident Response Runbook mirrors the alpha zone structure with beta-specific thresholds. Tier 1: automated logging and Slack notification. Tier 2: PagerDuty alert to beta zone on-call, 15-minute response SLA. Tier 3: War room initiated in dedicated Zoom bridge, incident commander assigned from SRE rotation. All beta zone incidents feed into the unified incident tracking system.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-frag-f3d", DOMAINS.gamma, "Gamma Zone Incident Response Runbook",
        `The Gamma Zone Incident Response Runbook addresses legacy system incidents that may not trigger automated monitoring. Manual incident reports are accepted via email or ServiceNow ticket. Gamma zone on-call engineers perform triage within 30 minutes. Legacy system failures often require vendor engagement — the runbook maintains a vendor contact matrix with escalation paths and contract SLA references.`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-frag-f3e", DOMAINS.delta, "Delta Zone Incident Response Runbook",
        `The Delta Zone Incident Response Runbook covers the sandbox and development environments. While lower severity than production zones, delta zone incidents that indicate supply chain compromise or credential leakage are escalated immediately. The runbook includes automated credential scanning results from CI/CD pipelines and dependency vulnerability reports from Snyk and Dependabot.`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-frag-f3f", DOMAINS.delta, "Delta Zone Security Testing Procedures",
        `Delta zone serves as the primary environment for security testing activities. Penetration testers operate within the delta zone perimeter under controlled conditions. All testing activities require pre-approved scope documents. The delta zone maintains isolated copies of production data (anonymized) for realistic testing scenarios. Test results are documented in the security findings database with CVSS scoring.`,
        "text/plain", dateMonthsAgo(1)),
];

// ── Queries ─────────────────────────────────────────────────────────────
// Each query targets ALL docs in its scenario (verified mode, minDomains=2).

export const CAT6_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What are the encryption standards for operational zones?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-frag-f1a", "v3-frag-f1b"],
    },
    {
        query: "What are the network segmentation policies across operational zones?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-frag-f2a", "v3-frag-f2b", "v3-frag-f2c", "v3-frag-f2d"],
    },
    {
        query: "What are the incident response runbooks for all operational zones?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v3-frag-f3a", "v3-frag-f3b", "v3-frag-f3c", "v3-frag-f3d", "v3-frag-f3e", "v3-frag-f3f"],
    },
];

/** Scenario metadata for reporting */
export const FRAGILITY_SCENARIOS = [
    { id: "F1", label: "Maximum (2 docs, 2 domains)", expectedRange: [0.8, 1.0] as [number, number] },
    { id: "F2", label: "Moderate (4 docs, 3 domains)", expectedRange: [0.3, 0.7] as [number, number] },
    { id: "F3", label: "Low (6 docs, 4 domains)", expectedRange: [0.1, 0.5] as [number, number] },
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT6_DOCS: CorpusDocV2[] = [...f1Docs, ...f2Docs, ...f3Docs];
