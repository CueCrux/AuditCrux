/**
 * Cat 1 — Ask Accuracy
 *
 * 16 docs, 12 queries across 4 complexity tiers (3 queries each):
 *   - Simple: single-doc factual lookups
 *   - Multi-hop: answer requires synthesising 2-3 docs
 *   - Adversarial: queries that could mislead (negation, near-miss vocabulary)
 *   - Ambiguous: queries matching multiple docs — tests ranking correctness
 *
 * Tests the /v1/answers endpoint across all engine modes.
 */

import type { CorpusDocV2, GroundTruth } from "../types-features.js";
import type { AskTier } from "../types-features.js";
import { DOMAINS, docFeature, dateMonthsAgo } from "../tenant.js";

// ── Simple-Tier Documents ────────────────────────────────────────────────
// Each doc answers exactly one factual question with no ambiguity.

const simpleDocs: CorpusDocV2[] = [
    docFeature(
        "ft-ask-s1",
        DOMAINS.security,
        "Meridian Password Policy — 2025",
        `# Meridian Password Policy

## Requirements
- Minimum length: 16 characters
- Must include: uppercase, lowercase, digit, special character
- Maximum age: 90 days
- Password history: last 12 passwords cannot be reused
- Lockout: 5 failed attempts triggers 30-minute lockout
- MFA: required for all accounts with admin or elevated privileges

## Exceptions
Service accounts use API key rotation (60-day cycle) instead of passwords.

Approved by: Security Architecture Board
Effective: 2025-03-01`,
        "text/markdown",
        dateMonthsAgo(6),
    ),

    docFeature(
        "ft-ask-s2",
        DOMAINS.infra,
        "Meridian Backup Retention Schedule",
        `# Backup Retention Schedule

| Data Class | Frequency | Retention | Location |
|-----------|-----------|-----------|----------|
| Production DB | Hourly WAL + Daily snapshot | 30 days WAL, 90 days snapshots | us-east-1 + eu-west-1 |
| Config & Secrets | On-change | 365 days | Vault HA cluster |
| Audit Logs | Continuous | 7 years (regulatory) | S3 Glacier Deep Archive |
| User Uploads | Daily incremental | 180 days | S3 Standard-IA |
| Analytics | Weekly full | 30 days | Redshift snapshots |

## Recovery Targets
- RPO (production): < 1 hour
- RTO (production): < 4 hours
- RPO (analytics): < 7 days

Approved by: James Okafor, CTO
Effective: 2025-01-15`,
        "text/markdown",
        dateMonthsAgo(8),
    ),

    docFeature(
        "ft-ask-s3",
        DOMAINS.hr,
        "Meridian On-Call Compensation Policy",
        `# On-Call Compensation Policy

## Rates
- Primary on-call: $500/week flat rate + incident bonus
- Secondary on-call: $250/week flat rate
- Incident bonus: $150 per Tier 3+ incident handled outside business hours
- Weekend shift premium: 1.5x base compensation

## Scheduling
- On-call rotations are 7 days (Monday 09:00 to Monday 09:00 UTC)
- Engineers may not be scheduled for consecutive on-call weeks
- Minimum 2 weeks gap between primary on-call assignments
- Swaps permitted with manager approval and 48h notice

## Escalation
If primary does not acknowledge within 15 minutes, auto-escalate to secondary.
If secondary does not acknowledge within 10 minutes, page engineering manager.

Approved by: Lisa Chen, VP People
Effective: 2025-04-01`,
        "text/markdown",
        dateMonthsAgo(5),
    ),

    docFeature(
        "ft-ask-s4",
        DOMAINS.finance,
        "Meridian Expense Reimbursement Limits",
        `# Expense Reimbursement Policy

## Per-Diem Limits (USD)
| Category | Domestic | International |
|----------|----------|---------------|
| Meals | $75/day | $100/day |
| Lodging | $200/night | $350/night |
| Ground Transport | $60/day | $80/day |
| Internet/Comms | $20/day | $30/day |

## Approval Thresholds
- < $500: Manager approval
- $500 - $2,000: Director approval
- $2,000 - $10,000: VP approval
- > $10,000: CFO approval

## Submission Deadline
All receipts must be submitted within 30 calendar days of expense date.
Late submissions require VP exception approval and may be denied.

Approved by: Maria Santos, CFO
Effective: 2025-02-01`,
        "text/markdown",
        dateMonthsAgo(7),
    ),
];

