/**
 * Cat 7 — Broad-Query Recall
 *
 * 2 source artifacts, each with 3 source chunks and 1 hierarchical summary.
 * Broad queries should recover the theme cluster and surface the
 * hierarchical summary in the retrieved set.
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

const remoteAccessArtifact = "v3-broad-remote-access";
const vendorEvidenceArtifact = "v3-broad-vendor-evidence";

const remoteAccessDocs: CorpusDocV2[] = [
    {
        ...docV3(
            "v3-broad-ra-src-1",
            DOMAINS.security,
            "Privileged Remote Access Device Posture Controls",
            `Privileged administrators may use remote access only from managed devices enrolled in Meridian device trust. Every session requires a compliant endpoint posture check covering disk encryption, EDR heartbeat freshness, and an active screen lock policy. Devices that fail posture checks are blocked before VPN access is granted.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: remoteAccessArtifact,
        chunkIndex: 0,
    },
    {
        ...docV3(
            "v3-broad-ra-src-2",
            DOMAINS.security,
            "Privileged Remote Access Session Controls",
            `Privileged remote access sessions must terminate after 30 minutes of inactivity and require step-up MFA every 8 hours of continuous use. Copy-paste into production consoles is disabled by default. Session recordings are retained for 180 days for post-incident review.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: remoteAccessArtifact,
        chunkIndex: 1,
    },
    {
        ...docV3(
            "v3-broad-ra-src-3",
            DOMAINS.security,
            "Privileged Remote Access Approval Workflow",
            `Emergency privileged access outside the change window requires break-glass approval from the duty manager and a ticket reference. Normal privileged access requires membership in the production-admin group plus a current quarterly access review. Shared credentials are prohibited.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: remoteAccessArtifact,
        chunkIndex: 2,
    },
    {
        ...docV3(
            "v3-broad-ra-summary",
            DOMAINS.security,
            "Privileged Remote Access Summary",
            `Privileged administrators can connect remotely only from managed, compliant devices, must satisfy MFA and session timeout controls, and need approved access with break-glass review for emergencies. The remote access programme couples device posture, short-lived sessions, and explicit approval workflows for production administration.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: remoteAccessArtifact,
        contentType: "hierarchical_summary",
        chunkIndex: 3,
        processingMetadata: {
            source_chunk_ids: ["v3-broad-ra-src-1", "v3-broad-ra-src-2", "v3-broad-ra-src-3"],
        },
    },
];

const vendorEvidenceDocs: CorpusDocV2[] = [
    {
        ...docV3(
            "v3-broad-ve-src-1",
            DOMAINS.compliance,
            "Vendor Security Questionnaire Retention",
            `Completed vendor security questionnaires are stored in the third-party risk register for 24 months from the completion date. Questionnaires tied to critical vendors are renewed annually. Superseded questionnaires remain available for audit comparison but are marked non-current.`,
            "text/plain",
            dateMonthsAgo(4),
        ),
        artifactKey: vendorEvidenceArtifact,
        chunkIndex: 0,
    },
    {
        ...docV3(
            "v3-broad-ve-src-2",
            DOMAINS.compliance,
            "Vendor SOC Report Retention",
            `SOC 2 and ISO 27001 evidence supplied by vendors is retained for 18 months after receipt unless contract terms require a longer hold. Critical vendors must provide fresh assurance evidence every 12 months. Archived copies are restricted to the security assurance team and procurement leadership.`,
            "text/plain",
            dateMonthsAgo(4),
        ),
        artifactKey: vendorEvidenceArtifact,
        chunkIndex: 1,
    },
    {
        ...docV3(
            "v3-broad-ve-src-3",
            DOMAINS.legal,
            "Vendor DPIA and Contract Evidence Retention",
            `Data protection impact assessments and signed security addenda for vendors are retained for the life of the contract plus 6 years. Offboarding requires procurement to confirm that non-required duplicate evidence copies are deleted from shared drives within 30 days.`,
            "text/plain",
            dateMonthsAgo(4),
        ),
        artifactKey: vendorEvidenceArtifact,
        chunkIndex: 2,
    },
    {
        ...docV3(
            "v3-broad-ve-summary",
            DOMAINS.compliance,
            "Vendor Security Evidence Retention Summary",
            `Vendor security evidence is retained on different schedules by evidence class: questionnaires for 24 months, assurance reports for 18 months, and DPIAs plus signed security terms for the contract lifetime plus 6 years. Critical vendors renew evidence annually and stale copies are archived or deleted under controlled workflows.`,
            "text/plain",
            dateMonthsAgo(4),
        ),
        artifactKey: vendorEvidenceArtifact,
        contentType: "hierarchical_summary",
        chunkIndex: 3,
        processingMetadata: {
            source_chunk_ids: ["v3-broad-ve-src-1", "v3-broad-ve-src-2", "v3-broad-ve-src-3"],
        },
    },
];

export const CAT7_DOCS: CorpusDocV2[] = [...remoteAccessDocs, ...vendorEvidenceDocs];

export const CAT7_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What are the current remote access requirements for privileged administrators?",
        mode: "verified",
        topK: 8,
        expectedDocIds: ["v3-broad-ra-src-1", "v3-broad-ra-src-2", "v3-broad-ra-src-3", "v3-broad-ra-summary"],
    },
    {
        query: "What is Meridian's vendor security evidence retention policy?",
        mode: "verified",
        topK: 8,
        expectedDocIds: ["v3-broad-ve-src-1", "v3-broad-ve-src-2", "v3-broad-ve-src-3", "v3-broad-ve-summary"],
    },
];

export const CAT7_SUMMARY_IDS = ["v3-broad-ra-summary", "v3-broad-ve-summary"] as const;
