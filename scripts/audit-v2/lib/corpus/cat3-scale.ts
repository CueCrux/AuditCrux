/**
 * Category 3 — Corpus Degradation Under Scale
 *
 * 50 signal docs across 6 domains and 9 MIME types, plus a generator for 500
 * context docs.  Tests whether retrieval quality holds as the corpus grows
 * from ~550 to 25 000 documents with heterogeneous formats.
 */

import type { CorpusDocV2, GroundTruth } from "../types-v2.js";
import { DOMAINS, ALL_DOMAINS, docV2, meridianDate, employee, service } from "./tenant.js";

import { generatePolicy, generateADR, generateRunbook, generateRFC, MIME_MARKDOWN } from "./templates/markdown.js";
import { generateTerraformOutput, generateFeatureFlags, generateApiGatewayConfig, generateDatabaseConfig, MIME_JSON } from "./templates/json-config.js";
import { generateK8sDeployment, generateCIPipeline, generateOpenAPIFragment, MIME_YAML } from "./templates/yaml-spec.js";
import { generateSLAMetrics, generateAssetInventory, generateVendorCompliance, generatePerformanceMetrics, MIME_CSV } from "./templates/csv-data.js";
import { generateQBRReport, generateComplianceDashboard, generateAuditFindings, MIME_HTML } from "./templates/html-report.js";
import { generateEmailThread, generateForwardedEmail, MIME_EMAIL } from "./templates/email.js";
import { generateMeetingNotes, generateRoughNotes, MIME_MEETING_NOTES } from "./templates/meeting-notes.js";
import { generateChatExport, generateIncidentChat, MIME_CHAT } from "./templates/chat-export.js";
import { generateDraftDoc, generatePersonalNotes, MIME_WIKI } from "./templates/wiki-scratchpad.js";

// ============================================================================
// Signal Documents — 50 docs with unique factual answers
// ============================================================================