// ── Multi-Hop Documents ──────────────────────────────────────────────────
// Answers require combining information across 2-3 documents.

const multiHopDocs: CorpusDocV2[] = [
    docFeature(
        "ft-ask-m1",
        DOMAINS.platform,
        "Meridian Service Catalog — Authentication",
        `# Service Catalog: Authentication Service

## Overview
The Authentication Service (auth-svc) handles all identity operations for Meridian platform users.

## Endpoints
- POST /auth/login — password + MFA login
- POST /auth/token/refresh — JWT refresh
- POST /auth/logout — session invalidation
- GET /auth/whoami — current session info

## Dependencies
- User Store: PostgreSQL (users, roles, permissions tables)
- Session Store: Redis cluster (auth-sessions namespace)
- MFA Provider: Twilio Verify (SMS + TOTP)
- Rate Limiter: internal rate-limit-svc (10 req/s per IP)

## SLA
- Availability: 99.99% (authentication is a critical path dependency)
- p95 latency: < 200ms for /auth/login
- p99 latency: < 500ms for /auth/login`,
        "text/markdown",
        dateMonthsAgo(4),
    ),

    docFeature(
        "ft-ask-m2",
        DOMAINS.security,
        "Meridian Incident Runbook — Auth Service Outage",
        `# Incident Runbook: Authentication Service Outage

## Detection
Alert: auth-svc-health (PagerDuty, Tier 3)
Trigger: health check failures from 2+ regions for > 2 minutes

## Immediate Actions
1. Check auth-svc pod status: kubectl get pods -n auth
2. Check Redis cluster health: redis-cli -h auth-redis.internal cluster info
3. Check PostgreSQL connectivity: pg_isready -h auth-db.internal
4. Check rate-limit-svc: if rate limiter is down, auth-svc may be overwhelmed

## Escalation Path
- 0-5 min: On-call SRE triages
- 5-15 min: Escalate to auth-svc team lead
- 15-30 min: Incident commander (IC) from SRE leadership
- 30+ min: VP Engineering notified

## Rollback
If caused by recent deployment:
kubectl rollout undo deployment/auth-svc -n auth

## Post-Incident
Blameless postmortem within 48 hours. Template in Confluence: /wiki/postmortem-template`,
        "text/markdown",
        dateMonthsAgo(3),
    ),

    docFeature(
        "ft-ask-m3",
        DOMAINS.platform,
        "Meridian Redis Cluster Architecture",
        `# Redis Cluster Architecture

## Topology
- 6-node cluster (3 primary + 3 replica)
- Deployed in us-east-1 across 3 AZs
- Instance type: r6g.xlarge (32GB RAM, 4 vCPU)
- Persistence: AOF with fsync=everysec

## Namespaces
| Namespace | Purpose | Max Memory | Eviction Policy |
|-----------|---------|------------|----------------|
| auth-sessions | Authentication session tokens | 8GB | volatile-ttl |
| rate-limits | Request rate counters | 2GB | allkeys-lru |
| feature-flags | LaunchDarkly cache | 1GB | volatile-lru |
| api-cache | Response caching | 4GB | allkeys-lfu |

## Failover
- Automatic failover via Redis Sentinel with 3-node quorum
- Failover time: < 15 seconds
- Application retry: 3 attempts with exponential backoff (100ms, 500ms, 2s)

## Monitoring
- redis_connected_clients (alert > 5000)
- redis_used_memory_pct (alert > 85%)
- redis_keyspace_misses_ratio (alert > 0.5 sustained 5 min)`,
        "text/markdown",
        dateMonthsAgo(5),
    ),

    docFeature(
        "ft-ask-m4",
        DOMAINS.eng,
        "Meridian Rate Limiting Strategy",
        `# Rate Limiting Strategy

## Architecture
The rate-limit-svc is a dedicated service that enforces request limits across all Meridian APIs.

## Limits
| Endpoint Category | Limit | Window | Action |
|-------------------|-------|--------|--------|
| Authentication | 10 req/s per IP | Sliding window | 429 + Retry-After header |
| API (authenticated) | 100 req/s per tenant | Token bucket | 429 + rate limit headers |
| API (unauthenticated) | 20 req/s per IP | Fixed window | 429 + CAPTCHA challenge |
| Webhooks (outbound) | 50 req/s global | Token bucket | Queue backpressure |

## Storage
Rate counters stored in Redis cluster (rate-limits namespace).
Counter TTL matches the window duration to prevent stale data accumulation.

## Circuit Breaker
If rate-limit-svc is unreachable, APIs default to ALLOW (fail-open) for 60 seconds,
then switch to fixed local limits (50% of normal) until rate-limit-svc recovers.`,
        "text/markdown",
        dateMonthsAgo(4),
    ),
];

