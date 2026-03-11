/**
 * Category 1 — Supersession Accuracy
 *
 * ~20 signal docs across 4 supersession chains, each using different formats.
 * Tests whether the Engine correctly identifies which documents are current
 * vs superseded, including informal supersession via chat/meeting notes.
 */

import type { CorpusDocV2, CorpusRelation, LivingState, GroundTruth } from "../types-v2.js";
import { DOMAINS, TENANT_V2, docV2, meridianDate } from "./tenant.js";
import { generatePolicy, MIME_MARKDOWN } from "./templates/markdown.js";
import { generateTerraformOutput, generateFeatureFlags, MIME_JSON } from "./templates/json-config.js";
import { generateK8sDeployment, MIME_YAML } from "./templates/yaml-spec.js";
import { generateAssetInventory, MIME_CSV } from "./templates/csv-data.js";
import { generateQBRReport, MIME_HTML } from "./templates/html-report.js";
import { generateEmailThread, MIME_EMAIL } from "./templates/email.js";
import { generateMeetingNotes, generateRoughNotes, MIME_MEETING_NOTES } from "./templates/meeting-notes.js";
import { generateChatExport, MIME_CHAT } from "./templates/chat-export.js";
import { generateDraftDoc, MIME_WIKI } from "./templates/wiki-scratchpad.js";

// ============================================================================
// Chain A — Policy Evolution (Data Classification)
// ============================================================================

