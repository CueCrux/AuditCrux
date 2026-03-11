/**
 * Cat 4 — Early Lifecycle Timestamp Edge Cases
 *
 * 3 patterns × 4 docs = 12 docs, evaluated via DB state checks (no API queries).
 *
 * Reproduces the 3 misclassification patterns from v2 Cat 4:
 * - Pattern A: contested → superseded (resolver overwrites contested state)
 * - Pattern B: active → superseded at rapid succession boundary
 * - Pattern C: active → missing near 90-day window edge
 */

import type { CorpusDocV2, CorpusRelation, LivingState } from "../types-v3.js";
import { DOMAINS, docV3, dateDays } from "../tenant.js";

// ── Pattern A: Contested → Superseded ─────────────────────────────────────
// v1 published → v2 supersedes v1 → contradiction of v2 → v2.1 resolves
// At T0+20d: v2 should be "contested" (due to contradiction), not "superseded"

const patternA: CorpusDocV2[] = [
    docV3("v3-ts-a1", DOMAINS.security, "Secret Rotation Policy v1",
        `# Secret Rotation Policy v1

All database credentials, API keys, and TLS certificates must be rotated on a fixed schedule:
- Database credentials: every 30 days
- API keys: every 90 days
- TLS certificates: every 365 days

Rotation is performed manually by the security team using the key-rotation-tool CLI.

Effective: T0
Approved by: Bob Martinez, Security Lead`,
        "text/markdown", dateDays(0)),

    docV3("v3-ts-a2", DOMAINS.security, "Secret Rotation Policy v2",
        `# Secret Rotation Policy v2

This policy supersedes Secret Rotation Policy v1.

All secret rotation is now automated via HashiCorp Vault:
- Database credentials: rotated every 24 hours (dynamic secrets)
- API keys: rotated every 60 days (automated via Vault transit)
- TLS certificates: rotated every 90 days (cert-manager + Vault PKI)

Manual rotation is deprecated. Emergency rotation triggered via Vault API.

Effective: T0+10d
Approved by: Bob Martinez, Security Lead`,
        "text/markdown", dateDays(10)),

    docV3("v3-ts-a3", DOMAINS.security, "Secret Rotation v2 Bug Report",
        `From: Hasan Patel <hpatel@meridian.test>
Date: T0+12d
Subject: RE: Secret Rotation v2 — Critical Bug

Team,

v2 policy has a critical issue: Vault dynamic secrets for database credentials are rotating every 24 hours but the connection pool isn't being refreshed. This causes intermittent 500 errors every morning when old credentials expire.

We need to revert to the v1 manual rotation schedule for database credentials until this is fixed. API key and TLS cert rotation via Vault is working fine.

Do NOT use v2's database credential rotation until further notice.

Hasan Patel, Security Engineer`,
        "text/plain", dateDays(12)),

    docV3("v3-ts-a4", DOMAINS.security, "Secret Rotation Policy v2.1",
        `# Secret Rotation Policy v2.1

This policy supersedes Secret Rotation Policy v2 and resolves the database credential rotation issue.

Changes from v2:
- Database credentials: rotated every 48 hours (was 24h) with connection pool pre-warming
- Added health check: rotation only proceeds if connection pool refresh succeeds
- Rollback: automatic revert to previous credentials if health check fails

Unchanged from v2:
- API keys: 60-day automated rotation via Vault transit
- TLS certificates: 90-day rotation via cert-manager + Vault PKI

Effective: T0+25d
Approved by: Bob Martinez, Security Lead`,
        "text/markdown", dateDays(25)),
];

const patternARelations: CorpusRelation[] = [
    { srcId: "v3-ts-a2", dstId: "v3-ts-a1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v3-ts-a3", dstId: "v3-ts-a2", relationType: "contradicts", confidence: 0.9 },
    { srcId: "v3-ts-a4", dstId: "v3-ts-a2", relationType: "supersedes", confidence: 0.95 },
];

// ── Pattern B: Rapid Succession (4 versions in 10 days) ──────────────────
// Test that the LATEST version is correctly marked "active" when multiple
// supersession events happen in rapid succession.

const patternB: CorpusDocV2[] = [
    docV3("v3-ts-b1", DOMAINS.platform, "Monitoring Thresholds v1",
        `# Monitoring Thresholds v1
Warning: p95 > 300ms. Critical: p99 > 1000ms. Evaluation window: 10 minutes.
Effective: T0+80d`,
        "text/markdown", dateDays(80)),

    docV3("v3-ts-b2", DOMAINS.platform, "Monitoring Thresholds v2",
        `# Monitoring Thresholds v2
Supersedes Monitoring Thresholds v1.
Warning: p95 > 250ms. Critical: p99 > 800ms. Evaluation window: 5 minutes.
Tightened thresholds based on Q2 baseline analysis.
Effective: T0+85d`,
        "text/markdown", dateDays(85)),

    docV3("v3-ts-b3", DOMAINS.platform, "Monitoring Thresholds v2 Errata",
        `# Monitoring Thresholds v2 — Errata
The critical threshold in v2 (p99 > 800ms) causes excessive false positives during batch processing windows. Updated to p99 > 750ms with a batch-window exclusion between 02:00-04:00 UTC.
This errata supports and amends v2 but does not supersede it.
Effective: T0+88d`,
        "text/markdown", dateDays(88)),

    docV3("v3-ts-b4", DOMAINS.platform, "Monitoring Thresholds v2.1",
        `# Monitoring Thresholds v2.1
Supersedes Monitoring Thresholds v2 and incorporates errata.
Warning: p95 > 250ms. Critical: p99 > 750ms (with batch-window exclusion 02:00-04:00 UTC).
Emergency: p99 > 2000ms (1-minute window, no exclusions).
Effective: T0+89d`,
        "text/markdown", dateDays(89)),
];

