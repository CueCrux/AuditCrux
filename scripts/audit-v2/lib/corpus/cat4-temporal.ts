/**
 * Category 4 — Temporal Reconstruction
 *
 * ~60 docs across 6 lifecycles over 12 months (T0 through T0+360d).
 * Tests whether the Engine correctly tracks document lifecycle states
 * including formal supersession, informal staleness, and contested states.
 */

import type { CorpusDocV2, CorpusRelation, LivingState } from "../types-v2.js";
import type { TemporalGroundTruth } from "../types-v2.js";
import { DOMAINS, docV2, meridianDateDays } from "./tenant.js";
import { generatePolicy, generateRFC, MIME_MARKDOWN } from "./templates/markdown.js";
import { generateFeatureFlags, generateDatabaseConfig, MIME_JSON } from "./templates/json-config.js";
import { generateK8sDeployment, generateCIPipeline, MIME_YAML } from "./templates/yaml-spec.js";
import { generateSLAMetrics, generatePerformanceMetrics, generateVendorCompliance, MIME_CSV } from "./templates/csv-data.js";
import { generateQBRReport, generateComplianceDashboard, MIME_HTML } from "./templates/html-report.js";
import { generateEmailThread, MIME_EMAIL } from "./templates/email.js";
import { generateMeetingNotes, generateRoughNotes, MIME_MEETING_NOTES } from "./templates/meeting-notes.js";
import { generateChatExport, MIME_CHAT } from "./templates/chat-export.js";
import { generateDraftDoc, generatePersonalNotes, MIME_WIKI } from "./templates/wiki-scratchpad.js";

// ============================================================================
// Lifecycle A — API Authentication Standard (10 docs)
// ============================================================================

