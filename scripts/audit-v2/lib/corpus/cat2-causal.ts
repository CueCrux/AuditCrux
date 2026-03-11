/**
 * Category 2 — Causal Chain Retrieval
 *
 * ~25 signal docs across 5 distinct causal chains, each spanning 3-5 formats.
 * Tests whether the Engine can retrieve the full causal thread when a query
 * relates to any point in the chain.
 */

import type { CorpusDocV2, CorpusRelation, LivingState, GroundTruth } from "../types-v2.js";
import { DOMAINS, docV2, meridianDate } from "./tenant.js";
import { generateADR, MIME_MARKDOWN } from "./templates/markdown.js";
import { generateDatabaseConfig, generateFeatureFlags, generateApiGatewayConfig, MIME_JSON } from "./templates/json-config.js";
import { generateK8sDeployment, generateCIPipeline, MIME_YAML } from "./templates/yaml-spec.js";
import { generateSLAMetrics, generatePerformanceMetrics, generateVendorCompliance, MIME_CSV } from "./templates/csv-data.js";
import { generateQBRReport, generateComplianceDashboard, generateAuditFindings, MIME_HTML } from "./templates/html-report.js";
import { generateEmailThread, MIME_EMAIL } from "./templates/email.js";
import { generateMeetingNotes, generateRoughNotes, MIME_MEETING_NOTES } from "./templates/meeting-notes.js";
import { generateChatExport, generateIncidentChat, MIME_CHAT } from "./templates/chat-export.js";
import { generatePolicy } from "./templates/markdown.js";

// ============================================================================
// Chain 1 — SLA Breach Resolution
// CSV (breach data) → Email (root cause) → JSON (config fix) → Markdown ADR → Meeting notes (confirmation)
// ============================================================================

