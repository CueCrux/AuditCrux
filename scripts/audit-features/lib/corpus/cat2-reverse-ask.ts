/**
 * Cat 2 — Reverse Ask (Receipt Chain Verification)
 *
 * 4 docs (2 domain pairs for minDomains=2), 30 queries.
 * Queries build a receipt chain via /v1/answers, then verifies the chain
 * via /v1/receipts/:answerId/verify-chain at increasing depths.
 *
 * Tests:
 *   - Chain integrity across increasing depths (up to 30)
 *   - Verification latency scaling (should be sub-linear)
 *   - Chain breaks under concurrent query load
 *   - Receipt ID consistency between answer and verification
 *
 * Unlike v3 Cat 5 (50 queries, 2 docs, depth checkpoints only), this test
 * focuses on the reverse-ask flow: given an answer, can the provenance chain
 * be verified back to its source documents?
 */

import type { CorpusDocV2, GroundTruth } from "../types-features.js";
import { DOMAINS, docFeature, dateMonthsAgo } from "../tenant.js";

// ── Domain A: Incident Management ──────────────────────────────────────

const incidentPolicyDoc = docFeature(
    "ft-rev-a1",
    DOMAINS.ops,
    "Meridian Incident Classification Framework",
    `# Incident Classification Framework

## Severity Levels

### SEV-1 (Critical)
- Complete service outage affecting all users
- Data breach confirmed or in progress
- Financial processing halted
- Response: All-hands war room within 15 minutes
- Notification: CEO, CTO, CISO, Legal within 1 hour
- Target resolution: 4 hours

### SEV-2 (High)
- Partial service degradation affecting > 25% of users
- Single-region outage with failover active
- Payment processing delays > 5 minutes
- Response: Incident commander + on-call team within 30 minutes
- Notification: VP Engineering, VP Product within 2 hours
- Target resolution: 8 hours

### SEV-3 (Medium)
- Minor service degradation affecting < 25% of users
- Non-critical feature unavailable
- Performance degradation (p95 > 2x normal)
- Response: On-call engineer within 1 hour
- Target resolution: 24 hours

### SEV-4 (Low)
- Cosmetic issues, non-user-facing bugs
- Internal tool degradation
- Response: Next business day
- Target resolution: 5 business days

## Escalation Matrix
Each severity level has an auto-escalation timer. If the target resolution time elapses without resolution, the incident is automatically escalated one level up.

## Postmortem Requirements
- SEV-1 and SEV-2: Mandatory blameless postmortem within 48 hours
- SEV-3: Written incident summary within 5 business days
- SEV-4: Captured in team retrospective

Approved by: Engineering Leadership Team
Effective: 2025-04-01`,
    "text/markdown",
    dateMonthsAgo(5),
);

const incidentRunbookDoc = docFeature(
    "ft-rev-a2",
    DOMAINS.ops,
    "Meridian Incident Response Runbook — Communication",
    `# Incident Response Communication Runbook

## Status Page Updates
- SEV-1/SEV-2: Status page updated within 10 minutes of detection
- Update frequency: Every 30 minutes until resolved
- Template: "We are investigating [issue]. Impact: [description]. ETA: [estimate]."
- Post-resolution: "The issue has been resolved. Duration: [time]. Root cause: [summary]."

## Internal Communication
- Slack channel: #incident-{sev}-{date} (auto-created by PagerDuty)
- War room: Google Meet link auto-generated for SEV-1/SEV-2
- Updates to #engineering-all every 2 hours for SEV-1

## Customer Communication
- SEV-1: Proactive email to affected enterprise customers within 1 hour
- SEV-2: In-app banner notification for affected regions
- SEV-3/SEV-4: No proactive customer communication required

## Post-Incident Communication
- Root Cause Analysis (RCA) published to status page within 5 business days for SEV-1/SEV-2
- Internal RCA shared with all engineering within 3 business days
- Customer-facing RCA sent to enterprise customers for SEV-1

Approved by: Communications Team
Effective: 2025-04-15`,
    "text/markdown",
    dateMonthsAgo(5),
);

// ── Domain B: Change Management ────────────────────────────────────────

const changeManagementDoc = docFeature(
    "ft-rev-b1",
    DOMAINS.eng,
    "Meridian Change Advisory Board Process",
    `# Change Advisory Board (CAB) Process

## Scope
All production infrastructure changes require CAB review:
- Database schema changes (DDL)
- Network topology modifications
- Kubernetes cluster upgrades
- Third-party integration deployments
- Security policy changes

## Process
1. **Submit**: Engineer opens Change Request (CR) in ServiceNow
2. **Review**: CAB meets weekly (Tuesdays 14:00 UTC) to review CRs
3. **Approve/Reject**: Majority vote required (quorum = 3 of 5 members)
4. **Schedule**: Approved changes assigned to next available maintenance window
5. **Execute**: Change owner implements with rollback plan
6. **Verify**: Post-change verification within 1 hour
7. **Close**: CR closed with outcome documentation

## Emergency Changes
- Bypass CAB for SEV-1/SEV-2 incident remediation
- Retrospective CAB review within 48 hours
- Emergency change logged with justification

## CAB Members
- SRE Lead (permanent chair)
- Security Lead
- Database Administrator
- Network Engineer
- Rotating engineering representative

Meeting notes archived in Confluence: /wiki/cab-minutes/

Approved by: VP Engineering
Effective: 2025-02-01`,
    "text/markdown",
    dateMonthsAgo(7),
);