const chainA: CorpusDocV2[] = [
    docV2("v2-ss-a1", DOMAINS.security, "Data Classification Policy v1",
        generatePolicy({
            id: "POL-SEC-001",
            title: "Data Classification Policy",
            version: "1.0",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2024-04-01",
            sections: [
                { heading: "Purpose", body: "This policy establishes the data classification framework for Meridian Financial Services. All data assets must be classified according to their sensitivity and regulatory requirements." },
                { heading: "Classification Levels", body: "Data is classified into four levels:\n\n1. **Public** — Information intended for public disclosure\n2. **Internal** — General business information not intended for public release\n3. **Confidential** — Sensitive business data requiring access controls\n4. **Restricted** — Highly sensitive data subject to regulatory requirements (PII, PCI, financial records)\n\nAll data must be labelled with its classification level at the point of creation." },
                { heading: "Handling Requirements", body: "Restricted data must be encrypted at rest using AES-256 and in transit using TLS 1.2 or higher. Confidential data must be encrypted in transit. Access to Restricted data requires manager approval and quarterly access review. Data classification labels must be applied in metadata fields, not just filenames." },
                { heading: "Retention", body: "Restricted data: 7 years. Confidential data: 5 years. Internal data: 3 years. Public data: no retention requirement. Deletion must use cryptographic erasure for Restricted data." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(18)),

    docV2("v2-ss-a2", DOMAINS.security, "Data Classification Policy v2",
        generatePolicy({
            id: "POL-SEC-001",
            title: "Data Classification Policy",
            version: "2.0",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2025-01-15",
            supersedes: "Data Classification Policy v1.0 (2024-04-01)",
            sections: [
                { heading: "Purpose", body: "This policy supersedes Data Classification Policy v1.0. It establishes an updated data classification framework for Meridian Financial Services incorporating GDPR Article 9 requirements for special category data and PCI DSS v4.0 changes." },
                { heading: "Classification Levels", body: "Data is classified into five levels (expanded from four):\n\n1. **Public** — Information intended for public disclosure\n2. **Internal** — General business information not intended for public release\n3. **Confidential** — Sensitive business data requiring access controls\n4. **Restricted** — Highly sensitive data subject to regulatory requirements\n5. **Ultra-Restricted** — Special category data under GDPR Article 9, cryptographic key material, and breach investigation records\n\nThe Ultra-Restricted classification was added to address regulatory gaps identified in the v1 policy. All Ultra-Restricted data requires two-person access controls and hardware security module storage for cryptographic material." },
                { heading: "Handling Requirements", body: "All data Confidential and above must be encrypted at rest using AES-256-GCM (updated from AES-256-CBC in v1). Transit encryption requires TLS 1.3 minimum (upgraded from TLS 1.2). Ultra-Restricted data must use customer-managed encryption keys stored in HSM. Access logging must capture read operations, not just modifications." },
                { heading: "Retention", body: "Ultra-Restricted data: 10 years or as mandated by regulation. Restricted data: 7 years. Confidential data: 5 years. Internal data: 3 years. Public data: no retention requirement. All deletion must produce a verifiable deletion certificate." },
                { heading: "Exceptions", body: "Exceptions to this policy require written approval from the CISO and must be reviewed quarterly. No exceptions are permitted for Ultra-Restricted data handling requirements." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(10)),

    docV2("v2-ss-a3", DOMAINS.security, "RE: Data Classification Policy v2 — Gaps in cloud storage handling",
        generateEmailThread({
            subject: "Data Classification Policy v2 — Gaps in cloud storage handling",
            messages: [
                { from: "Hasan Patel <hpatel@meridian.test>", to: ["Bob Martinez <bmartinez@meridian.test>"], date: "2025-02-10 09:14", body: "Bob,\n\nI've been reviewing the v2 policy against our actual cloud storage setup. There's a gap: the policy requires AES-256-GCM at rest but doesn't address object storage versioning. We have S3 buckets with versioning enabled where old versions of Restricted files persist even after \"deletion\". The deletion certificate requirement doesn't cover versioned objects.\n\nAlso, the Ultra-Restricted HSM requirement is going to be a problem for the 3 teams using AWS KMS — do they need to migrate to CloudHSM?\n\nHasan" },
                { from: "Bob Martinez <bmartinez@meridian.test>", to: ["Hasan Patel <hpatel@meridian.test>"], cc: ["Olivia Tanaka <otanaka@meridian.test>"], date: "2025-02-10 11:30", body: "Good catch on both points. Let me address:\n\n1. Object versioning: You're right, we need an amendment. Versioned objects must have lifecycle policies that permanently delete non-current versions within 30 days. The deletion certificate must confirm all versions are purged.\n\n2. KMS vs CloudHSM: AWS KMS with customer-managed keys (CMK) is acceptable for Ultra-Restricted data. The intent was to prevent AWS-managed keys, not to mandate physical HSM. I'll clarify this in a v2.1 amendment.\n\nLet's get the amendment drafted this sprint." },
                { from: "Hasan Patel <hpatel@meridian.test>", to: ["Bob Martinez <bmartinez@meridian.test>"], date: "2025-02-10 14:22", body: "That works. I'll draft the amendment and send it for review by Friday. Should we also add guidance on cross-region replication? Teams are replicating Restricted data to eu-west-1 for DR but the policy doesn't address data residency requirements.\n\nHasan" },
            ],
        }),
        MIME_EMAIL, meridianDate(8)),

    docV2("v2-ss-a4", DOMAINS.security, "Data Classification Policy v2.1 — Cloud Storage Amendment",
        generatePolicy({
            id: "POL-SEC-001-A1",
            title: "Data Classification Policy — Cloud Storage Amendment",
            version: "2.1",
            department: "Information Security",
            owner: "Bob Martinez",
            effectiveDate: "2025-03-01",
            supersedes: "Amends Data Classification Policy v2.0 sections on storage and HSM",
            sections: [
                { heading: "Scope", body: "This amendment addresses three gaps identified in Data Classification Policy v2.0 relating to cloud object storage, HSM requirements, and cross-region data residency." },
                { heading: "Object Storage Versioning", body: "All S3 buckets (or equivalent) containing Restricted or Ultra-Restricted data must have lifecycle policies configured to permanently delete non-current object versions within 30 days. Deletion certificates must confirm all object versions, including non-current versions, have been purged. MFA Delete must be enabled on buckets containing Ultra-Restricted data." },
                { heading: "HSM Requirement Clarification", body: "The Ultra-Restricted HSM requirement is satisfied by AWS KMS with customer-managed keys (CMK) or equivalent cloud provider key management with customer-controlled key material. AWS-managed keys are not acceptable for Ultra-Restricted data. Physical HSM (CloudHSM or on-premise) is required only for cryptographic signing keys used in financial transaction processing." },
                { heading: "Cross-Region Data Residency", body: "Restricted and Ultra-Restricted data must not be replicated outside the primary regulatory jurisdiction without explicit approval from the Compliance team. Cross-region replication for disaster recovery requires a Data Transfer Impact Assessment (DTIA) documenting the legal basis for transfer. EU customer data must remain within EU regions." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(7)),

    docV2("v2-ss-a5", DOMAINS.product, "Sync: Security policy review — 2025-03-15",
        generateRoughNotes({
            title: "Security policy review sync",
            date: "2025-03-15",
            scribe: "evoronova",
            rawNotes: [
                "- Bob walked thru the v2.1 amendment, seems solid",
                "- BUT Grace raised concern that v2.1 is already getting unwieldy",
                "- discussed: should we just do a clean v3 instead of more amendments?",
                "- consensus: yes, let's abandon the amendment approach and go straight to v3",
                "- v3 will consolidate v2 + v2.1 + the residency stuff into one clean doc",
                "- Bob to own v3 draft, target end of Q2",
                "- IMPORTANT: v2.1 is still the current policy until v3 is ratified",
                "- Karen asked about teh encryption standards — still AES-256-GCM, no change planned",
                "- Mia wants v3 to also address AI/ML training data classification (new category?)",
            ],
            todos: [
                "Bob: draft v3 outline by end of March",
                "Carol: review v3 for regulatory alignment",
                "all: stop referencing v1, it's fully superseded",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(6)),
];

// ============================================================================
// Chain B — Config Drift (K8s / Terraform)
// ============================================================================

const chainB: CorpusDocV2[] = [
    docV2("v2-ss-b1", DOMAINS.platform, "payment-service K8s deployment manifest",
        generateK8sDeployment({
            service: "payment-service",
            namespace: "production",
            replicas: 3,
            image: "registry.meridian.internal/payment-service",
            tag: "v2.14.3",
            memoryLimit: "512Mi",
            cpuLimit: "500m",
            memoryRequest: "256Mi",
            cpuRequest: "250m",
            env: [
                { name: "NODE_ENV", value: "production" },
                { name: "DB_POOL_MAX", value: "20" },
                { name: "LOG_LEVEL", value: "info" },
                { name: "CACHE_TTL_SEC", value: "300" },
            ],
            port: 3000,
        }),
        MIME_YAML, meridianDate(12)),

    docV2("v2-ss-b2", DOMAINS.platform, "Terraform output: payment-service infrastructure update",
        generateTerraformOutput({
            region: "eu-west-1",
            workspace: "production",
            resources: [
                { type: "kubernetes_deployment", name: "payment-service", values: { replicas: 4, memory_limit: "1Gi", cpu_limit: "1000m", image_tag: "v2.18.0" } },
                { type: "kubernetes_horizontal_pod_autoscaler", name: "payment-service-hpa", values: { min_replicas: 4, max_replicas: 12, target_cpu_utilization: 70 } },
                { type: "aws_elasticache_cluster", name: "payment-cache", values: { node_type: "cache.r6g.large", num_cache_nodes: 3, engine: "redis", engine_version: "7.0" } },
            ],
        }),
        MIME_JSON, meridianDate(6)),

    docV2("v2-ss-b3", DOMAINS.platform, "#platform-ops: payment-service config discussion",
        generateChatExport({
            channel: "platform-ops",
            date: "2025-04-10",
            messages: [
                { timestamp: "09:15", handle: "dkim", message: "heads up — the payment-service k8s manifest in the repo still says 3 replicas but terraform applied 4 last month" },
                { timestamp: "09:17", handle: "nbrooks", message: "yeah the yaml is stale. terraform is the source of truth for payment-service now" },
                { timestamp: "09:18", handle: "swallace", message: "we should update the yaml to match. someone's going to kubectl apply the old one and break things" },
                { timestamp: "09:20", handle: "dkim", message: "agreed. also the memory limit is wrong — yaml says 512Mi but we bumped it to 1Gi in terraform because of the OOM kills" },
                { timestamp: "09:22", handle: "nbrooks", message: "I'll update the yaml today. @jokafor can you review?" },
                { timestamp: "09:23", handle: "jokafor", message: "sure, ping me when it's up", reaction: ":thumbsup: x3" },
                { timestamp: "09:45", handle: "dkim", message: "also reminder: DB_POOL_MAX is still 20 in the yaml env vars but we changed it to 50 in the config patch after the SLA incident. make sure that gets updated too" },
                { timestamp: "09:47", handle: "nbrooks", message: "good catch, will include that" },
            ],
        }),
        MIME_CHAT, meridianDate(5)),

    docV2("v2-ss-b4", DOMAINS.platform, "payment-service K8s deployment manifest (updated)",
        generateK8sDeployment({
            service: "payment-service",
            namespace: "production",
            replicas: 4,
            image: "registry.meridian.internal/payment-service",
            tag: "v2.18.0",
            memoryLimit: "1Gi",
            cpuLimit: "1000m",
            memoryRequest: "512Mi",
            cpuRequest: "500m",
            env: [
                { name: "NODE_ENV", value: "production" },
                { name: "DB_POOL_MAX", value: "50" },
                { name: "LOG_LEVEL", value: "info" },
                { name: "CACHE_TTL_SEC", value: "300" },
                { name: "HPA_ENABLED", value: "true" },
            ],
            port: 3000,
        }),
        MIME_YAML, meridianDate(5)),

    docV2("v2-ss-b5", DOMAINS.platform, "Production infrastructure asset inventory — Q2 2025",
        generateAssetInventory({
            assets: [
                { hostname: "payment-service-prod-1", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-04-08", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "payment-service-prod-2", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-04-08", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "payment-service-prod-3", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-04-08", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "payment-service-prod-4", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-04-08", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "payment-cache-001", type: "elasticache", os: "redis-7.0", patchDate: "2025-04-01", owner: "Sam Wallace", environment: "production", status: "active" },
                { hostname: "payment-cache-002", type: "elasticache", os: "redis-7.0", patchDate: "2025-04-01", owner: "Sam Wallace", environment: "production", status: "active" },
                { hostname: "payment-cache-003", type: "elasticache", os: "redis-7.0", patchDate: "2025-04-01", owner: "Sam Wallace", environment: "production", status: "active" },
                { hostname: "user-service-prod-1", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-03-28", owner: "Alice Chen", environment: "production", status: "active" },
                { hostname: "user-service-prod-2", type: "k8s-deployment", os: "alpine-3.19", patchDate: "2025-03-28", owner: "Alice Chen", environment: "production", status: "active" },
            ],
        }),
        MIME_CSV, meridianDate(4)),
];

// ============================================================================
// Chain C — Cross-Format Standard (SLA Target)
// ============================================================================

const chainC: CorpusDocV2[] = [
    docV2("v2-ss-c1", DOMAINS.leadership, "Q3 2024 Engineering QBR — Platform Reliability",
        generateQBRReport({
            quarter: "Q3",
            year: 2024,
            department: "Engineering",
            highlights: [
                { metric: "Overall Platform Availability", target: "99.9%", actual: "99.87%", status: "At Risk" },
                { metric: "Mean Time to Recovery", target: "< 15 min", actual: "12 min", status: "On Track" },
                { metric: "Deployment Frequency", target: "> 20/week", actual: "24/week", status: "On Track" },
                { metric: "Change Failure Rate", target: "< 5%", actual: "3.2%", status: "On Track" },
            ],
            narrative: "Platform availability fell short of the 99.9% SLA target due to two extended incidents in August affecting the payment processing pipeline. The settlement-engine experienced 47 minutes of degraded performance on August 14th, and the kyc-service had a 23-minute outage on August 28th. Both incidents have been root-caused and remediation is in progress. The current SLA target of 99.9% has been in place since 2023 and represents the contractual commitment to enterprise clients.",
            risks: [
                { description: "Payment pipeline single point of failure in cache tier", severity: "High", mitigation: "ADR-042 approved: dedicated cache pools for batch vs real-time" },
                { description: "KYC provider API rate limiting causing timeout cascades", severity: "Medium", mitigation: "Circuit breaker implementation scheduled for Q4" },
            ],
        }),
        MIME_HTML, meridianDate(14)),

    docV2("v2-ss-c2", DOMAINS.eng, "Engineering Standard: Platform SLA Requirements",
        generatePolicy({
            id: "STD-ENG-012",
            title: "Platform SLA Requirements",
            version: "2.0",
            department: "Engineering",
            owner: "Grace Huang",
            effectiveDate: "2025-01-01",
            supersedes: "Previous SLA target of 99.9% (per Q3 2024 QBR baseline)",
            sections: [
                { heading: "SLA Target", body: "Effective January 1, 2025, the platform-wide availability SLA target is **99.95%** measured over a rolling 30-day window. This represents an increase from the previous target of 99.9% and reflects contractual obligations to Tier 1 enterprise clients signed in Q4 2024.\n\nThe 99.95% target translates to a maximum of **21.9 minutes of downtime per 30-day period** across all Tier 1 services." },
                { heading: "Tier Classification", body: "Services are classified into three tiers:\n\n- **Tier 1** (99.95%): payment-service, settlement-engine, auth-service, api-gateway\n- **Tier 2** (99.9%): user-service, kyc-service, ledger-service, card-issuing\n- **Tier 3** (99.5%): notification-service, reporting-service, webhook-relay, document-store" },
                { heading: "Measurement", body: "Availability is measured using synthetic monitoring from three geographic regions (eu-west-1, us-east-1, ap-southeast-1). A service is considered unavailable when the success rate of synthetic probes falls below 95% for two consecutive minutes. Scheduled maintenance windows are excluded from SLA calculations if announced 72 hours in advance." },
                { heading: "Breach Response", body: "SLA breach triggers an automatic incident at SEV2 or above. Post-incident review is mandatory within 48 hours. Repeated breaches (>2 in a 30-day window) trigger architectural review by the Engineering Leadership team." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(9)),

    docV2("v2-ss-c3", DOMAINS.eng, "Feature flag configuration: SLA monitoring thresholds",
        generateFeatureFlags({
            service: "platform-monitoring",
            environment: "production",
            flags: [
                { key: "sla_target_tier1", enabled: true, description: "Tier 1 SLA availability target percentage", rollout_percentage: 100, owner: "Grace Huang" },
                { key: "sla_target_tier2", enabled: true, description: "Tier 2 SLA availability target percentage", rollout_percentage: 100 },
                { key: "sla_alert_threshold", enabled: true, description: "Alert when availability drops below this percentage in a 5-minute window", rollout_percentage: 100 },
                { key: "sla_breach_auto_incident", enabled: true, description: "Automatically create SEV2 incident on SLA breach detection", rollout_percentage: 100, owner: "James Okafor" },
            ],
        }),
        MIME_JSON, meridianDate(9)),

    docV2("v2-ss-c4", DOMAINS.leadership, "RE: Updated SLA targets for 2025",
        generateEmailThread({
            subject: "Updated SLA targets for 2025",
            messages: [
                { from: "Karen Singh <ksingh@meridian.test>", to: ["Grace Huang <ghuang@meridian.test>"], date: "2024-12-18 10:30", body: "Grace,\n\nJust confirming — the new SLA target for Tier 1 services is 99.95% starting January 1, correct? The Q3 QBR still references 99.9% and some teams are using that as their benchmark.\n\nKaren" },
                { from: "Grace Huang <ghuang@meridian.test>", to: ["Karen Singh <ksingh@meridian.test>"], cc: ["Mia Petrov <mpetrov@meridian.test>"], date: "2024-12-18 11:45", body: "Confirmed. The new target is 99.95% for Tier 1 services. The Q3 QBR predates this decision — the target was raised in the Tier 1 enterprise contract signed in November.\n\nI've published the engineering standard (STD-ENG-012 v2.0) with the full details. Please make sure your teams reference that, not the old QBR.\n\nGrace" },
            ],
        }),
        MIME_EMAIL, meridianDate(9)),

    docV2("v2-ss-c5", DOMAINS.product, "Draft: SLA monitoring notes — personal",
        generateDraftDoc({
            title: "SLA Monitoring Setup Notes",
            author: "Quinn Murphy",
            lastEdited: "2025-01-10",
            sections: [
                { heading: "Current SLA targets", body: "Platform SLA is 99.9% — need to check if this changed recently. I think I saw something about 99.95% but not sure if that's finalized.", complete: false },
                { heading: "Monitoring setup", body: "Using Prometheus + Grafana for SLA dashboards. Synthetic probes run from 3 regions. Alert rules in alertmanager config under `/etc/alertmanager/rules/sla.yml`.", complete: true },
                { heading: "Incident response", body: "When SLA breaches, auto-creates PagerDuty incident. Need to update the runbook with the new thresholds.", complete: false },
            ],
            relatedLinks: [
                "[Q3 QBR report](???)",
                "[Engineering standard — can't find the link](???)",
                "[PagerDuty integration docs](https://internal.meridian.test/pagerduty)",
            ],
        }),
        MIME_WIKI, meridianDate(8)),
];

// ============================================================================
// Chain D — Incident Playbook Evolution
// ============================================================================

const chainD: CorpusDocV2[] = [
    docV2("v2-ss-d1", DOMAINS.security, "Incident Response Playbook v1",
        generatePolicy({
            id: "PLB-SEC-001",
            title: "Incident Response Playbook",
            version: "1.0",
            department: "Security Operations",
            owner: "Bob Martinez",
            effectiveDate: "2024-06-01",
            sections: [
                { heading: "Scope", body: "This playbook covers the detection, response, and recovery procedures for security incidents at Meridian Financial Services." },
                { heading: "Severity Classification", body: "Incidents are classified into three severity levels:\n\n- **SEV1 (Critical):** Active breach, data exfiltration, ransomware\n- **SEV2 (High):** Unauthorized access detected, vulnerability actively exploited\n- **SEV3 (Medium):** Policy violation, suspicious activity requiring investigation" },
                { heading: "Response Procedures", body: "**Section 1 — Detection:** Monitor SIEM alerts, EDR notifications, and user reports. All alerts must be triaged within 15 minutes.\n\n**Section 2 — Containment:** Isolate affected systems using network segmentation. Preserve forensic evidence before remediation.\n\n**Section 3 — Communication:** Notify CISO within 30 minutes for SEV1. Notify legal within 1 hour if personal data is involved.\n\n**Section 4 — Evidence Collection:** Capture memory dumps, disk images, and network logs. Chain of custody must be maintained. All evidence stored in the forensics vault at `/secure/forensics/`." },
                { heading: "Post-Incident", body: "Post-incident review within 5 business days. Root cause analysis documented in incident report. Lessons learned shared in monthly security briefing." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(16)),

    docV2("v2-ss-d2", DOMAINS.security, "Incident Response Playbook v2",
        generatePolicy({
            id: "PLB-SEC-001",
            title: "Incident Response Playbook",
            version: "2.0",
            department: "Security Operations",
            owner: "Bob Martinez",
            effectiveDate: "2025-02-01",
            supersedes: "Incident Response Playbook v1.0 (2024-06-01)",
            sections: [
                { heading: "Scope", body: "This playbook supersedes Incident Response Playbook v1.0. It incorporates lessons learned from 14 incidents handled under v1 and aligns with NIST SP 800-61 Rev 3." },
                { heading: "Severity Classification", body: "Incidents are classified into four severity levels (expanded from three):\n\n- **SEV1 (Critical):** Active breach, data exfiltration, ransomware, supply chain compromise\n- **SEV2 (High):** Unauthorized access, vulnerability actively exploited, credential compromise\n- **SEV3 (Medium):** Policy violation, suspicious activity, failed attack attempt\n- **SEV4 (Low):** Informational, security advisory, phishing attempt blocked" },
                { heading: "Response Procedures", body: "**Section 1 — Detection:** Automated triage via SOAR platform. Human review within 10 minutes (reduced from 15). False positive rate tracked as KPI.\n\n**Section 2 — Containment:** Automated containment for known attack patterns via EDR policy. Manual containment requires approval from on-call security engineer. Cloud workloads contained via security group modification, not instance termination.\n\n**Section 3 — Communication:** Notification matrix updated. CISO notified within 15 minutes for SEV1 (reduced from 30). Customer notification within 72 hours if personal data confirmed compromised per GDPR Article 33.\n\n**Section 4 — Evidence Collection:** All evidence collection automated via forensics pipeline. Manual evidence collection deprecated. Evidence stored in immutable S3 bucket with legal hold, not local forensics vault. Chain of custody maintained via blockchain-anchored hashes." },
                { heading: "Post-Incident", body: "Blameless post-incident review within 3 business days (reduced from 5). Root cause analysis uses the \"5 Whys\" framework. Corrective actions tracked in Jira with SLA for completion." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(8)),

    docV2("v2-ss-d3", DOMAINS.security, "#security-oncall: playbook v2 section 4 issue",
        generateChatExport({
            channel: "security-oncall",
            date: "2025-02-15",
            messages: [
                { timestamp: "14:32", handle: "hpatel", message: "heads up everyone — playbook v2 section 4 (evidence collection) has a problem" },
                { timestamp: "14:33", handle: "hpatel", message: "the 'automated forensics pipeline' it references doesn't exist yet. it's in the roadmap for Q3 but the playbook says to use it NOW" },
                { timestamp: "14:35", handle: "otanaka", message: "wait seriously? we just had it ratified last week" },
                { timestamp: "14:36", handle: "hpatel", message: "yeah. also the S3 bucket with legal hold isn't set up. if we have an incident right now we'd have nowhere to store evidence" },
                { timestamp: "14:38", handle: "bmartinez", message: "ok that's a problem. for now, use the OLD section 4 from playbook v1 — the local forensics vault is still available" },
                { timestamp: "14:39", handle: "bmartinez", message: "I'll issue a correction. use v2 for everything EXCEPT evidence collection. for evidence collection follow v1 section 4 until the pipeline is ready" },
                { timestamp: "14:40", handle: "hpatel", message: "got it. so v2 sections 1-3, v1 section 4?", reaction: ":white_check_mark: x4" },
                { timestamp: "14:41", handle: "bmartinez", message: "correct. I'll get a v2.1 out this month that fixes this" },
            ],
        }),
        MIME_CHAT, meridianDate(7)),

    docV2("v2-ss-d4", DOMAINS.security, "Security ops standup — 2025-02-20",
        generateMeetingNotes({
            title: "Security Operations Standup",
            date: "2025-02-20",
            attendees: ["Bob Martinez", "Hasan Patel", "Olivia Tanaka"],
            location: "Zoom",
            notes: [
                "Discussed the playbook v2 section 4 issue from last week",
                "Forensics pipeline timeline pushed to Q3 — won't be ready before July at earliest",
                "S3 legal hold bucket — Hasan has the terraform PR ready, needs review",
                "Interim guidance confirmed: use v2 for sections 1-3, v1 for section 4 (evidence collection)",
            ],
            decisions: [
                "Will issue playbook v2.1 that reverts section 4 to v1's approach (local forensics vault) with a note that automated pipeline is planned for Q3",
                "v2.1 will keep all other v2 improvements (faster triage, SOAR integration, GDPR notification timeline)",
            ],
            actionItems: [
                { assignee: "bmartinez", task: "Draft playbook v2.1 by Feb 28" },
                { assignee: "hpatel", task: "Get S3 legal hold terraform PR merged" },
                { assignee: "otanaka", task: "Update SOAR runbooks to reference v2.1 once published" },
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(7)),

    docV2("v2-ss-d5", DOMAINS.security, "Incident Response Playbook v2.1",
        generatePolicy({
            id: "PLB-SEC-001",
            title: "Incident Response Playbook",
            version: "2.1",
            department: "Security Operations",
            owner: "Bob Martinez",
            effectiveDate: "2025-03-01",
            supersedes: "Incident Response Playbook v2.0 (2025-02-01) — Section 4 corrected",
            sections: [
                { heading: "Change Summary", body: "This version corrects Section 4 (Evidence Collection) from v2.0. The automated forensics pipeline referenced in v2.0 is not yet available (planned Q3 2025). Section 4 reverts to the manual evidence collection procedures from v1.0 with the addition of the S3 legal hold bucket for long-term evidence storage. All other sections remain unchanged from v2.0." },
                { heading: "Section 4 — Evidence Collection (Corrected)", body: "Evidence collection follows manual procedures until the automated forensics pipeline is deployed (target Q3 2025):\n\n1. Capture memory dumps using `avml` on Linux or `winpmem` on Windows\n2. Create disk images using `dd` with SHA-256 verification\n3. Export network logs from the SIEM for the incident timeframe\n4. Store all evidence in the forensics vault at `/secure/forensics/` with incident ID as directory name\n5. Additionally, upload evidence archives to the S3 legal hold bucket (`s3://meridian-forensics-legal-hold/`) for immutable retention\n6. Maintain chain of custody log in the incident ticket\n\nWhen the automated forensics pipeline is available, this section will be updated to use the pipeline as the primary collection method." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(6)),
];

// ============================================================================
// Exports
// ============================================================================

export const CAT1_DOCS: CorpusDocV2[] = [...chainA, ...chainB, ...chainC, ...chainD];

export const CAT1_RELATIONS: CorpusRelation[] = [
    // Chain A — Policy evolution
    { srcId: "v2-ss-a2", dstId: "v2-ss-a1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-ss-a4", dstId: "v2-ss-a2", relationType: "elaborates", confidence: 0.9 },
    { srcId: "v2-ss-a3", dstId: "v2-ss-a2", relationType: "elaborates", confidence: 0.8 },

    // Chain B — Config drift
    { srcId: "v2-ss-b4", dstId: "v2-ss-b1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-ss-b2", dstId: "v2-ss-b1", relationType: "supersedes", confidence: 0.9 },
    { srcId: "v2-ss-b5", dstId: "v2-ss-b4", relationType: "elaborates", confidence: 0.7 },

    // Chain C — SLA target
    { srcId: "v2-ss-c2", dstId: "v2-ss-c1", relationType: "supersedes", confidence: 0.9 },
    { srcId: "v2-ss-c3", dstId: "v2-ss-c2", relationType: "elaborates", confidence: 0.85 },
    { srcId: "v2-ss-c4", dstId: "v2-ss-c2", relationType: "supports", confidence: 0.8 },
    { srcId: "v2-ss-c5", dstId: "v2-ss-c1", relationType: "cites", confidence: 0.4 }, // stale wiki cites old QBR

    // Chain D — Incident playbook
    { srcId: "v2-ss-d2", dstId: "v2-ss-d1", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-ss-d3", dstId: "v2-ss-d2", relationType: "contradicts", confidence: 0.85 }, // chat says v2 section 4 is wrong
    { srcId: "v2-ss-d5", dstId: "v2-ss-d2", relationType: "supersedes", confidence: 0.95 },
    { srcId: "v2-ss-d5", dstId: "v2-ss-d1", relationType: "supersedes", confidence: 0.95 },
];

export const CAT1_LIVING_STATES: LivingState[] = [
    // Chain A
    { artifactId: "v2-ss-a1", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "v2-ss-a2", livingStatus: "superseded", confidence: 0.3 }, // superseded by v2.1
    { artifactId: "v2-ss-a3", livingStatus: "active", confidence: 0.6 },     // email discussion still relevant context
    { artifactId: "v2-ss-a4", livingStatus: "active", confidence: 0.9 },     // v2.1 is current until v3
    { artifactId: "v2-ss-a5", livingStatus: "active", confidence: 0.7 },     // meeting notes re: v3 plan

    // Chain B
    { artifactId: "v2-ss-b1", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "v2-ss-b2", livingStatus: "active", confidence: 0.85 },
    { artifactId: "v2-ss-b3", livingStatus: "active", confidence: 0.6 },
    { artifactId: "v2-ss-b4", livingStatus: "active", confidence: 0.95 },   // updated yaml is current
    { artifactId: "v2-ss-b5", livingStatus: "active", confidence: 0.9 },

    // Chain C
    { artifactId: "v2-ss-c1", livingStatus: "superseded", confidence: 0.2 }, // old QBR with 99.9%
    { artifactId: "v2-ss-c2", livingStatus: "active", confidence: 0.95 },    // current engineering standard
    { artifactId: "v2-ss-c3", livingStatus: "active", confidence: 0.9 },
    { artifactId: "v2-ss-c4", livingStatus: "active", confidence: 0.8 },
    { artifactId: "v2-ss-c5", livingStatus: "stale", confidence: 0.3 },      // wiki references old 99.9%

    // Chain D
    { artifactId: "v2-ss-d1", livingStatus: "superseded", confidence: 0.1 },
    { artifactId: "v2-ss-d2", livingStatus: "superseded", confidence: 0.2 }, // v2 superseded by v2.1
    { artifactId: "v2-ss-d3", livingStatus: "active", confidence: 0.5 },     // chat identifying the problem
    { artifactId: "v2-ss-d4", livingStatus: "active", confidence: 0.6 },     // meeting confirming decision
    { artifactId: "v2-ss-d5", livingStatus: "active", confidence: 0.95 },    // v2.1 is current
];

export const CAT1_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What is the current data classification policy at Meridian?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-ss-a4", "v2-ss-a2"],  // v2.1 amendment + v2 base
        expectedRanking: [["v2-ss-a4", "v2-ss-a1"], ["v2-ss-a2", "v2-ss-a1"]], // v2.1 and v2 above v1
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "What is the platform SLA availability target?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-ss-c2"],  // engineering standard with 99.95%
        expectedRanking: [["v2-ss-c2", "v2-ss-c1"]], // standard above old QBR
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "How many replicas does payment-service run in production?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-ss-b4"],  // updated yaml with 4 replicas
        expectedRanking: [["v2-ss-b4", "v2-ss-b1"]], // updated yaml above stale yaml
        expectedFragilityRange: [0.0, 1.0],
    },
    {
        query: "What is the current incident response playbook?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-ss-d5"],  // v2.1 is current
        expectedRanking: [["v2-ss-d5", "v2-ss-d1"], ["v2-ss-d5", "v2-ss-d2"]], // v2.1 above v1 and v2
        expectedFragilityRange: [0.3, 1.0],
    },
    {
        query: "What encryption standard is required for restricted data?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-ss-a4", "v2-ss-a2"],  // v2.1 + v2 both mention AES-256-GCM
        expectedFragilityRange: [0.0, 1.0],
    },
    {
        query: "What is the evidence collection procedure for security incidents?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-ss-d5"],  // v2.1 corrected section 4
        expectedRanking: [["v2-ss-d5", "v2-ss-d2"]], // v2.1 above v2 (which had wrong section 4)
        expectedFragilityRange: [0.3, 1.0],
    },
];