// ── Adversarial Documents ────────────────────────────────────────────────
// Docs designed to test negation handling and near-miss vocabulary.

const adversarialDocs: CorpusDocV2[] = [
    docFeature(
        "ft-ask-a1",
        DOMAINS.security,
        "Deprecated: Meridian SSO via SAML 2.0",
        `# SSO via SAML 2.0 (DEPRECATED)

THIS DOCUMENT IS DEPRECATED as of 2025-06-01. SAML 2.0 SSO is no longer supported.

All SSO integrations must use OpenID Connect (OIDC) as described in the current SSO documentation.
The SAML IdP certificate has been revoked and SAML endpoints have been decommissioned.

## Historical Reference Only
- IdP: Okta (saml.meridian.test — DECOMMISSIONED)
- SP: Meridian Platform (sp.meridian.test/saml/acs — REMOVED)
- Assertion lifetime: 5 minutes (was)
- Signature algorithm: RSA-SHA256 (was)

DO NOT configure any new SAML integrations. Contact security@meridian.test for OIDC migration assistance.`,
        "text/markdown",
        dateMonthsAgo(2),
    ),

    docFeature(
        "ft-ask-a2",
        DOMAINS.security,
        "Meridian SSO via OpenID Connect (Current)",
        `# SSO via OpenID Connect (OIDC)

## Overview
All Meridian SSO integrations use OIDC with PKCE. This is the only supported SSO protocol.

## Configuration
- Authorization endpoint: https://auth.meridian.test/oauth2/authorize
- Token endpoint: https://auth.meridian.test/oauth2/token
- JWKS URI: https://auth.meridian.test/.well-known/jwks.json
- Scopes: openid, profile, email, meridian:roles
- Token lifetime: Access=15min, Refresh=24h, ID=1h

## Integration Requirements
1. Register client via self-service portal (dev-portal.meridian.test)
2. PKCE is mandatory for all public clients
3. Redirect URIs must use HTTPS (localhost excepted for development)
4. Client credentials flow permitted for service-to-service only

Approved by: Security Architecture Board
Effective: 2025-06-01`,
        "text/markdown",
        dateMonthsAgo(2),
    ),

    docFeature(
        "ft-ask-a3",
        DOMAINS.compliance,
        "Meridian Data Deletion vs Data Retention Obligations",
        `# Data Deletion vs Retention — Conflict Resolution

## Problem Statement
GDPR Article 17 (Right to Erasure) may conflict with financial record retention obligations (7 years under SOX/AML).

## Resolution Framework
1. **Categorise data**: Determine if data falls under financial record retention mandates
2. **Financial records**: Subject to 7-year hold. GDPR erasure requests are acknowledged but deferred with documented legal basis (Article 17(3)(b) — legal obligation)
3. **Non-financial PII**: Must be deleted within 30 days of verified erasure request
4. **Mixed records**: Financial data is retained; associated PII is pseudonymised (replaced with hash references)

## Pseudonymisation Process
- Original PII replaced with SHA-256 hash
- Mapping table stored in isolated vault with separate access controls
- Mapping destroyed after retention period expires
- Pseudonymised records remain in financial systems for audit trail

## Audit Trail
All deletion requests logged with: request_date, data_category, action_taken, legal_basis, completion_date.

Approved by: Carol Okonkwo, DPO & Compliance Manager`,
        "text/markdown",
        dateMonthsAgo(3),
    ),

    docFeature(
        "ft-ask-a4",
        DOMAINS.legal,
        "Meridian Third-Party Data Processing Agreements",
        `# Third-Party Data Processing Agreements (DPAs)

## Active DPAs
| Vendor | Service | Data Category | DPA Expiry | Subprocessors Approved |
|--------|---------|---------------|------------|----------------------|
| AWS | Infrastructure | All categories | 2027-01-01 | Yes (14 subprocessors) |
| Twilio | MFA/SMS | Phone numbers | 2026-06-01 | Yes (3 subprocessors) |
| Datadog | Observability | System telemetry (no PII) | 2026-03-01 | Yes (6 subprocessors) |
| Stripe | Payments | Financial records | 2027-01-01 | Yes (8 subprocessors) |
| OpenAI | AI/ML | Anonymised queries only | 2026-09-01 | Pending review |

## DPA Requirements
All vendors processing Meridian data must sign a DPA that includes:
- Purpose limitation clause
- Data minimisation obligations
- Subprocessor notification (14 days advance notice)
- Breach notification within 48 hours
- Right to audit (with 30 days notice)
- Data deletion upon termination (within 90 days)

Maintained by: Legal Operations
Last reviewed: 2025-07-01`,
        "text/markdown",
        dateMonthsAgo(4),
    ),
];

