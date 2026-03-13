/**
 * Cat 3 — Proof Documents (CROWN Receipt Generation & Integrity)
 *
 * 10 docs across 3 scenarios testing CROWN receipt generation:
 *   - Scenario A: Standard query → receipt with all fields present
 *   - Scenario B: Multi-citation query → receipt with correct MiSES composition
 *   - Scenario C: Cross-domain query → fragility score and signature presence
 *
 * Tests:
 *   - Receipt generation (receiptId present in response)
 *   - MiSES composition (correct citation IDs in CROWN envelope)
 *   - Fragility score presence and range
 *   - Signed flag for verified/audit mode
 *   - Knowledge state cursor presence (V4.1 only)
 *   - Crown mode consistency with request mode
 *
 * Unlike v3 Cat 5 (receipt chain depth stress), this tests the CONTENT
 * of individual CROWN receipts — are they complete and correct?
 */

import type { CorpusDocV2, GroundTruth } from "../types-features.js";
import { DOMAINS, docFeature, dateMonthsAgo } from "../tenant.js";

// ── Scenario A: Standard Receipt Generation ──────────────────────────────
// Single-domain docs, simple queries. Tests baseline receipt completeness.

const scenarioADocs: CorpusDocV2[] = [
    docFeature(
        "ft-proof-a1",
        DOMAINS.compliance,
        "Meridian Anti-Money Laundering (AML) Policy",
        `# Anti-Money Laundering Policy

## Know Your Customer (KYC) Requirements
All new customers must complete KYC verification before account activation:
1. Government-issued photo ID (passport, national ID, or driver's license)
2. Proof of address (utility bill, bank statement — dated within 90 days)
3. Source of funds declaration for accounts > $50,000
4. Enhanced Due Diligence (EDD) for politically exposed persons (PEPs)

## Transaction Monitoring
- Automated screening via Meridian Risk Engine
- Threshold alerts: single transactions > $10,000
- Pattern alerts: structuring (multiple transactions just below threshold)
- Geographic risk scoring: transactions to/from high-risk jurisdictions (FATF grey list)

## Suspicious Activity Reporting
- Internal SAR filed within 24 hours of detection
- Regulatory SAR filed within 30 days to FinCEN (US) or NCA (UK)
- No customer notification ("tipping off" is prohibited)
- SAR records retained for minimum 5 years

## Training
Annual AML training mandatory for all customer-facing staff.
Quarterly refresher for compliance team.

Approved by: Compliance Committee
Effective: 2025-01-01`,
        "text/markdown",
        dateMonthsAgo(9),
    ),

    docFeature(
        "ft-proof-a2",
        DOMAINS.compliance,
        "Meridian Sanctions Screening Process",
        `# Sanctions Screening Process

## Screening Points
1. **Onboarding**: All new customers screened against sanctions lists
2. **Transaction**: Real-time screening for all outbound payments
3. **Periodic**: Existing customer base re-screened monthly

## Sanctions Lists
| List | Source | Update Frequency |
|------|--------|-----------------|
| SDN | US OFAC | Daily |
| Consolidated List | EU Council | Weekly |
| Sanctions List | UK OFSI | Weekly |
| Consolidated List | UN Security Council | As published |

## Match Handling
- True positive: Immediate account freeze, escalate to Compliance Officer
- False positive: Document reasoning, release within 4 hours
- Potential match (fuzzy): Manual review within 24 hours

## Audit Trail
All screening decisions logged with: timestamp, customer_id, list_matched,
match_score, reviewer, decision, rationale.

Approved by: Head of Financial Crime
Effective: 2025-02-15`,
        "text/markdown",
        dateMonthsAgo(8),
    ),

    docFeature(
        "ft-proof-a3",
        DOMAINS.compliance,
        "Meridian Customer Risk Rating Model",
        `# Customer Risk Rating Model

## Risk Factors
| Factor | Weight | Data Source |
|--------|--------|-----------|
| Country of residence | 25% | KYC form |
| Industry/Occupation | 20% | KYC form |
| Transaction volume | 20% | Transaction history |
| Product complexity | 15% | Account type |
| Source of wealth | 10% | EDD assessment |
| Channel behaviour | 10% | Login patterns |

## Risk Tiers
- Low (score 0-30): Standard monitoring, annual review
- Medium (score 31-60): Enhanced monitoring, semi-annual review
- High (score 61-80): EDD required, quarterly review
- Critical (score 81-100): Senior management approval required, monthly review

## Re-Rating Triggers
Customer risk is automatically re-rated when:
- Account type changes
- Transaction patterns deviate > 2σ from baseline
- Adverse media alert detected
- Sanctions list match (even if false positive)

Approved by: Chief Risk Officer
Effective: 2025-03-01`,
        "text/markdown",
        dateMonthsAgo(7),
    ),
];

// ── Scenario B: Multi-Citation MiSES Composition ─────────────────────────
// Query requires multiple docs. Tests that CROWN MiSES contains all cited sources.

