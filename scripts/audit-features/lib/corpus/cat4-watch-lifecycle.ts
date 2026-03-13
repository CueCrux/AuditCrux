/**
 * Cat 4 — Watch Lifecycle (Living State Transitions)
 *
 * 20 docs across 4 lifecycle scenarios testing living state management:
 *   - Scenario A: Clean supersession chain (active → superseded)
 *   - Scenario B: Contested state (contradicting docs → contested status)
 *   - Scenario C: Stale decay (no updates past review window → stale)
 *   - Scenario D: Complex lifecycle (dormant → active → contested → superseded → deprecated)
 *
 * Tests:
 *   - Living state correctness after ingestion
 *   - State transition accuracy (supersession, contradiction, elaboration)
 *   - Stale detection based on next_review_at window
 *   - Confidence score propagation
 *   - Multi-step lifecycle chains
 *
 * Evaluated via DB state queries (no API calls) — tests the WatchCrux
 * state resolver directly.
 */

import type { CorpusDocV2, CorpusRelation, LivingState } from "../types-features.js";
import type { WatchScenario } from "../types-features.js";
import { DOMAINS, docFeature, dateDays } from "../tenant.js";

// ── Scenario A: Clean Supersession Chain ─────────────────────────────────
// v1 → v2 → v3. Each version supersedes the previous.
// Expected: v1=superseded, v2=superseded, v3=active

const scenarioA: CorpusDocV2[] = [
    docFeature(
        "ft-watch-a1",
        DOMAINS.security,
        "TLS Configuration Standard v1",
        `# TLS Configuration Standard v1

## Minimum Requirements
- TLS 1.2 minimum for all external-facing endpoints
- TLS 1.1 permitted for internal services (legacy compatibility)
- Cipher suites: ECDHE-RSA-AES256-GCM-SHA384 preferred
- Certificate key size: RSA 2048-bit minimum

## Certificate Management
- Public certificates via Let's Encrypt (90-day auto-renewal)
- Internal certificates via self-signed CA (365-day validity)

Effective: T0
Approved by: Security Architecture Board`,
        "text/markdown",
        dateDays(0),
    ),

    docFeature(
        "ft-watch-a2",
        DOMAINS.security,
        "TLS Configuration Standard v2",
        `# TLS Configuration Standard v2

Supersedes TLS Configuration Standard v1.

## Changes from v1
- TLS 1.3 required for all external endpoints (TLS 1.2 deprecated for external)
- TLS 1.2 minimum for internal services (TLS 1.1 removed)
- Added ECDSA P-256 certificate support
- HSTS preload enabled for all production domains

## Cipher Suites (Priority Order)
1. TLS_AES_256_GCM_SHA384 (TLS 1.3)
2. TLS_CHACHA20_POLY1305_SHA256 (TLS 1.3)
3. ECDHE-ECDSA-AES256-GCM-SHA384 (TLS 1.2 fallback)

## Certificate Management
- Public certificates via ACM (auto-renewal, no expiry management needed)
- Internal certificates via Vault PKI (24-hour validity, auto-rotation)

Effective: T0+60d
Approved by: Security Architecture Board`,
        "text/markdown",
        dateDays(60),
    ),

    docFeature(
        "ft-watch-a3",
        DOMAINS.security,
        "TLS Configuration Standard v3",
        `# TLS Configuration Standard v3

Supersedes TLS Configuration Standard v2.

## Changes from v2
- TLS 1.3 required for ALL endpoints (internal and external)
- TLS 1.2 removed entirely — no fallback
- Post-quantum key exchange: X25519Kyber768 experimental support enabled
- Certificate Transparency log monitoring mandatory

## Removed
- All TLS 1.2 cipher suites removed from allowlist
- RSA key exchange removed (forward secrecy required)

## Certificate Management
- Public: ACM with Certificate Transparency monitoring (crt.sh alerts)
- Internal: Vault PKI with 1-hour leaf certificates (reduced from 24h)
- OCSP stapling required on all endpoints

Effective: T0+180d
Approved by: Security Architecture Board`,
        "text/markdown",
        dateDays(180),
    ),
];