// ── Ambiguous Documents ──────────────────────────────────────────────────
// Multiple docs could match; tests ranking correctness.

const ambiguousDocs: CorpusDocV2[] = [
    docFeature(
        "ft-ask-amb1",
        DOMAINS.eng,
        "Database Migration Runbook — PostgreSQL",
        `# Database Migration Runbook

## Scope
This runbook covers schema migrations for the primary PostgreSQL cluster.

## Pre-Migration Checklist
- [ ] Migration tested on staging (matching production schema version)
- [ ] Backup completed within last 2 hours
- [ ] Change ticket approved (CAB approval for DDL changes)
- [ ] Rollback script prepared and tested
- [ ] Maintenance window scheduled (minimum 2 hours)

## Migration Process
1. Enable maintenance mode on affected services
2. Run migration: npx knex migrate:latest --env production
3. Verify schema: compare pg_dump --schema-only against expected DDL
4. Run smoke tests against migrated database
5. Disable maintenance mode
6. Monitor error rates for 30 minutes post-migration

## Rollback
npx knex migrate:rollback --env production
If rollback fails, restore from pre-migration backup.`,
        "text/markdown",
        dateMonthsAgo(6),
    ),

    docFeature(
        "ft-ask-amb2",
        DOMAINS.eng,
        "Database Migration Runbook — MongoDB",
        `# Database Migration Runbook — MongoDB

## Scope
This runbook covers schema-less migrations for the MongoDB analytics cluster.

## Pre-Migration Checklist
- [ ] Migration script peer-reviewed
- [ ] mongodump completed from analytics-primary
- [ ] Estimated duration calculated (based on collection sizes)
- [ ] Rollback strategy documented

## Migration Process
1. Run migration script via mongosh on analytics-primary
2. Verify indexes rebuilt: db.runCommand({listIndexes: "target_collection"})
3. Validate document schema with JSON Schema validator
4. Run analytics pipeline smoke tests

## Key Difference from PostgreSQL Migrations
MongoDB migrations do NOT require maintenance windows for most operations.
Index builds use {background: true} to avoid blocking reads.
Rolling updates are possible for replica set topology changes.`,
        "text/markdown",
        dateMonthsAgo(5),
    ),

    docFeature(
        "ft-ask-amb3",
        DOMAINS.platform,
        "API Versioning Strategy",
        `# API Versioning Strategy

## Approach
Meridian uses URL-based versioning: /v1/, /v2/, etc.

## Deprecation Policy
- New version announcement: 6 months before deprecation of old version
- Deprecation header: Sunset HTTP header added to all responses
- End-of-life: 12 months after new version GA
- Migration guide published at docs.meridian.test/api/migration

## Current Versions
| API | Current | Deprecated | EOL |
|-----|---------|-----------|-----|
| Platform API | v3 | v2 (sunset 2025-12-01) | v1 (EOL 2025-06-01) |
| Payments API | v2 | v1 (sunset 2026-03-01) | — |
| Analytics API | v1 | — | — |

## Breaking Change Policy
Breaking changes are ONLY permitted in new major versions.
Minor versions may add fields/endpoints but never remove or rename them.`,
        "text/markdown",
        dateMonthsAgo(3),
    ),

    docFeature(
        "ft-ask-amb4",
        DOMAINS.platform,
        "Internal API Design Guidelines",
        `# Internal API Design Guidelines

## Naming Conventions
- Resources: plural nouns (e.g., /users, /transactions)
- Actions: POST to resource + /action verb (e.g., POST /users/123/deactivate)
- Query params: snake_case (e.g., ?created_after=2025-01-01)

## Response Format
All responses use the standard envelope:
{ "ok": true, "data": {...}, "meta": { "request_id": "...", "took_ms": 42 } }

Error responses:
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "details": [...] } }

## Pagination
Cursor-based pagination for all list endpoints:
- Request: ?cursor=abc123&limit=50
- Response: { "data": [...], "meta": { "next_cursor": "def456", "has_more": true } }

Offset-based pagination is NOT permitted (performance degradation at scale).`,
        "text/markdown",
        dateMonthsAgo(4),
    ),
];