const patternBRelations: CorpusRelation[] = [
    { srcId: "v3-ts-b2", dstId: "v3-ts-b1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v3-ts-b3", dstId: "v3-ts-b2", relationType: "elaborates", confidence: 0.85 },
    { srcId: "v3-ts-b4", dstId: "v3-ts-b2", relationType: "supersedes", confidence: 0.95 },
];

// ── Pattern C: Window Boundary (docs near 90-day edge) ───────────────────
// Docs published near the 90-day window boundary. Test whether the living
// state resolver assigns state to all of them or "misses" boundary docs.

const patternC: CorpusDocV2[] = [
    docV3("v3-ts-c1", DOMAINS.eng, "Deployment Freeze Policy — Inside Window",
        `# Deployment Freeze Policy (v1)
No production deployments permitted during the last 5 business days of each quarter. Exceptions require VP Engineering approval.
Effective: T0+85d (inside 90-day window from T0+180d)`,
        "text/markdown", dateDays(85)),

    docV3("v3-ts-c2", DOMAINS.eng, "Deployment Freeze Policy — Barely Inside",
        `# Deployment Freeze Policy (v1.1 addendum)
Addendum: Hotfixes for Tier 4 security incidents are exempt from the deployment freeze.
Effective: T0+88d (barely inside 90-day window)`,
        "text/markdown", dateDays(88)),

    docV3("v3-ts-c3", DOMAINS.eng, "Deployment Freeze Policy — At Boundary",
        `# Deployment Freeze Policy (v2)
Supersedes v1. Updated freeze window: last 3 business days (was 5). Security hotfixes and data-loss-prevention changes are always exempt.
Effective: T0+91d (at 90-day window boundary)`,
        "text/markdown", dateDays(91)),

    docV3("v3-ts-c4", DOMAINS.eng, "Deployment Freeze Policy — Outside Window",
        `# Deployment Freeze Policy (v2.1)
Minor update to v2: added monitoring-only deployments to the exemption list.
Effective: T0+95d (outside 90-day window from T0)`,
        "text/markdown", dateDays(95)),
];

const patternCRelations: CorpusRelation[] = [
    { srcId: "v3-ts-c2", dstId: "v3-ts-c1", relationType: "elaborates", confidence: 0.85 },
    { srcId: "v3-ts-c3", dstId: "v3-ts-c1", relationType: "supersedes", confidence: 0.9 },
    { srcId: "v3-ts-c4", dstId: "v3-ts-c3", relationType: "elaborates", confidence: 0.8 },
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT4_DOCS: CorpusDocV2[] = [...patternA, ...patternB, ...patternC];

export const CAT4_RELATIONS: CorpusRelation[] = [
    ...patternARelations,
    ...patternBRelations,
    ...patternCRelations,
];

/**
 * Living states set manually to match expected states.
 * The test checks whether the DB agrees with these after ingestion.
 */
export const CAT4_LIVING_STATES: LivingState[] = [
    // Pattern A at T0+30d
    { artifactId: "v3-ts-a1", livingStatus: "superseded", confidence: 0.95 },
    { artifactId: "v3-ts-a2", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "v3-ts-a3", livingStatus: "deprecated", confidence: 0.8 },
    { artifactId: "v3-ts-a4", livingStatus: "active", confidence: 0.95 },
    // Pattern B at T0+120d
    { artifactId: "v3-ts-b1", livingStatus: "superseded", confidence: 0.95 },
    { artifactId: "v3-ts-b2", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "v3-ts-b3", livingStatus: "deprecated", confidence: 0.8 },
    { artifactId: "v3-ts-b4", livingStatus: "active", confidence: 0.95 },
    // Pattern C at T0+120d
    { artifactId: "v3-ts-c1", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "v3-ts-c2", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v3-ts-c3", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v3-ts-c4", livingStatus: "active", confidence: 0.85 },
];

/**
 * Ground truth: expected living state at specific time points.
 * Pattern A checks contested vs superseded distinction.
 * Pattern B checks rapid succession latest-is-active.
 * Pattern C checks window boundary visibility.
 */
export const CAT4_TEMPORAL_TRUTH = {
    patternA: {
        label: "Contested vs Superseded",
        expectedStates: [
            { docId: "v3-ts-a1", expectedStatus: "superseded" },
            { docId: "v3-ts-a2", expectedStatus: "superseded" }, // was contested, resolved by v2.1
            { docId: "v3-ts-a3", expectedStatus: "deprecated" },
            { docId: "v3-ts-a4", expectedStatus: "active" },
        ],
    },
    patternB: {
        label: "Rapid Succession",
        expectedStates: [
            { docId: "v3-ts-b1", expectedStatus: "superseded" },
            { docId: "v3-ts-b2", expectedStatus: "superseded" },
            { docId: "v3-ts-b3", expectedStatus: "deprecated" }, // errata for superseded doc
            { docId: "v3-ts-b4", expectedStatus: "active" },    // latest must be active
        ],
    },
    patternC: {
        label: "Window Boundary Visibility",
        expectedStates: [
            { docId: "v3-ts-c1", expectedStatus: "superseded" },
            { docId: "v3-ts-c2", expectedStatus: "active" },  // elaboration of superseded, still active
            { docId: "v3-ts-c3", expectedStatus: "active" },  // latest superseding version
            { docId: "v3-ts-c4", expectedStatus: "active" },  // latest elaboration
        ],
    },
};