const scenarioBDocs: CorpusDocV2[] = [
    docFeature(
        "ft-proof-b1",
        DOMAINS.infra,
        "Meridian Network Architecture — VPC Layout",
        `# Network Architecture: VPC Layout

## VPC Structure
| VPC | CIDR | Purpose | Region |
|-----|------|---------|--------|
| prod-main | 10.0.0.0/16 | Production workloads | us-east-1 |
| prod-dr | 10.1.0.0/16 | Disaster recovery | eu-west-1 |
| staging | 10.2.0.0/16 | Pre-production | us-east-1 |
| management | 10.3.0.0/16 | Bastion, monitoring, CI/CD | us-east-1 |

## Subnet Design
Each VPC has 3 subnet tiers:
- Public (x.x.0.0/20): Load balancers, NAT gateways
- Private (x.x.16.0/20): Application workloads
- Data (x.x.32.0/20): Databases, caches (no internet route)

## Transit Gateway
All VPCs connected via AWS Transit Gateway.
Cross-VPC traffic allowed: management → all, staging ↔ prod-main (read-only paths only).
Direct staging → prod-dr traffic prohibited.`,
        "text/markdown",
        dateMonthsAgo(6),
    ),

    docFeature(
        "ft-proof-b2",
        DOMAINS.security,
        "Meridian Network Security Controls",
        `# Network Security Controls

## Security Groups
- Default deny all inbound
- Application SGs allow only required ports from known CIDRs
- Database SGs allow PostgreSQL (5432) from private subnets only
- Bastion SGs allow SSH (22) from VPN CIDR only

## Network ACLs
- Stateless ACLs as defence-in-depth layer
- Block known bad IP ranges (updated daily from threat intelligence feeds)
- Allow established connections (ephemeral port range 1024-65535)

## Web Application Firewall (WAF)
- AWS WAF on all public ALBs
- OWASP Core Rule Set enabled
- Rate limiting: 2000 requests per 5 minutes per IP
- Geographic restrictions: Block traffic from sanctioned countries

## VPN Access
- Tailscale mesh VPN for engineer access
- MFA required for VPN authentication
- Split tunnelling disabled — all traffic routed through VPN
- Session timeout: 12 hours (re-auth required)`,
        "text/markdown",
        dateMonthsAgo(5),
    ),

    docFeature(
        "ft-proof-b3",
        DOMAINS.infra,
        "Meridian DNS and Load Balancing Architecture",
        `# DNS and Load Balancing

## External DNS
- Primary: Route 53 with health-checked failover
- Domain: meridian.com (production), staging.meridian.test (staging)
- TTL: 60 seconds for A/AAAA records (fast failover)
- DNSSEC enabled on all production zones

## Load Balancing
| Layer | Type | Purpose |
|-------|------|---------|
| L7 (external) | AWS ALB | HTTPS termination, path-based routing |
| L4 (internal) | AWS NLB | gRPC services, database proxies |
| L7 (internal) | Envoy (mesh) | Service-to-service mTLS |

## Certificate Management
- Public certs: ACM with auto-renewal
- Internal mTLS: Vault PKI with 24-hour leaf certificates
- Certificate rotation: Zero-downtime via dual-cert listeners

## Health Checks
- ALB: HTTP 200 on /healthz every 10 seconds
- NLB: TCP connect on target port every 30 seconds
- DNS: HTTP 200 on /health from 3 regions every 60 seconds`,
        "text/markdown",
        dateMonthsAgo(4),
    ),
];

// ── Scenario C: Cross-Domain Fragility & Signatures ──────────────────────
// Docs span multiple domains to test fragility scoring.
// Queries touch 3+ domains — expected fragility should be lower (more diverse evidence).