const lifecycleA: CorpusDocV2[] = [
    // T0: Draft
    docV2("v2-tr-a1", DOMAINS.security, "Draft: API Authentication Standard",
        generateDraftDoc({
            title: "API Authentication Standard",
            author: "Bob Martinez",
            lastEdited: "2025-03-01",
            sections: [
                { heading: "Purpose", body: "Establish a unified API authentication standard for all Meridian services. Currently teams use a mix of API keys, OAuth 2.0, and custom token schemes.", complete: true },
                { heading: "Proposed Approach", body: "Standardize on OAuth 2.0 with PKCE for user-facing APIs and mutual TLS for service-to-service communication. API keys retained only for third-party integrations with 180-day rotation.", complete: true },
                { heading: "Migration Plan", body: "TODO: define migration timeline per service", complete: false },
            ],
            relatedLinks: ["[Current auth inventory](???)", "[OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)"],
        }),
        MIME_WIKI, meridianDateDays(0)),

    // T0+15d: Email review
    docV2("v2-tr-a2", DOMAINS.security, "RE: API Auth Standard Draft — Review Comments",
        generateEmailThread({
            subject: "API Auth Standard Draft — Review Comments",
            messages: [
                { from: "Olivia Tanaka <otanaka@meridian.test>", to: ["Bob Martinez <bmartinez@meridian.test>"], date: "2025-03-16 10:00", body: "Bob,\n\nReviewed the draft. Two concerns:\n\n1. mTLS for service-to-service is operationally heavy — we'd need to manage cert rotation across 15 services. Have we considered service mesh (Istio) to abstract this?\n\n2. The 180-day API key rotation is too long for PCI compliance. PCI DSS v4.0 recommends 90 days for keys accessing cardholder data.\n\nOlivia" },
                { from: "Bob Martinez <bmartinez@meridian.test>", to: ["Olivia Tanaka <otanaka@meridian.test>"], date: "2025-03-16 14:30", body: "Good points. I'll address both in v1:\n1. mTLS via service mesh — agreed, Istio sidecar handles cert rotation automatically.\n2. 90-day rotation for PCI-scoped keys, 180 days for non-PCI keys.\n\nBob" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(15)),

    // T0+30d: Meeting notes
    docV2("v2-tr-a3", DOMAINS.security, "API Auth Standard Review Meeting — 2025-03-31",
        generateMeetingNotes({
            title: "API Auth Standard Review",
            date: "2025-03-31",
            attendees: ["Bob Martinez", "Olivia Tanaka", "Alice Chen", "Karen Singh"],
            location: "Security War Room",
            notes: [
                "Reviewed draft with Olivia's feedback incorporated",
                "mTLS via Istio service mesh approved — David Kim to set up in staging",
                "API key rotation: 90 days for PCI scope, 180 days for everything else",
                "OAuth 2.0 with PKCE for all user-facing APIs confirmed",
                "Migration timeline: 6 months, starting with payment-service",
            ],
            decisions: [
                "API Auth Standard v1 approved for publication",
                "Payment-service migrates first (highest risk), then settlement-engine",
            ],
            actionItems: [
                { assignee: "bmartinez", task: "Publish API Auth Standard v1 by April 15" },
                { assignee: "dkim", task: "Deploy Istio in staging for mTLS testing" },
                { assignee: "achen", task: "Plan payment-service OAuth migration" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(30)),

    // T0+45d: Approved v1
    docV2("v2-tr-a4", DOMAINS.security, "API Authentication Standard v1",
        generatePolicy({
            id: "STD-SEC-005",
            title: "API Authentication Standard",
            version: "1.0",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2025-04-15",
            sections: [
                { heading: "Scope", body: "This standard applies to all API endpoints operated by Meridian Financial Services, both internal and external." },
                { heading: "Authentication Methods", body: "Three authentication methods are approved:\n\n1. **OAuth 2.0 with PKCE** — mandatory for all user-facing APIs. Access tokens expire after 15 minutes. Refresh tokens expire after 24 hours.\n2. **Mutual TLS (mTLS)** — mandatory for service-to-service communication via the Istio service mesh. Certificate rotation handled automatically by Istio.\n3. **API Keys** — permitted only for third-party integrations. Keys must be rotated every 90 days for PCI-scoped services and 180 days for all others." },
                { heading: "Token Format", body: "Access tokens must be JWTs signed with RS256. Token payload must include: sub (subject), iss (issuer), exp (expiration), scope (permissions), and tenant_id." },
                { heading: "Migration", body: "All services must migrate to this standard within 6 months. Payment-service migrates first (May 2025), followed by settlement-engine (June 2025). Remaining services by October 2025." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(45)),

    // T0+90d: JSON config implementing it
    docV2("v2-tr-a5", DOMAINS.platform, "Feature flags: API auth standard rollout",
        generateFeatureFlags({
            service: "auth-service",
            environment: "production",
            flags: [
                { key: "oauth2_pkce_enabled", enabled: true, description: "Enable OAuth 2.0 with PKCE for user-facing APIs", rollout_percentage: 100, owner: "Bob Martinez" },
                { key: "mtls_istio_enabled", enabled: true, description: "Enable mTLS via Istio for service-to-service auth", rollout_percentage: 100, owner: "David Kim" },
                { key: "api_key_rotation_90d", enabled: true, description: "Enforce 90-day API key rotation for PCI-scoped services", rollout_percentage: 100 },
                { key: "jwt_rs256_required", enabled: true, description: "Require RS256-signed JWTs for all access tokens", rollout_percentage: 100 },
            ],
        }),
        MIME_JSON, meridianDateDays(90)),

    // T0+150d: v1.1 amendment
    docV2("v2-tr-a6", DOMAINS.security, "API Authentication Standard v1.1 — ES256 Amendment",
        generatePolicy({
            id: "STD-SEC-005-A1",
            title: "API Authentication Standard — ES256 Amendment",
            version: "1.1",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2025-08-01",
            supersedes: "Amends Section 3 (Token Format) of API Auth Standard v1.0",
            sections: [
                { heading: "Change Summary", body: "This amendment updates the token signing algorithm from RS256 to ES256 (ECDSA with P-256). ES256 provides equivalent security with smaller token sizes (reducing header overhead by ~40%) and faster signature verification. RS256 tokens remain valid during a 30-day transition period." },
                { heading: "Updated Token Format", body: "Access tokens must be JWTs signed with ES256 (replacing RS256). The JWKS endpoint must publish both ES256 and RS256 public keys during the transition period. After September 1, 2025, RS256 keys will be removed from the JWKS endpoint." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(150)),

    // T0+210d: Email about v2
    docV2("v2-tr-a7", DOMAINS.security, "RE: Planning API Auth Standard v2",
        generateEmailThread({
            subject: "Planning API Auth Standard v2",
            messages: [
                { from: "Bob Martinez <bmartinez@meridian.test>", to: ["Olivia Tanaka <otanaka@meridian.test>", "Karen Singh <ksingh@meridian.test>"], date: "2025-10-01 09:00", body: "Team,\n\nWith the migration to v1 nearly complete and the ES256 amendment in place, I'm starting to plan v2 of the auth standard. Key additions for v2:\n\n1. Passkey/WebAuthn support for human users\n2. Token binding (DPoP) to prevent token replay\n3. Deprecate API keys entirely — move all integrations to OAuth client credentials\n\nTarget publication: January 2026.\n\nBob" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(210)),

    // T0+240d: v2 superseding v1.1
    docV2("v2-tr-a8", DOMAINS.security, "API Authentication Standard v2",
        generatePolicy({
            id: "STD-SEC-005",
            title: "API Authentication Standard",
            version: "2.0",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2025-11-15",
            supersedes: "API Authentication Standard v1.0 and v1.1",
            sections: [
                { heading: "Scope", body: "This standard supersedes API Authentication Standard v1.0 and its v1.1 amendment." },
                { heading: "Authentication Methods", body: "Four methods are approved:\n\n1. **Passkeys (WebAuthn/FIDO2)** — primary method for human user authentication\n2. **OAuth 2.0 with PKCE + DPoP** — for API access, tokens are sender-constrained\n3. **Mutual TLS** — for service-to-service via Istio\n4. **OAuth 2.0 Client Credentials** — for third-party integrations (replaces API keys)" },
                { heading: "Token Format", body: "Opaque tokens with server-side introspection (replacing JWTs). Enables instant revocation and reduces token size. Introspection endpoint must respond within 10ms." },
                { heading: "API Key Deprecation", body: "API keys are deprecated effective immediately. Existing keys remain valid until their next rotation date. No new API keys will be issued. All integrations must migrate to OAuth client credentials by March 2026." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(240)),

    // T0+300d: v1/v1.1 archived
    docV2("v2-tr-a9", DOMAINS.security, "ARCHIVED: API Authentication Standard v1.x",
        `# ARCHIVED: API Authentication Standard v1.x

This document confirms that API Authentication Standard v1.0 (2025-04-15) and its v1.1 amendment (2025-08-01) are now archived.

**Superseded by:** API Authentication Standard v2.0 (2025-11-15)

**Reason for archive:** v2.0 incorporates all v1.x requirements plus new capabilities (passkeys, DPoP, opaque tokens). v1.x should no longer be referenced for implementation guidance.

**Historical note:** v1.0 standardized OAuth 2.0 with PKCE, mTLS, and API keys. v1.1 updated token signing from RS256 to ES256. v2.0 moves to passkeys, DPoP-bound tokens, opaque tokens, and deprecates API keys entirely.`,
        MIME_MARKDOWN, meridianDateDays(300)),

    // T0+330d: Updated config for v2
    docV2("v2-tr-a10", DOMAINS.platform, "Feature flags: API auth v2 rollout",
        generateFeatureFlags({
            service: "auth-service",
            environment: "production",
            flags: [
                { key: "passkey_webauthn_enabled", enabled: true, description: "Enable passkey/WebAuthn authentication for human users", rollout_percentage: 75, owner: "Bob Martinez" },
                { key: "dpop_token_binding", enabled: true, description: "Enable DPoP sender-constrained tokens", rollout_percentage: 100 },
                { key: "opaque_tokens_enabled", enabled: true, description: "Use opaque tokens with server-side introspection (replaces JWT)", rollout_percentage: 100 },
                { key: "api_key_deprecation_warning", enabled: true, description: "Show deprecation warning for API key authentication", rollout_percentage: 100 },
                { key: "jwt_rs256_required", enabled: false, description: "[DEPRECATED] RS256 JWT requirement — replaced by opaque tokens", rollout_percentage: 0 },
            ],
        }),
        MIME_JSON, meridianDateDays(330)),
];

// ============================================================================
// Lifecycle B — Infrastructure Cost Optimization (10 docs)
// ============================================================================

const lifecycleB: CorpusDocV2[] = [
    docV2("v2-tr-b1", DOMAINS.platform, "Cloud infrastructure spend — Q1 2025",
        generatePerformanceMetrics({
            service: "cloud-infrastructure",
            period: "Q1 2025 (Monthly Cost Summary)",
            dataPoints: [
                { date: "2025-01", requests: 0, errors: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, cpu_pct: 72, memory_mb: 45200 },
                { date: "2025-02", requests: 0, errors: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, cpu_pct: 75, memory_mb: 48300 },
                { date: "2025-03", requests: 0, errors: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0, cpu_pct: 78, memory_mb: 51800 },
            ],
        }),
        MIME_CSV, meridianDateDays(30)),

    docV2("v2-tr-b2", DOMAINS.product, "Cost optimization brainstorm — 2025-04-30",
        generateRoughNotes({
            title: "Cost optimization brainstorm",
            date: "2025-04-30",
            scribe: "swallace",
            rawNotes: [
                "- cloud spend up 15% QoQ, need to get this under control",
                "- Sam proposed spot instances for non-critical workloads",
                "- reporting-service and notification-service are good candidates",
                "- spot can save 60-70% on compute costs",
                "- risk: spot interruptions — need graceful shutdown handling",
                "- David: we'd need to update k8s configs for spot nodepool toleration",
                "- Grace wants a formal RFC before we proceed",
            ],
            todos: [
                "Sam: draft RFC for spot instance adoption",
                "David: prototype spot nodepool in staging",
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(60)),

    docV2("v2-tr-b3", DOMAINS.eng, "RFC-0022: Spot Instance Adoption for Non-Critical Workloads",
        generateRFC({
            number: 22,
            title: "Spot Instance Adoption for Non-Critical Workloads",
            author: "Sam Wallace",
            status: "Accepted",
            date: "2025-05-30",
            summary: "Adopt EC2 spot instances for Tier 3 services (notification-service, reporting-service, webhook-relay, document-store) to reduce compute costs by an estimated 60-70%.",
            motivation: "Cloud infrastructure spend increased 15% quarter-over-quarter in Q1 2025. Tier 3 services account for 35% of total compute cost but have relaxed availability requirements (99.5% SLA). Spot instances provide equivalent compute at 60-70% discount with the trade-off of potential interruption.",
            proposal: "Deploy Tier 3 services on a dedicated spot instance node pool with graceful shutdown handling. Services must handle SIGTERM within 120 seconds. Kubernetes pod disruption budgets ensure at least 1 replica remains available during spot interruptions. On-demand fallback pool maintains minimum capacity.",
            risks: [
                "Spot interruption during peak hours could degrade notification delivery",
                "Spot pricing volatility — costs could increase if demand spikes",
                "Operational complexity of managing mixed on-demand/spot node pools",
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(90)),

    docV2("v2-tr-b4", DOMAINS.platform, "K8s config: spot instance node pool",
        generateK8sDeployment({
            service: "notification-service",
            namespace: "production",
            replicas: 3,
            image: "registry.meridian.internal/notification-service",
            tag: "v1.8.2",
            memoryLimit: "512Mi",
            cpuLimit: "500m",
            memoryRequest: "256Mi",
            cpuRequest: "250m",
            env: [
                { name: "NODE_ENV", value: "production" },
                { name: "GRACEFUL_SHUTDOWN_TIMEOUT", value: "120000" },
                { name: "SPOT_INSTANCE", value: "true" },
            ],
            port: 3000,
        }),
        MIME_YAML, meridianDateDays(120)),

    docV2("v2-tr-b5", DOMAINS.compliance, "Cost reduction report — spot instances Q3 2025",
        generateSLAMetrics({
            reportPeriod: "Q3 2025 — Spot Instance Cost Impact",
            services: [
                { name: "notification-service", target: 99.5, actual: 99.62, month: "2025-07", incidents: 2, p99_latency_ms: 85 },
                { name: "reporting-service", target: 99.5, actual: 99.71, month: "2025-07", incidents: 1, p99_latency_ms: 120 },
                { name: "webhook-relay", target: 99.5, actual: 99.55, month: "2025-07", incidents: 3, p99_latency_ms: 45 },
                { name: "document-store", target: 99.5, actual: 99.68, month: "2025-07", incidents: 1, p99_latency_ms: 95 },
            ],
        }),
        MIME_CSV, meridianDateDays(150)),

    docV2("v2-tr-b6", DOMAINS.leadership, "Q3 2025 Infrastructure QBR — Cost Optimization",
        generateQBRReport({
            quarter: "Q3",
            year: 2025,
            department: "Infrastructure",
            highlights: [
                { metric: "Compute Cost Reduction", target: "60%", actual: "63%", status: "On Track" },
                { metric: "Spot Availability", target: "> 99%", actual: "99.4%", status: "On Track" },
                { metric: "Tier 3 SLA", target: "99.5%", actual: "99.64%", status: "On Track" },
                { metric: "Spot Interruptions", target: "< 10/month", actual: "7", status: "On Track" },
            ],
            narrative: "The spot instance adoption for Tier 3 services has delivered a 63% reduction in compute costs for those workloads, exceeding the 60% target from RFC-0022. All 4 Tier 3 services maintained above their 99.5% SLA targets despite 7 spot interruptions in Q3. Graceful shutdown handling and pod disruption budgets worked as designed.",
            risks: [
                { description: "Spot pricing could increase during re:Invent period", severity: "Low", mitigation: "On-demand fallback pool provides baseline capacity" },
            ],
        }),
        MIME_HTML, meridianDateDays(180)),

    docV2("v2-tr-b7", DOMAINS.platform, "RE: Spot instances — reliability concerns",
        generateEmailThread({
            subject: "Spot instances — reliability concerns",
            messages: [
                { from: "James Okafor <jokafor@meridian.test>", to: ["Sam Wallace <swallace@meridian.test>", "Grace Huang <ghuang@meridian.test>"], date: "2025-11-05 08:30", body: "Team,\n\nWe've seen a spike in spot interruptions in November — 15 so far vs 7/month average. The webhook-relay had a 12-minute outage yesterday when all 3 spot instances were reclaimed simultaneously.\n\nI'm recommending we evaluate reserved instances as an alternative. We've been on spot for 5 months now, which gives us good data on our actual usage patterns. Reserved 1-year commitment could provide ~40% savings with zero interruption risk.\n\nJames" },
                { from: "Sam Wallace <swallace@meridian.test>", to: ["James Okafor <jokafor@meridian.test>"], date: "2025-11-05 10:00", body: "The November spike is unusual — likely related to AWS capacity changes before re:Invent. But your point about reserved instances is valid. Let me run the numbers and compare total cost of ownership.\n\nSam" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(240)),

    docV2("v2-tr-b8", DOMAINS.platform, "#infra-cost: reserved vs spot discussion",
        generateChatExport({
            channel: "infra-cost",
            date: "2025-11-20",
            messages: [
                { timestamp: "10:15", handle: "swallace", message: "ran the numbers on reserved vs spot for Tier 3 services" },
                { timestamp: "10:16", handle: "swallace", message: "spot: avg 63% savings but 15 interruptions in Nov. reserved 1yr: 40% savings, zero interruptions" },
                { timestamp: "10:17", handle: "swallace", message: "the 23% cost difference is ~$4.2K/month. question is whether that's worth the interruption risk" },
                { timestamp: "10:20", handle: "jokafor", message: "given the webhook-relay outage cost us way more in incident response time, I'd say reserved wins" },
                { timestamp: "10:22", handle: "ghuang", message: "agreed. let's move to reserved. can we do a mix? reserved for baseline + spot for burst?", reaction: ":thumbsup: x4" },
                { timestamp: "10:25", handle: "swallace", message: "yes, that's the best approach. reserved for min replicas, spot for autoscale overflow" },
            ],
        }),
        MIME_CHAT, meridianDateDays(270)),

    docV2("v2-tr-b9", DOMAINS.eng, "Updated Infrastructure Cost Policy — Reserved Instance Strategy",
        generatePolicy({
            id: "POL-INFRA-003",
            title: "Infrastructure Cost Management — Reserved Instance Strategy",
            version: "1.0",
            department: "Platform Engineering",
            owner: "Sam Wallace",
            effectiveDate: "2025-12-15",
            supersedes: "RFC-0022 spot-only approach for Tier 3 services",
            sections: [
                { heading: "Strategy", body: "Tier 3 services will use a hybrid compute model: reserved instances for baseline capacity (minimum replicas) and spot instances for autoscale overflow. This replaces the spot-only approach from RFC-0022." },
                { heading: "Rationale", body: "The spot-only approach delivered 63% cost savings but introduced reliability risk. November 2025 saw 15 spot interruptions including a 12-minute webhook-relay outage. Reserved instances for baseline capacity eliminate interruption risk for minimum replicas while spot overflow maintains cost efficiency for peak demand." },
                { heading: "Expected Savings", body: "Baseline cost reduction: ~40% (reserved) vs ~63% (spot-only). Reduced incident response costs offset the 23% difference. Total estimated savings: $38K/year." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(300)),

    docV2("v2-tr-b10", DOMAINS.platform, "K8s config: reserved instance node pool (replaces spot-only)",
        generateK8sDeployment({
            service: "notification-service",
            namespace: "production",
            replicas: 3,
            image: "registry.meridian.internal/notification-service",
            tag: "v1.12.0",
            memoryLimit: "512Mi",
            cpuLimit: "500m",
            memoryRequest: "256Mi",
            cpuRequest: "250m",
            env: [
                { name: "NODE_ENV", value: "production" },
                { name: "GRACEFUL_SHUTDOWN_TIMEOUT", value: "120000" },
                { name: "INSTANCE_TYPE", value: "reserved" },
            ],
            port: 3000,
        }),
        MIME_YAML, meridianDateDays(330)),
];

// ============================================================================
// Lifecycle C — Vendor Assessment (10 docs)
// ============================================================================

const lifecycleC: CorpusDocV2[] = [
    docV2("v2-tr-c1", DOMAINS.compliance, "Vendor comparison matrix — KYC providers 2025",
        generateVendorCompliance({
            vendors: [
                { name: "Onfido", category: "KYC/Identity Verification", soc2: "Certified", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-02-15", riskRating: "Low", contractExpiry: "2025-09-30" },
                { name: "Jumio", category: "KYC/Identity Verification", soc2: "Certified", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-01-20", riskRating: "Low", contractExpiry: "N/A" },
                { name: "Veriff", category: "KYC/Identity Verification", soc2: "In Progress", gdpr: "Compliant", pci: "N/A", lastAudit: "2024-11-30", riskRating: "Medium", contractExpiry: "N/A" },
            ],
        }),
        MIME_CSV, meridianDateDays(15)),

    docV2("v2-tr-c2", DOMAINS.compliance, "RE: KYC provider evaluation",
        generateEmailThread({
            subject: "KYC provider evaluation",
            messages: [
                { from: "Carol Okonkwo <cokonkwo@meridian.test>", to: ["Elena Voronova <evoronova@meridian.test>", "Grace Huang <ghuang@meridian.test>"], date: "2025-04-15 09:00", body: "Team,\n\nOur current KYC provider (Onfido) contract expires September 30. I've started evaluating alternatives. Key factors: verification accuracy, API response time, GDPR compliance, and cost.\n\nOnfido: good accuracy (98.5%) but API latency has been increasing (avg 3.2s, up from 2.1s last year). Pricing: $0.85/verification.\nJumio: comparable accuracy (98.2%), faster API (1.8s avg). Pricing: $0.72/verification.\nVeriff: newer player, good accuracy (97.8%), fastest API (1.2s avg). Pricing: $0.65/verification. BUT no SOC 2 cert yet.\n\nRecommendation: Jumio offers the best balance of accuracy, performance, and compliance.\n\nCarol" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(45)),

    docV2("v2-tr-c3", DOMAINS.product, "KYC vendor selection meeting — 2025-05-15",
        generateMeetingNotes({
            title: "KYC Vendor Selection",
            date: "2025-05-15",
            attendees: ["Carol Okonkwo", "Elena Voronova", "Grace Huang", "Alice Chen"],
            location: "Board Room",
            notes: [
                "Reviewed Carol's vendor comparison",
                "Jumio selected as new KYC provider",
                "Key factors: SOC 2 certification, 98.2% accuracy, 1.8s avg API time, $0.72/verification",
                "Veriff rejected due to missing SOC 2 — revisit when they complete certification",
                "Alice: integration effort estimated at 3 sprints for kyc-service migration",
            ],
            decisions: [
                "Migrate from Onfido to Jumio by September 1, 2025",
                "Run parallel verification (Onfido + Jumio) for 30 days before cutover",
            ],
            actionItems: [
                { assignee: "cokonkwo", task: "Negotiate Jumio contract" },
                { assignee: "achen", task: "Begin kyc-service integration with Jumio API" },
                { assignee: "evoronova", task: "Define acceptance criteria for parallel testing" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(75)),

    docV2("v2-tr-c4", DOMAINS.compliance, "Jumio KYC Provider Contract Summary",
        generatePolicy({
            id: "VND-2025-004",
            title: "Vendor Contract Summary: Jumio KYC Services",
            version: "1.0",
            department: "Compliance",
            owner: "Carol Okonkwo",
            effectiveDate: "2025-06-01",
            sections: [
                { heading: "Contract Terms", body: "Vendor: Jumio Corporation\nService: Identity verification and KYC processing\nContract period: July 1, 2025 — June 30, 2027 (24 months)\nPricing: $0.72 per verification (volume discount: $0.65 above 100K/month)\nSLA: 99.9% API availability, p99 latency < 3 seconds" },
                { heading: "Compliance", body: "SOC 2 Type II certified (annual renewal). GDPR compliant with EU data processing addendum. Data processed in EU (Frankfurt) region." },
                { heading: "Exit Terms", body: "90-day termination notice. Data deletion within 30 days of contract termination. All verification data returned in structured format." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(90)),

    docV2("v2-tr-c5", DOMAINS.platform, "Jumio integration config — kyc-service",
        generateDatabaseConfig({
            service: "kyc-service",
            host: "api.jumio.com",
            port: 443,
            database: "jumio-meridian-prod",
            pool: { maxConnections: 25, minConnections: 5, idleTimeoutMs: 60000, connectionTimeoutMs: 10000 },
            ssl: true,
        }),
        MIME_JSON, meridianDateDays(120)),

    docV2("v2-tr-c6", DOMAINS.compliance, "Jumio Vendor Compliance Audit — H2 2025",
        generateComplianceDashboard({
            reportDate: "2025-09-15",
            framework: "Vendor Risk Assessment",
            controls: [
                { id: "VRA-1", name: "SOC 2 Type II Certification", status: "Compliant", lastTested: "2025-09-01", owner: "Carol Okonkwo" },
                { id: "VRA-2", name: "GDPR Data Processing", status: "Compliant", lastTested: "2025-08-15", owner: "Paul Dubois" },
                { id: "VRA-3", name: "API Availability SLA", status: "Compliant", lastTested: "2025-09-10", owner: "Alice Chen", finding: "99.95% achieved vs 99.9% SLA target" },
                { id: "VRA-4", name: "Incident Response", status: "Compliant", lastTested: "2025-07-20", owner: "Bob Martinez" },
            ],
            overallScore: 98,
        }),
        MIME_HTML, meridianDateDays(180)),

    docV2("v2-tr-c7", DOMAINS.product, "#kyc-ops: Jumio reliability issues",
        generateChatExport({
            channel: "kyc-ops",
            date: "2025-11-10",
            messages: [
                { timestamp: "11:30", handle: "achen", message: "anyone else seeing elevated Jumio API errors? getting 502s on ~5% of verification requests" },
                { timestamp: "11:32", handle: "qmurphy", message: "yeah same here, started about 2 hours ago" },
                { timestamp: "11:35", handle: "achen", message: "opened a support ticket with Jumio. their status page shows 'degraded performance' in EU-WEST region" },
                { timestamp: "11:40", handle: "cokonkwo", message: "this is the 3rd incident in the past 6 weeks. they were at 99.95% but trending down" },
                { timestamp: "11:45", handle: "achen", message: "if this continues we might need to revisit the vendor decision. Veriff got their SOC 2 cert last month" },
                { timestamp: "11:48", handle: "cokonkwo", message: "noted. let's give Jumio until end of year to stabilize. if reliability doesn't improve, I'll start the replacement process" },
            ],
        }),
        MIME_CHAT, meridianDateDays(240)),

    docV2("v2-tr-c8", DOMAINS.compliance, "RE: Jumio reliability — vendor replacement evaluation",
        generateEmailThread({
            subject: "Jumio reliability — vendor replacement evaluation",
            messages: [
                { from: "Carol Okonkwo <cokonkwo@meridian.test>", to: ["Grace Huang <ghuang@meridian.test>", "Alice Chen <achen@meridian.test>"], date: "2025-12-15 10:00", body: "Team,\n\nJumio reliability has not improved. We had 5 more incidents in December. Their actual availability is now at 99.2% — well below the 99.9% SLA in our contract.\n\nI'm recommending we start evaluating replacements. Veriff now has SOC 2 Type II certification (completed October 2025) and their pricing is still competitive at $0.65/verification.\n\nI'll initiate the formal vendor replacement process and issue an RFP.\n\nCarol" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(270)),

    docV2("v2-tr-c9", DOMAINS.eng, "RFC-0031: KYC Provider Migration — Jumio to Veriff",
        generateRFC({
            number: 31,
            title: "KYC Provider Migration — Jumio to Veriff",
            author: "Alice Chen",
            status: "Proposed",
            date: "2026-01-15",
            summary: "Migrate from Jumio to Veriff for KYC identity verification due to Jumio reliability degradation (99.2% actual vs 99.9% SLA) and Veriff's newly obtained SOC 2 certification.",
            motivation: "Jumio has experienced 8 incidents in the past 3 months with actual availability at 99.2%. The SLA breach has been formally documented. Veriff completed SOC 2 Type II certification in October 2025, eliminating the compliance blocker that prevented their selection in the original evaluation.",
            proposal: "3-phase migration: (1) Deploy Veriff integration in staging (2 sprints), (2) Parallel run Jumio+Veriff in production for 30 days, (3) Cutover to Veriff as primary with Jumio as fallback for 30 days, then full decommission.",
            risks: [
                "Veriff accuracy slightly lower (97.8% vs Jumio 98.2%) — monitor false positive rate during parallel run",
                "Integration effort estimated at 2 sprints (Veriff API is similar but not identical to Jumio)",
                "Contract exit with Jumio requires 90-day notice",
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(300)),

    docV2("v2-tr-c10", DOMAINS.compliance, "Updated vendor comparison matrix — KYC 2026",
        generateVendorCompliance({
            vendors: [
                { name: "Onfido", category: "KYC/Identity Verification", soc2: "Certified", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-11-15", riskRating: "Low", contractExpiry: "Expired 2025-09-30" },
                { name: "Jumio", category: "KYC/Identity Verification", soc2: "Certified", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-10-20", riskRating: "High", contractExpiry: "2027-06-30" },
                { name: "Veriff", category: "KYC/Identity Verification", soc2: "Certified", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-10-01", riskRating: "Low", contractExpiry: "N/A" },
            ],
        }),
        MIME_CSV, meridianDateDays(345)),
];

// ============================================================================
// Lifecycle D — Data Privacy Policy (10 docs)
// ============================================================================

const lifecycleD: CorpusDocV2[] = [
    docV2("v2-tr-d1", DOMAINS.compliance, "Data Privacy Policy v1",
        generatePolicy({
            id: "POL-COMP-002",
            title: "Data Privacy Policy",
            version: "1.0",
            department: "Compliance",
            owner: "Carol Okonkwo",
            effectiveDate: "2025-03-01",
            sections: [
                { heading: "Purpose", body: "This policy establishes data privacy requirements for Meridian Financial Services in compliance with GDPR, CCPA, and applicable financial regulations." },
                { heading: "Data Subject Rights", body: "Meridian supports: right to access (30 days), right to erasure (30 days), right to portability (30 days), right to rectification (15 days). All requests logged in the DSR tracking system." },
                { heading: "Consent Management", body: "Explicit consent required for marketing communications. Legitimate interest basis for transaction processing. Consent records retained for 7 years." },
                { heading: "Data Processing", body: "Personal data processed only within the EU (primary) and UK (secondary). No transfers to third countries without adequacy decision or Standard Contractual Clauses." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(0)),

    docV2("v2-tr-d2", DOMAINS.compliance, "RE: GDPR Article 25 — privacy by design requirements",
        generateEmailThread({
            subject: "GDPR Article 25 — privacy by design requirements",
            messages: [
                { from: "Paul Dubois <pdubois@meridian.test>", to: ["Carol Okonkwo <cokonkwo@meridian.test>"], date: "2025-05-01 09:00", body: "Carol,\n\nThe DPA has published new guidance on GDPR Article 25 (Data Protection by Design). Key changes affecting our privacy policy:\n\n1. Privacy Impact Assessments (PIA) now required for ANY new feature that processes personal data, not just high-risk processing\n2. Data minimization must be enforced at the API level — endpoints should only return fields required by the requesting service\n3. Pseudonymization recommended for all analytics and reporting workloads\n\nOur current v1 policy doesn't cover any of these. We should update.\n\nPaul" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(60)),

    docV2("v2-tr-d3", DOMAINS.product, "Privacy policy review meeting — 2025-06-15",
        generateMeetingNotes({
            title: "Data Privacy Policy v2 Review",
            date: "2025-06-15",
            attendees: ["Carol Okonkwo", "Paul Dubois", "Bob Martinez", "Elena Voronova"],
            location: "Compliance Suite",
            notes: [
                "Reviewed Paul's analysis of DPA Article 25 guidance",
                "Agreed: v2 must add PIA requirements, data minimization, pseudonymization",
                "Bob: pseudonymization aligns with our security posture — supports it",
                "Elena: PIA for every feature could slow down product velocity",
                "Compromise: PIA required for features touching PII, lightweight checklist for others",
            ],
            decisions: [
                "Publish Data Privacy Policy v2 by July 1",
                "PIA required for features processing PII; checklist for others",
                "Pseudonymization mandatory for analytics/reporting by Q4",
            ],
            actionItems: [
                { assignee: "cokonkwo", task: "Draft v2 policy" },
                { assignee: "pdubois", task: "Create PIA template and lightweight checklist" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(90)),

    docV2("v2-tr-d4", DOMAINS.compliance, "Data Privacy Policy v2",
        generatePolicy({
            id: "POL-COMP-002",
            title: "Data Privacy Policy",
            version: "2.0",
            department: "Compliance",
            owner: "Carol Okonkwo",
            effectiveDate: "2025-07-01",
            supersedes: "Data Privacy Policy v1.0 (2025-03-01)",
            sections: [
                { heading: "Purpose", body: "This policy supersedes Data Privacy Policy v1.0 and incorporates DPA guidance on GDPR Article 25 (Data Protection by Design)." },
                { heading: "Privacy by Design", body: "All new features processing personal data require a Privacy Impact Assessment (PIA) before development begins. Features not processing personal data require a lightweight privacy checklist. PIAs must be reviewed and approved by the Data Protection Officer." },
                { heading: "Data Minimization", body: "APIs must only return data fields required by the requesting service. Field-level access controls must be implemented for all endpoints returning personal data. Unused data fields must be removed during annual API reviews." },
                { heading: "Pseudonymization", body: "All personal data used for analytics, reporting, and machine learning must be pseudonymized. Pseudonymization keys stored separately from pseudonymized data. Re-identification permitted only by authorized personnel with documented justification." },
                { heading: "Data Subject Rights", body: "Unchanged from v1: access (30 days), erasure (30 days), portability (30 days), rectification (15 days)." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(120)),

    docV2("v2-tr-d5", DOMAINS.platform, "Feature flags: privacy policy v2 enforcement",
        generateFeatureFlags({
            service: "platform-compliance",
            environment: "production",
            flags: [
                { key: "pia_required_for_pii", enabled: true, description: "Require Privacy Impact Assessment for features processing PII", rollout_percentage: 100, owner: "Carol Okonkwo" },
                { key: "data_minimization_enforcement", enabled: true, description: "Enforce API field-level access controls", rollout_percentage: 50, owner: "Paul Dubois" },
                { key: "pseudonymization_analytics", enabled: true, description: "Require pseudonymization for analytics pipelines", rollout_percentage: 100 },
            ],
        }),
        MIME_JSON, meridianDateDays(180)),

    docV2("v2-tr-d6", DOMAINS.compliance, "Privacy Compliance Dashboard — H2 2025",
        generateComplianceDashboard({
            reportDate: "2025-09-30",
            framework: "GDPR Compliance",
            controls: [
                { id: "GDPR-25", name: "Privacy by Design", status: "Compliant", lastTested: "2025-09-15", owner: "Carol Okonkwo" },
                { id: "GDPR-17", name: "Right to Erasure", status: "Compliant", lastTested: "2025-09-01", owner: "Paul Dubois" },
                { id: "GDPR-20", name: "Right to Portability", status: "Compliant", lastTested: "2025-09-01", owner: "Paul Dubois" },
                { id: "GDPR-5.1c", name: "Data Minimization", status: "In Progress", lastTested: "2025-09-10", owner: "Alice Chen", finding: "50% of APIs enforcing field-level controls, target 100% by Q1 2026" },
            ],
            overallScore: 88,
        }),
        MIME_HTML, meridianDateDays(210)),

    docV2("v2-tr-d7", DOMAINS.product, "Draft: Privacy policy v3 ideas — personal notes",
        generatePersonalNotes({
            topic: "Privacy policy v3 brainstorm",
            author: "Paul Dubois",
            snippets: [
                "v2 doesn't cover AI/ML training data — need to add this",
                "should we allow synthetic data as alternative to pseudonymization?",
                "consent fatigue issue — too many consent prompts, users just click through",
                "new ePrivacy regulation expected in 2026 — might change cookie rules",
                "data minimization enforcement only at 50% — need to push this to 100%",
            ],
            questions: [
                "do we need a separate AI data governance policy?",
                "should pseudonymization be differential privacy instead?",
                "when will ePrivacy reg actually be finalized?",
            ],
        }),
        MIME_WIKI, meridianDateDays(270)),

    docV2("v2-tr-d8", DOMAINS.platform, "#privacy-eng: concerns about v2 data minimization",
        generateChatExport({
            channel: "privacy-eng",
            date: "2025-12-10",
            messages: [
                { timestamp: "14:00", handle: "qmurphy", message: "the v2 data minimization requirement is causing issues. user-service needs to return email for auth but the field-level control blocks it for reporting-service" },
                { timestamp: "14:02", handle: "fabadi", message: "same issue with payment-service. the field-level controls are too coarse — we need per-service permissions not just per-field" },
                { timestamp: "14:05", handle: "pdubois", message: "this is a known gap in v2. the policy says 'field-level access controls' but the implementation needs to be per-service-per-field" },
                { timestamp: "14:08", handle: "qmurphy", message: "so is v2 the current policy or not? because technically the implementation doesn't match what v2 says" },
                { timestamp: "14:10", handle: "cokonkwo", message: "v2 is still current. the implementation gap doesn't invalidate the policy — it means we need to fix the implementation, not change the policy" },
                { timestamp: "14:12", handle: "fabadi", message: "but the policy is causing us to build the wrong thing. shouldn't the policy be updated to reflect reality?" },
            ],
        }),
        MIME_CHAT, meridianDateDays(300)),

    docV2("v2-tr-d9", DOMAINS.product, "Privacy policy amendment discussion — 2026-01-10",
        generateMeetingNotes({
            title: "Privacy Policy v2 Amendment Discussion",
            date: "2026-01-10",
            attendees: ["Carol Okonkwo", "Paul Dubois", "Frank Abadi", "Quinn Murphy"],
            location: "Zoom",
            notes: [
                "Discussed the data minimization implementation gap",
                "Agreed: v2 policy text is correct but implementation needs refinement",
                "Per-service-per-field access controls are the right approach",
                "Will NOT do a full v3 — too disruptive, too many moving parts",
                "Instead: v2.1 amendment to clarify data minimization implementation",
            ],
            decisions: [
                "Keep v2 as current policy",
                "Issue v2.1 amendment clarifying per-service-per-field access controls",
                "Table v3 until ePrivacy regulation is finalized",
            ],
            actionItems: [
                { assignee: "cokonkwo", task: "Draft v2.1 amendment by Feb 1" },
                { assignee: "qmurphy", task: "Implement per-service-per-field access controls" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(330)),

    docV2("v2-tr-d10", DOMAINS.compliance, "RE: Privacy policy v2.1 amendment — draft for review",
        generateEmailThread({
            subject: "Privacy policy v2.1 amendment — draft for review",
            messages: [
                { from: "Carol Okonkwo <cokonkwo@meridian.test>", to: ["Paul Dubois <pdubois@meridian.test>", "Frank Abadi <fabadi@meridian.test>"], date: "2026-02-01 09:00", body: "Team,\n\nDraft v2.1 amendment attached. Key change: Section 3 (Data Minimization) now specifies per-service-per-field access controls instead of per-field controls. This aligns with the actual implementation needs discussed in our January meeting.\n\nPlease review and send comments by February 10. Target publication: February 15.\n\nCarol" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(345)),
];

// ============================================================================
// Lifecycle E — Deployment Pipeline (10 docs)
// ============================================================================

const lifecycleE: CorpusDocV2[] = [
    docV2("v2-tr-e1", DOMAINS.platform, "CI/CD pipeline v1 — standard build",
        generateCIPipeline({
            service: "standard-pipeline",
            language: "Node.js",
            testCommand: "npm test",
            buildCommand: "npm run build",
            deployTarget: "staging",
            secretScanning: false,
            dependencyAudit: false,
        }),
        MIME_YAML, meridianDateDays(15)),

    docV2("v2-tr-e2", DOMAINS.platform, "#devx: pipeline improvement ideas",
        generateChatExport({
            channel: "devx",
            date: "2025-04-15",
            messages: [
                { timestamp: "10:00", handle: "nbrooks", message: "our CI pipeline is taking 12 minutes on average. way too slow" },
                { timestamp: "10:02", handle: "dkim", message: "main bottleneck is the npm install step — 4 minutes every time" },
                { timestamp: "10:05", handle: "nbrooks", message: "we should add caching. also want to add parallel test execution" },
                { timestamp: "10:08", handle: "swallace", message: "let's also add security scanning while we're at it. Bob's been asking for secret scanning in CI" },
                { timestamp: "10:10", handle: "nbrooks", message: "good idea. I'll draft an RFC for pipeline v2" },
            ],
        }),
        MIME_CHAT, meridianDateDays(45)),

    docV2("v2-tr-e3", DOMAINS.eng, "RFC-0019: CI/CD Pipeline v2 — Performance and Security",
        generateRFC({
            number: 19,
            title: "CI/CD Pipeline v2 — Performance and Security Enhancements",
            author: "Nathan Brooks",
            status: "Accepted",
            date: "2025-05-15",
            summary: "Redesign the CI/CD pipeline to reduce build times from 12 minutes to under 5 minutes while adding mandatory security scanning.",
            motivation: "Current pipeline averages 12 minutes per build. npm install accounts for 4 minutes, sequential test execution for 5 minutes. No security scanning in pipeline despite INC-2025-1247 (credential leak) recommending it.",
            proposal: "Three key changes: (1) Add npm cache layer using actions/cache, reducing install time to ~30 seconds. (2) Parallelize test execution across 4 runners, reducing test time from 5 minutes to ~90 seconds. (3) Add mandatory secret scanning (TruffleHog) and dependency audit (npm audit) as pipeline gates.",
            risks: [
                "Parallel test execution may surface race conditions in tests",
                "Secret scanning could produce false positives blocking deploys",
                "Pipeline complexity increases — need to document new workflow",
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(75)),

    docV2("v2-tr-e4", DOMAINS.platform, "CI/CD pipeline v2 — with caching and security",
        generateCIPipeline({
            service: "standard-pipeline-v2",
            language: "Node.js",
            testCommand: "npm test -- --parallel --workers=4",
            buildCommand: "npm run build",
            deployTarget: "production",
            secretScanning: true,
            dependencyAudit: true,
        }),
        MIME_YAML, meridianDateDays(120)),

    docV2("v2-tr-e5", DOMAINS.product, "Pipeline performance review — 2025-08-01",
        generateMeetingNotes({
            title: "CI/CD Pipeline v2 Performance Review",
            date: "2025-08-01",
            attendees: ["Nathan Brooks", "David Kim", "Karen Singh"],
            location: "Zoom",
            notes: [
                "Pipeline v2 deployed to all repos 6 weeks ago",
                "Average build time: 4.2 minutes (down from 12 minutes — 65% improvement)",
                "npm cache hit rate: 94%",
                "Secret scanning: 2 true positives caught, 8 false positives (4% false positive rate)",
                "Dependency audit: blocked 3 PRs with high-severity vulnerabilities",
                "Parallel tests: no race conditions detected so far",
            ],
            decisions: ["Pipeline v2 declared stable — no changes needed"],
            actionItems: [
                { assignee: "nbrooks", task: "Tune TruffleHog rules to reduce false positives" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(150)),

    docV2("v2-tr-e6", DOMAINS.eng, "Deployment metrics — H1 vs H2 2025",
        generatePerformanceMetrics({
            service: "ci-cd-pipeline",
            period: "2025 H1 vs H2 comparison",
            dataPoints: [
                { date: "H1-avg", requests: 850, errors: 12, p50_ms: 720000, p95_ms: 840000, p99_ms: 960000, cpu_pct: 45, memory_mb: 2048 },
                { date: "H2-avg", requests: 920, errors: 5, p50_ms: 252000, p95_ms: 310000, p99_ms: 380000, cpu_pct: 55, memory_mb: 2560 },
            ],
        }),
        MIME_CSV, meridianDateDays(180)),

    docV2("v2-tr-e7", DOMAINS.security, "RE: Adding SAST scanning to CI pipeline",
        generateEmailThread({
            subject: "Adding SAST scanning to CI pipeline",
            messages: [
                { from: "Bob Martinez <bmartinez@meridian.test>", to: ["Nathan Brooks <nbrooks@meridian.test>"], cc: ["Karen Singh <ksingh@meridian.test>"], date: "2025-10-01 11:00", body: "Nathan,\n\nFollowing the SOC 2 audit findings, we need to add SAST (Static Application Security Testing) to the CI pipeline. Semgrep is my recommendation — it's fast, has good rule coverage for Node.js, and can run in under 60 seconds.\n\nCan we add this as a v2.1 update?\n\nBob" },
                { from: "Nathan Brooks <nbrooks@meridian.test>", to: ["Bob Martinez <bmartinez@meridian.test>"], date: "2025-10-01 14:00", body: "Makes sense. I'll add Semgrep as a new pipeline stage. It'll run in parallel with the existing security checks so it shouldn't add to total build time.\n\nNathan" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(210)),

    docV2("v2-tr-e8", DOMAINS.platform, "CI/CD pipeline v2.1 — with SAST scanning",
        generateCIPipeline({
            service: "standard-pipeline-v2.1",
            language: "Node.js",
            testCommand: "npm test -- --parallel --workers=4",
            buildCommand: "npm run build",
            deployTarget: "production",
            secretScanning: true,
            dependencyAudit: true,
        }),
        MIME_YAML, meridianDateDays(240)),

    docV2("v2-tr-e9", DOMAINS.leadership, "Deployment Dashboard — Q4 2025",
        generateQBRReport({
            quarter: "Q4",
            year: 2025,
            department: "Platform Engineering — CI/CD",
            highlights: [
                { metric: "Average Build Time", target: "< 5 min", actual: "4.5 min", status: "On Track" },
                { metric: "Security Scan Coverage", target: "100%", actual: "100%", status: "On Track" },
                { metric: "False Positive Rate", target: "< 5%", actual: "2.8%", status: "On Track" },
                { metric: "Deploy Frequency", target: "> 20/week", actual: "28/week", status: "On Track" },
            ],
            narrative: "CI/CD pipeline v2.1 with SAST scanning has been deployed across all repositories. Build times remain under 5 minutes despite adding Semgrep analysis. The security scanning stages (secret scanning, dependency audit, SAST) have caught 12 genuine security issues in Q4, preventing them from reaching production.",
            risks: [
                { description: "Pipeline complexity increasing — need to document and test the pipeline itself", severity: "Low", mitigation: "Pipeline-as-code with its own test suite" },
            ],
        }),
        MIME_HTML, meridianDateDays(300)),

    docV2("v2-tr-e10", DOMAINS.eng, "CI/CD Pipeline Retrospective — 2025",
        generatePolicy({
            id: "RETRO-CICD-2025",
            title: "CI/CD Pipeline Evolution — 2025 Retrospective",
            version: "1.0",
            department: "Platform Engineering",
            owner: "Nathan Brooks",
            effectiveDate: "2026-01-15",
            sections: [
                { heading: "Journey", body: "Pipeline v1 (March 2025): Basic build and test, 12-minute average. Pipeline v2 (July 2025): Caching, parallel tests, security scanning, 4.2-minute average. Pipeline v2.1 (November 2025): Added SAST scanning, 4.5-minute average. Total improvement: 63% reduction in build time with comprehensive security coverage." },
                { heading: "Key Metrics", body: "Builds per week: 850 (H1) → 920 (H2). Security issues caught: 23 total. False positive rate: 4% (H2) → 2.8% (Q4). Developer satisfaction: 4.2/5 (annual survey)." },
                { heading: "2026 Plans", body: "Pipeline v3 planned for Q2 2026: container image scanning, DAST integration, and build provenance (SLSA Level 3)." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(345)),
];

// ============================================================================
// Lifecycle F — Monitoring Standards (10 docs)
// ============================================================================

const lifecycleF: CorpusDocV2[] = [
    docV2("v2-tr-f1", DOMAINS.platform, "Monitoring Standards v1",
        generatePolicy({
            id: "STD-PLT-003",
            title: "Platform Monitoring Standards",
            version: "1.0",
            department: "Platform Engineering",
            owner: "James Okafor",
            effectiveDate: "2025-04-01",
            sections: [
                { heading: "Requirements", body: "All services must expose a /metrics endpoint in Prometheus format. Required metrics: request_count, request_duration_seconds (histogram), error_count, and active_connections (gauge)." },
                { heading: "Alerting", body: "Alerting rules defined in Alertmanager YAML. Alert severity levels: critical (page), warning (Slack), info (log only). Critical alerts must fire within 60 seconds of threshold breach." },
                { heading: "Dashboards", body: "Each service must have a Grafana dashboard with: request rate, error rate, latency percentiles (p50/p95/p99), and resource utilization. Dashboards provisioned as code via Grafana API." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(30)),

    docV2("v2-tr-f2", DOMAINS.platform, "Alertmanager configuration — production",
        `{
  "global": {
    "resolve_timeout": "5m",
    "slack_api_url": "https://hooks.slack.com/services/MERIDIAN/ALERTS"
  },
  "route": {
    "group_by": ["alertname", "service"],
    "group_wait": "30s",
    "group_interval": "5m",
    "repeat_interval": "4h",
    "receiver": "default",
    "routes": [
      {
        "match": { "severity": "critical" },
        "receiver": "pagerduty-critical",
        "continue": true
      },
      {
        "match": { "severity": "warning" },
        "receiver": "slack-warnings"
      }
    ]
  },
  "receivers": [
    {
      "name": "default",
      "slack_configs": [{ "channel": "#ops-alerts" }]
    },
    {
      "name": "pagerduty-critical",
      "pagerduty_configs": [{ "service_key": "$(PD_SERVICE_KEY)" }]
    },
    {
      "name": "slack-warnings",
      "slack_configs": [{ "channel": "#ops-warnings" }]
    }
  ]
}`,
        MIME_JSON, meridianDateDays(60)),

    docV2("v2-tr-f3", DOMAINS.platform, "Prometheus scrape configuration",
        `global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

scrape_configs:
  - job_name: "kubernetes-pods"
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: namespace

  - job_name: "node-exporter"
    static_configs:
      - targets: ["node-exporter:9100"]

rule_files:
  - "/etc/prometheus/rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
`,
        MIME_YAML, meridianDateDays(90)),

    docV2("v2-tr-f4", DOMAINS.product, "Alert fatigue discussion — 2025-07-15",
        generateMeetingNotes({
            title: "Alert Fatigue Discussion",
            date: "2025-07-15",
            attendees: ["James Okafor", "David Kim", "Nathan Brooks", "Sam Wallace"],
            location: "SRE Room",
            notes: [
                "On-call team reporting alert fatigue — 150+ alerts per week",
                "80% of alerts are warnings that don't require action",
                "Critical alerts sometimes missed because of noise",
                "James: we need to overhaul the alerting strategy",
                "Sam: monitoring standards v1 are too prescriptive — every metric gets an alert",
                "Need to move to SLO-based alerting instead of threshold-based",
            ],
            decisions: [
                "Overhaul monitoring standards — move to SLO-based alerting",
                "Target: reduce actionable alerts to < 20/week",
                "James to draft monitoring standards v2",
            ],
            actionItems: [
                { assignee: "jokafor", task: "Draft monitoring standards v2 with SLO-based approach" },
                { assignee: "dkim", task: "Audit current alert rules and identify noise sources" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDateDays(120)),

    docV2("v2-tr-f5", DOMAINS.platform, "RE: Monitoring overhaul proposal",
        generateEmailThread({
            subject: "Monitoring overhaul proposal",
            messages: [
                { from: "James Okafor <jokafor@meridian.test>", to: ["Grace Huang <ghuang@meridian.test>", "Sam Wallace <swallace@meridian.test>"], date: "2025-08-15 10:00", body: "Team,\n\nProposal for monitoring standards v2:\n\n1. Replace threshold-based alerting with SLO-based alerting using burn rate windows\n2. Define error budgets per service (e.g., 99.95% SLA = 21.9 minutes error budget per 30 days)\n3. Alert only when burn rate threatens the error budget — eliminates transient noise\n4. Consolidate to 3 alert levels: burn_rate_1h (urgent), burn_rate_6h (warning), budget_exhausted (critical)\n\nThis should reduce actionable alerts from 150/week to under 20.\n\nJames" },
            ],
        }),
        MIME_EMAIL, meridianDateDays(150)),

    docV2("v2-tr-f6", DOMAINS.platform, "Monitoring Standards v2 — SLO-Based Alerting",
        generatePolicy({
            id: "STD-PLT-003",
            title: "Platform Monitoring Standards",
            version: "2.0",
            department: "Platform Engineering",
            owner: "James Okafor",
            effectiveDate: "2025-09-15",
            supersedes: "Platform Monitoring Standards v1.0 (2025-04-01)",
            sections: [
                { heading: "SLO-Based Alerting", body: "This version supersedes v1's threshold-based alerting with SLO-based alerting using burn rate windows. Services define error budgets based on their SLA target. Alerts fire only when the burn rate threatens to exhaust the error budget.\n\nBurn rate windows:\n- 1-hour window × 14.4x burn rate → urgent (page)\n- 6-hour window × 6x burn rate → warning (Slack)\n- Error budget exhausted → critical (escalation)" },
                { heading: "Metrics", body: "Same as v1: /metrics endpoint, Prometheus format. Added: error_budget_remaining (gauge), burn_rate (gauge)." },
                { heading: "Dashboards", body: "Service dashboards updated to show error budget burn-down chart alongside traditional metrics." },
            ],
        }),
        MIME_MARKDOWN, meridianDateDays(180)),

    docV2("v2-tr-f7", DOMAINS.platform, "Updated Alertmanager config — SLO-based rules",
        `{
  "global": {
    "resolve_timeout": "5m",
    "slack_api_url": "https://hooks.slack.com/services/MERIDIAN/ALERTS"
  },
  "route": {
    "group_by": ["alertname", "service", "slo"],
    "group_wait": "60s",
    "group_interval": "10m",
    "repeat_interval": "6h",
    "receiver": "default",
    "routes": [
      {
        "match": { "alert_type": "burn_rate_1h" },
        "receiver": "pagerduty-urgent",
        "group_wait": "0s"
      },
      {
        "match": { "alert_type": "burn_rate_6h" },
        "receiver": "slack-warnings"
      },
      {
        "match": { "alert_type": "budget_exhausted" },
        "receiver": "pagerduty-critical"
      }
    ]
  },
  "receivers": [
    { "name": "default", "slack_configs": [{ "channel": "#ops-info" }] },
    { "name": "pagerduty-urgent", "pagerduty_configs": [{ "service_key": "$(PD_URGENT_KEY)" }] },
    { "name": "pagerduty-critical", "pagerduty_configs": [{ "service_key": "$(PD_CRITICAL_KEY)" }] },
    { "name": "slack-warnings", "slack_configs": [{ "channel": "#ops-warnings" }] }
  ]
}`,
        MIME_JSON, meridianDateDays(210)),

    docV2("v2-tr-f8", DOMAINS.eng, "Alert metrics — before and after SLO migration",
        generateSLAMetrics({
            reportPeriod: "Alert Volume Comparison — v1 vs v2",
            services: [
                { name: "all-services-v1-avg", target: 0, actual: 0, month: "2025-06", incidents: 150, p99_latency_ms: 0 },
                { name: "all-services-v2-avg", target: 0, actual: 0, month: "2025-11", incidents: 18, p99_latency_ms: 0 },
            ],
        }),
        MIME_CSV, meridianDateDays(240)),

    docV2("v2-tr-f9", DOMAINS.product, "Draft: Monitoring v3 ideas — personal notes",
        generatePersonalNotes({
            topic: "Monitoring v3 brainstorm",
            author: "James Okafor",
            snippets: [
                "v2 SLO alerting is working well — 88% reduction in alert noise",
                "but we're missing distributed tracing integration",
                "OpenTelemetry collector should replace Prometheus scraping",
                "unified observability: logs + metrics + traces in one platform",
                "maybe Grafana Tempo for traces?",
                "need to talk to the team about this",
            ],
            questions: [
                "is OpenTelemetry mature enough for production?",
                "can we migrate incrementally or does it need a big bang?",
                "budget for a managed observability platform (Datadog? Grafana Cloud)?",
            ],
        }),
        MIME_WIKI, meridianDateDays(300)),

    docV2("v2-tr-f10", DOMAINS.leadership, "Monitoring Dashboard — 2025 Annual Review",
        generateQBRReport({
            quarter: "Annual",
            year: 2025,
            department: "Platform Engineering — Observability",
            highlights: [
                { metric: "Alert Volume (weekly)", target: "< 20", actual: "18", status: "On Track" },
                { metric: "Alert Noise Reduction", target: "> 80%", actual: "88%", status: "On Track" },
                { metric: "MTTR (Mean Time to Resolution)", target: "< 30 min", actual: "22 min", status: "On Track" },
                { metric: "Dashboard Coverage", target: "100% services", actual: "100%", status: "On Track" },
            ],
            narrative: "The migration from threshold-based (v1) to SLO-based (v2) alerting reduced alert volume by 88%. On-call engineer satisfaction improved from 2.1/5 to 4.3/5. MTTR improved from 45 minutes to 22 minutes because engineers can focus on genuine incidents rather than noise. The error budget burn-down charts provide clear visibility into service health.",
            risks: [
                { description: "Observability stack fragmented (Prometheus + Grafana + ELK) — consolidation needed", severity: "Medium", mitigation: "Monitoring standards v3 planned for Q2 2026 with OpenTelemetry evaluation" },
            ],
        }),
        MIME_HTML, meridianDateDays(345)),
];

// ============================================================================
// Exports
// ============================================================================

export const CAT4_DOCS: CorpusDocV2[] = [
    ...lifecycleA,
    ...lifecycleB,
    ...lifecycleC,
    ...lifecycleD,
    ...lifecycleE,
    ...lifecycleF,
];

export const CAT4_RELATIONS: CorpusRelation[] = [
    // Lifecycle A — API Auth Standard
    { srcId: "v2-tr-a4", dstId: "v2-tr-a1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-a6", dstId: "v2-tr-a4", relationType: "elaborates", confidence: 0.9 },
    { srcId: "v2-tr-a8", dstId: "v2-tr-a4", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-a8", dstId: "v2-tr-a6", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-a10", dstId: "v2-tr-a5", relationType: "supersedes", confidence: 0.9 },

    // Lifecycle B — Cost Optimization
    { srcId: "v2-tr-b9", dstId: "v2-tr-b3", relationType: "supersedes", confidence: 0.9 },
    { srcId: "v2-tr-b10", dstId: "v2-tr-b4", relationType: "supersedes", confidence: 0.9 },

    // Lifecycle C — Vendor
    { srcId: "v2-tr-c9", dstId: "v2-tr-c4", relationType: "supersedes", confidence: 0.85 },
    { srcId: "v2-tr-c7", dstId: "v2-tr-c6", relationType: "contradicts", confidence: 0.7 },

    // Lifecycle D — Privacy
    { srcId: "v2-tr-d4", dstId: "v2-tr-d1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-d8", dstId: "v2-tr-d4", relationType: "contradicts", confidence: 0.6 },

    // Lifecycle E — Pipeline
    { srcId: "v2-tr-e4", dstId: "v2-tr-e1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-e8", dstId: "v2-tr-e4", relationType: "elaborates", confidence: 0.9 },

    // Lifecycle F — Monitoring
    { srcId: "v2-tr-f6", dstId: "v2-tr-f1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-tr-f7", dstId: "v2-tr-f2", relationType: "supersedes", confidence: 0.9 },
];

export const CAT4_LIVING_STATES: LivingState[] = [
    // Lifecycle A
    { artifactId: "v2-tr-a1", livingStatus: "superseded", confidence: 0.1 },   // draft → superseded by v1
    { artifactId: "v2-tr-a2", livingStatus: "active", confidence: 0.5 },       // review email
    { artifactId: "v2-tr-a3", livingStatus: "active", confidence: 0.5 },       // meeting notes
    { artifactId: "v2-tr-a4", livingStatus: "superseded", confidence: 0.1 },   // v1 → superseded by v2
    { artifactId: "v2-tr-a5", livingStatus: "superseded", confidence: 0.2 },   // v1 config → superseded
    { artifactId: "v2-tr-a6", livingStatus: "superseded", confidence: 0.1 },   // v1.1 → superseded by v2
    { artifactId: "v2-tr-a7", livingStatus: "active", confidence: 0.6 },       // email planning v2
    { artifactId: "v2-tr-a8", livingStatus: "active", confidence: 0.95 },      // v2 is current
    { artifactId: "v2-tr-a9", livingStatus: "deprecated", confidence: 0.05 },  // archive notice
    { artifactId: "v2-tr-a10", livingStatus: "active", confidence: 0.9 },      // v2 config

    // Lifecycle B
    { artifactId: "v2-tr-b1", livingStatus: "active", confidence: 0.7 },       // cost data (historical)
    { artifactId: "v2-tr-b2", livingStatus: "active", confidence: 0.5 },       // brainstorm notes
    { artifactId: "v2-tr-b3", livingStatus: "superseded", confidence: 0.2 },   // spot RFC → superseded by reserved
    { artifactId: "v2-tr-b4", livingStatus: "superseded", confidence: 0.1 },   // spot k8s config → superseded
    { artifactId: "v2-tr-b5", livingStatus: "active", confidence: 0.7 },       // cost reduction data
    { artifactId: "v2-tr-b6", livingStatus: "active", confidence: 0.7 },       // QBR
    { artifactId: "v2-tr-b7", livingStatus: "active", confidence: 0.8 },       // reliability concerns email
    { artifactId: "v2-tr-b8", livingStatus: "active", confidence: 0.7 },       // chat discussion
    { artifactId: "v2-tr-b9", livingStatus: "active", confidence: 0.95 },      // reserved policy is current
    { artifactId: "v2-tr-b10", livingStatus: "active", confidence: 0.9 },      // reserved k8s config

    // Lifecycle C
    { artifactId: "v2-tr-c1", livingStatus: "stale", confidence: 0.3 },        // old vendor matrix
    { artifactId: "v2-tr-c2", livingStatus: "active", confidence: 0.5 },       // eval email
    { artifactId: "v2-tr-c3", livingStatus: "active", confidence: 0.5 },       // selection meeting
    { artifactId: "v2-tr-c4", livingStatus: "active", confidence: 0.7 },       // Jumio contract (still active)
    { artifactId: "v2-tr-c5", livingStatus: "active", confidence: 0.8 },       // integration config
    { artifactId: "v2-tr-c6", livingStatus: "stale", confidence: 0.3 },        // compliance audit pre-issues
    { artifactId: "v2-tr-c7", livingStatus: "active", confidence: 0.8 },       // reliability issues chat
    { artifactId: "v2-tr-c8", livingStatus: "active", confidence: 0.85 },      // replacement email
    { artifactId: "v2-tr-c9", livingStatus: "active", confidence: 0.9 },       // replacement RFC
    { artifactId: "v2-tr-c10", livingStatus: "active", confidence: 0.9 },      // updated vendor matrix

    // Lifecycle D
    { artifactId: "v2-tr-d1", livingStatus: "superseded", confidence: 0.1 },   // v1 → superseded by v2
    { artifactId: "v2-tr-d2", livingStatus: "active", confidence: 0.5 },       // GDPR email
    { artifactId: "v2-tr-d3", livingStatus: "active", confidence: 0.5 },       // review meeting
    { artifactId: "v2-tr-d4", livingStatus: "contested", confidence: 0.6 },    // v2 contested by chat discussion
    { artifactId: "v2-tr-d5", livingStatus: "active", confidence: 0.8 },       // feature flags
    { artifactId: "v2-tr-d6", livingStatus: "active", confidence: 0.7 },       // compliance dashboard
    { artifactId: "v2-tr-d7", livingStatus: "stale", confidence: 0.2 },        // v3 wiki notes (never formalized)
    { artifactId: "v2-tr-d8", livingStatus: "active", confidence: 0.7 },       // chat contesting v2
    { artifactId: "v2-tr-d9", livingStatus: "active", confidence: 0.8 },       // meeting deciding to keep v2
    { artifactId: "v2-tr-d10", livingStatus: "active", confidence: 0.85 },     // v2.1 amendment email

    // Lifecycle E
    { artifactId: "v2-tr-e1", livingStatus: "superseded", confidence: 0.1 },   // pipeline v1 → superseded
    { artifactId: "v2-tr-e2", livingStatus: "active", confidence: 0.4 },       // improvement chat
    { artifactId: "v2-tr-e3", livingStatus: "active", confidence: 0.7 },       // RFC
    { artifactId: "v2-tr-e4", livingStatus: "active", confidence: 0.85 },      // pipeline v2 (elaborated by v2.1)
    { artifactId: "v2-tr-e5", livingStatus: "active", confidence: 0.6 },       // performance review
    { artifactId: "v2-tr-e6", livingStatus: "active", confidence: 0.7 },       // deployment metrics
    { artifactId: "v2-tr-e7", livingStatus: "active", confidence: 0.6 },       // SAST email
    { artifactId: "v2-tr-e8", livingStatus: "active", confidence: 0.9 },       // pipeline v2.1 (current)
    { artifactId: "v2-tr-e9", livingStatus: "active", confidence: 0.8 },       // dashboard
    { artifactId: "v2-tr-e10", livingStatus: "active", confidence: 0.8 },      // retrospective

    // Lifecycle F
    { artifactId: "v2-tr-f1", livingStatus: "superseded", confidence: 0.1 },   // monitoring v1 → superseded
    { artifactId: "v2-tr-f2", livingStatus: "superseded", confidence: 0.1 },   // old alertmanager config
    { artifactId: "v2-tr-f3", livingStatus: "active", confidence: 0.8 },       // Prometheus config (still valid)
    { artifactId: "v2-tr-f4", livingStatus: "active", confidence: 0.6 },       // alert fatigue meeting
    { artifactId: "v2-tr-f5", livingStatus: "active", confidence: 0.6 },       // overhaul email
    { artifactId: "v2-tr-f6", livingStatus: "active", confidence: 0.95 },      // monitoring v2 (current)
    { artifactId: "v2-tr-f7", livingStatus: "active", confidence: 0.9 },       // updated alertmanager
    { artifactId: "v2-tr-f8", livingStatus: "active", confidence: 0.7 },       // alert metrics comparison
    { artifactId: "v2-tr-f9", livingStatus: "stale", confidence: 0.2 },        // v3 wiki notes (never completed)
    { artifactId: "v2-tr-f10", livingStatus: "active", confidence: 0.85 },     // annual dashboard
];

/**
 * Ground truth for temporal reconstruction.
 *
 * Uses FINAL living_state values (same approach as v1).
 * Docs that are superseded/deprecated/contested in final state
 * show as such at all timestamps, even before the supersession occurred.
 */
export const CAT4_GROUND_TRUTH: TemporalGroundTruth[] = [
    // T0+30d: Lifecycle A: a1-a3 published. B: b1. C: c1. D: d1. E: e1. F: f1.
    {
        atDaysFromT0: 30,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-b1", "v2-tr-e1"],
        superseded: ["v2-tr-a1"],
        deprecated: [],
        contested: ["v2-tr-d1"],
    },

    // T0+75d: A: +a4. B: +b2. C: +c1,c2. D: +d2. E: +e1,e2,e3. F: f1.
    {
        atDaysFromT0: 75,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-b1", "v2-tr-b2", "v2-tr-c2", "v2-tr-d2", "v2-tr-e2", "v2-tr-e3"],
        superseded: ["v2-tr-a1", "v2-tr-a4", "v2-tr-e1"],
        deprecated: [],
        contested: ["v2-tr-d1"],
    },

    // T0+120d: A: +a5. B: +b3,b4. C: +c3,c4,c5. D: +d3,d4. E: +e4. F: +f1,f2,f3,f4.
    {
        atDaysFromT0: 120,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-a5", "v2-tr-b1", "v2-tr-b2", "v2-tr-c2", "v2-tr-c3", "v2-tr-c4", "v2-tr-c5", "v2-tr-d2", "v2-tr-d3", "v2-tr-e2", "v2-tr-e3", "v2-tr-e4", "v2-tr-f3", "v2-tr-f4"],
        superseded: ["v2-tr-a1", "v2-tr-a4", "v2-tr-b3", "v2-tr-b4", "v2-tr-d1", "v2-tr-e1", "v2-tr-f1", "v2-tr-f2"],
        deprecated: [],
        contested: ["v2-tr-d4"],
    },

    // T0+180d: A: +a6. B: +b5,b6. C: +c6. D: +d5,d6. E: +e5,e6. F: +f5,f6.
    {
        atDaysFromT0: 180,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-b1", "v2-tr-b2", "v2-tr-b5", "v2-tr-b6", "v2-tr-c2", "v2-tr-c3", "v2-tr-c4", "v2-tr-c5", "v2-tr-d2", "v2-tr-d3", "v2-tr-d5", "v2-tr-d6", "v2-tr-e2", "v2-tr-e3", "v2-tr-e4", "v2-tr-e5", "v2-tr-e6", "v2-tr-f3", "v2-tr-f4", "v2-tr-f5", "v2-tr-f6"],
        superseded: ["v2-tr-a1", "v2-tr-a4", "v2-tr-a5", "v2-tr-a6", "v2-tr-b3", "v2-tr-b4", "v2-tr-d1", "v2-tr-e1", "v2-tr-f1", "v2-tr-f2"],
        deprecated: [],
        contested: ["v2-tr-d4"],
    },

    // T0+270d: A: +a7,a8. B: +b7,b8. C: +c7,c8. D: +d7,d8. E: +e7,e8. F: +f7,f8.
    {
        atDaysFromT0: 270,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-a7", "v2-tr-a8", "v2-tr-b1", "v2-tr-b2", "v2-tr-b5", "v2-tr-b6", "v2-tr-b7", "v2-tr-b8", "v2-tr-c2", "v2-tr-c3", "v2-tr-c4", "v2-tr-c5", "v2-tr-c7", "v2-tr-c8", "v2-tr-d2", "v2-tr-d3", "v2-tr-d5", "v2-tr-d6", "v2-tr-d8", "v2-tr-e2", "v2-tr-e3", "v2-tr-e4", "v2-tr-e5", "v2-tr-e6", "v2-tr-e7", "v2-tr-e8", "v2-tr-f3", "v2-tr-f4", "v2-tr-f5", "v2-tr-f6", "v2-tr-f7", "v2-tr-f8"],
        superseded: ["v2-tr-a1", "v2-tr-a4", "v2-tr-a5", "v2-tr-a6", "v2-tr-b3", "v2-tr-b4", "v2-tr-d1", "v2-tr-e1", "v2-tr-f1", "v2-tr-f2"],
        deprecated: [],
        contested: ["v2-tr-d4"],
    },

    // T0+345d: All docs published. Final states.
    {
        atDaysFromT0: 345,
        active: ["v2-tr-a2", "v2-tr-a3", "v2-tr-a7", "v2-tr-a8", "v2-tr-a10", "v2-tr-b1", "v2-tr-b2", "v2-tr-b5", "v2-tr-b6", "v2-tr-b7", "v2-tr-b8", "v2-tr-b9", "v2-tr-b10", "v2-tr-c2", "v2-tr-c3", "v2-tr-c4", "v2-tr-c5", "v2-tr-c7", "v2-tr-c8", "v2-tr-c9", "v2-tr-c10", "v2-tr-d2", "v2-tr-d3", "v2-tr-d5", "v2-tr-d6", "v2-tr-d8", "v2-tr-d9", "v2-tr-d10", "v2-tr-e2", "v2-tr-e3", "v2-tr-e4", "v2-tr-e5", "v2-tr-e6", "v2-tr-e7", "v2-tr-e8", "v2-tr-e9", "v2-tr-e10", "v2-tr-f3", "v2-tr-f4", "v2-tr-f5", "v2-tr-f6", "v2-tr-f7", "v2-tr-f8", "v2-tr-f10"],
        superseded: ["v2-tr-a1", "v2-tr-a4", "v2-tr-a5", "v2-tr-a6", "v2-tr-b3", "v2-tr-b4", "v2-tr-d1", "v2-tr-e1", "v2-tr-f1", "v2-tr-f2"],
        deprecated: ["v2-tr-a9"],
        contested: ["v2-tr-d4"],
    },
];