export const CAT3_SIGNAL_DOCS: CorpusDocV2[] = [
    // ---------- Markdown (s1–s6) ----------

    // s1: Policy — KYC re-verification cadence
    docV2("v2-scale-s1", DOMAINS.compliance, "KYC Re-verification Policy",
        generatePolicy({
            id: "POL-COMP-017",
            title: "KYC Re-verification Policy",
            version: "3.2",
            department: "Compliance",
            owner: "Carol Okonkwo",
            effectiveDate: "2025-09-01",
            sections: [
                { heading: "Purpose", body: "This policy defines the mandatory re-verification cadence for all Know-Your-Customer records at Meridian Financial Services. It applies to retail clients, institutional counterparties, and payment facilitators operating under Meridian's acquiring license." },
                { heading: "Re-verification Schedule", body: "High-risk clients must be re-verified every 6 months. Medium-risk clients every 12 months. Low-risk clients every 24 months. The risk tier is determined by the automated risk-scoring model (see Risk Scoring Engine v4.1). Re-verification windows open 30 days before the due date and trigger an automated workflow in the kyc-service. Failure to complete re-verification within 14 days of the deadline results in automatic account restriction — the client can receive funds but cannot initiate outbound transfers until re-verification is complete." },
                { heading: "Enhanced Due Diligence", body: "Clients flagged by sanctions screening or with transaction volumes exceeding EUR 500,000 per quarter require Enhanced Due Diligence (EDD). EDD includes source-of-funds documentation, beneficial ownership refresh, and a manual review by a Compliance Officer within 5 business days. The EDD threshold was raised from EUR 250,000 to EUR 500,000 per quarter effective 2025-09-01 following regulatory guidance update RG-2025-44." },
                { heading: "Exceptions", body: "Regulated financial institutions with valid LEI codes and current SOC 2 Type II reports may qualify for extended re-verification intervals of 36 months, subject to annual attestation. Exception requests must be approved by the Head of Compliance." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(6)),

    // s2: ADR — Settlement batch window
    docV2("v2-scale-s2", DOMAINS.eng, "ADR-058: Settlement Batch Window Optimization",
        generateADR({
            number: 58,
            title: "Settlement Batch Window Optimization",
            status: "Accepted",
            date: "2025-08-20",
            deciders: ["Alice Chen", "Frank Abadi", "Karen Singh"],
            context: "The settlement-engine currently processes all pending settlements in a single nightly batch at 02:00 UTC. As transaction volume has grown to 1.2 million daily transactions, the batch window has expanded from 45 minutes to 3 hours 20 minutes, risking overlap with the 06:00 UTC cut-off for same-day SEPA credit transfers. If the batch exceeds this window, Meridian incurs penalty fees from our clearing partner (EUR 0.03 per delayed settlement) and client SLAs are breached.",
            decision: "Split the settlement batch into 4 micro-batches running at 02:00, 03:00, 04:00, and 05:00 UTC. Each micro-batch processes settlements for a geographic region: EU-West, EU-East, UK, and Rest-of-World respectively. The settlement-engine will use a new partitioned queue (SQS FIFO) with message group IDs based on region code. Target completion time per micro-batch: 35 minutes. This gives a 25-minute buffer before the SEPA cut-off even if the final batch overruns.",
            consequences: [
                "Settlement latency for EU-West remains unchanged (02:00 UTC batch)",
                "UK settlements shift from 02:00 to 04:00 UTC — within SLA but later than current",
                "Monitoring must be updated to track per-region batch completion times",
                "Rollback plan: revert to single batch by removing the region partitioning config flag",
                "Database connection pool for settlement-engine increased from 30 to 45 to handle concurrent micro-batch workers",
            ],
            alternatives: [
                { name: "Real-time settlement", reason: "Requires SEPA Instant participation which costs EUR 1.2M annually and our clearing partner doesn't support it yet" },
                { name: "Two batches (EU vs non-EU)", reason: "Insufficient granularity — EU batch alone takes 2h15m at current volume" },
            ],
        }),
        MIME_MARKDOWN, meridianDate(7)),

    // s3: Runbook — FX rate feed failure
    docV2("v2-scale-s3", DOMAINS.platform, "Runbook: FX Rate Feed Failure Recovery",
        generateRunbook({
            title: "FX Rate Feed Failure Recovery",
            service: "fx-service",
            severity: "P1",
            steps: [
                { action: "Verify feed status", command: "curl -s https://fx-feed.meridian.internal/health | jq .status", notes: "Expected: 'healthy'. If 'degraded', check the primary feed provider (Reuters) status page at https://status.refinitiv.com" },
                { action: "Check failover feed", command: "curl -s https://fx-feed-secondary.meridian.internal/health | jq .status", notes: "Secondary feed (Bloomberg B-PIPE) should be active if primary is down. Failover is automatic but verify it engaged." },
                { action: "Validate stale rate threshold", command: "kubectl -n production get configmap fx-service-config -o jsonpath='{.data.STALE_RATE_THRESHOLD_SECONDS}'", notes: "Default: 300 seconds (5 minutes). If rates are older than this threshold, the fx-service returns HTTP 503 for all conversion requests to prevent stale pricing. This threshold was increased from 120 to 300 seconds in incident INC-2025-0892." },
                { action: "Force rate refresh", command: "kubectl -n production exec deploy/fx-service -- curl -X POST localhost:8080/admin/force-refresh", notes: "Triggers an immediate pull from all configured feed providers. Rate limit: once per 60 seconds." },
                { action: "Verify downstream impact", command: "kubectl -n production logs deploy/payment-service --since=10m | grep 'fx_rate_unavailable'", notes: "Payment-service queues transactions when FX rates are unavailable. Queue depth alert threshold is 5000 messages. If exceeded, engage the payments on-call." },
                { action: "Engage vendor support if unresolved after 15 minutes", notes: "Reuters support line: +44-20-7250-1122 (contract ref MFS-2024-RT-001). Bloomberg support: raise ticket via BSUP<GO> terminal." },
            ],
            escalation: "If both primary and secondary feeds are down for more than 15 minutes, escalate to VP Engineering (Grace Huang) and Head of Product (Tanya Rossi). Consider activating the manual rate entry procedure documented in Runbook: Manual FX Rate Override (POL-TREAS-009).",
        }),
        MIME_MARKDOWN, meridianDate(4)),

    // s4: RFC — Risk scoring model v5
    docV2("v2-scale-s4", DOMAINS.eng, "RFC-0012: Risk Scoring Model v5 Migration",
        generateRFC({
            number: 12,
            title: "Risk Scoring Model v5 Migration",
            author: "Elena Voronova",
            status: "Approved",
            date: "2025-10-05",
            summary: "Migrate the risk-scoring service from the rule-based v4.1 model to the ML-based v5 model. The v5 model uses a gradient-boosted decision tree (XGBoost) trained on 18 months of transaction data with 247 features. It achieves a 34% improvement in fraud detection rate (from 78.2% to 94.7%) while reducing false positives by 22% (from 3.1% to 2.4%).",
            motivation: "The v4.1 rule-based model has a hard-coded threshold of 850 risk points for transaction blocking. This threshold is too rigid — it blocks 3.1% of legitimate transactions (false positives) while missing 21.8% of confirmed fraud cases (false negatives). Competitors using ML-based models report false positive rates below 2%. Our acquiring bank partners have requested improved fraud detection as a condition of the Q1 2026 contract renewal.",
            proposal: "Deploy v5 in shadow mode alongside v4.1 for 30 days. During shadow mode, both models score every transaction but only v4.1 decisions are enforced. After 30 days, if v5 achieves ≥90% fraud detection with ≤2.5% false positive rate on production traffic, cut over to v5 as primary with v4.1 as fallback. The model artifact is stored in S3 at s3://meridian-ml-models/risk-scoring/v5/model.xgb (142 MB). Inference latency target: p99 ≤ 12ms (v4.1 is 3ms, but v5 pre-computed feature store reduces total scoring time). Feature store refresh cadence: every 4 hours from the data warehouse.",
            risks: [
                "ML model opacity — harder to explain decisions to regulators than rule-based model",
                "Model drift — requires quarterly retraining pipeline (not yet built)",
                "Increased infrastructure cost — XGBoost inference requires 4x CPU vs rule engine",
                "Shadow mode doubles scoring compute for 30 days",
                "If v5 underperforms, reverting to v4.1 is zero-downtime (feature flag toggle)",
            ],
        }),
        MIME_MARKDOWN, meridianDate(3)),

    // s5: Policy — API rate limiting
    docV2("v2-scale-s5", DOMAINS.platform, "API Rate Limiting Standards",
        generatePolicy({
            id: "POL-PLAT-023",
            title: "API Rate Limiting Standards",
            version: "2.0",
            department: "Platform Engineering",
            owner: "Sam Wallace",
            effectiveDate: "2025-07-15",
            sections: [
                { heading: "Purpose", body: "This standard defines the rate limiting configuration for all externally-facing APIs at Meridian Financial Services. It replaces the ad-hoc per-team rate limits with a centralized configuration managed through the api-gateway service." },
                { heading: "Default Limits", body: "All API consumers are subject to the following default rate limits unless a higher tier is negotiated:\n\n- **Standard tier**: 100 requests per second per API key\n- **Premium tier**: 500 requests per second per API key\n- **Enterprise tier**: 2,000 requests per second per API key\n\nRate limits are enforced using a sliding window algorithm with 1-second granularity. Burst allowance is 2x the per-second limit over a 100ms window." },
                { heading: "Payment API Specifics", body: "The payment initiation endpoint (`POST /v2/payments`) has an additional monetary rate limit: no single API key may initiate more than EUR 10,000,000 in aggregate transaction value within a 1-hour rolling window. This limit applies regardless of the tier and is enforced by the payment-service independently of the api-gateway rate limiter. Exceeding this limit triggers an automatic review by the fraud team." },
                { heading: "Rate Limit Headers", body: "All API responses must include the following headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix timestamp). When a client is rate-limited, the API must return HTTP 429 with a `Retry-After` header in seconds." },
            ],
        }),
        MIME_MARKDOWN, meridianDate(8)),

    // s6: Runbook — Ledger reconciliation failure
    docV2("v2-scale-s6", DOMAINS.eng, "Runbook: Ledger Reconciliation Failure",
        generateRunbook({
            title: "Ledger Reconciliation Failure",
            service: "ledger-service",
            severity: "P2",
            steps: [
                { action: "Check reconciliation job status", command: "kubectl -n production get jobs -l app=ledger-recon --sort-by=.metadata.creationTimestamp | tail -5", notes: "The reconciliation job runs daily at 06:30 UTC. A successful run takes 18-25 minutes for the current volume of ~1.8M daily ledger entries." },
                { action: "Identify discrepancy type", command: "kubectl -n production logs job/ledger-recon-$(date +%Y%m%d) | grep 'DISCREPANCY'", notes: "Common types: MISSING_CREDIT (settlement received but not posted), DUPLICATE_DEBIT (double-posted transaction), AMOUNT_MISMATCH (rounding difference). Amount mismatches under EUR 0.02 are auto-resolved by the reconciliation engine." },
                { action: "Check the settlement feed lag", command: "curl -s https://ledger.meridian.internal/metrics | grep settlement_feed_lag_seconds", notes: "If lag exceeds 900 seconds (15 min), settlements may not have been ingested before the recon window. The acceptable lag threshold is 600 seconds." },
                { action: "Trigger manual reconciliation for specific date range", command: "kubectl -n production create job ledger-recon-manual --from=cronjob/ledger-recon -- --start-date=$(date -d yesterday +%Y-%m-%d) --end-date=$(date +%Y-%m-%d)", notes: "Manual recon can be scoped to a date range. Maximum range: 7 days." },
            ],
            escalation: "If discrepancies exceed EUR 50,000 in aggregate or involve more than 100 transactions, escalate to Head of Finance and Compliance Manager (Carol Okonkwo). Regulatory reporting may be required within 24 hours for material discrepancies.",
        }),
        MIME_MARKDOWN, meridianDate(5)),

    // ---------- JSON (s7–s12) ----------

    // s7: Database config — kyc-service with specific pool settings
    docV2("v2-scale-s7", DOMAINS.platform, "Database Configuration: kyc-service",
        generateDatabaseConfig({
            service: "kyc-service",
            host: "kyc-db-primary.meridian.internal",
            port: 5432,
            database: "kyc_records",
            pool: {
                maxConnections: 75,
                minConnections: 15,
                idleTimeoutMs: 45000,
                connectionTimeoutMs: 8000,
            },
            ssl: true,
            readReplicas: [
                "kyc-db-replica-1.meridian.internal",
                "kyc-db-replica-2.meridian.internal",
                "kyc-db-replica-3.meridian.internal",
            ],
        }),
        MIME_JSON, meridianDate(5)),

    // s8: Feature flags — card-issuing with specific rollout percentages
    docV2("v2-scale-s8", DOMAINS.product, "Feature Flags: card-issuing Q4 2025",
        generateFeatureFlags({
            service: "card-issuing",
            environment: "production",
            flags: [
                { key: "virtual_card_instant_issuance", enabled: true, description: "Enable instant virtual card issuance without manual approval", rollout_percentage: 85, owner: "Elena Voronova" },
                { key: "dynamic_cvv", enabled: false, description: "Rotate CVV every 30 minutes for virtual cards", rollout_percentage: 0, owner: "Frank Abadi" },
                { key: "multi_currency_cards", enabled: true, description: "Allow single card to hold balances in up to 5 currencies", rollout_percentage: 40, owner: "Liam Zhao" },
                { key: "card_controls_api_v2", enabled: true, description: "Expose granular card controls (merchant category, geography, time-of-day) via API v2", rollout_percentage: 100, owner: "Alice Chen" },
                { key: "apple_pay_provisioning", enabled: true, description: "Direct Apple Pay token provisioning without redirect", rollout_percentage: 65, owner: "David Kim" },
            ],
        }),
        MIME_JSON, meridianDate(3)),

    // s9: API gateway config — payment-service rate limits
    docV2("v2-scale-s9", DOMAINS.platform, "API Gateway Config: payment-service routes",
        generateApiGatewayConfig({
            service: "payment-service",
            routes: [
                { path: "/v2/payments", method: "POST", backend: "payment-service.production.svc:8080", rateLimit: 200, auth: "oauth2_bearer", timeout_ms: 30000 },
                { path: "/v2/payments/:id", method: "GET", backend: "payment-service.production.svc:8080", rateLimit: 500, auth: "oauth2_bearer", timeout_ms: 5000 },
                { path: "/v2/payments/:id/status", method: "GET", backend: "payment-service.production.svc:8080", rateLimit: 1000, auth: "oauth2_bearer", timeout_ms: 3000 },
                { path: "/v2/payments/batch", method: "POST", backend: "payment-service.production.svc:8080", rateLimit: 50, auth: "oauth2_bearer", timeout_ms: 120000 },
                { path: "/v2/payments/:id/refund", method: "POST", backend: "payment-service.production.svc:8080", rateLimit: 100, auth: "oauth2_bearer", timeout_ms: 30000 },
            ],
            globalRateLimit: 5000,
            cors: {
                origins: ["https://dashboard.meridian.com", "https://portal.meridian.com"],
                methods: ["GET", "POST", "PUT", "DELETE"],
            },
        }),
        MIME_JSON, meridianDate(4)),

    // s10: Terraform output — production infrastructure specifics
    docV2("v2-scale-s10", DOMAINS.platform, "Terraform Output: Production Payment Infrastructure",
        generateTerraformOutput({
            resources: [
                { type: "aws_rds_cluster", name: "payment-db-cluster", values: { engine: "aurora-postgresql", engine_version: "15.4", instance_class: "db.r6g.2xlarge", num_instances: 3, storage_encrypted: true, backup_retention_days: 35 } },
                { type: "aws_elasticache_cluster", name: "payment-cache", values: { engine: "redis", engine_version: "7.0", node_type: "cache.r6g.xlarge", num_nodes: 3, at_rest_encryption: true, transit_encryption: true } },
                { type: "aws_sqs_queue", name: "settlement-queue", values: { fifo_queue: true, content_based_deduplication: true, visibility_timeout_seconds: 900, message_retention_seconds: 1209600, max_receive_count: 5 } },
                { type: "aws_msk_cluster", name: "event-bus", values: { kafka_version: "3.5.1", broker_instance_type: "kafka.m5.2xlarge", number_of_broker_nodes: 6, storage_per_broker_gb: 1000 } },
            ],
            region: "eu-central-1",
            workspace: "production",
        }),
        MIME_JSON, meridianDate(6)),

    // s11: Feature flags — risk-scoring shadow mode config
    docV2("v2-scale-s11", DOMAINS.eng, "Feature Flags: risk-scoring v5 shadow mode",
        generateFeatureFlags({
            service: "risk-scoring",
            environment: "production",
            flags: [
                { key: "v5_shadow_mode", enabled: true, description: "Run v5 ML model in shadow mode alongside v4.1 rule engine", rollout_percentage: 100, owner: "Elena Voronova" },
                { key: "v5_enforce", enabled: false, description: "Use v5 model decisions instead of v4.1 (requires shadow mode validation)", rollout_percentage: 0, owner: "Elena Voronova" },
                { key: "v5_feature_store_refresh", enabled: true, description: "Enable 4-hour feature store refresh from data warehouse", rollout_percentage: 100, owner: "Quinn Murphy" },
                { key: "v4_fallback_on_timeout", enabled: true, description: "Fall back to v4.1 if v5 inference exceeds 50ms", rollout_percentage: 100, owner: "Frank Abadi" },
                { key: "transaction_velocity_feature", enabled: true, description: "Include 15-min rolling transaction velocity as scoring feature", rollout_percentage: 100, owner: "Alice Chen" },
            ],
        }),
        MIME_JSON, meridianDate(2)),

    // s12: Database config — settlement-engine
    docV2("v2-scale-s12", DOMAINS.platform, "Database Configuration: settlement-engine",
        generateDatabaseConfig({
            service: "settlement-engine",
            host: "settlement-db-primary.meridian.internal",
            port: 5432,
            database: "settlements",
            pool: {
                maxConnections: 45,
                minConnections: 10,
                idleTimeoutMs: 30000,
                connectionTimeoutMs: 5000,
            },
            ssl: true,
            readReplicas: [
                "settlement-db-replica-1.meridian.internal",
            ],
        }),
        MIME_JSON, meridianDate(7)),

    // ---------- YAML (s13–s18) ----------

    // s13: K8s deployment — kyc-service with specific resource limits
    docV2("v2-scale-s13", DOMAINS.platform, "K8s Deployment: kyc-service production",
        generateK8sDeployment({
            service: "kyc-service",
            namespace: "production",
            replicas: 6,
            image: "registry.meridian.internal/kyc-service",
            tag: "v3.8.2",
            memoryLimit: "2Gi",
            cpuLimit: "1500m",
            memoryRequest: "1Gi",
            cpuRequest: "750m",
            env: [
                { name: "KYC_VERIFICATION_TIMEOUT_MS", value: "45000" },
                { name: "KYC_DOCUMENT_SCAN_PROVIDER", value: "onfido" },
                { name: "KYC_MAX_RETRY_ATTEMPTS", value: "3" },
                { name: "KYC_CACHE_TTL_SECONDS", value: "3600" },
                { name: "KYC_EDD_THRESHOLD_EUR", value: "500000" },
            ],
            port: 8080,
        }),
        MIME_YAML, meridianDate(5)),

    // s14: CI pipeline — settlement-engine with specific test/build config
    docV2("v2-scale-s14", DOMAINS.eng, "CI Pipeline: settlement-engine",
        generateCIPipeline({
            service: "settlement-engine",
            language: "TypeScript",
            testCommand: "npm run test:integration -- --coverage --coverageThreshold='{\"global\":{\"branches\":85,\"functions\":90,\"lines\":90}}'",
            buildCommand: "npm run build && docker build -t registry.meridian.internal/settlement-engine:${{ github.sha }} .",
            deployTarget: "production",
            secretScanning: true,
            dependencyAudit: true,
        }),
        MIME_YAML, meridianDate(6)),

    // s15: OpenAPI — notification-service endpoints
    docV2("v2-scale-s15", DOMAINS.eng, "OpenAPI: notification-service v2",
        generateOpenAPIFragment({
            service: "notification-service",
            basePath: "/v2/notifications",
            endpoints: [
                { path: "/email", method: "post", summary: "Send transactional email notification", responseCode: 202, responseDescription: "Email queued for delivery" },
                { path: "/sms", method: "post", summary: "Send SMS notification (max 160 chars)", responseCode: 202, responseDescription: "SMS queued for delivery" },
                { path: "/push", method: "post", summary: "Send push notification to mobile app", responseCode: 202, responseDescription: "Push notification queued" },
                { path: "/webhook", method: "post", summary: "Fire webhook to registered endpoint with HMAC-SHA256 signature", responseCode: 202, responseDescription: "Webhook delivery initiated" },
                { path: "/preferences/:userId", method: "get", summary: "Get notification preferences for a user", responseCode: 200, responseDescription: "User notification preferences" },
                { path: "/preferences/:userId", method: "put", summary: "Update notification channel preferences", responseCode: 200, responseDescription: "Preferences updated" },
            ],
        }),
        MIME_YAML, meridianDate(4)),

    // s16: K8s deployment — risk-scoring with GPU resources
    docV2("v2-scale-s16", DOMAINS.platform, "K8s Deployment: risk-scoring production",
        generateK8sDeployment({
            service: "risk-scoring",
            namespace: "production",
            replicas: 4,
            image: "registry.meridian.internal/risk-scoring",
            tag: "v5.0.0-shadow",
            memoryLimit: "4Gi",
            cpuLimit: "4000m",
            memoryRequest: "2Gi",
            cpuRequest: "2000m",
            env: [
                { name: "MODEL_PATH", value: "s3://meridian-ml-models/risk-scoring/v5/model.xgb" },
                { name: "SHADOW_MODE", value: "true" },
                { name: "V4_FALLBACK_TIMEOUT_MS", value: "50" },
                { name: "FEATURE_STORE_REFRESH_INTERVAL_HOURS", value: "4" },
                { name: "INFERENCE_BATCH_SIZE", value: "64" },
                { name: "SCORING_THRESHOLD", value: "0.73" },
            ],
            port: 8080,
        }),
        MIME_YAML, meridianDate(2)),

    // s17: K8s deployment — fx-service
    docV2("v2-scale-s17", DOMAINS.platform, "K8s Deployment: fx-service production",
        generateK8sDeployment({
            service: "fx-service",
            namespace: "production",
            replicas: 3,
            image: "registry.meridian.internal/fx-service",
            tag: "v2.14.0",
            memoryLimit: "1Gi",
            cpuLimit: "500m",
            memoryRequest: "512Mi",
            cpuRequest: "250m",
            env: [
                { name: "FX_PRIMARY_FEED", value: "reuters" },
                { name: "FX_SECONDARY_FEED", value: "bloomberg" },
                { name: "FX_STALE_RATE_THRESHOLD_SECONDS", value: "300" },
                { name: "FX_SUPPORTED_CURRENCY_PAIRS", value: "42" },
                { name: "FX_MARKUP_BPS", value: "15" },
                { name: "FX_CACHE_TTL_SECONDS", value: "30" },
            ],
            port: 8080,
        }),
        MIME_YAML, meridianDate(4)),

    // s18: OpenAPI — ledger-service
    docV2("v2-scale-s18", DOMAINS.eng, "OpenAPI: ledger-service v3",
        generateOpenAPIFragment({
            service: "ledger-service",
            basePath: "/v3/ledger",
            endpoints: [
                { path: "/entries", method: "post", summary: "Create double-entry ledger posting with idempotency key", responseCode: 201, responseDescription: "Ledger entry created" },
                { path: "/entries/:id", method: "get", summary: "Retrieve ledger entry by ID", responseCode: 200, responseDescription: "Ledger entry details" },
                { path: "/balances/:accountId", method: "get", summary: "Get real-time balance for account (cached, 2s staleness)", responseCode: 200, responseDescription: "Account balance" },
                { path: "/reconciliation/run", method: "post", summary: "Trigger manual reconciliation for date range (max 7 days)", responseCode: 202, responseDescription: "Reconciliation job started" },
                { path: "/journal/:date", method: "get", summary: "Export daily journal entries in CSV format", responseCode: 200, responseDescription: "Journal CSV download" },
            ],
        }),
        MIME_YAML, meridianDate(5)),

    // ---------- CSV (s19–s24) ----------

    // s19: SLA metrics — November 2025 with specific breach data
    docV2("v2-scale-s19", DOMAINS.compliance, "SLA Performance Report — November 2025",
        generateSLAMetrics({
            reportPeriod: "November 2025",
            services: [
                { name: "payment-service", target: 99.95, actual: 99.97, month: "2025-11", incidents: 0, p99_latency_ms: 142 },
                { name: "settlement-engine", target: 99.95, actual: 99.98, month: "2025-11", incidents: 0, p99_latency_ms: 38 },
                { name: "kyc-service", target: 99.9, actual: 99.12, month: "2025-11", incidents: 3, p99_latency_ms: 1240 },
                { name: "card-issuing", target: 99.9, actual: 99.93, month: "2025-11", incidents: 0, p99_latency_ms: 89 },
                { name: "fx-service", target: 99.9, actual: 98.45, month: "2025-11", incidents: 2, p99_latency_ms: 2100 },
                { name: "notification-service", target: 99.5, actual: 99.87, month: "2025-11", incidents: 0, p99_latency_ms: 56 },
                { name: "risk-scoring", target: 99.95, actual: 99.99, month: "2025-11", incidents: 0, p99_latency_ms: 11 },
            ],
        }),
        MIME_CSV, meridianDate(2)),

    // s20: Asset inventory — production servers
    docV2("v2-scale-s20", DOMAINS.security, "Production Asset Inventory — Q4 2025",
        generateAssetInventory({
            assets: [
                { hostname: "payment-db-primary.meridian.internal", type: "RDS Aurora PostgreSQL", os: "Aurora 15.4", patchDate: "2025-11-01", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "payment-cache-001.meridian.internal", type: "ElastiCache Redis", os: "Redis 7.0", patchDate: "2025-10-15", owner: "David Kim", environment: "production", status: "active" },
                { hostname: "kyc-worker-gpu-01.meridian.internal", type: "EC2 g5.xlarge", os: "Amazon Linux 2023", patchDate: "2025-11-10", owner: "James Okafor", environment: "production", status: "active" },
                { hostname: "event-bus-broker-01.meridian.internal", type: "MSK Kafka", os: "Kafka 3.5.1", patchDate: "2025-09-20", owner: "Sam Wallace", environment: "production", status: "active" },
                { hostname: "ml-inference-01.meridian.internal", type: "EC2 g5.2xlarge", os: "Amazon Linux 2023", patchDate: "2025-11-05", owner: "Quinn Murphy", environment: "production", status: "active" },
                { hostname: "bastion-eu-west.meridian.internal", type: "EC2 t3.micro", os: "Ubuntu 22.04", patchDate: "2025-11-12", owner: "Hasan Patel", environment: "production", status: "active" },
                { hostname: "vault-001.meridian.internal", type: "EC2 m5.large", os: "Ubuntu 22.04", patchDate: "2025-10-28", owner: "Bob Martinez", environment: "production", status: "active" },
                { hostname: "monitoring-01.meridian.internal", type: "EC2 m5.xlarge", os: "Ubuntu 22.04", patchDate: "2025-11-08", owner: "James Okafor", environment: "production", status: "active" },
            ],
        }),
        MIME_CSV, meridianDate(1)),

    // s21: Vendor compliance matrix
    docV2("v2-scale-s21", DOMAINS.compliance, "Vendor Compliance Matrix — 2025",
        generateVendorCompliance({
            vendors: [
                { name: "Onfido", category: "Identity Verification", soc2: "Type II (2025-03)", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-03-15", riskRating: "Low", contractExpiry: "2026-06-30" },
                { name: "Refinitiv (LSEG)", category: "Market Data / FX Feeds", soc2: "Type II (2025-01)", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-01-20", riskRating: "Low", contractExpiry: "2027-01-15" },
                { name: "Stripe", category: "Payment Processing", soc2: "Type II (2025-06)", gdpr: "Compliant", pci: "Level 1", lastAudit: "2025-06-01", riskRating: "Low", contractExpiry: "2026-12-31" },
                { name: "ClearBank", category: "Banking-as-a-Service / Clearing", soc2: "Type II (2024-11)", gdpr: "Compliant", pci: "Level 1", lastAudit: "2024-11-30", riskRating: "Medium", contractExpiry: "2026-03-31" },
                { name: "Datadog", category: "Observability", soc2: "Type II (2025-04)", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-04-10", riskRating: "Low", contractExpiry: "2026-09-30" },
                { name: "HashiCorp (Vault)", category: "Secrets Management", soc2: "Type II (2025-02)", gdpr: "Compliant", pci: "N/A", lastAudit: "2025-02-28", riskRating: "Low", contractExpiry: "2026-08-15" },
                { name: "Sumsub", category: "AML Screening", soc2: "Type I (2024-09)", gdpr: "Compliant", pci: "N/A", lastAudit: "2024-09-15", riskRating: "Medium", contractExpiry: "2025-12-31" },
            ],
        }),
        MIME_CSV, meridianDate(3)),

    // s22: Performance metrics — payment-service post-fix
    docV2("v2-scale-s22", DOMAINS.eng, "Performance Metrics: payment-service — November 2025",
        generatePerformanceMetrics({
            service: "payment-service",
            period: "November 2025 (Week 1-2)",
            dataPoints: [
                { date: "2025-11-01", requests: 1450000, errors: 12, p50_ms: 18, p95_ms: 67, p99_ms: 142, cpu_pct: 45, memory_mb: 1280 },
                { date: "2025-11-02", requests: 980000, errors: 5, p50_ms: 15, p95_ms: 52, p99_ms: 118, cpu_pct: 32, memory_mb: 1150 },
                { date: "2025-11-03", requests: 1520000, errors: 18, p50_ms: 22, p95_ms: 78, p99_ms: 165, cpu_pct: 52, memory_mb: 1420 },
                { date: "2025-11-04", requests: 1610000, errors: 8, p50_ms: 19, p95_ms: 71, p99_ms: 148, cpu_pct: 55, memory_mb: 1380 },
                { date: "2025-11-05", requests: 1580000, errors: 14, p50_ms: 20, p95_ms: 74, p99_ms: 155, cpu_pct: 53, memory_mb: 1400 },
                { date: "2025-11-06", requests: 1490000, errors: 7, p50_ms: 17, p95_ms: 63, p99_ms: 138, cpu_pct: 48, memory_mb: 1310 },
                { date: "2025-11-07", requests: 1550000, errors: 10, p50_ms: 19, p95_ms: 70, p99_ms: 150, cpu_pct: 51, memory_mb: 1370 },
            ],
        }),
        MIME_CSV, meridianDate(2)),

    // s23: SLA metrics — December 2025
    docV2("v2-scale-s23", DOMAINS.compliance, "SLA Performance Report — December 2025",
        generateSLAMetrics({
            reportPeriod: "December 2025",
            services: [
                { name: "payment-service", target: 99.95, actual: 99.98, month: "2025-12", incidents: 0, p99_latency_ms: 128 },
                { name: "settlement-engine", target: 99.95, actual: 99.96, month: "2025-12", incidents: 0, p99_latency_ms: 42 },
                { name: "kyc-service", target: 99.9, actual: 99.94, month: "2025-12", incidents: 0, p99_latency_ms: 310 },
                { name: "card-issuing", target: 99.9, actual: 99.91, month: "2025-12", incidents: 1, p99_latency_ms: 95 },
                { name: "fx-service", target: 99.9, actual: 99.88, month: "2025-12", incidents: 1, p99_latency_ms: 420 },
                { name: "notification-service", target: 99.5, actual: 99.92, month: "2025-12", incidents: 0, p99_latency_ms: 48 },
                { name: "risk-scoring", target: 99.95, actual: 99.97, month: "2025-12", incidents: 0, p99_latency_ms: 9 },
            ],
        }),
        MIME_CSV, meridianDate(1)),

    // s24: Performance metrics — kyc-service showing latency issue
    docV2("v2-scale-s24", DOMAINS.eng, "Performance Metrics: kyc-service — November 2025",
        generatePerformanceMetrics({
            service: "kyc-service",
            period: "November 2025",
            dataPoints: [
                { date: "2025-11-01", requests: 42000, errors: 280, p50_ms: 320, p95_ms: 890, p99_ms: 1240, cpu_pct: 78, memory_mb: 1850 },
                { date: "2025-11-03", requests: 45000, errors: 410, p50_ms: 350, p95_ms: 920, p99_ms: 1380, cpu_pct: 82, memory_mb: 1920 },
                { date: "2025-11-05", requests: 38000, errors: 150, p50_ms: 280, p95_ms: 780, p99_ms: 1100, cpu_pct: 71, memory_mb: 1780 },
                { date: "2025-11-10", requests: 44000, errors: 520, p50_ms: 380, p95_ms: 980, p99_ms: 1450, cpu_pct: 85, memory_mb: 1950 },
                { date: "2025-11-15", requests: 41000, errors: 90, p50_ms: 190, p95_ms: 450, p99_ms: 680, cpu_pct: 55, memory_mb: 1420 },
                { date: "2025-11-20", requests: 43000, errors: 65, p50_ms: 170, p95_ms: 390, p99_ms: 580, cpu_pct: 52, memory_mb: 1380 },
                { date: "2025-11-25", requests: 46000, errors: 42, p50_ms: 155, p95_ms: 340, p99_ms: 510, cpu_pct: 48, memory_mb: 1340 },
            ],
        }),
        MIME_CSV, meridianDate(2)),

    // ---------- HTML (s25–s30) ----------

    // s25: QBR — Engineering Q3 2025
    docV2("v2-scale-s25", DOMAINS.leadership, "QBR: Engineering Department — Q3 2025",
        generateQBRReport({
            quarter: "Q3",
            year: 2025,
            department: "Engineering",
            highlights: [
                { metric: "Sprint Velocity", target: "42 story points", actual: "38 story points", status: "Behind" },
                { metric: "Production Incidents (P1/P2)", target: "≤3", actual: "5", status: "Behind" },
                { metric: "Deployment Frequency", target: "Daily", actual: "3.2/week", status: "On Track" },
                { metric: "MTTR (P1)", target: "≤30 minutes", actual: "22 minutes", status: "On Track" },
                { metric: "Code Coverage", target: "85%", actual: "82%", status: "Behind" },
                { metric: "Tech Debt Ratio", target: "≤15%", actual: "18.3%", status: "Behind" },
            ],
            narrative: "Q3 was a challenging quarter for engineering. We onboarded 3 Tier 1 enterprise clients which doubled peak transaction volume but didn't proportionally increase infrastructure capacity, leading to the October payment-service SLA breaches. The risk-scoring v5 ML model was developed and entered shadow mode. Card-issuing v2 launched with virtual card instant issuance. Key miss: settlement batch optimization was delayed from Q3 to Q4 due to the incident response workload. Tech debt ratio increased to 18.3% primarily due to deferred refactoring in the ledger-service and legacy authentication code in the auth-service.",
            risks: [
                { description: "Settlement batch window approaching SEPA cut-off", severity: "High", mitigation: "ADR-058 approved — micro-batch implementation in progress for Q4" },
                { description: "Risk scoring v5 model drift without retraining pipeline", severity: "Medium", mitigation: "RFC-0012 includes quarterly retraining requirement — pipeline build scheduled Q1 2026" },
                { description: "Single point of failure on FX rate feed", severity: "Medium", mitigation: "Bloomberg secondary feed added; failover tested monthly" },
            ],
        }),
        MIME_HTML, meridianDate(4)),

    // s26: Compliance dashboard — PCI DSS
    docV2("v2-scale-s26", DOMAINS.compliance, "PCI DSS v4.0 Compliance Dashboard — November 2025",
        generateComplianceDashboard({
            reportDate: "2025-11-15",
            framework: "PCI DSS v4.0",
            controls: [
                { id: "1.2.1", name: "Network segmentation", status: "Compliant", lastTested: "2025-10-20", owner: "Hasan Patel" },
                { id: "3.4.1", name: "PAN data encryption at rest", status: "Compliant", lastTested: "2025-11-01", owner: "Bob Martinez" },
                { id: "3.5.1.2", name: "Disk-level encryption for cardholder data", status: "Compliant", lastTested: "2025-11-01", owner: "Bob Martinez" },
                { id: "6.4.3", name: "Web application firewall", status: "Compliant", lastTested: "2025-10-15", owner: "Olivia Tanaka" },
                { id: "8.3.6", name: "Multi-factor authentication for admin access", status: "Compliant", lastTested: "2025-11-10", owner: "Hasan Patel" },
                { id: "10.2.1", name: "Audit trail for cardholder data access", status: "Non-Compliant", lastTested: "2025-11-12", owner: "Isabel Torres", finding: "Audit logs for card-issuing service lack the source IP field required by v4.0. Remediation due 2025-12-31." },
                { id: "11.3.1", name: "Quarterly vulnerability scanning", status: "Compliant", lastTested: "2025-09-30", owner: "Olivia Tanaka" },
                { id: "12.6.1", name: "Security awareness training", status: "Compliant", lastTested: "2025-10-01", owner: "Bob Martinez" },
            ],
            overallScore: 87,
        }),
        MIME_HTML, meridianDate(2)),

    // s27: Audit findings — internal audit
    docV2("v2-scale-s27", DOMAINS.compliance, "Internal Audit: Payment Processing Controls — 2025",
        generateAuditFindings({
            auditTitle: "Payment Processing Controls Audit",
            auditDate: "2025-10-20",
            auditor: "Isabel Torres",
            findings: [
                { id: "F-2025-018", severity: "High", title: "Insufficient segregation of duties in settlement approval", description: "A single operator can both initiate and approve settlements above EUR 100,000. The four-eyes principle is not enforced in the settlement-engine for high-value transactions. During testing, we successfully processed a EUR 250,000 settlement with only one approval.", recommendation: "Implement mandatory dual-approval workflow for settlements exceeding EUR 100,000. Add configurable threshold in the settlement-engine configuration.", owner: "Alice Chen", dueDate: "2025-12-15", status: "In Progress" },
                { id: "F-2025-019", severity: "Medium", title: "Payment idempotency keys not validated for format", description: "The payment-service accepts any string as an idempotency key without format validation. This could lead to collision risks if clients use short or predictable keys. Industry standard recommends UUID v4 format.", recommendation: "Enforce UUID v4 format for idempotency keys in the payment API. Provide a 90-day migration window for existing integrations.", owner: "Frank Abadi", dueDate: "2026-01-31", status: "Open" },
                { id: "F-2025-020", severity: "Low", title: "Stale test accounts in production environment", description: "17 test accounts from the 2024 integration testing phase remain active in the production database. While these accounts have zero balances and no recent activity, they represent unnecessary attack surface.", recommendation: "Deactivate and archive all test accounts. Implement automated cleanup of test resources after integration testing.", owner: "David Kim", dueDate: "2025-11-30", status: "Open" },
            ],
        }),
        MIME_HTML, meridianDate(3)),

    // s28: QBR — Product Q3 2025
    docV2("v2-scale-s28", DOMAINS.leadership, "QBR: Product Department — Q3 2025",
        generateQBRReport({
            quarter: "Q3",
            year: 2025,
            department: "Product",
            highlights: [
                { metric: "NPS Score", target: "≥45", actual: "52", status: "On Track" },
                { metric: "Feature Adoption (card-issuing v2)", target: "60%", actual: "73%", status: "On Track" },
                { metric: "API Integration Time (new clients)", target: "≤14 days", actual: "11 days", status: "On Track" },
                { metric: "Client Churn Rate", target: "≤2%", actual: "1.4%", status: "On Track" },
                { metric: "Revenue per Transaction", target: "EUR 0.12", actual: "EUR 0.14", status: "On Track" },
            ],
            narrative: "Strong quarter for Product. Card-issuing v2 with instant virtual card issuance drove 73% feature adoption, well above our 60% target. Three new Tier 1 enterprise clients onboarded (FinCorp AG, NordPay Solutions, and Iberian Credit Union). API integration time averaged 11 days, beating our 14-day target. Revenue per transaction increased to EUR 0.14 driven by the multi-currency card feature premium. Key initiative for Q4: risk-scoring v5 rollout and the settlement batch optimization to support the higher transaction volumes from new enterprise clients.",
            risks: [
                { description: "FX service reliability affecting multi-currency card experience", severity: "Medium", mitigation: "Dual feed providers active; monitoring enhanced" },
                { description: "KYC verification delays impacting client onboarding", severity: "High", mitigation: "KYC service scaling from 4 to 6 replicas; Onfido API caching implemented" },
            ],
        }),
        MIME_HTML, meridianDate(4)),

    // s29: Compliance dashboard — SOC 2
    docV2("v2-scale-s29", DOMAINS.compliance, "SOC 2 Type II Compliance Dashboard — Q4 2025",
        generateComplianceDashboard({
            reportDate: "2025-12-01",
            framework: "SOC 2 Type II",
            controls: [
                { id: "CC6.1", name: "Logical access controls", status: "Compliant", lastTested: "2025-11-20", owner: "Bob Martinez" },
                { id: "CC6.2", name: "Access provisioning based on role", status: "Compliant", lastTested: "2025-11-15", owner: "Hasan Patel" },
                { id: "CC6.3", name: "Access removal upon termination", status: "Compliant", lastTested: "2025-11-25", owner: "Hasan Patel" },
                { id: "CC7.1", name: "Monitoring for unauthorized changes", status: "Needs Improvement", lastTested: "2025-11-28", owner: "Olivia Tanaka", finding: "Infrastructure drift detection runs weekly — should be daily for production. Config drift detected 3 times in Q4 with 4-day average detection delay." },
                { id: "CC7.2", name: "Incident response procedures", status: "Compliant", lastTested: "2025-10-30", owner: "James Okafor" },
                { id: "CC8.1", name: "Change management process", status: "Compliant", lastTested: "2025-11-10", owner: "Karen Singh" },
                { id: "A1.1", name: "System availability commitments", status: "Compliant", lastTested: "2025-11-30", owner: "Sam Wallace" },
            ],
            overallScore: 92,
        }),
        MIME_HTML, meridianDate(1)),

    // s30: Audit findings — security review
    docV2("v2-scale-s30", DOMAINS.security, "Security Audit: API Surface Review — December 2025",
        generateAuditFindings({
            auditTitle: "API Surface Security Review",
            auditDate: "2025-12-05",
            auditor: "Olivia Tanaka",
            findings: [
                { id: "SEC-2025-041", severity: "Critical", title: "Webhook endpoint lacks request signature verification", description: "The notification-service webhook delivery endpoint does not verify the HMAC-SHA256 signature on incoming webhook registration requests. An attacker could register a malicious webhook URL and receive copies of all notifications for a tenant. The webhook delivery itself signs outbound payloads correctly, but the registration endpoint is unprotected.", recommendation: "Implement HMAC-SHA256 signature verification on the webhook registration endpoint using the tenant's API key as the signing secret. Add replay protection with a 5-minute timestamp window.", owner: "Quinn Murphy", dueDate: "2025-12-20", status: "In Progress" },
                { id: "SEC-2025-042", severity: "High", title: "GraphQL introspection enabled in production", description: "The reporting-service GraphQL endpoint has introspection enabled in the production environment. This exposes the full schema including internal fields (audit metadata, internal user IDs, feature flags). While authenticated, any valid API key can query the introspection endpoint.", recommendation: "Disable GraphQL introspection in production. If schema documentation is needed, provide it via a separate developer portal endpoint with restricted access.", owner: "Frank Abadi", dueDate: "2025-12-31", status: "Open" },
            ],
        }),
        MIME_HTML, meridianDate(1)),

    // ---------- Email (s31–s35) ----------

    // s31: Email thread — decision on Kafka partition count
    docV2("v2-scale-s31", DOMAINS.eng, "RE: Kafka partition strategy for event-bus",
        generateEmailThread({
            subject: "Kafka partition strategy for event-bus",
            messages: [
                { from: "Sam Wallace <swallace@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "David Kim <dkim@meridian.test>"], date: "2025-10-15 10:30", body: "Team,\n\nWe need to finalize the Kafka partition count for the payment-events topic on the event-bus cluster. Current setup is 12 partitions which was fine for 500K daily events but we're now at 1.8M and seeing consumer lag during peak hours.\n\nOptions:\n1. Increase to 24 partitions (2x current)\n2. Increase to 36 partitions (3x current)\n3. Split the topic by event type (payment.created, payment.completed, payment.failed)\n\nWhat are your thoughts?\n\nSam" },
                { from: "Alice Chen <achen@meridian.test>", to: ["Sam Wallace <swallace@meridian.test>", "David Kim <dkim@meridian.test>"], date: "2025-10-15 14:22", body: "I'd go with option 3 — splitting by event type. Reason: our consumers are already filtering by event type, so they're reading and discarding ~60% of messages. Splitting gives us natural scaling per event type AND reduces wasted I/O.\n\nProposed partition counts for split topics:\n- payment.created: 18 partitions (highest volume, ~800K/day)\n- payment.completed: 12 partitions (~600K/day)\n- payment.failed: 6 partitions (~50K/day, but bursty during incidents)\n- payment.refunded: 4 partitions (~30K/day)\n\nTotal: 40 partitions across 4 topics vs 36 on a single topic, but much better consumer efficiency.\n\nAlice" },
                { from: "David Kim <dkim@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "Sam Wallace <swallace@meridian.test>"], date: "2025-10-15 16:45", body: "Agree with Alice's approach. One addition: we should set the retention period to 7 days for payment.created and payment.completed but 30 days for payment.failed — the fraud team needs longer lookback on failures.\n\nI'll prepare the topic migration plan. We can do a rolling migration — create new topics, dual-write for 48 hours, then cut consumers over.\n\nDavid" },
                { from: "Sam Wallace <swallace@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "David Kim <dkim@meridian.test>"], cc: ["Karen Singh <ksingh@meridian.test>"], date: "2025-10-16 09:00", body: "Approved. Let's go with Alice's partition layout and David's retention policy. Karen — FYI this will be the Q4 event-bus migration. Target completion: end of November.\n\nSam" },
            ],
        }),
        MIME_EMAIL, meridianDate(3)),

    // s32: Email — decision on card BIN range allocation
    docV2("v2-scale-s32", DOMAINS.product, "RE: BIN range allocation for virtual cards",
        generateEmailThread({
            subject: "BIN range allocation for virtual cards",
            messages: [
                { from: "Elena Voronova <evoronova@meridian.test>", to: ["Tanya Rossi <trossi@meridian.test>", "Liam Zhao <lzhao@meridian.test>"], date: "2025-09-20 11:00", body: "Hi Tanya, Liam,\n\nVisa has allocated us a second BIN range for virtual cards: 4532-17xx-xxxx-xxxx. Our existing range (4532-08xx) is at 78% utilization with the current issuance rate. At the Q3 growth rate, we'll exhaust 4532-08xx by March 2026.\n\nThe new range gives us capacity for approximately 2 million additional virtual cards. I need a decision on whether to start issuing from the new range immediately or wait until 4532-08xx hits 90%.\n\nElena" },
                { from: "Tanya Rossi <trossi@meridian.test>", to: ["Elena Voronova <evoronova@meridian.test>", "Liam Zhao <lzhao@meridian.test>"], date: "2025-09-20 14:30", body: "Start issuing from 4532-17xx immediately for new client onboardings. Keep existing clients on 4532-08xx. This way we get production validation of the new range without disrupting existing card-on-file integrations.\n\nAlso, check with ClearBank if the new BIN is registered for 3D Secure — we had that issue with the first range where it took 6 weeks for the 3DS directory to propagate.\n\nTanya" },
            ],
        }),
        MIME_EMAIL, meridianDate(5)),

    // s33: Forwarded email — vendor contract renewal decision
    docV2("v2-scale-s33", DOMAINS.compliance, "FW: Sumsub AML screening contract renewal",
        generateForwardedEmail({
            subject: "Sumsub AML screening contract renewal",
            originalFrom: "Paul Dubois <pdubois@meridian.test>",
            originalDate: "2025-11-05 09:30",
            originalBody: "Carol,\n\nThe Sumsub contract expires 2025-12-31. Current annual cost is EUR 180,000 for 500,000 screenings/year. We used 420,000 screenings in the past 12 months.\n\nSumsub is offering renewal at EUR 210,000/year for 750,000 screenings (40% increase in price for 50% increase in capacity). Their SOC 2 is still Type I — they committed to Type II by Q2 2026 but it's not guaranteed.\n\nAlternative: ComplyAdvantage quoted EUR 195,000/year for 1,000,000 screenings with existing SOC 2 Type II certification. Migration effort estimated at 6-8 weeks.\n\nRecommendation: Switch to ComplyAdvantage. Better pricing, better compliance posture, and higher screening capacity.\n\nPaul",
            forwardFrom: "Carol Okonkwo <cokonkwo@meridian.test>",
            forwardTo: ["Grace Huang <ghuang@meridian.test>", "Mia Petrov <mpetrov@meridian.test>"],
            forwardDate: "2025-11-05 11:15",
            forwardBody: "Grace, Mia — forwarding Paul's analysis on the AML screening vendor decision. I agree with his recommendation to switch to ComplyAdvantage. The SOC 2 Type II gap with Sumsub is a risk for our own SOC 2 audit. Budget impact is +EUR 15,000/year but we get 2x the screening capacity.\n\nNeed approval by Nov 15 to start the migration before Sumsub contract expires.\n\nCarol",
        }),
        MIME_EMAIL, meridianDate(2)),

    // s34: Email — database migration timeline decision
    docV2("v2-scale-s34", DOMAINS.platform, "RE: PostgreSQL 15 to 16 migration timeline",
        generateEmailThread({
            subject: "PostgreSQL 15 to 16 migration timeline",
            messages: [
                { from: "David Kim <dkim@meridian.test>", to: ["James Okafor <jokafor@meridian.test>", "Sam Wallace <swallace@meridian.test>"], date: "2025-11-20 08:45", body: "Team,\n\nPostgreSQL 15 reaches end-of-life in November 2026. We should plan the migration to PG 16 in Q1 2026 to avoid rushing near EOL.\n\nKey considerations:\n- All 4 production databases (payments, kyc_records, settlements, ledger) run PG 15.4 on Aurora\n- PG 16 adds SIMD-accelerated text search and improved logical replication — both relevant for our workloads\n- Aurora supports PG 16.1 since October 2025\n- Major risk: the kyc-service uses PG 15-specific advisory lock patterns that changed behavior in PG 16\n\nProposed timeline:\n1. January 2026: Staging migration for all 4 databases\n2. February 2026: Production migration of ledger and settlements (lowest risk)\n3. March 2026: Production migration of payments and kyc_records (highest risk, requires maintenance window)\n\nMaintenance window needed: 4 hours for each production cutover (Blue/Green deployment via Aurora).\n\nDavid" },
                { from: "James Okafor <jokafor@meridian.test>", to: ["David Kim <dkim@meridian.test>", "Sam Wallace <swallace@meridian.test>"], date: "2025-11-20 10:30", body: "Timeline looks good. One addition — we need to coordinate the payments DB migration with the settlement batch window. The 4-hour maintenance window should start at 06:00 UTC (after the last micro-batch completes at 05:35) and must finish before 14:00 UTC (before US market open triggers payment spikes).\n\nI'll own the runbook for the migration.\n\nJames" },
            ],
        }),
        MIME_EMAIL, meridianDate(2)),

    // s35: Email — KYC latency root cause
    docV2("v2-scale-s35", DOMAINS.eng, "RE: KYC service latency spikes in November",
        generateEmailThread({
            subject: "KYC service latency spikes in November",
            messages: [
                { from: "Frank Abadi <fabadi@meridian.test>", to: ["Alice Chen <achen@meridian.test>", "Karen Singh <ksingh@meridian.test>"], date: "2025-11-12 15:00", body: "Team,\n\nkyc-service p99 latency hit 1450ms on Nov 10 — our target is 500ms. Root cause investigation:\n\n1. Onfido document verification API response times degraded from avg 800ms to 2200ms starting Nov 8\n2. Our retry logic was amplifying the problem — 3 retries with no backoff = 3x the load to Onfido\n3. The KYC cache was misconfigured — TTL was set to 60 seconds instead of the intended 3600 seconds, causing cache misses for repeated verifications\n\nFixes applied:\n- Added exponential backoff to Onfido retries (base 500ms, max 4s, jitter)\n- Corrected cache TTL to 3600 seconds (matching the K8s env var KYC_CACHE_TTL_SECONDS=3600)\n- Scaled from 4 to 6 replicas to handle the backlog\n\nLatency is now trending down: p99 dropped from 1450ms to 510ms as of today.\n\nFrank" },
                { from: "Karen Singh <ksingh@meridian.test>", to: ["Frank Abadi <fabadi@meridian.test>", "Alice Chen <achen@meridian.test>"], date: "2025-11-12 16:20", body: "Good diagnosis. The cache TTL mismatch is concerning — how did it get to 60s? Was it a config deployment error or a code default?\n\nAlso, we should add an Onfido API latency SLI to our monitoring. If their API degrades below our threshold we should get alerted before it impacts our customers.\n\nKaren" },
                { from: "Frank Abadi <fabadi@meridian.test>", to: ["Karen Singh <ksingh@meridian.test>", "Alice Chen <achen@meridian.test>"], date: "2025-11-12 17:05", body: "The 60s cache TTL was a code default. The environment variable was correctly set to 3600 but the config parser had a fallback of 60 seconds that was being used because the env var name had a typo in the config file (KYC_CACHE_TTL vs KYC_CACHE_TTL_SECONDS). Fixed the config file to match the K8s env var name.\n\nWill add the Onfido API latency SLI — threshold at 1500ms p99 with 5-minute evaluation window.\n\nFrank" },
            ],
        }),
        MIME_EMAIL, meridianDate(2)),

    // ---------- Meeting Notes (s36–s40) ----------

    // s36: Meeting notes — Q4 planning with budget decisions
    docV2("v2-scale-s36", DOMAINS.leadership, "Q4 2025 Engineering Planning Meeting",
        generateMeetingNotes({
            title: "Q4 2025 Engineering Planning",
            date: "2025-10-02",
            attendees: ["Grace Huang", "Karen Singh", "Tanya Rossi", "Sam Wallace", "Elena Voronova"],
            location: "Conf Room 3A / Zoom",
            notes: [
                "Q3 retro: 5 P1 incidents vs 3 target. Root cause in most cases was under-provisioned infra after enterprise client onboarding",
                "Infrastructure budget for Q4: EUR 285,000 (up from EUR 210,000 in Q3) — approved by CFO on Sep 28",
                "Grace: 40% of Q4 infra budget (EUR 114,000) allocated to the settlement-engine micro-batch project",
                "Sam: Remaining 60% split between Kafka event-bus migration (EUR 85,500) and database PG16 migration prep (EUR 85,500)",
                "Risk-scoring v5 shadow mode running since Oct 1 — Elena reports 94.7% detection rate in first week, exceeding 90% target",
                "Tanya: Product roadmap calls for multi-currency card GA by end of Q4. Currently at 40% rollout",
                "Hiring: 2 SRE positions approved, targeting start date Jan 2026. JD drafted by James Okafor",
                "Tech debt sprint scheduled for Nov 17-28 — each team dedicates 50% capacity to tech debt items",
            ],
            actionItems: [
                { assignee: "swallace", task: "Finalize Kafka topic migration plan by Oct 20" },
                { assignee: "evoronova", task: "Prepare risk-scoring v5 shadow mode 30-day report by Nov 1" },
                { assignee: "ksingh", task: "Schedule tech debt sprint and assign items from backlog" },
                { assignee: "ghuang", task: "Review and approve SRE job descriptions by Oct 10" },
            ],
            decisions: [
                "Q4 infrastructure budget set at EUR 285,000 with the specified allocation",
                "Multi-currency card GA target: December 15, 2025",
                "Tech debt sprint Nov 17-28 approved",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(4)),

    // s37: Meeting notes — incident review with specific findings
    docV2("v2-scale-s37", DOMAINS.eng, "FX Service Incident Review — INC-2025-1189",
        generateMeetingNotes({
            title: "FX Service Incident Review — INC-2025-1189",
            date: "2025-11-18",
            attendees: ["James Okafor", "David Kim", "Nathan Brooks", "Sam Wallace"],
            location: "Zoom",
            notes: [
                "Incident: fx-service dropped to 98.45% availability on Nov 14-15",
                "Root cause: Reuters primary feed had a 47-minute outage at 14:22 UTC on Nov 14",
                "Failover to Bloomberg secondary feed triggered at 14:27 (5-minute delay — stale rate threshold was 300s)",
                "However, Bloomberg feed was returning rates for only 38 of our 42 supported currency pairs — missing GBP/TRY, EUR/ZAR, USD/BRL, EUR/BRL",
                "Transactions involving those 4 pairs returned HTTP 503 for 47 minutes until Reuters recovered",
                "Impact: 342 failed FX conversions, affecting 28 clients. Estimated revenue impact: EUR 4,200",
                "Nathan: The Bloomberg contract only covers 38 pairs. We need to either upgrade the Bloomberg package or add a third feed provider",
                "Sam: Let's also reduce the stale rate threshold from 300s to 120s for major pairs (G10 currencies)",
            ],
            actionItems: [
                { assignee: "nbrooks", task: "Get quote from Bloomberg for the full 42-pair package by Dec 1" },
                { assignee: "dkim", task: "Implement tiered stale rate thresholds: 120s for G10 pairs, 300s for others" },
                { assignee: "jokafor", task: "Add per-currency-pair availability monitoring to Datadog" },
            ],
            decisions: [
                "Accept 300s→120s stale threshold change for G10 currencies",
                "Evaluate third FX feed provider (FactSet) as backup for exotic pairs",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(2)),

    // s38: Rough notes — architecture brainstorm
    docV2("v2-scale-s38", DOMAINS.eng, "Notes: Ledger Service v3 Architecture Brainstorm",
        generateRoughNotes({
            title: "Ledger v3 brainstorm",
            date: "2025-11-22",
            scribe: "Quinn Murphy",
            rawNotes: [
                "current ledger handles 1.8M entries/day — need to support 5M by Q2 2026",
                "alice: CQRS pattern — separate write model (PostgreSQL) from read model (materialized views or Elasticsearch)",
                "write path: double-entry postings w/ idempotency key. current throughput bottleneck is the unique constraint check on idempotency_key column",
                "frank suggested partitioning the ledger table by month — reduces index size, improves vacuum performance",
                "concern from karen: partitioning breaks the current reconciliation job which does full table scans",
                "reconciliation job redesign needed regardless — currently takes 25 min for 1.8M entries, won't scale to 5M",
                "proposed: streaming reconciliation via Kafka. Each ledger entry published to kafka topic, reconciliation consumer compares against settlement feed in real-time instead of batch",
                "balance queries: currently 2s staleness (cache). alice wants to explore Redis Sorted Sets for real-time balance tracking",
                "need to maintain audit trail — every balance change must have a traceable ledger entry (regulatory requirement)",
                "estimated effort: 3 sprints (6 weeks) for core CQRS + 2 sprints for streaming recon",
            ],
            todos: [
                "quinn: write RFC for ledger v3 CQRS architecture",
                "alice: prototype Redis Sorted Sets balance tracker",
                "frank: benchmark PG partitioning with 5M rows/month",
                "ALL: review RFC by Dec 6",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(2)),

    // s39: Meeting notes — compliance review
    docV2("v2-scale-s39", DOMAINS.compliance, "Quarterly Compliance Review — Q4 2025",
        generateMeetingNotes({
            title: "Quarterly Compliance Review — Q4 2025",
            date: "2025-12-03",
            attendees: ["Carol Okonkwo", "Paul Dubois", "Isabel Torres", "Bob Martinez", "Grace Huang"],
            location: "Boardroom / Zoom",
            notes: [
                "PCI DSS v4.0 audit scheduled for February 2026. Current compliance score: 87% (target: 95%)",
                "Outstanding finding: card-issuing audit trail missing source IP (control 10.2.1). Fix ETA: Dec 31",
                "SOC 2 Type II audit renewal: March 2026. Current score: 92%. Drift detection gap (CC7.1) must be resolved",
                "Carol: The Sumsub→ComplyAdvantage migration is approved. Paul will lead. Migration window: Jan 6 — Feb 14, 2026",
                "KYC re-verification backlog: 847 high-risk clients overdue for re-verification as of Dec 1. Target: clear backlog by Dec 20",
                "Isabel: Internal audit of payment processing controls found 3 findings (F-2025-018 through F-2025-020). Settlement dual-approval (F-2025-018) is highest priority",
                "Regulatory update: EBA Guidelines on outsourcing (EBA/GL/2019/02) require updated vendor risk assessment for all critical service providers by March 2026",
                "Grace: Budget approved for ComplyAdvantage migration — EUR 195,000/year contract signed Nov 20",
                "GDPR data subject request response time: average 4.2 days (within 30-day requirement) — 187 requests processed in Q4",
            ],
            actionItems: [
                { assignee: "pdubois", task: "Lead ComplyAdvantage AML migration starting Jan 6" },
                { assignee: "itorres", task: "Track F-2025-018 settlement dual-approval remediation weekly" },
                { assignee: "cokonkwo", task: "Update vendor risk assessments per EBA/GL/2019/02 by Feb 28" },
                { assignee: "bmartinez", task: "Resolve PCI DSS 10.2.1 finding for card-issuing by Dec 31" },
            ],
            decisions: [
                "ComplyAdvantage contract approved at EUR 195,000/year",
                "PCI DSS v4.0 audit rescheduled from January to February 2026 to allow remediation",
                "KYC re-verification backlog clearance is P1 priority for compliance team in December",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(1)),

    // s40: Meeting notes — card-issuing feature review
    docV2("v2-scale-s40", DOMAINS.product, "Card-Issuing v2 Feature Review",
        generateMeetingNotes({
            title: "Card-Issuing v2 Feature Review",
            date: "2025-11-08",
            attendees: ["Liam Zhao", "Elena Voronova", "Frank Abadi", "Tanya Rossi"],
            location: "Zoom",
            notes: [
                "Virtual card instant issuance: live at 85% rollout. Zero fraud incidents since launch",
                "Dynamic CVV (rotate every 30 min): still disabled (0% rollout). Waiting on Apple Pay tokenization compatibility testing",
                "Multi-currency cards: 40% rollout. Supports EUR, USD, GBP, CHF, SEK. Target GA Dec 15 at 100%",
                "Frank: Apple Pay provisioning at 65% rollout. Direct provisioning (no redirect) reduces issuance time from 45s to 8s",
                "Card controls API v2: 100% rollout. 12 clients integrated so far. Most popular control: merchant category blocking",
                "Liam: Analytics show 73% feature adoption for instant issuance. Top 3 use cases: employee expense cards (42%), client refund cards (31%), marketing campaign cards (27%)",
                "Issue: multi-currency card FX spread is 15bps but competitive analysis shows market average is 10-12bps",
                "Tanya: We'll review FX spread pricing in January — need margin analysis from finance first",
            ],
            actionItems: [
                { assignee: "fabadi", task: "Complete Apple Pay + dynamic CVV compatibility testing by Dec 1" },
                { assignee: "lzhao", task: "Prepare multi-currency card GA rollout plan for Dec 15" },
                { assignee: "evoronova", task: "Request FX margin analysis from finance team for January pricing review" },
            ],
            decisions: [
                "Multi-currency card GA date confirmed: December 15, 2025",
                "Dynamic CVV launch blocked until Apple Pay testing complete",
                "FX spread pricing review deferred to January 2026",
            ],
        }),
        MIME_MEETING_NOTES, meridianDate(2)),

    // ---------- Chat Exports (s41–s45) ----------

    // s41: Incident chat — payment processing timeout
    docV2("v2-scale-s41", DOMAINS.platform, "Incident Chat: Payment Timeout Cascade — INC-2025-1203",
        generateIncidentChat({
            channel: "inc-2025-1203",
            incidentId: "INC-2025-1203",
            messages: [
                { timestamp: "2025-11-25 03:12", handle: "alertbot", message: "ALERT: payment-service p99 latency >500ms (current: 1842ms). 23 failed requests in last 5 minutes." },
                { timestamp: "2025-11-25 03:14", handle: "nbrooks", message: "On it. Checking payment-service pods." },
                { timestamp: "2025-11-25 03:16", handle: "nbrooks", message: "All 8 pods healthy but Redis connection pool is at 100% capacity. payment-cache-001 showing 12,847 active connections vs max 10,000 configured." },
                { timestamp: "2025-11-25 03:18", handle: "dkim", message: "That's the settlement micro-batch. The 03:00 UTC EU-East batch is running and each worker opens 50 Redis connections for the settlement cache warmup step.", threadReply: true },
                { timestamp: "2025-11-25 03:20", handle: "nbrooks", message: "Confirmed — settlement workers are consuming 3,200 Redis connections. Payment-service normal usage is ~8,500. Combined exceeds the 10,000 limit." },
                { timestamp: "2025-11-25 03:22", handle: "dkim", message: "Short-term fix: increase Redis maxclients from 10000 to 15000. Long-term: settlement workers need a separate Redis connection pool or their own cache cluster.", threadReply: true },
                { timestamp: "2025-11-25 03:25", handle: "nbrooks", message: "Applied maxclients=15000 on payment-cache-001. Latency dropping — p99 now 340ms.", reaction: ":thumbsup: x3" },
                { timestamp: "2025-11-25 03:30", handle: "nbrooks", message: "Incident resolved. p99 back to normal at 135ms. Total impact: 18 minutes of degraded performance, 47 failed payment requests." },
                { timestamp: "2025-11-25 03:32", handle: "jokafor", message: "Good catch. Adding action item: separate Redis cluster for settlement batch operations. This is a consequence of ADR-058 micro-batch design that we didn't anticipate." },
            ],
        }),
        MIME_CHAT, meridianDate(1)),

    // s42: Chat — decision on secret rotation cadence
    docV2("v2-scale-s42", DOMAINS.security, "Chat: #security-ops — API key rotation policy discussion",
        generateChatExport({
            channel: "security-ops",
            date: "2025-11-06",
            messages: [
                { timestamp: "11:00", handle: "bmartinez", message: "Reminder: we need to finalize the API key rotation policy for client-facing keys. Current state: no automated rotation, keys are manually rotated on request." },
                { timestamp: "11:05", handle: "hpatel", message: "Proposal: 90-day mandatory rotation for all client API keys. We can implement graceful rotation with overlapping validity — old key works for 7 days after new key is issued." },
                { timestamp: "11:08", handle: "otanaka", message: "90 days is aggressive. Most of our clients are B2B integrations — forced rotation breaks CI/CD pipelines. Can we do 180 days with a 30-day overlap?", reaction: ":thinking_face: x2" },
                { timestamp: "11:12", handle: "bmartinez", message: "Compromise: 180-day rotation for Standard tier clients, 90-day for Enterprise tier (they have dedicated integration teams), and 30-day for internal service-to-service keys." },
                { timestamp: "11:15", handle: "hpatel", message: "That works. Overlap period: 14 days for all tiers. We'll send rotation reminders at 30, 14, and 7 days before expiry.", threadReply: true },
                { timestamp: "11:18", handle: "bmartinez", message: "Agreed. I'll draft the policy update. Implementation via the auth-service — we'll add an expiry_at field to the api_keys table and a cron job for rotation reminders.", reaction: ":white_check_mark: x3" },
                { timestamp: "11:22", handle: "otanaka", message: "One more thing — we should exempt webhook signing keys from rotation. Those are HMAC secrets embedded in client infrastructure and rotation would break all webhook verifications simultaneously." },
                { timestamp: "11:25", handle: "bmartinez", message: "Good point. Webhook signing keys exempted from mandatory rotation but must be rotatable on-demand if compromised." },
            ],
        }),
        MIME_CHAT, meridianDate(2)),

    // s43: Chat — operational decision on monitoring threshold
    docV2("v2-scale-s43", DOMAINS.platform, "Chat: #platform-ops — Disk usage alert threshold change",
        generateChatExport({
            channel: "platform-ops",
            date: "2025-11-28",
            messages: [
                { timestamp: "09:00", handle: "jokafor", message: "We keep getting paged for disk usage on the Kafka brokers at 75% threshold. The event-bus migration (more topics) means disk usage naturally sits at 70-72% now." },
                { timestamp: "09:05", handle: "swallace", message: "What's the actual risk threshold? Kafka starts degrading at 85% disk and hard-stops at 95%." },
                { timestamp: "09:08", handle: "jokafor", message: "Right. Current broker storage is 1TB per node (6 nodes = 6TB total). At 72% we have 1.68TB free across the cluster. Daily ingestion rate is ~45GB." },
                { timestamp: "09:12", handle: "nbrooks", message: "So we have ~37 days of headroom at current ingestion rate. That's plenty.", threadReply: true },
                { timestamp: "09:15", handle: "swallace", message: "Let's raise the alert threshold to 82% (warning) and 90% (critical/page). At 82% we'd have ~10 days headroom which is enough to react.", reaction: ":thumbsup: x4" },
                { timestamp: "09:18", handle: "jokafor", message: "Done. Updated Datadog monitors: kafka_broker_disk_usage_pct warning=82 critical=90. Old values were 75/85." },
            ],
        }),
        MIME_CHAT, meridianDate(1)),

    // s44: Chat — decision on feature flag ownership
    docV2("v2-scale-s44", DOMAINS.product, "Chat: #product-eng — Feature flag governance",
        generateChatExport({
            channel: "product-eng",
            date: "2025-12-02",
            messages: [
                { timestamp: "14:00", handle: "evoronova", message: "We have 47 feature flags in production across all services. 12 of them have been at 100% rollout for more than 90 days. Can we clean those up?" },
                { timestamp: "14:05", handle: "ksingh", message: "Absolutely. Flags at 100% for 90+ days should be considered permanent and the flag check should be removed from code. The flag metadata can be archived." },
                { timestamp: "14:08", handle: "fabadi", message: "Agree but we need a process. Proposal: monthly flag review — any flag at 100% for 60+ days gets a ticket to remove the flag and make the feature permanent. Owner of the flag is responsible.", threadReply: true },
                { timestamp: "14:12", handle: "evoronova", message: "Monthly review works. Who owns the review meeting?" },
                { timestamp: "14:15", handle: "ksingh", message: "Product and Engineering jointly. Elena owns the flag inventory, I'll enforce the cleanup tickets. First review: December 16.", reaction: ":calendar: x2" },
                { timestamp: "14:20", handle: "lzhao", message: "Can we also add a hard limit? No service should have more than 20 active flags. Forces teams to clean up before adding new ones." },
                { timestamp: "14:22", handle: "ksingh", message: "20 is a good limit. I'll add a CI check that fails if a service's flag config exceeds 20 entries. Grandfathering existing services until their first cleanup pass." },
            ],
        }),
        MIME_CHAT, meridianDate(1)),

    // s45: Incident chat — settlement discrepancy
    docV2("v2-scale-s45", DOMAINS.eng, "Incident Chat: Settlement Discrepancy — INC-2025-1215",
        generateIncidentChat({
            channel: "inc-2025-1215",
            incidentId: "INC-2025-1215",
            messages: [
                { timestamp: "2025-12-01 07:15", handle: "alertbot", message: "ALERT: Ledger reconciliation found 23 MISSING_CREDIT entries totaling EUR 47,832.19 for settlement date 2025-11-30." },
                { timestamp: "2025-12-01 07:18", handle: "fabadi", message: "Investigating. This looks like the EU-East micro-batch from last night." },
                { timestamp: "2025-12-01 07:22", handle: "fabadi", message: "Found it. The EU-East settlement batch at 03:00 UTC completed but 23 entries had a race condition with the ledger write. The settlement-engine marked them as settled in its DB but the Kafka event for ledger posting was not published because the SQS→Kafka bridge had a transient network error." },
                { timestamp: "2025-12-01 07:25", handle: "jokafor", message: "SQS dead letter queue shows 23 messages. They failed after 5 retries (max_receive_count=5). The bridge reconnected at 03:47 but by then the messages were in DLQ.", threadReply: true },
                { timestamp: "2025-12-01 07:30", handle: "fabadi", message: "Fix: replaying the 23 DLQ messages to the settlement topic. Ledger will process them as normal — idempotency keys prevent double-posting." },
                { timestamp: "2025-12-01 07:35", handle: "fabadi", message: "All 23 entries replayed and confirmed in ledger. Recon check passing now. Total discrepancy resolved: EUR 47,832.19.", reaction: ":white_check_mark: x4" },
                { timestamp: "2025-12-01 07:40", handle: "jokafor", message: "Post-incident: we need to increase max_receive_count from 5 to 10 on the settlement SQS queue, and add a DLQ depth alert. Current visibility_timeout is 900s which is correct." },
            ],
        }),
        MIME_CHAT, meridianDate(1)),

    // ---------- Wiki Scratchpads (s46–s50) ----------

    // s46: Draft doc — auth service refactoring plan
    docV2("v2-scale-s46", DOMAINS.eng, "Draft: Auth Service Refactoring Plan",
        generateDraftDoc({
            title: "Auth Service Refactoring Plan",
            author: "Quinn Murphy",
            lastEdited: "2025-11-25",
            sections: [
                { heading: "Current State", body: "The auth-service is the oldest service in the Meridian stack (originally built in 2022). It handles OAuth2 token issuance, API key validation, and session management. Current tech debt ratio: 31% (highest of any service). Key issues:\n\n1. Monolithic JWT validation — all services call auth-service synchronously for token validation (no local JWT verification)\n2. API key storage uses bcrypt with cost factor 12 — adds 250ms to every API key authentication\n3. Session store uses PostgreSQL — should be Redis for performance\n4. No support for PKCE (Proof Key for Code Exchange) — required for mobile app auth flow", complete: true },
                { heading: "Proposed Changes", body: "Phase 1 (Q1 2026): Migrate API key storage from bcrypt to HMAC-SHA256 with per-key salt. Expected latency improvement: 250ms → 2ms per key validation. Backward compatible — existing bcrypt keys validated and migrated on first use.\n\nPhase 2 (Q1 2026): Implement local JWT verification using JWKS endpoint. Auth-service publishes public keys at /.well-known/jwks.json, services validate JWTs locally. Eliminates ~40% of auth-service traffic.\n\nPhase 3 (Q2 2026): Add PKCE support for mobile auth flow. Required for the mobile app launch planned for Q3 2026.", complete: true },
                { heading: "Migration Risk", body: "The bcrypt→HMAC migration is the highest risk. If the migration job fails mid-way, some keys will be bcrypt and some HMAC. The validation endpoint must support both formats concurrently during the migration window (estimated 2 weeks for all 14,000 active API keys).", complete: false },
            ],
            relatedLinks: [
                "https://eng.meridian.test/docs/v2-scale-s5 — API Rate Limiting Standards",
                "https://security.meridian.test/docs/v2-scale-s42 — API Key Rotation Policy",
            ],
        }),
        MIME_WIKI, meridianDate(1)),

    // s47: Personal notes — Kafka migration notes
    docV2("v2-scale-s47", DOMAINS.platform, "Notes: Kafka Event Bus Migration",
        generatePersonalNotes({
            topic: "Kafka Event Bus Migration",
            author: "Sam Wallace",
            snippets: [
                "migration plan: create new topics → dual-write 48hrs → cut consumers → decommission old topic",
                "new topic partition counts: payment.created=18, payment.completed=12, payment.failed=6, payment.refunded=4",
                "retention: 7 days for created+completed, 30 days for failed (fraud team lookback)",
                "consumer groups to migrate: settlement-consumer, fraud-detector, notification-dispatcher, analytics-sink, audit-logger",
                "risk: analytics-sink consumer does cross-event-type joins — needs to subscribe to all 4 new topics",
                "dual-write implementation: producer publishes to both old topic and new topic during migration window",
                "monitoring: track consumer lag on both old and new topics during dual-write. If new topic consumer lag > 10,000, pause migration",
                "rollback: if migration fails, consumers revert to old topic. Old topic retained for 7 days after migration complete",
                "timeline: start Nov 18, dual-write Nov 18-20, consumer cutover Nov 20-22, old topic decommission Nov 29",
                "DONE: topic creation (Nov 18), schema registry updated for new topics",
            ],
            questions: [
                "Should we use Kafka Connect for the analytics-sink instead of custom consumer?",
                "Do we need separate ACLs for each new topic or one ACL for the payment.* wildcard?",
                "What's the compaction policy for payment.refunded? Currently using delete but maybe compact makes sense for refund lookups",
            ],
        }),
        MIME_WIKI, meridianDate(1)),

    // s48: Draft doc — data warehouse design
    docV2("v2-scale-s48", DOMAINS.eng, "Draft: Data Warehouse Architecture for Risk Scoring Features",
        generateDraftDoc({
            title: "Data Warehouse Architecture for Risk Scoring Features",
            author: "Elena Voronova",
            lastEdited: "2025-11-28",
            sections: [
                { heading: "Overview", body: "The risk-scoring v5 model requires a feature store that refreshes every 4 hours from the data warehouse. Currently, the feature store is populated by ad-hoc SQL queries against the production replica databases. This is unsustainable at scale — the feature extraction queries account for 35% of read replica CPU during refresh windows.\n\nThis document proposes a dedicated data warehouse using Amazon Redshift Serverless for feature extraction, decoupling ML workloads from production databases.", complete: true },
                { heading: "Feature Store Schema", body: "The v5 model uses 247 features grouped into 6 categories:\n\n1. Transaction velocity (28 features): rolling counts and sums over 1h, 6h, 24h, 7d windows\n2. Merchant risk signals (42 features): merchant category codes, geographic risk, chargeback ratios\n3. Device fingerprinting (35 features): device age, IP geolocation, browser entropy\n4. Account behavior (52 features): account age, KYC tier, historical dispute rate\n5. Network graph (48 features): connection to known fraud accounts, shared device clusters\n6. Temporal patterns (42 features): time-of-day, day-of-week, holiday proximity\n\nTotal feature vector size: 247 float32 values = 988 bytes per transaction.", complete: true },
                { heading: "Refresh Pipeline", body: "ETL pipeline using AWS Glue:\n1. Extract: CDC from production Postgres via Debezium → Kafka → S3 (Parquet)\n2. Transform: Glue Spark jobs compute feature aggregations\n3. Load: Features written to Redis (feature store) and Redshift (historical)\n\nRefresh cadence: every 4 hours (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC)\nTarget refresh latency: <15 minutes end-to-end", complete: false },
            ],
        }),
        MIME_WIKI, meridianDate(1)),

    // s49: Personal notes — PCI audit prep
    docV2("v2-scale-s49", DOMAINS.security, "Notes: PCI DSS v4.0 Audit Preparation",
        generatePersonalNotes({
            topic: "PCI DSS v4.0 Audit Prep",
            author: "Bob Martinez",
            snippets: [
                "audit date: February 2026 (pushed from January to fix card-issuing audit trail)",
                "auditor: same firm as last year — Coalfire. Lead auditor: Jennifer Walsh",
                "scope: card-issuing, payment-service, auth-service, and supporting infrastructure",
                "control 10.2.1 finding: card-issuing audit trail missing source_ip field. Frank is adding it — ETA Dec 31",
                "control 3.4.1: PAN encryption uses AES-256-GCM. Key rotation every 365 days via Vault Transit. Last rotation: 2025-06-15",
                "tokenization: PAN tokenized before storage. Token format: tok_xxxxxxxxxxxx (preserves last 4 digits). Detokenization requires explicit RBAC permission",
                "network segmentation: CDE (cardholder data environment) in isolated VPC — verified by quarterly network scan",
                "penetration test: annual pen test completed October 2025 by NCC Group. 2 medium findings, both remediated",
                "employee training: 98% completion rate on annual PCI security awareness (target: 100%). 4 employees overdue — all on leave",
                "evidence collection: using Drata for continuous compliance evidence. 847 evidence items auto-collected",
            ],
            questions: [
                "Do we need a separate AOC (Attestation of Compliance) for the multi-currency card feature?",
                "Coalfire wants to review the Onfido integration — is their SOC 2 Type I sufficient or do we need their PCI AOC?",
                "Should we include the risk-scoring v5 model in scope? It doesn't touch PAN data but it scores payment transactions",
            ],
        }),
        MIME_WIKI, meridianDate(1)),

    // s50: Draft doc — mobile app architecture
    docV2("v2-scale-s50", DOMAINS.product, "Draft: Mobile App Architecture — Project Horizon",
        generateDraftDoc({
            title: "Mobile App Architecture — Project Horizon",
            author: "Liam Zhao",
            lastEdited: "2025-12-01",
            sections: [
                { heading: "Overview", body: "Project Horizon is Meridian's mobile banking app, targeting Q3 2026 launch. The app will provide card management, payment initiation, balance inquiries, and push notifications. Platform: React Native (iOS + Android) with native modules for biometric authentication and NFC card provisioning.\n\nTarget users: existing Meridian clients who currently use the web dashboard. Phase 1 does not include new client onboarding — KYC must still be completed via the web portal.", complete: true },
                { heading: "Authentication", body: "Mobile auth uses OAuth2 with PKCE (RFC 7636). The auth-service PKCE support is a dependency (Phase 3 of auth-service refactoring — Q2 2026). Biometric unlock (Face ID / fingerprint) stores refresh token in device secure enclave. Session duration: 30 minutes active, 7 days refresh token lifetime.\n\nDevice binding: each device is registered with a device fingerprint. Transfers from unregistered devices require step-up authentication (SMS OTP + biometric).", complete: true },
                { heading: "API Layer", body: "The mobile app connects to a BFF (Backend-for-Frontend) service that aggregates calls to existing microservices. The BFF reduces client-side complexity and provides mobile-optimized response payloads.\n\nBFF endpoints:\n- GET /mobile/v1/dashboard — aggregates balance, recent transactions, card status\n- POST /mobile/v1/payments — initiates payment with mobile-specific validation\n- GET /mobile/v1/cards — card list with controls and spending limits\n- POST /mobile/v1/cards/:id/freeze — instant card freeze/unfreeze\n\nTarget latency: p99 < 200ms for dashboard, < 500ms for payment initiation.", complete: false },
                { heading: "Push Notifications", body: "Integrates with existing notification-service. Firebase Cloud Messaging (Android) and APNs (iOS). Notification types: transaction alerts, payment confirmations, security alerts, KYC reminders.\n\nUsers can configure notification preferences per channel via the notification preferences API (GET/PUT /v2/notifications/preferences/:userId).", complete: true },
            ],
            relatedLinks: [
                "https://eng.meridian.test/docs/auth-refactoring — Auth Service PKCE dependency",
                "https://product.meridian.test/docs/project-horizon-prd — Product Requirements Document",
            ],
        }),
        MIME_WIKI, meridianDate(1)),
];

// ============================================================================
// Context Document Generator — 500 docs
// ============================================================================

const MIME_TYPES = [
    MIME_MARKDOWN,
    MIME_JSON,
    MIME_YAML,
    MIME_CSV,
    MIME_HTML,
    MIME_EMAIL,
    MIME_MEETING_NOTES,
    MIME_CHAT,
    MIME_WIKI,
] as const;

const CTX_TOPICS = [
    "onboarding", "monitoring", "deployment", "testing", "documentation",
    "refactoring", "migration", "scaling", "security-review", "cost-optimization",
    "incident-management", "capacity-planning", "vendor-evaluation", "training",
    "performance-tuning", "backup-strategy", "disaster-recovery", "api-versioning",
    "data-governance", "release-management",
] as const;

export function generateCat3ContextDocs(): CorpusDocV2[] {
    const docs: CorpusDocV2[] = [];

    for (let i = 0; i < 500; i++) {
        const domain = ALL_DOMAINS[i % ALL_DOMAINS.length];
        const mimeIdx = i % 9;
        const mime = MIME_TYPES[mimeIdx];
        const topic = CTX_TOPICS[i % CTX_TOPICS.length];
        const svc = service(i);
        const emp = employee(i);
        const monthsAgo = 1 + (i % 12);
        const id = `v2-scale-ctx-${i}`;
        const title = `${topic} — ${svc} (${i})`;

        let content: string;

        switch (mimeIdx) {
            case 0: // markdown
                content = generatePolicy({
                    id: `CTX-POL-${i}`,
                    title: `${topic} Guidelines for ${svc}`,
                    version: `1.${i % 5}`,
                    department: emp.dept,
                    owner: emp.name,
                    effectiveDate: `2025-${String(1 + (i % 12)).padStart(2, "0")}-01`,
                    sections: [
                        { heading: "Scope", body: `This document covers the ${topic} procedures for the ${svc} within Meridian Financial Services. All team members in the ${emp.dept} department must follow these guidelines when performing ${topic} activities. This applies to both production and staging environments.` },
                        { heading: "Procedures", body: `Standard ${topic} procedures for ${svc} include the following steps: initial assessment of the current state, planning phase with stakeholder sign-off, execution during the approved maintenance window, validation using automated test suites, and post-completion review. All activities must be logged in the operations journal.` },
                        { heading: "Review Cadence", body: `These guidelines are reviewed quarterly by the ${emp.dept} department. Last review completed by ${emp.name}. Next review scheduled for the following quarter.` },
                    ],
                });
                break;
            case 1: // json
                content = generateFeatureFlags({
                    service: svc,
                    environment: i % 2 === 0 ? "production" : "staging",
                    flags: [
                        { key: `${topic}_enabled`, enabled: i % 3 !== 0, description: `Enable ${topic} workflow for ${svc}`, rollout_percentage: (i * 7) % 101, owner: emp.name },
                        { key: `${topic}_v2`, enabled: i % 4 === 0, description: `Use v2 ${topic} pipeline`, owner: emp.name },
                    ],
                });
                break;
            case 2: // yaml
                content = generateCIPipeline({
                    service: svc,
                    language: "TypeScript",
                    testCommand: `npm run test:${topic}`,
                    buildCommand: `npm run build`,
                    deployTarget: i % 2 === 0 ? "production" : "staging",
                    secretScanning: i % 3 === 0,
                    dependencyAudit: i % 2 === 0,
                });
                break;
            case 3: // csv
                content = generatePerformanceMetrics({
                    service: svc,
                    period: `Context period ${i}`,
                    dataPoints: [
                        { date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-01`, requests: 100000 + i * 1000, errors: i % 50, p50_ms: 10 + (i % 30), p95_ms: 50 + (i % 80), p99_ms: 100 + (i % 200), cpu_pct: 20 + (i % 60), memory_mb: 500 + (i % 1500) },
                        { date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-02`, requests: 110000 + i * 1000, errors: (i + 1) % 50, p50_ms: 11 + (i % 30), p95_ms: 52 + (i % 80), p99_ms: 105 + (i % 200), cpu_pct: 22 + (i % 60), memory_mb: 510 + (i % 1500) },
                    ],
                });
                break;
            case 4: // html
                content = generateQBRReport({
                    quarter: `Q${1 + (i % 4)}`,
                    year: 2025,
                    department: emp.dept,
                    highlights: [
                        { metric: `${topic} completion rate`, target: "95%", actual: `${85 + (i % 15)}%`, status: i % 3 === 0 ? "Behind" : "On Track" },
                        { metric: `${topic} cycle time`, target: "5 days", actual: `${3 + (i % 5)} days`, status: "On Track" },
                    ],
                    narrative: `This report covers ${topic} activities for ${svc} during the quarter. The team achieved the target metrics with standard operational procedures. No significant deviations from the plan were observed. Staffing levels remained consistent throughout the period.`,
                    risks: [
                        { description: `${topic} process dependency on ${svc}`, severity: i % 3 === 0 ? "High" : "Medium", mitigation: `Documented procedures and cross-training in place` },
                    ],
                });
                break;
            case 5: // email
                content = generateEmailThread({
                    subject: `${topic} update for ${svc}`,
                    messages: [
                        { from: `${emp.name} <${emp.handle}@meridian.test>`, to: [`team-${emp.dept}@meridian.test`], date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")} 10:00`, body: `Team,\n\nQuick update on the ${topic} work for ${svc}. We're on track with the planned timeline. The main deliverables are progressing as expected and no blockers have been identified.\n\nPlease review the attached documentation and provide feedback by end of week.\n\n${emp.name}` },
                    ],
                });
                break;
            case 6: // meeting notes
                content = generateMeetingNotes({
                    title: `${topic} standup — ${svc}`,
                    date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
                    attendees: [emp.name, employee(i + 1).name, employee(i + 2).name],
                    location: "Zoom",
                    notes: [
                        `Discussed ${topic} progress for ${svc}`,
                        `Current status: on track for the planned delivery date`,
                        `No blockers identified during this standup`,
                        `Next review scheduled for next week`,
                    ],
                    actionItems: [
                        { assignee: emp.handle, task: `Continue ${topic} implementation for ${svc}` },
                    ],
                });
                break;
            case 7: // chat
                content = generateChatExport({
                    channel: `${emp.dept}-general`,
                    date: `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
                    messages: [
                        { timestamp: "10:00", handle: emp.handle, message: `Starting ${topic} work on ${svc} today` },
                        { timestamp: "10:05", handle: employee(i + 1).handle, message: `Sounds good. Let me know if you need a review.` },
                        { timestamp: "14:00", handle: emp.handle, message: `${topic} changes for ${svc} are ready for review` },
                    ],
                });
                break;
            case 8: // wiki
                content = generatePersonalNotes({
                    topic: `${topic} for ${svc}`,
                    author: emp.name,
                    snippets: [
                        `working on ${topic} improvements for ${svc}`,
                        `current implementation follows standard patterns`,
                        `no significant deviations from the architecture guidelines`,
                        `documentation updated in the team wiki`,
                    ],
                    questions: [
                        `Should we align ${topic} cadence with the release schedule?`,
                        `Any dependencies on other teams for the ${svc} changes?`,
                    ],
                });
                break;
        }

        docs.push(docV2(id, domain, title, content!, mime, meridianDate(monthsAgo)));
    }

    return docs;
}

// ============================================================================
// Benchmark Queries — 15 queries testing cross-format retrieval
// ============================================================================

export const CAT3_QUERIES: GroundTruth[] = [
    // Q1: Answer in JSON config (s7) — KYC database pool max connections
    {
        query: "What is the maximum connection pool size for the kyc-service database?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s7"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q2: Answer in CSV (s19) — FX service SLA breach in November
    {
        query: "Which services breached their SLA targets in November 2025?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s19"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q3: Answer in email (s31) — Kafka partition strategy decision
    {
        query: "What partition layout was decided for the payment event Kafka topics?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s31"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q4: Answer in HTML report (s26) — PCI DSS non-compliant control
    {
        query: "Which PCI DSS v4.0 control was found non-compliant for Meridian in November 2025?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s26"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q5: Answer spans JSON (s8) + meeting notes (s40) — multi-currency card rollout percentage
    {
        query: "What is the current rollout percentage for multi-currency cards and when is GA planned?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s8", "v2-scale-s40"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q6: Answer in markdown ADR (s2) + YAML K8s (s12) — settlement engine batch design
    {
        query: "How are settlement batches partitioned and what is the database connection pool size for the settlement-engine?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s2", "v2-scale-s12"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q7: Answer in meeting notes (s36) — Q4 infrastructure budget
    {
        query: "What is the Q4 2025 infrastructure budget for engineering and how is it allocated?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s36"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q8: Answer in chat (s42) — API key rotation cadence by tier
    {
        query: "What is the API key rotation policy for different client tiers at Meridian?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s42"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q9: Answer in wiki draft (s46) + markdown policy (s5) — auth service API key validation latency
    {
        query: "How long does API key authentication take currently and what is the planned improvement?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s46", "v2-scale-s5"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q10: Answer in HTML audit (s30) — critical webhook security finding
    {
        query: "What critical security finding was identified in the notification-service webhook endpoint?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s30"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q11: Answer in email (s35) + CSV (s24) — KYC service latency root cause
    {
        query: "What caused the KYC service latency spikes in November 2025 and what was the fix?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s35", "v2-scale-s24"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q12: Answer in markdown RFC (s4) + JSON (s11) — risk scoring v5 model details
    {
        query: "What are the fraud detection rate and false positive rate for the risk scoring v5 model?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s4", "v2-scale-s11"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q13: Answer in incident chat (s41) — Redis connection limit incident
    {
        query: "What caused the payment timeout cascade incident INC-2025-1203?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s41"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q14: Answer in email (s33) + meeting notes (s39) — AML vendor switch decision
    {
        query: "Why is Meridian switching from Sumsub to ComplyAdvantage for AML screening?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s33", "v2-scale-s39"],
        expectedFragilityRange: [0.0, 1.0],
    },

    // Q15: Answer in YAML (s17) + markdown runbook (s3) — FX service stale rate threshold
    {
        query: "What is the stale rate threshold for the FX service and why was it changed?",
        mode: "light",
        topK: 10,
        expectedDocIds: ["v2-scale-s17", "v2-scale-s3"],
        expectedFragilityRange: [0.0, 1.0],
    },
];

// ============================================================================
// Fragility Probes — 5 queries in verified mode
// ============================================================================

export const CAT3_FRAGILITY_PROBES: GroundTruth[] = [
    // FP1: Answer buried in incident chat (s45) — settlement discrepancy amount
    {
        query: "What was the total EUR amount of the settlement discrepancy in incident INC-2025-1215?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-scale-s45"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // FP2: Answer in email BIN allocation (s32) — specific BIN range
    {
        query: "What new Visa BIN range was allocated to Meridian for virtual cards?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-scale-s32"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // FP3: Answer in wiki notes (s48) — number of features in risk scoring model
    {
        query: "How many features does the risk scoring v5 model use and what is the feature vector size in bytes?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-scale-s48"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // FP4: Answer in chat (s43) — specific Kafka disk alert thresholds
    {
        query: "What are the current Datadog alert thresholds for Kafka broker disk usage?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-scale-s43"],
        expectedFragilityRange: [0.3, 1.0],
    },

    // FP5: Answer in policy (s1) + HTML dashboard (s26) — KYC EDD threshold value
    {
        query: "What is the Enhanced Due Diligence transaction volume threshold per quarter and was it recently changed?",
        mode: "verified",
        topK: 10,
        expectedDocIds: ["v2-scale-s1"],
        expectedFragilityRange: [0.3, 1.0],
    },
];