const scenarioCDocs: CorpusDocV2[] = [
    docFeature(
        "ft-proof-c1",
        DOMAINS.finance,
        "Meridian Revenue Recognition Policy",
        `# Revenue Recognition Policy (ASC 606)

## Five-Step Model
1. Identify the contract: Written agreement with customer
2. Identify performance obligations: SaaS subscription, professional services, support
3. Determine transaction price: Base subscription + usage-based overage
4. Allocate to obligations: Standalone selling price for each component
5. Recognise revenue: Ratably over subscription period (monthly)

## Usage-Based Revenue
- Overage billed monthly in arrears
- Recognised when usage is metered and billed
- Minimum commitment recognised ratably; overage recognised on consumption

## Professional Services
- Time & materials: Recognised as services delivered
- Fixed-price: Recognised on percentage-of-completion basis
- Milestone-based: Recognised on milestone acceptance

Approved by: Controller's Office
Effective: 2025-01-01`,
        "text/markdown",
        dateMonthsAgo(8),
    ),

    docFeature(
        "ft-proof-c2",
        DOMAINS.product,
        "Meridian Pricing Tiers — 2025",
        `# Pricing Tiers 2025

## Plans
| Plan | Monthly Price | Included Units | Overage Rate |
|------|--------------|---------------|-------------|
| Starter | $499/mo | 10,000 API calls | $0.05/call |
| Growth | $1,999/mo | 100,000 API calls | $0.03/call |
| Enterprise | Custom | Unlimited | Negotiated |

## Add-Ons
- Advanced Analytics: $299/mo
- Premium Support (24/7): $599/mo
- Data Residency (EU/APAC): $199/mo
- Custom Integrations: $150/hr professional services

## Billing
- Monthly billing: Credit card or ACH
- Annual billing: Invoice (net-30 terms), 15% discount
- Enterprise: Custom payment terms available

## Fair Use Policy
API call limits are soft limits. Sustained overage (>150% of plan for 30+ days)
triggers plan upgrade discussion. No service interruption without 30-day notice.

Effective: 2025-01-01`,
        "text/markdown",
        dateMonthsAgo(9),
    ),

    docFeature(
        "ft-proof-c3",
        DOMAINS.legal,
        "Meridian Master Subscription Agreement — Key Terms",
        `# Master Subscription Agreement — Key Terms

## Term and Renewal
- Initial term: 12 months from effective date
- Auto-renewal: 12-month periods unless 60 days written notice
- Early termination: 90 days notice + remaining term fees at 50% discount

## Service Level Agreement
- Uptime commitment: 99.95% monthly
- Credit: 10% per 0.1% below target (max 30% monthly credit)
- Exclusions: Scheduled maintenance, force majeure, customer-caused issues

## Data Protection
- Meridian acts as Data Processor; Customer is Data Controller
- Data processed per Meridian's DPA (attached as Exhibit B)
- Data location: As specified in Customer's Data Residency selection
- Data portability: Export in JSON/CSV within 30 days of request

## Limitation of Liability
- Cap: 12 months of fees paid in the preceding 12-month period
- Exclusions: Neither party liable for indirect, consequential, or punitive damages
- Exceptions: Cap does not apply to IP infringement or data breaches

## Governing Law
Laws of the State of Delaware, USA. Disputes resolved via binding arbitration (AAA rules).

Template version: 2025-Q1
Approved by: General Counsel`,
        "text/markdown",
        dateMonthsAgo(7),
    ),

    docFeature(
        "ft-proof-c4",
        DOMAINS.ops,
        "Meridian Customer Onboarding Checklist",
        `# Customer Onboarding Checklist

## Pre-Activation (Sales → Customer Success)
- [ ] MSA and DPA signed
- [ ] Payment method validated
- [ ] Plan tier confirmed
- [ ] Data residency region selected
- [ ] Technical contact identified

## Account Setup (Customer Success → Engineering)
- [ ] Tenant provisioned in production environment
- [ ] API keys generated and delivered securely
- [ ] SSO integration configured (if Enterprise plan)
- [ ] Custom domain DNS configured (if applicable)
- [ ] Welcome email sent with documentation links

## Training (Customer Success)
- [ ] Kickoff call scheduled (within 5 business days of activation)
- [ ] Admin training session completed
- [ ] API integration guide shared
- [ ] Support ticket SLA expectations set

## Go-Live Verification
- [ ] Customer confirms API connectivity
- [ ] First successful API call logged
- [ ] Monitoring alerts configured for customer's tenant
- [ ] 30-day check-in scheduled

Approved by: VP Customer Success
Effective: 2025-05-01`,
        "text/markdown",
        dateMonthsAgo(4),
    ),
];

// ── Ground Truth ─────────────────────────────────────────────────────────

/** Scenario definitions for proof document metrics reporting */
export const PROOF_SCENARIOS = [
    {
        id: "scenario_a",
        label: "Standard receipt — single-domain compliance query",
        queryIndex: 0,
    },
    {
        id: "scenario_b",
        label: "Multi-citation receipt — cross-doc infrastructure query",
        queryIndex: 1,
    },
    {
        id: "scenario_c_diverse",
        label: "Cross-domain receipt — fragility with diverse evidence",
        queryIndex: 2,
    },
    {
        id: "scenario_c_narrow",
        label: "Single-domain receipt — fragility with narrow evidence",
        queryIndex: 3,
    },
];

export const CAT3_GROUND_TRUTH: GroundTruth[] = [
    // Scenario A: standard single-domain query
    {
        query: "What are Meridian's KYC requirements and how are suspicious transactions reported?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-proof-a1"],
        expectedMiSES: ["ft-proof-a1"],
    },
    // Scenario B: multi-citation infrastructure query
    {
        query: "Describe the complete network architecture including VPC layout, security controls, and load balancing at Meridian.",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-proof-b1", "ft-proof-b2", "ft-proof-b3"],
        expectedMiSES: ["ft-proof-b1", "ft-proof-b2", "ft-proof-b3"],
    },
    // Scenario C: cross-domain (diverse evidence, lower fragility expected)
    {
        query: "How does Meridian handle pricing, billing, revenue recognition, and customer onboarding end-to-end?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-proof-c1", "ft-proof-c2", "ft-proof-c4"],
        expectedFragilityRange: [0.0, 0.5],
    },
    // Scenario C: narrow domain (higher fragility expected)
    {
        query: "What are the specific customer risk rating factors and their weights in the AML compliance model?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["ft-proof-a3"],
        expectedFragilityRange: [0.3, 1.0],
    },
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT3_DOCS: CorpusDocV2[] = [
    ...scenarioADocs,
    ...scenarioBDocs,
    ...scenarioCDocs,
];