const scenarioARelations: CorpusRelation[] = [
    { srcId: "ft-watch-a2", dstId: "ft-watch-a1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "ft-watch-a3", dstId: "ft-watch-a2", relationType: "supersedes", confidence: 0.95 },
];

// ── Scenario B: Contested State ──────────────────────────────────────────
// Two teams publish conflicting guidance. Neither supersedes the other.
// Expected: both contested until resolution doc arrives.

const scenarioB: CorpusDocV2[] = [
    docFeature(
        "ft-watch-b1",
        DOMAINS.eng,
        "Logging Standard — Structured JSON",
        `# Logging Standard: Structured JSON

All services must emit structured JSON logs with the following schema:
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "service-name",
  "trace_id": "W3C trace ID",
  "message": "Human-readable message",
  "context": { "user_id": "...", "request_id": "..." }
}

## Rules
- No PII in log messages (mask or hash sensitive fields)
- Maximum log line: 8KB (truncate context if needed)
- Log levels: ERROR for failures, WARN for degraded, INFO for business events, DEBUG for development only
- DEBUG logs must NOT be enabled in production

Effective: T0+30d
Approved by: Platform Engineering`,
        "text/markdown",
        dateDays(30),
    ),

    docFeature(
        "ft-watch-b2",
        DOMAINS.platform,
        "Logging Standard — ECS Format",
        `# Logging Standard: Elastic Common Schema (ECS)

All services must emit logs conforming to Elastic Common Schema (ECS) format:
- @timestamp: ISO8601
- ecs.version: "8.0"
- log.level: "info|warn|error|debug"
- service.name: "service-name"
- trace.id: "W3C trace ID"
- message: "Human-readable message"
- labels: { "user_id": "...", "request_id": "..." }

## Additional ECS Fields Required
- host.name: Container hostname
- container.id: Docker container ID
- cloud.region: Deployment region
- event.duration: Request duration in nanoseconds

## Rationale
ECS provides richer metadata for observability tooling (Elasticsearch, Kibana)
and enables cross-service correlation without custom parsing rules.

Effective: T0+35d
Approved by: Observability Team`,
        "text/markdown",
        dateDays(35),
    ),

    docFeature(
        "ft-watch-b3",
        DOMAINS.eng,
        "Logging Standard — Unified Resolution",
        `# Logging Standard: Unified Format (Resolution)

This document resolves the conflicting logging standards (Structured JSON and ECS).

## Decision
Adopt ECS as the base format with Meridian-specific extensions:
- Use ECS field names for all standard fields
- Add "meridian.*" namespace for custom fields not covered by ECS
- JSON output format (compatible with both standards)

## Migration Plan
- Phase 1 (T0+90d): New services must use unified format
- Phase 2 (T0+120d): Existing services migrate (engineering-led)
- Phase 3 (T0+150d): Legacy format support removed from log pipeline

This document supersedes both the Structured JSON and ECS Format standards.

Effective: T0+80d
Approved by: VP Engineering`,
        "text/markdown",
        dateDays(80),
    ),
];

const scenarioBRelations: CorpusRelation[] = [
    { srcId: "ft-watch-b2", dstId: "ft-watch-b1", relationType: "contradicts", confidence: 0.85 },
    { srcId: "ft-watch-b1", dstId: "ft-watch-b2", relationType: "contradicts", confidence: 0.85 },
    { srcId: "ft-watch-b3", dstId: "ft-watch-b1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "ft-watch-b3", dstId: "ft-watch-b2", relationType: "supersedes", confidence: 0.95 },
];

// ── Scenario C: Stale Decay ──────────────────────────────────────────────
// Docs that haven't been updated or reviewed past their next_review_at.
// Tests whether the watch system marks them stale.

const scenarioC: CorpusDocV2[] = [
    docFeature(
        "ft-watch-c1",
        DOMAINS.compliance,
        "Vendor Risk Assessment — Q1 2024",
        `# Vendor Risk Assessment — Q1 2024

## Summary
Risk assessment of all Tier 1 vendors completed for Q1 2024.

| Vendor | Risk Score | Trend | Next Review |
|--------|-----------|-------|-------------|
| AWS | Low (12) | Stable | Q2 2024 |
| Stripe | Low (8) | Stable | Q2 2024 |
| Twilio | Medium (34) | Increasing | Q2 2024 |
| Datadog | Low (15) | Stable | Q2 2024 |

## Findings
- Twilio risk increased due to reported data incident in December 2023
- All other vendors within acceptable risk parameters
- Recommendation: Increase monitoring frequency for Twilio to monthly

## Action Items
- Schedule Twilio security review call (Security Team — due Q2 2024)
- Update DPA with enhanced breach notification clause (Legal — due Q2 2024)

Approved by: Risk Committee
Review date: 2024-03-15
Next review: 2024-06-15`,
        "text/markdown",
        dateDays(0),  // Published T0, review was due 3 months later — now stale
    ),

    docFeature(
        "ft-watch-c2",
        DOMAINS.compliance,
        "Vendor Risk Assessment — Q2 2024",
        `# Vendor Risk Assessment — Q2 2024

## Summary
Follow-up assessment — Twilio risk monitored.

| Vendor | Risk Score | Trend | Next Review |
|--------|-----------|-------|-------------|
| AWS | Low (11) | Stable | Q3 2024 |
| Stripe | Low (7) | Improving | Q3 2024 |
| Twilio | Medium (29) | Decreasing | Q3 2024 |
| Datadog | Low (14) | Stable | Q3 2024 |

## Findings
- Twilio completed remediation of December incident
- Risk score trending down, expected to return to Low by Q3
- New vendor evaluation initiated: Resend (email service)

Approved by: Risk Committee
Review date: 2024-06-15
Next review: 2024-09-15`,
        "text/markdown",
        dateDays(90),  // Published T0+90d, review was due T0+180d — now stale
    ),

    docFeature(
        "ft-watch-c3",
        DOMAINS.security,
        "Penetration Test Report — Annual 2024",
        `# Penetration Test Report — Annual 2024

## Engagement Details
- Firm: CrowdStrike Services
- Scope: External perimeter, web application, internal network
- Duration: 2024-02-01 to 2024-02-15
- Methodology: OWASP Testing Guide v4, PTES

## Executive Summary
Overall security posture: GOOD
- Critical findings: 0
- High findings: 2 (both remediated)
- Medium findings: 7 (5 remediated, 2 accepted risk)
- Low findings: 18

## Key Findings (High)
1. Insecure direct object reference in /api/v2/users/{id}/documents
   - Remediated: Added authorization check (2024-02-20)
2. Missing rate limiting on /api/v1/auth/reset-password
   - Remediated: Added 3 req/min limit per email (2024-02-22)

## Retest
Retest of High findings confirmed remediation on 2024-03-01.

Next annual test scheduled: 2025-02-01`,
        "text/markdown",
        dateDays(30),  // Published T0+30d — annual retest overdue
    ),
];

const scenarioCRelations: CorpusRelation[] = [
    { srcId: "ft-watch-c2", dstId: "ft-watch-c1", relationType: "supersedes", confidence: 0.9 },
];

// ── Scenario D: Full Lifecycle ───────────────────────────────────────────
// Document goes through: dormant → active → contested → superseded → deprecated
// Tests the complete lifecycle progression.

const scenarioD: CorpusDocV2[] = [
    docFeature(
        "ft-watch-d1",
        DOMAINS.product,
        "Feature Proposal: Real-Time Notifications (Draft)",
        `# Feature Proposal: Real-Time Notifications (DRAFT)

## Status: DRAFT — Not approved for implementation

## Proposal
Add WebSocket-based real-time notifications to the Meridian platform.

## Motivation
Current polling-based notification check (every 60 seconds) causes:
- Unnecessary API load (estimated 15% of total API calls)
- Poor user experience (up to 60-second delay on notifications)

## Proposed Architecture
- WebSocket gateway (Socket.IO) deployed in each region
- Redis Pub/Sub for cross-instance message fan-out
- Fallback to SSE for clients behind restrictive proxies

## Open Questions
- How to handle notification delivery guarantees (at-least-once vs at-most-once)?
- Mobile push notification integration?

Author: Senior Engineer
Submitted: T0+10d`,
        "text/markdown",
        dateDays(10),  // dormant — draft, not approved
    ),

    docFeature(
        "ft-watch-d2",
        DOMAINS.product,
        "Real-Time Notifications — Approved Design",
        `# Real-Time Notifications — Approved Design

## Status: APPROVED

Supersedes the draft proposal. This is the approved implementation plan.

## Architecture Decision
- Protocol: WebSocket (RFC 6455) with Socket.IO client library
- Transport fallback: Long-polling (not SSE — better proxy compatibility)
- Backend: Dedicated notification-svc (Node.js, 4 replicas per region)
- Pub/Sub: Redis Streams (not Pub/Sub — persistence and consumer groups)

## Delivery Guarantees
- At-least-once delivery with client-side deduplication (message ID)
- Offline queue: Messages stored for 24 hours for disconnected clients
- Acknowledgement: Client must ACK within 30 seconds (auto-retry 3x)

## Mobile Push
- Firebase Cloud Messaging (FCM) for Android
- Apple Push Notification Service (APNs) for iOS
- Unified push via notification-svc (same message routed to WebSocket + push)

Approved by: VP Product + VP Engineering
Effective: T0+40d`,
        "text/markdown",
        dateDays(40),  // active — approved, supersedes draft
    ),

    docFeature(
        "ft-watch-d3",
        DOMAINS.eng,
        "Real-Time Notifications — Socket.IO Performance Concern",
        `# Performance Concern: Socket.IO Memory Leak

From: SRE Team
Date: T0+100d

## Issue
Load testing of the notification-svc reveals a memory leak in Socket.IO:
- Memory grows linearly at ~50MB/hour under 10K concurrent connections
- OOM kill after approximately 12 hours of sustained load
- Root cause: Socket.IO v4 transport upgrade handler not releasing buffers

## Impact
This CONTRADICTS the approved design's choice of Socket.IO as the WebSocket library.

## Recommendation
Switch to native ws library (https://github.com/websockets/ws):
- No transport upgrade overhead (pure WebSocket)
- 3x lower memory footprint in our benchmarks
- Requires implementing reconnection logic (Socket.IO handled this automatically)

## Risk
Switching libraries may delay the feature launch by 2-3 weeks.

Filed by: SRE Lead`,
        "text/markdown",
        dateDays(100),  // contested — contradicts approved design
    ),

    docFeature(
        "ft-watch-d4",
        DOMAINS.product,
        "Real-Time Notifications — Revised Design v2",
        `# Real-Time Notifications — Revised Design v2

## Status: APPROVED

Supersedes the original approved design. Incorporates SRE performance feedback.

## Changes from v1 Design
- WebSocket library: ws (native) replaces Socket.IO
- Reconnection: Custom reconnection handler with exponential backoff (1s → 30s cap)
- Transport: Pure WebSocket only (removed long-polling fallback)
- Proxy compatibility: Reverse proxy WebSocket upgrade support documented per-provider

## Performance Validation
- Memory stable at 200MB for 50K concurrent connections (24h soak test)
- p99 message delivery latency: 45ms (was 120ms with Socket.IO)
- No OOM events in 72-hour stress test

## Timeline
- Implementation: T0+110d to T0+130d
- Staging validation: T0+130d to T0+140d
- Production rollout: T0+145d (canary → GA)

Approved by: VP Product + VP Engineering
Effective: T0+105d`,
        "text/markdown",
        dateDays(105),  // active — supersedes both v1 design and contradicting concern
    ),

    docFeature(
        "ft-watch-d5",
        DOMAINS.product,
        "Real-Time Notifications — Deprecation Notice",
        `# Real-Time Notifications v1 — Deprecation Notice

## Deprecation
The WebSocket-based real-time notification system (v1) is deprecated as of T0+300d.

## Replacement
Real-time notifications are now delivered via the Meridian Event Streaming Platform (ESP)
using Server-Sent Events (SSE) with a Kafka-backed event bus.

## Migration Timeline
- T0+300d: Deprecation announced, new clients must use ESP
- T0+330d: WebSocket endpoint marked as sunset (Sunset HTTP header)
- T0+360d: WebSocket endpoint decommissioned

## Why
- SSE+Kafka provides better delivery guarantees than WebSocket+Redis
- Unified event bus for notifications, webhooks, and real-time analytics
- Reduced operational complexity (1 system instead of 3)

All notification-svc documentation should be considered deprecated.

Approved by: VP Engineering
Effective: T0+300d`,
        "text/markdown",
        dateDays(300),  // deprecated — entire feature replaced
    ),
];

const scenarioDRelations: CorpusRelation[] = [
    { srcId: "ft-watch-d2", dstId: "ft-watch-d1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "ft-watch-d3", dstId: "ft-watch-d2", relationType: "contradicts", confidence: 0.9 },
    { srcId: "ft-watch-d4", dstId: "ft-watch-d2", relationType: "supersedes", confidence: 0.95 },
    { srcId: "ft-watch-d4", dstId: "ft-watch-d3", relationType: "supersedes", confidence: 0.85 },
    { srcId: "ft-watch-d5", dstId: "ft-watch-d4", relationType: "supersedes", confidence: 0.95 },
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT4_DOCS: CorpusDocV2[] = [
    ...scenarioA,
    ...scenarioB,
    ...scenarioC,
    ...scenarioD,
];

export const CAT4_RELATIONS: CorpusRelation[] = [
    ...scenarioARelations,
    ...scenarioBRelations,
    ...scenarioCRelations,
    ...scenarioDRelations,
];

/**
 * Living states set to match expected states after all relations are resolved.
 * The test verifies the DB contains these states after ingestion.
 */
export const CAT4_LIVING_STATES: LivingState[] = [
    // Scenario A: clean supersession chain
    { artifactId: "ft-watch-a1", livingStatus: "superseded", confidence: 0.95 },
    { artifactId: "ft-watch-a2", livingStatus: "superseded", confidence: 0.95 },
    { artifactId: "ft-watch-a3", livingStatus: "active", confidence: 0.95 },
    // Scenario B: contested → resolved
    { artifactId: "ft-watch-b1", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "ft-watch-b2", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "ft-watch-b3", livingStatus: "active", confidence: 0.95 },
    // Scenario C: stale documents (review overdue)
    { artifactId: "ft-watch-c1", livingStatus: "stale", confidence: 0.7 },
    { artifactId: "ft-watch-c2", livingStatus: "stale", confidence: 0.7 },
    { artifactId: "ft-watch-c3", livingStatus: "stale", confidence: 0.7 },
    // Scenario D: full lifecycle
    { artifactId: "ft-watch-d1", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "ft-watch-d2", livingStatus: "superseded", confidence: 0.9 },
    { artifactId: "ft-watch-d3", livingStatus: "deprecated", confidence: 0.8 },
    { artifactId: "ft-watch-d4", livingStatus: "superseded", confidence: 0.95 },
    { artifactId: "ft-watch-d5", livingStatus: "deprecated", confidence: 0.9 },
];

/**
 * Watch scenarios with expected lifecycle states.
 * Each scenario tests a specific lifecycle pattern.
 */
export const WATCH_SCENARIOS: WatchScenario[] = [
    {
        id: "scenario_a",
        label: "Clean Supersession Chain",
        description: "Linear v1 → v2 → v3 supersession. Latest version should be active, all prior superseded.",
        checkpoints: [
            { docId: "ft-watch-a1", expectedStatus: "superseded", label: "TLS v1 (original)" },
            { docId: "ft-watch-a2", expectedStatus: "superseded", label: "TLS v2 (intermediate)" },
            { docId: "ft-watch-a3", expectedStatus: "active", label: "TLS v3 (current)" },
        ],
    },
    {
        id: "scenario_b",
        label: "Contested → Resolved",
        description: "Two conflicting standards resolved by a unifying document. Both originals superseded.",
        checkpoints: [
            { docId: "ft-watch-b1", expectedStatus: "superseded", label: "JSON logging (superseded)" },
            { docId: "ft-watch-b2", expectedStatus: "superseded", label: "ECS logging (superseded)" },
            { docId: "ft-watch-b3", expectedStatus: "active", label: "Unified logging (resolution)" },
        ],
    },
    {
        id: "scenario_c",
        label: "Stale Decay",
        description: "Documents past their review window should be marked stale.",
        checkpoints: [
            { docId: "ft-watch-c1", expectedStatus: "stale", label: "Q1 2024 vendor assessment (overdue)" },
            { docId: "ft-watch-c2", expectedStatus: "stale", label: "Q2 2024 vendor assessment (overdue)" },
            { docId: "ft-watch-c3", expectedStatus: "stale", label: "2024 pen test report (overdue)" },
        ],
    },
    {
        id: "scenario_d",
        label: "Full Lifecycle",
        description: "Complete lifecycle: draft → approved → contested → revised → deprecated.",
        checkpoints: [
            { docId: "ft-watch-d1", expectedStatus: "superseded", label: "Draft proposal (superseded by approval)" },
            { docId: "ft-watch-d2", expectedStatus: "superseded", label: "Approved v1 (superseded by v2)" },
            { docId: "ft-watch-d3", expectedStatus: "deprecated", label: "Performance concern (addressed)" },
            { docId: "ft-watch-d4", expectedStatus: "superseded", label: "Revised v2 (superseded by deprecation)" },
            { docId: "ft-watch-d5", expectedStatus: "deprecated", label: "Deprecation notice (end of lifecycle)" },
        ],
    },
];