// ── Ground Truth ─────────────────────────────────────────────────────────

export const CAT1_DOCS: CorpusDocV2[] = [
    ...simpleDocs,
    ...multiHopDocs,
    ...adversarialDocs,
    ...ambiguousDocs,
];

/** Map query to its tier for stratified reporting */
export const QUERY_TIERS: { query: string; tier: AskTier }[] = [];

// Simple tier: direct factual lookups (1 doc each)
const simpleQueries: GroundTruth[] = [
    {
        query: "What is the minimum password length required at Meridian?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-s1"],
    },
    {
        query: "How long are production database backups retained?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-s2"],
    },
    {
        query: "What is the on-call incident bonus rate at Meridian?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-s3"],
    },
];

// Multi-hop tier: requires synthesising across docs
const multiHopQueries: GroundTruth[] = [
    {
        query: "If the Redis cluster hosting authentication sessions fails, what is the expected failover time and who should be paged?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-ask-m2", "ft-ask-m3"],
    },
    {
        query: "What happens to authentication requests if the rate limiting service goes down?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-ask-m1", "ft-ask-m4"],
    },
    {
        query: "What Redis namespace does the rate limiter use and what is its eviction policy?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-ask-m3", "ft-ask-m4"],
    },
];

// Adversarial tier: negation handling, deprecated docs
const adversarialQueries: GroundTruth[] = [
    {
        query: "What SSO protocol does Meridian currently support for new integrations?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-a2"],
        // Must NOT cite the deprecated SAML doc (ft-ask-a1) — or if cited, OIDC must rank higher
        expectedRanking: [["ft-ask-a2", "ft-ask-a1"]],
    },
    {
        query: "Can I set up SAML 2.0 SSO with Meridian?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-a1"],
        // The deprecated doc should appear — it explicitly says SAML is no longer supported
    },
    {
        query: "When a user requests data deletion, which data is NOT deleted and why?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-a3"],
    },
];

// Ambiguous tier: multiple plausible matches — tests ranking
const ambiguousQueries: GroundTruth[] = [
    {
        query: "How do I run a database migration?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-ask-amb1", "ft-ask-amb2"],
        // Both should appear — query is intentionally ambiguous
    },
    {
        query: "What is the API versioning and deprecation policy?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-amb3"],
        // Versioning strategy (amb3) should rank above design guidelines (amb4)
        expectedRanking: [["ft-ask-amb3", "ft-ask-amb4"]],
    },
    {
        query: "What expense limits apply to international travel?",
        mode: "verified",
        topK: 5,
        expectedDocIds: ["ft-ask-s4"],
    },
];

// Register tiers
for (const q of simpleQueries) QUERY_TIERS.push({ query: q.query, tier: "simple" });
for (const q of multiHopQueries) QUERY_TIERS.push({ query: q.query, tier: "multi-hop" });
for (const q of adversarialQueries) QUERY_TIERS.push({ query: q.query, tier: "adversarial" });
for (const q of ambiguousQueries) QUERY_TIERS.push({ query: q.query, tier: "ambiguous" });

export const CAT1_GROUND_TRUTH: GroundTruth[] = [
    ...simpleQueries,
    ...multiHopQueries,
    ...adversarialQueries,
    ...ambiguousQueries,
];