const chain1: CorpusDocV2[] = [
    docV2("v2-cc-1a", DOMAINS.compliance, "SLA Performance Report — October 2025",
        generateSLAMetrics({
            reportPeriod: "October 2025",
            services: [
                { name: "payment-service", target: 99.95, actual: 98.2, month: "2025-10", incidents: 4, p99_latency_ms: 890 },
                { name: "settlement-engine", target: 99.95, actual: 99.97, month: "2025-10", incidents: 0, p99_latency_ms: 45 },
                { name: "auth-service", target: 99.95, actual: 99.98, month: "2025-10", incidents: 0, p99_latency_ms: 12 },
                { name: "api-gateway", target: 99.95, actual: 99.96, month: "2025-10", incidents: 1, p99_latency_ms: 38 },
                { name: "user-service", target: 99.9, actual: 99.92, month: "2025-10", incidents: 0, p99_latency_ms: 67 },
                { name: "kyc-service", target: 99.9, actual: 99.85, month: "2025-10", incidents: 1, p99_latency_ms: 234 },
                { name: "ledger-service", target: 99.9, actual: 99.94, month: "2025-10", incidents: 0, p99_latency_ms: 28 },
            ],
        }),
        MIME_CSV, meridianDate(5)),

    docV2("v2-cc-1b", DOMAINS.eng, "RE: RE: payment-service SLA breach — October postmortem",
        generateEmailThread({
            subject: "payment-service SLA breach — October postmortem",
            messages: [
                { from: "James Okafor <jokafor@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "Karen Singh <ksingh@meridian.test>"], date: "2025-11-03 09:00", body: "Team,\n\nPayment-service dropped to 98.2% availability in October — well below our 99.95% Tier 1 target. We had 4 separate incidents, all related to the same root cause.\n\nCan we get a postmortem scheduled this week?\n\nJames" },
                { from: "Alice Chen <achen@meridian.test>", to: ["James Okafor <jokafor@meridian.test>", "Karen Singh <ksingh@meridian.test>"], date: "2025-11-03 10:15", body: "I've done a preliminary investigation. All 4 incidents trace back to database connection pool exhaustion. The payment-service is configured with DB_POOL_MAX=20 but under peak load we're seeing 35-40 concurrent database connections needed.\n\nWhen the pool is exhausted, new requests queue up and eventually timeout, causing the cascading failures we saw. The p99 latency spiked to 890ms during the worst incident.\n\nRoot cause: the connection pool was sized for the pre-Q3 traffic patterns. Since the Tier 1 enterprise client onboarding in Q4 2024, peak transaction volume has roughly doubled but the pool size was never adjusted.\n\nFix: increase DB_POOL_MAX from 20 to 50, which gives us headroom for 2x current peak. I'll prepare the config change.\n\nAlice" },
                { from: "Karen Singh <ksingh@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "James Okafor <jokafor@meridian.test>"], date: "2025-11-03 11:30", body: "Alice — agreed on the root cause. 20 connections was adequate when we had half the current load.\n\nBefore we just bump the number, should we document this as an ADR? The connection pool sizing has been a recurring issue and we should establish a formula that scales with traffic. Also want to make sure the DB can handle 50 connections without performance degradation.\n\nKaren" },
            ],
        }),
        MIME_EMAIL, meridianDate(4)),

    docV2("v2-cc-1c", DOMAINS.platform, "Database configuration: payment-service pool update",
        generateDatabaseConfig({
            service: "payment-service",
            host: "payment-db-primary.meridian.internal",
            port: 5432,
            database: "payments",
            pool: {
                maxConnections: 50,
                minConnections: 10,
                idleTimeoutMs: 30000,
                connectionTimeoutMs: 5000,
            },
            ssl: true,
            readReplicas: [
                "payment-db-replica-1.meridian.internal",
                "payment-db-replica-2.meridian.internal",
            ],
        }),
        MIME_JSON, meridianDate(4)),

    docV2("v2-cc-1d", DOMAINS.eng, "ADR-042: Connection Pool Sizing for Payment Service",
        generateADR({
            number: 42,
            title: "Connection Pool Sizing for Payment Service",
            status: "Accepted",
            date: "2025-11-10",
            deciders: ["Alice Chen", "Karen Singh", "James Okafor"],
            context: "The payment-service experienced 4 SLA breaches in October 2025, all caused by database connection pool exhaustion. The pool was configured with 20 maximum connections, which was adequate for pre-Q4 2024 traffic but insufficient after the Tier 1 enterprise client onboarding doubled peak transaction volume. Connection pool exhaustion caused request queuing, timeout cascades, and p99 latency spikes to 890ms.",
            decision: "Increase the payment-service database connection pool from 20 to 50 maximum connections. Adopt the connection pool sizing formula: optimal_pool_size = (2 * cpu_cores) + effective_spindle_count. For our 8-core instances with NVMe storage (spindle_count=1), this gives 17 as a baseline — we set 50 to provide 3x headroom for traffic spikes. Additionally, add connection pool monitoring with alerts when utilization exceeds 80%.",
            consequences: [
                "Immediate: payment-service can handle 2.5x current peak transaction volume without pool exhaustion",
                "Database server must be checked: 50 connections per payment-service instance × 4 instances = 200 total connections, within the 300 max_connections limit",
                "Monitoring dashboards updated to include pool utilization metrics",
                "Connection pool sizing becomes a checklist item in the capacity planning framework",
            ],
            alternatives: [
                { name: "Add read replicas for read-heavy queries", reason: "Would help long-term but doesn't address the immediate pool exhaustion for write operations" },
                { name: "Implement connection pooling at the infrastructure level (PgBouncer)", reason: "Deferred to Q1 2026 — adds operational complexity and requires testing with prepared statements" },
            ],
        }),
        MIME_MARKDOWN, meridianDate(3)),

    docV2("v2-cc-1e", DOMAINS.product, "Platform reliability standup — 2025-11-20",
        generateRoughNotes({
            title: "Platform reliability standup",
            date: "2025-11-20",
            scribe: "lzhao",
            rawNotes: [
                "- payment-service SLA update: back to 99.7% in November so far after pool fix",
                "- connection pool bumped from 20 to 50 per ADR-042",
                "- Alice confirmed DB load is fine with the extra connections",
                "- monitoring dashboard now shows pool utilization — currently sitting at ~40% at peak",
                "- James wants to review other services for similar pool sizing issues",
                "- kyc-service also had a dip last month (99.85%) — different root cause tho, external provider rate limiting",
                "- Karen: should we add pool sizing to teh capacity planning framework? consensus yes",
            ],
            todos: [
                "Alice: audit connection pool sizes across all Tier 1 services",
                "James: update capacity planning framework to include pool sizing checklist",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(3)),
];

// ============================================================================
// Chain 2 — Security Incident
// Chat (detection) → Markdown (incident report) → JSON (API gateway fix) → YAML (CI fix) → HTML (compliance)
// ============================================================================

const chain2: CorpusDocV2[] = [
    docV2("v2-cc-2a", DOMAINS.security, "#security-oncall: credential leak detection",
        generateIncidentChat({
            channel: "security-oncall",
            incidentId: "INC-2025-1247",
            messages: [
                { timestamp: "2025-09-22 08:14", handle: "otanaka", message: "ALERT: Secret scanning detected credentials in public repository meridian/payment-sdk" },
                { timestamp: "2025-09-22 08:15", handle: "otanaka", message: "Detected: API key matching pattern `mrd_live_*` in file `examples/quickstart.js` committed 3 hours ago" },
                { timestamp: "2025-09-22 08:16", handle: "bmartinez", message: "confirming — this is a live production API key. checking access logs now" },
                { timestamp: "2025-09-22 08:20", handle: "bmartinez", message: "access logs show the key was used for 2 API calls from an unknown IP (45.33.x.x) in the last hour. rotating immediately" },
                { timestamp: "2025-09-22 08:22", handle: "hpatel", message: "key rotated. old key invalidated. the 2 API calls were GET requests to /v1/account — read-only, no modifications detected" },
                { timestamp: "2025-09-22 08:25", handle: "bmartinez", message: "declaring INC-2025-1247, SEV2. no data exfiltration confirmed but credential was exposed publicly for ~3 hours" },
                { timestamp: "2025-09-22 08:30", handle: "otanaka", message: "root cause: developer committed example code with a real API key instead of a placeholder. pre-commit hook for secret scanning was not enabled on the payment-sdk repo", reaction: ":facepalm: x2" },
            ],
        }),
        MIME_CHAT, meridianDate(8)),

    docV2("v2-cc-2b", DOMAINS.security, "Incident Report: INC-2025-1247 — Credential Exposure in Public Repository",
        generatePolicy({
            id: "INC-2025-1247",
            title: "Incident Report: Credential Exposure in Public Repository",
            version: "Final",
            department: "Security Operations",
            owner: "Bob Martinez",
            effectiveDate: "2025-09-25",
            sections: [
                { heading: "Summary", body: "On September 22, 2025 at 08:14 UTC, automated secret scanning detected a live production API key (`mrd_live_*` pattern) committed to the public `meridian/payment-sdk` repository. The key was exposed for approximately 3 hours before detection and was used by an unknown external party for 2 read-only API calls. No data exfiltration or unauthorized modifications were confirmed." },
                { heading: "Timeline", body: "- 05:12 UTC: Developer commits `examples/quickstart.js` containing live API key\n- 08:14 UTC: Secret scanning alert triggers in #security-oncall\n- 08:22 UTC: API key rotated, old key invalidated\n- 08:25 UTC: Incident declared (SEV2)\n- 08:30 UTC: Root cause identified — missing pre-commit hook\n- 09:00 UTC: Repository history rewritten to remove key from git history\n- 12:00 UTC: Customer notification sent (precautionary)" },
                { heading: "Root Cause", body: "The developer copied a working code example from an internal repository and committed it to the public SDK repository without replacing the live API key with a placeholder. The `payment-sdk` repository did not have the secret scanning pre-commit hook enabled, which would have blocked the commit.\n\nContributing factors:\n1. No pre-commit hook enforcement on public repositories\n2. No distinction between live and test API keys in the key naming convention\n3. Developer onboarding does not include secret handling training for public repo contributors" },
                { heading: "Corrective Actions", body: "1. **Immediate:** Enable secret scanning pre-commit hooks on ALL public repositories (completed 2025-09-23)\n2. **Short-term:** Add API key prefix convention: `mrd_live_` for production, `mrd_test_` for test/example. API gateway to reject `mrd_test_` keys in production (target: 2025-10-15)\n3. **Medium-term:** Add mandatory secret scanning step to CI pipeline for all repositories (target: 2025-11-01)\n4. **Long-term:** Implement API key scoping — keys issued with minimum required permissions, no \"god keys\" (target: Q1 2026)" },
            ],
        }),
        MIME_MARKDOWN, meridianDate(7)),

    docV2("v2-cc-2c", DOMAINS.platform, "API gateway configuration: key validation update",
        generateApiGatewayConfig({
            service: "api-gateway",
            routes: [
                { path: "/v1/account", method: "GET", backend: "user-service:3000", rateLimit: 100, auth: "api_key", timeout_ms: 5000 },
                { path: "/v1/payments", method: "POST", backend: "payment-service:3000", rateLimit: 50, auth: "api_key", timeout_ms: 10000 },
                { path: "/v1/settlements", method: "GET", backend: "settlement-engine:3000", rateLimit: 200, auth: "api_key", timeout_ms: 5000 },
            ],
            globalRateLimit: 1000,
            cors: { origins: ["https://app.meridian.com", "https://dashboard.meridian.com"], methods: ["GET", "POST", "PUT", "DELETE"] },
        }),
        MIME_JSON, meridianDate(7)),

    docV2("v2-cc-2d", DOMAINS.platform, "CI pipeline update: mandatory secret scanning",
        generateCIPipeline({
            service: "all-repositories",
            language: "Node.js",
            testCommand: "npm test",
            buildCommand: "npm run build",
            deployTarget: "production",
            secretScanning: true,
            dependencyAudit: true,
        }),
        MIME_YAML, meridianDate(6)),

    docV2("v2-cc-2e", DOMAINS.compliance, "Security Compliance Dashboard — Q4 2025",
        generateComplianceDashboard({
            reportDate: "2025-12-15",
            framework: "SOC 2 Type II",
            controls: [
                { id: "CC6.1", name: "Logical Access Controls", status: "Compliant", lastTested: "2025-12-01", owner: "Bob Martinez" },
                { id: "CC6.6", name: "Security Event Monitoring", status: "Compliant", lastTested: "2025-12-01", owner: "Hasan Patel" },
                { id: "CC6.7", name: "Transmission Security", status: "Compliant", lastTested: "2025-11-15", owner: "Olivia Tanaka" },
                { id: "CC7.1", name: "Vulnerability Management", status: "Remediated", lastTested: "2025-12-10", owner: "Olivia Tanaka", finding: "INC-2025-1247: Secret scanning gaps — remediated via mandatory CI pipeline scanning and pre-commit hooks" },
                { id: "CC7.2", name: "Incident Response", status: "Compliant", lastTested: "2025-12-05", owner: "Bob Martinez" },
                { id: "CC8.1", name: "Change Management", status: "Compliant", lastTested: "2025-11-20", owner: "Karen Singh" },
            ],
            overallScore: 96,
        }),
        MIME_HTML, meridianDate(2)),
];

// ============================================================================
// Chain 3 — Platform Migration (Redis 6 → 7)
// Markdown RFC → YAML (canary) → CSV (perf data) → Email (approval) → Chat (post-migration)
// ============================================================================

const chain3: CorpusDocV2[] = [
    docV2("v2-cc-3a", DOMAINS.eng, "RFC-0018: Redis 6 to Redis 7 Migration",
        `# RFC-0018: Redis 6 to Redis 7 Migration

**Author:** Sam Wallace
**Status:** Accepted
**Date:** 2025-06-15

## Summary

Migrate all Redis 6.2 instances to Redis 7.0 across the Meridian platform to gain access to Redis Functions, improved ACLs, and the new multi-part AOF persistence model.

## Motivation

Redis 6.2 reaches end of support in March 2026. Additionally, Redis 7.0 provides three features critical to our roadmap:

1. **Redis Functions** replace Lua scripting with a more maintainable server-side execution model. The settlement-engine currently uses 12 Lua scripts for atomic operations that would benefit from the Functions API.
2. **ACL v2** supports per-key permissions, enabling us to implement zero-trust access controls per service identity rather than the current shared-password model.
3. **Multi-part AOF** improves persistence reliability and reduces the risk of data loss during unexpected restarts.

## Proposal

Phased migration over 8 weeks:
- **Phase 1 (Week 1-2):** Deploy Redis 7.0 canary alongside existing Redis 6.2 in staging
- **Phase 2 (Week 3-4):** Migrate staging workloads, run comparison benchmarks
- **Phase 3 (Week 5-6):** Deploy Redis 7.0 canary in production with 10% traffic shadow
- **Phase 4 (Week 7-8):** Full production cutover, decommission Redis 6.2

## Risks

- Redis 7.0 changed the RDB format — rollback requires data re-import from AOF
- Lua scripts must be converted to Functions before migration (12 scripts, estimated 2 days)
- Memory usage may increase by 5-10% due to new internal data structures`,
        MIME_MARKDOWN, meridianDate(9)),

    docV2("v2-cc-3b", DOMAINS.platform, "Redis 7 canary deployment manifest",
        generateK8sDeployment({
            service: "redis-canary",
            namespace: "production",
            replicas: 1,
            image: "redis",
            tag: "7.0.15-alpine",
            memoryLimit: "2Gi",
            cpuLimit: "1000m",
            memoryRequest: "1Gi",
            cpuRequest: "500m",
            env: [
                { name: "REDIS_PASSWORD", value: "$(REDIS_CANARY_PASSWORD)" },
                { name: "REDIS_MAXMEMORY", value: "1536mb" },
                { name: "REDIS_MAXMEMORY_POLICY", value: "allkeys-lru" },
                { name: "REDIS_AOF_ENABLED", value: "yes" },
                { name: "REDIS_AOF_USE_RDB_PREAMBLE", value: "yes" },
            ],
            port: 6379,
        }),
        MIME_YAML, meridianDate(8)),

    docV2("v2-cc-3c", DOMAINS.eng, "Redis migration benchmark: 6.2 vs 7.0 comparison",
        generatePerformanceMetrics({
            service: "redis-benchmark",
            period: "2025-07-15 to 2025-07-22",
            dataPoints: [
                { date: "2025-07-15", requests: 1250000, errors: 0, p50_ms: 0.4, p95_ms: 0.8, p99_ms: 1.2, cpu_pct: 35, memory_mb: 890 },
                { date: "2025-07-16", requests: 1300000, errors: 0, p50_ms: 0.4, p95_ms: 0.9, p99_ms: 1.3, cpu_pct: 37, memory_mb: 910 },
                { date: "2025-07-17", requests: 1280000, errors: 0, p50_ms: 0.3, p95_ms: 0.7, p99_ms: 1.1, cpu_pct: 34, memory_mb: 905 },
                { date: "2025-07-18", requests: 1350000, errors: 2, p50_ms: 0.3, p95_ms: 0.8, p99_ms: 1.0, cpu_pct: 36, memory_mb: 920 },
                { date: "2025-07-19", requests: 1100000, errors: 0, p50_ms: 0.3, p95_ms: 0.7, p99_ms: 0.9, cpu_pct: 30, memory_mb: 880 },
                { date: "2025-07-20", requests: 980000, errors: 0, p50_ms: 0.3, p95_ms: 0.6, p99_ms: 0.8, cpu_pct: 25, memory_mb: 860 },
                { date: "2025-07-21", requests: 1400000, errors: 0, p50_ms: 0.4, p95_ms: 0.9, p99_ms: 1.2, cpu_pct: 38, memory_mb: 935 },
                { date: "2025-07-22", requests: 1320000, errors: 0, p50_ms: 0.3, p95_ms: 0.8, p99_ms: 1.1, cpu_pct: 36, memory_mb: 915 },
            ],
        }),
        MIME_CSV, meridianDate(7)),

    docV2("v2-cc-3d", DOMAINS.eng, "RE: Redis 7 canary results — ready for full rollout",
        generateEmailThread({
            subject: "Redis 7 canary results — ready for full rollout",
            messages: [
                { from: "Sam Wallace <swallace@meridian.test>", to: ["Karen Singh <ksingh@meridian.test>", "Grace Huang <ghuang@meridian.test>"], date: "2025-07-25 14:00", body: "Team,\n\nThe Redis 7 canary has been running in production for 2 weeks with 10% traffic shadow. Results:\n\n- Latency: p99 improved from 1.3ms (Redis 6.2) to 1.1ms (Redis 7.0) — 15% improvement\n- Memory: ~5% higher as expected (935MB vs 890MB peak), well within our 2GB limit\n- All 12 Lua scripts successfully converted to Redis Functions\n- Zero errors across 18M canary requests\n\nI'm confident we can proceed to full production rollout. Requesting approval for the Week 7-8 cutover.\n\nSam" },
                { from: "Grace Huang <ghuang@meridian.test>", to: ["Sam Wallace <swallace@meridian.test>"], cc: ["Karen Singh <ksingh@meridian.test>"], date: "2025-07-25 16:30", body: "Approved. Schedule the cutover for next Tuesday during the maintenance window. Make sure the rollback plan is tested — we need the ability to fall back to Redis 6.2 within 15 minutes if anything goes wrong.\n\nGrace" },
            ],
        }),
        MIME_EMAIL, meridianDate(7)),

    docV2("v2-cc-3e", DOMAINS.platform, "#platform-eng: Redis 7 migration complete",
        generateChatExport({
            channel: "platform-eng",
            date: "2025-08-02",
            messages: [
                { timestamp: "06:15", handle: "swallace", message: "Redis 7 migration complete! All production clusters now running 7.0.15. Cutover took 12 minutes, zero downtime." },
                { timestamp: "06:17", handle: "swallace", message: "Redis 6.2 clusters decommissioned. All services confirmed healthy on the new clusters." },
                { timestamp: "06:20", handle: "dkim", message: "nice work Sam! latency looking good on the dashboards", reaction: ":tada: x5" },
                { timestamp: "06:25", handle: "achen", message: "one thing to track — the settlement-engine's Function #7 (atomic_settle) is showing slightly different behavior on edge cases. not a bug per se but the error messages changed format. logging a ticket to update our error parsing" },
                { timestamp: "06:28", handle: "swallace", message: "good catch, sounds minor. create a ticket and we'll pick it up in the next sprint" },
                { timestamp: "06:30", handle: "ksingh", message: "great migration everyone. @swallace please update the RFC status to 'Completed' and add the final metrics" },
            ],
        }),
        MIME_CHAT, meridianDate(6)),
];

// ============================================================================
// Chain 4 — Compliance Audit
// HTML (findings) → Email (assignment) → Markdown (remediation plan) → JSON (feature flag) → CSV (closure)
// ============================================================================

const chain4: CorpusDocV2[] = [
    docV2("v2-cc-4a", DOMAINS.compliance, "External Audit Report: SOC 2 Type II — 2025 Annual",
        generateAuditFindings({
            auditTitle: "SOC 2 Type II Annual Audit — Meridian Financial Services",
            auditDate: "2025-08-15",
            auditor: "Deloitte LLP — Cyber Risk Advisory",
            findings: [
                { id: "F-2025-001", severity: "High", title: "Insufficient Audit Trail for Administrative Actions", description: "Administrative actions on production databases (schema changes, user permission modifications, data exports) are not consistently logged in an immutable audit trail. Current logging captures approximately 60% of administrative operations. The remaining 40% are performed via direct database connections that bypass the application audit layer.", recommendation: "Implement database-level audit logging using PostgreSQL's pgaudit extension to capture all DDL and privileged DML operations. Logs must be shipped to an immutable storage backend within 60 seconds.", owner: "Alice Chen", dueDate: "2025-11-15", status: "Open" },
                { id: "F-2025-002", severity: "Medium", title: "API Key Lifecycle Management Gaps", description: "API keys do not have enforced expiration dates. Analysis of active API keys shows 23% have not been rotated in over 12 months. The key rotation process is manual and relies on service owners to initiate rotation.", recommendation: "Implement automated API key expiration with 180-day maximum lifetime. Add automated rotation workflow with 24-hour dual-key transition period.", owner: "Bob Martinez", dueDate: "2025-12-15", status: "Open" },
                { id: "F-2025-003", severity: "Low", title: "Incomplete Access Review Documentation", description: "Quarterly access reviews are conducted but documentation is inconsistent. 3 of 8 reviews in the audit period lacked formal sign-off from the system owner. Review evidence is stored in email threads rather than a centralized system.", recommendation: "Migrate access review process to a GRC platform with enforced sign-off workflow and automated evidence collection.", owner: "Carol Okonkwo", dueDate: "2026-03-15", status: "Open" },
            ],
        }),
        MIME_HTML, meridianDate(6)),

    docV2("v2-cc-4b", DOMAINS.compliance, "RE: SOC 2 audit findings — remediation assignment",
        generateEmailThread({
            subject: "SOC 2 audit findings — remediation assignment",
            messages: [
                { from: "Carol Okonkwo <cokonkwo@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "Bob Martinez <bmartinez@meridian.test>"], cc: ["Grace Huang <ghuang@meridian.test>", "Paul Dubois <pdubois@meridian.test>"], date: "2025-08-20 09:00", body: "Team,\n\nAttached are the findings from the annual SOC 2 audit. We have three findings that need remediation:\n\n1. F-2025-001 (High): Database audit trail gaps — Alice, this is yours. Target: Nov 15\n2. F-2025-002 (Medium): API key lifecycle — Bob, this is yours. Target: Dec 15\n3. F-2025-003 (Low): Access review docs — I'll take this one. Target: Mar 15\n\nThe High finding needs priority attention. Deloitte flagged that if F-2025-001 isn't remediated before the next audit, it could escalate to a qualified opinion.\n\nPlease confirm you can meet the target dates and send me your remediation plans by end of next week.\n\nCarol" },
                { from: "Alice Chen <achen@meridian.test>", to: ["Carol Okonkwo <cokonkwo@meridian.test>"], date: "2025-08-20 10:30", body: "Carol — confirmed, I'll take F-2025-001. pgaudit is already on our backlog, this gives it the priority bump it needed. I'll have the remediation plan to you by Friday.\n\nAlice" },
                { from: "Bob Martinez <bmartinez@meridian.test>", to: ["Carol Okonkwo <cokonkwo@meridian.test>"], date: "2025-08-20 11:00", body: "Confirmed for F-2025-002. The API key rotation work partially overlaps with corrective actions from INC-2025-1247 (the credential leak incident). I'll combine the efforts.\n\nBob" },
            ],
        }),
        MIME_EMAIL, meridianDate(6)),

    docV2("v2-cc-4c", DOMAINS.eng, "Remediation Plan: F-2025-001 — Database Audit Trail Enhancement",
        generatePolicy({
            id: "REM-2025-001",
            title: "Remediation Plan: Database Audit Trail Enhancement",
            version: "1.0",
            department: "Engineering",
            owner: "Alice Chen",
            effectiveDate: "2025-08-25",
            sections: [
                { heading: "Finding Reference", body: "SOC 2 Type II Finding F-2025-001: Insufficient Audit Trail for Administrative Actions (Severity: High)" },
                { heading: "Remediation Approach", body: "Deploy PostgreSQL pgaudit extension across all production database instances. Configure to capture:\n\n- All DDL operations (CREATE, ALTER, DROP)\n- Privileged DML (DELETE, TRUNCATE on sensitive tables)\n- Role and permission changes\n- Connection events from administrative users\n\nAudit logs will be shipped to the centralized logging platform (Elasticsearch) within 60 seconds via the existing log shipping pipeline. A new Grafana dashboard will provide real-time visibility into administrative actions." },
                { heading: "Implementation Timeline", body: "- **Week 1 (Sep 1-5):** Deploy pgaudit to staging, validate log format\n- **Week 2 (Sep 8-12):** Configure log shipping pipeline, build Grafana dashboard\n- **Week 3 (Sep 15-19):** Deploy to production (rolling, zero downtime)\n- **Week 4 (Sep 22-26):** Validation period — verify 100% capture rate\n- **Buffer (Oct-Nov):** Address any issues, prepare evidence for auditor review" },
                { heading: "Success Criteria", body: "100% of administrative database operations captured in immutable audit log. Verified by comparing pgaudit log entries against a controlled set of test operations. Auditor confirmation that the control is operating effectively." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(5)),

    docV2("v2-cc-4d", DOMAINS.eng, "Feature flag configuration: pgaudit rollout",
        generateFeatureFlags({
            service: "database-infrastructure",
            environment: "production",
            flags: [
                { key: "pgaudit_enabled", enabled: true, description: "Enable PostgreSQL pgaudit extension for DDL and privileged DML logging", rollout_percentage: 100, owner: "Alice Chen" },
                { key: "pgaudit_log_shipping", enabled: true, description: "Ship pgaudit logs to centralized Elasticsearch cluster", rollout_percentage: 100 },
                { key: "pgaudit_alert_on_ddl", enabled: true, description: "Alert on DDL operations outside maintenance windows", rollout_percentage: 100, owner: "James Okafor" },
                { key: "pgaudit_dashboard_v2", enabled: true, description: "Enable enhanced Grafana dashboard for database audit trail", rollout_percentage: 100 },
            ],
        }),
        MIME_JSON, meridianDate(3)),

    docV2("v2-cc-4e", DOMAINS.compliance, "Vendor compliance matrix — Q4 2025 update",
        generateVendorCompliance({
            vendors: [
                { name: "AWS", category: "Cloud Infrastructure", soc2: "Certified", gdpr: "Compliant", pci: "Level 1", lastAudit: "2025-09-30", riskRating: "Low", contractExpiry: "2026-12-31" },
                { name: "Stripe", category: "Payment Processing", soc2: "Certified", gdpr: "Compliant", pci: "Level 1", lastAudit: "2025-10-15", riskRating: "Low", contractExpiry: "2026-06-30" },
                { name: "Deloitte", category: "External Audit", soc2: "N/A", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-08-15", riskRating: "Low", contractExpiry: "2027-01-31" },
                { name: "Meridian Internal", category: "Self-Assessment", soc2: "In Progress", gdpr: "Compliant", pci: "Level 2", lastAudit: "2025-12-01", riskRating: "Medium", contractExpiry: "N/A" },
            ],
        }),
        MIME_CSV, meridianDate(2)),
];

// ============================================================================
// Chain 5 — Performance Optimization (N+1 Query)
// Meeting notes (degradation) → CSV (metrics) → Markdown (root cause) → JSON (fix) → HTML (dashboard)
// ============================================================================

const chain5: CorpusDocV2[] = [
    docV2("v2-cc-5a", DOMAINS.product, "Platform perf review — 2025-08-05",
        generateMeetingNotes({
            title: "Platform Performance Review",
            date: "2025-08-05",
            attendees: ["Alice Chen", "Frank Abadi", "James Okafor", "David Kim"],
            location: "Conf Room B / Zoom",
            notes: [
                "user-service API response times have been degrading over the past 2 weeks",
                "p99 latency up from ~60ms to ~250ms — 4x increase",
                "no code changes deployed in that period — suspect data growth related",
                "Frank noticed the user listing endpoint is particularly slow — takes 800ms for accounts with many payment methods",
                "James: correlates with the new enterprise client onboarding — they have ~50 payment methods per user vs our avg of 3",
                "Alice: sounds like it could be an N+1 query — the ORM loads payment methods in a loop for each user",
                "Need to profile and confirm — Alice will investigate this week",
            ],
            actionItems: [
                { assignee: "achen", task: "Profile user-service queries, confirm N+1 hypothesis" },
                { assignee: "jokafor", task: "Set up query performance monitoring dashboard" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(7)),

    docV2("v2-cc-5b", DOMAINS.eng, "user-service performance metrics — August 2025",
        generatePerformanceMetrics({
            service: "user-service",
            period: "August 2025 (first 2 weeks)",
            dataPoints: [
                { date: "2025-08-01", requests: 450000, errors: 12, p50_ms: 35, p95_ms: 120, p99_ms: 245, cpu_pct: 55, memory_mb: 780 },
                { date: "2025-08-02", requests: 460000, errors: 8, p50_ms: 38, p95_ms: 130, p99_ms: 260, cpu_pct: 58, memory_mb: 790 },
                { date: "2025-08-03", requests: 420000, errors: 5, p50_ms: 33, p95_ms: 110, p99_ms: 230, cpu_pct: 50, memory_mb: 770 },
                { date: "2025-08-04", requests: 480000, errors: 15, p50_ms: 40, p95_ms: 145, p99_ms: 280, cpu_pct: 62, memory_mb: 810 },
                { date: "2025-08-05", requests: 490000, errors: 22, p50_ms: 42, p95_ms: 155, p99_ms: 310, cpu_pct: 65, memory_mb: 830 },
                { date: "2025-08-06", requests: 470000, errors: 18, p50_ms: 39, p95_ms: 140, p99_ms: 295, cpu_pct: 60, memory_mb: 815 },
                { date: "2025-08-07", requests: 500000, errors: 25, p50_ms: 45, p95_ms: 165, p99_ms: 340, cpu_pct: 68, memory_mb: 850 },
            ],
        }),
        MIME_CSV, meridianDate(7)),

    docV2("v2-cc-5c", DOMAINS.eng, "Root Cause Analysis: user-service N+1 Query Pattern",
        generatePolicy({
            id: "RCA-2025-008",
            title: "Root Cause Analysis: user-service Latency Degradation",
            version: "1.0",
            department: "Engineering",
            owner: "Alice Chen",
            effectiveDate: "2025-08-12",
            sections: [
                { heading: "Problem Statement", body: "The user-service experienced a 4x increase in p99 latency (60ms → 250ms) over a 2-week period beginning late July 2025. The degradation was most pronounced on endpoints that return user profile data with associated payment methods." },
                { heading: "Root Cause", body: "The ORM (Prisma) generates individual SELECT queries for each user's payment methods when loading user profiles. This is a classic N+1 query pattern.\n\nFor a request listing 20 users:\n- **Expected:** 1 query for users + 1 query for all payment methods = 2 queries\n- **Actual:** 1 query for users + 20 queries for payment methods (one per user) = 21 queries\n\nWith the enterprise client onboarding, users now have an average of 50 payment methods (vs. previous average of 3). This amplifies the N+1 issue: each individual payment method query returns 50 rows instead of 3, and the total query count per request scales linearly with the number of users displayed.\n\nDatabase query profiling confirmed: the user listing endpoint executes an average of 142 queries per request for enterprise accounts, with a total database time of 180ms." },
                { heading: "Fix", body: "Replace the ORM's lazy-loading with an eager-loading strategy using `include` relations:\n\n```\n// Before (N+1)\nconst users = await prisma.user.findMany();\n// Each access to user.paymentMethods triggers a separate query\n\n// After (eager load)\nconst users = await prisma.user.findMany({\n  include: { paymentMethods: true }\n});\n// Single JOIN query, all data loaded in 2 queries\n```\n\nAdditionally, enable Prisma's query caching for the payment methods relation with a 60-second TTL to reduce database load for repeated requests." },
                { heading: "Impact", body: "After deploying the fix in staging:\n- p99 latency: 250ms → 45ms (82% reduction)\n- Database queries per request: 142 → 2 (98.6% reduction)\n- Database CPU utilization: 65% → 28% (57% reduction)" },
            ],
        }),
        MIME_MARKDOWN, meridianDate(6)),

    docV2("v2-cc-5d", DOMAINS.platform, "Database config: user-service query caching",
        generateDatabaseConfig({
            service: "user-service",
            host: "user-db-primary.meridian.internal",
            port: 5432,
            database: "users",
            pool: {
                maxConnections: 30,
                minConnections: 5,
                idleTimeoutMs: 30000,
                connectionTimeoutMs: 5000,
            },
            ssl: true,
            readReplicas: ["user-db-replica-1.meridian.internal"],
        }),
        MIME_JSON, meridianDate(6)),

    docV2("v2-cc-5e", DOMAINS.leadership, "Platform Performance Dashboard — August 2025 Review",
        generateQBRReport({
            quarter: "August",
            year: 2025,
            department: "Engineering — Performance",
            highlights: [
                { metric: "user-service p99 Latency", target: "< 100ms", actual: "45ms", status: "On Track" },
                { metric: "user-service Error Rate", target: "< 0.1%", actual: "0.003%", status: "On Track" },
                { metric: "Database Query Efficiency", target: "< 10 queries/request", actual: "2 queries/request", status: "On Track" },
                { metric: "Database CPU Utilization", target: "< 50%", actual: "28%", status: "On Track" },
            ],
            narrative: "The user-service latency degradation identified in early August has been fully resolved. Root cause was an N+1 query pattern in the ORM that was amplified by enterprise client onboarding (users with 50+ payment methods vs. average of 3). The fix replaced lazy-loading with eager-loading, reducing database queries per request from 142 to 2 and p99 latency from 250ms to 45ms. Query caching with 60-second TTL provides additional protection against traffic spikes.",
            risks: [
                { description: "Similar N+1 patterns may exist in other services", severity: "Medium", mitigation: "Alice Chen conducting ORM query audit across all Tier 1 services" },
            ],
        }),
        MIME_HTML, meridianDate(5)),
];

// ============================================================================
// Exports
// ============================================================================

export const CAT2_DOCS: CorpusDocV2[] = [...chain1, ...chain2, ...chain3, ...chain4, ...chain5];

export const CAT2_RELATIONS: CorpusRelation[] = [
    // Chain 1 — SLA Breach
    { srcId: "v2-cc-1b", dstId: "v2-cc-1a", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-1c", dstId: "v2-cc-1b", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-1d", dstId: "v2-cc-1b", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-1d", dstId: "v2-cc-1c", relationType: "cites", confidence: 0.8 },
    { srcId: "v2-cc-1e", dstId: "v2-cc-1d", relationType: "cites", confidence: 0.7 },

    // Chain 2 — Security Incident
    { srcId: "v2-cc-2b", dstId: "v2-cc-2a", relationType: "derived_from", confidence: 0.95 },
    { srcId: "v2-cc-2c", dstId: "v2-cc-2b", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-2d", dstId: "v2-cc-2b", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-2e", dstId: "v2-cc-2b", relationType: "cites", confidence: 0.8 },

    // Chain 3 — Redis Migration
    { srcId: "v2-cc-3b", dstId: "v2-cc-3a", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-3c", dstId: "v2-cc-3b", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-3d", dstId: "v2-cc-3c", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-3e", dstId: "v2-cc-3d", relationType: "derived_from", confidence: 0.8 },

    // Chain 4 — Compliance Audit
    { srcId: "v2-cc-4b", dstId: "v2-cc-4a", relationType: "derived_from", confidence: 0.95 },
    { srcId: "v2-cc-4c", dstId: "v2-cc-4a", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-4d", dstId: "v2-cc-4c", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-4e", dstId: "v2-cc-4a", relationType: "cites", confidence: 0.7 },

    // Chain 5 — Performance
    { srcId: "v2-cc-5b", dstId: "v2-cc-5a", relationType: "derived_from", confidence: 0.8 },
    { srcId: "v2-cc-5c", dstId: "v2-cc-5b", relationType: "derived_from", confidence: 0.9 },
    { srcId: "v2-cc-5c", dstId: "v2-cc-5a", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-5d", dstId: "v2-cc-5c", relationType: "derived_from", confidence: 0.85 },
    { srcId: "v2-cc-5e", dstId: "v2-cc-5c", relationType: "cites", confidence: 0.8 },
];

export const CAT2_LIVING_STATES: LivingState[] = [
    // Chain 1
    { artifactId: "v2-cc-1a", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-1b", livingStatus: "active", confidence: 0.85 },
    { artifactId: "v2-cc-1c", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-1d", livingStatus: "active", confidence: 0.95 },
    { artifactId: "v2-cc-1e", livingStatus: "active", confidence: 0.7 },
    // Chain 2
    { artifactId: "v2-cc-2a", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v2-cc-2b", livingStatus: "active", confidence: 0.95 },
    { artifactId: "v2-cc-2c", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-2d", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-2e", livingStatus: "active", confidence: 0.9 },
    // Chain 3
    { artifactId: "v2-cc-3a", livingStatus: "active", confidence: 0.85 },
    { artifactId: "v2-cc-3b", livingStatus: "deprecated", confidence: 0.2 }, // canary decommissioned
    { artifactId: "v2-cc-3c", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v2-cc-3d", livingStatus: "active", confidence: 0.85 },
    { artifactId: "v2-cc-3e", livingStatus: "active", confidence: 0.8 },
    // Chain 4
    { artifactId: "v2-cc-4a", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-4b", livingStatus: "active", confidence: 0.85 },
    { artifactId: "v2-cc-4c", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-4d", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-4e", livingStatus: "active", confidence: 0.85 },
    // Chain 5
    { artifactId: "v2-cc-5a", livingStatus: "active", confidence: 0.7 },
    { artifactId: "v2-cc-5b", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v2-cc-5c", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-5d", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-cc-5e", livingStatus: "active", confidence: 0.85 },
];

export const CAT2_GROUND_TRUTH: GroundTruth[] = [
    // Chain 1 — SLA Breach
    {
        query: "Why did payment-service SLA breach occur in October and how was it fixed?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-cc-1a", "v2-cc-1b", "v2-cc-1d"],
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "What is the connection pool sizing recommendation for payment-service?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-cc-1d", "v2-cc-1c"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Chain 2 — Security Incident
    {
        query: "What happened with the credential leak incident INC-2025-1247?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-cc-2a", "v2-cc-2b"],
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "What security controls were implemented after the credential exposure?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-cc-2b", "v2-cc-2d"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Chain 3 — Redis Migration
    {
        query: "What was the outcome of the Redis 6 to Redis 7 migration?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-cc-3a", "v2-cc-3e"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // Chain 4 — Compliance
    {
        query: "How was the database audit trail finding F-2025-001 remediated?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-cc-4a", "v2-cc-4c"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // Chain 5 — Performance
    {
        query: "What caused the user-service latency degradation and what was the fix?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-cc-5a", "v2-cc-5c"],
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "What is the N+1 query pattern issue in user-service?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-cc-5c"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Cross-chain queries
    {
        query: "What security changes were made at Meridian in 2025?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-cc-2b", "v2-cc-2d"],
        expectedFragilityRange: [0.0, 1.0],
    },
    {
        query: "What performance improvements were achieved in the platform this year?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-cc-5c", "v2-cc-5e"],
        expectedFragilityRange: [0.0, 1.0],
    },
];