const releaseProcessDoc = docFeature(
    "ft-rev-b2",
    DOMAINS.eng,
    "Meridian Release Process — CI/CD Pipeline",
    `# Release Process — CI/CD Pipeline

## Pipeline Stages
1. **Build**: Docker image built from main branch (buildkit, multi-stage)
2. **Unit Tests**: Jest + pytest suites (must pass 100%)
3. **Integration Tests**: Against staging environment (must pass 95%+)
4. **Security Scan**: Snyk container scan + SAST (no critical/high findings)
5. **Staging Deploy**: Auto-deploy to staging namespace
6. **Smoke Tests**: Health check + core flow verification
7. **Production Deploy**: Canary → 10% → 50% → 100% (manual gate at 50%)
8. **Post-Deploy**: Automated rollback if error rate > 1% for 5 minutes

## Release Cadence
- Feature releases: Weekly (Wednesdays 10:00 UTC)
- Hotfixes: Any time with SEV-2+ justification
- Infrastructure: Monthly maintenance window (first Saturday)

## Rollback Policy
- Automated: If canary error rate > 1% or p99 > 3x baseline
- Manual: kubectl rollout undo deployment/{service} -n production
- Database rollback: Separate process (see Database Migration Runbook)

## Versioning
Semantic versioning: MAJOR.MINOR.PATCH
Git tags: v{version} on release commit
Container tags: {version}-{short-sha}

Approved by: Engineering Platform Team
Effective: 2025-03-01`,
    "text/markdown",
    dateMonthsAgo(6),
);

// ── Query Generator ─────────────────────────────────────────────────────

const INCIDENT_PARAPHRASES = [
    "What are the severity levels in Meridian's incident classification?",
    "How quickly must a SEV-1 incident be resolved?",
    "Who gets notified during a critical incident?",
    "What is the escalation process when incidents are not resolved on time?",
    "When is a blameless postmortem required?",
    "What defines a SEV-2 incident at Meridian?",
    "How are status page updates managed during incidents?",
    "What is the auto-escalation timer for incident severity levels?",
    "How is customer communication handled for SEV-1 incidents?",
    "What Slack channel naming convention is used for incidents?",
    "When must the root cause analysis be published for critical incidents?",
    "What response time is expected for SEV-3 incidents?",
    "How are war rooms set up during major incidents?",
    "What is the incident communication update frequency?",
    "When do enterprise customers receive proactive email about outages?",
];

const CHANGE_PARAPHRASES = [
    "What is the Change Advisory Board process at Meridian?",
    "How are production infrastructure changes approved?",
    "What types of changes require CAB review?",
    "How are emergency changes handled outside the CAB process?",
    "What is the release pipeline structure?",
    "When does automated rollback trigger?",
    "What is the production deployment cadence?",
    "How does canary deployment work at Meridian?",
    "What security scanning is done before deployment?",
    "Who are the CAB members?",
    "What is the ServiceNow change request workflow?",
    "What happens during the post-deploy monitoring phase?",
    "How are hotfixes deployed differently from feature releases?",
    "What is the staging deploy verification process?",
    "When is the monthly infrastructure maintenance window?",
];

/** Generate 30 queries: 15 per domain, interleaved */
export function generateReverseAskQueries(): GroundTruth[] {
    const queries: GroundTruth[] = [];
    for (let i = 0; i < 15; i++) {
        queries.push({
            query: INCIDENT_PARAPHRASES[i],
            mode: "verified",
            topK: 10,
            expectedDocIds: i < 8 ? ["ft-rev-a1"] : ["ft-rev-a2"],
        });
        queries.push({
            query: CHANGE_PARAPHRASES[i],
            mode: "verified",
            topK: 10,
            expectedDocIds: i < 8 ? ["ft-rev-b1"] : ["ft-rev-b2"],
        });
    }
    return queries;
}

/** Depth checkpoints for chain verification */
export const REVERSE_ASK_DEPTH_CHECKPOINTS = [5, 10, 15, 20, 25, 30];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT2_DOCS: CorpusDocV2[] = [
    incidentPolicyDoc,
    incidentRunbookDoc,
    changeManagementDoc,
    releaseProcessDoc,
];
