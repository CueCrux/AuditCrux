/**
 * Cat 8 — Proposition Precision@1
 *
 * 3 source artifacts, each with one source chunk and one derived proposition.
 * Targeted fact queries should rank the proposition chunk first in the
 * retrieved candidate list.
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

const privilegedLoginArtifact = "v3-prop-privileged-login";
const callRetentionArtifact = "v3-prop-call-retention";
const vendorKeyRotationArtifact = "v3-prop-vendor-key-rotation";

export const CAT8_DOCS: CorpusDocV2[] = [
    {
        ...docV3(
            "v3-prop-src-1",
            DOMAINS.security,
            "Privileged Login Protection Standard",
            `The privileged login protection standard covers multiple safeguards for administrative identities. Production admin accounts require phishing-resistant MFA, an interactive login banner, IP reputation checks, and lockout enforcement. When an administrator accumulates five failed login attempts within a rolling ten-minute window, the account is locked until the helpdesk completes identity verification and a security manager approves the unlock. Emergency break-glass accounts are monitored separately.`,
            "text/plain",
            dateMonthsAgo(1),
        ),
        artifactKey: privilegedLoginArtifact,
        chunkIndex: 0,
    },
    {
        ...docV3(
            "v3-prop-p1",
            DOMAINS.security,
            "Privileged Login Lockout Proposition",
            `Privileged administrator accounts lock after five failed login attempts within ten minutes.`,
            "text/plain",
            dateMonthsAgo(1),
        ),
        artifactKey: privilegedLoginArtifact,
        contentType: "proposition",
        chunkIndex: 1,
        processingMetadata: {
            source_chunk_ids: ["v3-prop-src-1"],
        },
    },
    {
        ...docV3(
            "v3-prop-src-2",
            DOMAINS.compliance,
            "Customer Support Recording Standard",
            `Customer support call recordings are captured for quality assurance, complaint handling, and fraud investigation. The retention schedule is split by queue type, but the default contact centre policy keeps ordinary support call recordings for one hundred and eighty days before deletion. Legal hold overrides the default and fraud investigation extracts can be retained longer when explicitly approved.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: callRetentionArtifact,
        chunkIndex: 0,
    },
    {
        ...docV3(
            "v3-prop-p2",
            DOMAINS.compliance,
            "Call Recording Retention Proposition",
            `Customer support call recordings are retained for 180 days before deletion.`,
            "text/plain",
            dateMonthsAgo(2),
        ),
        artifactKey: callRetentionArtifact,
        contentType: "proposition",
        chunkIndex: 1,
        processingMetadata: {
            source_chunk_ids: ["v3-prop-src-2"],
        },
    },
    {
        ...docV3(
            "v3-prop-src-3",
            DOMAINS.platform,
            "Third-Party Signing Key Standard",
            `Every third-party signing key used to verify inbound software artifacts must be rotated on a fixed schedule. The software supply chain standard sets the maximum lifetime of vendor signing keys at thirty days, requires publication of the new public key at least seventy-two hours before cutover, and mandates revocation of the prior key immediately after rotation completes.`,
            "text/plain",
            dateMonthsAgo(1),
        ),
        artifactKey: vendorKeyRotationArtifact,
        chunkIndex: 0,
    },
    {
        ...docV3(
            "v3-prop-p3",
            DOMAINS.platform,
            "Vendor Signing Key Rotation Proposition",
            `Third-party signing keys rotate every 30 days.`,
            "text/plain",
            dateMonthsAgo(1),
        ),
        artifactKey: vendorKeyRotationArtifact,
        contentType: "proposition",
        chunkIndex: 1,
        processingMetadata: {
            source_chunk_ids: ["v3-prop-src-3"],
        },
    },
];

export const CAT8_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What is the lockout threshold for privileged administrator accounts?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["v3-prop-p1"],
    },
    {
        query: "How long are customer support call recordings retained?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["v3-prop-p2"],
    },
    {
        query: "When must third-party signing keys rotate?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["v3-prop-p3"],
    },
];
