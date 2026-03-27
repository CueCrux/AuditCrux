#!/usr/bin/env tsx
// Delta Fixture — Corpus Generator
//
// Generates a 2M+ token corpus (~500 docs) with:
// - ~40 signal documents containing decision keys
// - ~460 noise documents (realistic but not directly relevant)
// - 5 needle facts buried in long noise docs
// - 4 contradiction pairs
// - 10 stale documents
//
// Domain: "Enterprise SaaS Platform" — multi-team org with payments, auth,
// data pipeline, ML, infrastructure, compliance, mobile, and API teams.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface CorpusDoc {
  id: string;
  type: "document" | "decision" | "incident" | "constraint";
  title: string;
  content: string;
  tokens: number;
  domain?: string;
  phase?: string | number;
  metadata?: Record<string, unknown>;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function randomDate(yearStart: number, yearEnd: number): string {
  const y = yearStart + Math.floor(Math.random() * (yearEnd - yearStart + 1));
  const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// Teams, services, and infrastructure vocabulary
// ============================================================

const TEAMS = [
  "Platform Engineering", "Payments", "Auth & Identity", "Data Pipeline",
  "ML Platform", "Infrastructure", "Compliance & Security", "Mobile",
  "API Gateway", "Observability", "Customer Success", "Developer Experience",
  "Growth", "Billing", "Search", "Notifications", "Analytics", "SRE",
  "Frontend Platform", "Content Delivery",
];

const SERVICES = [
  "payment-service", "auth-gateway", "user-service", "billing-engine",
  "notification-hub", "search-indexer", "ml-inference", "data-ingestion",
  "event-router", "api-gateway", "cdn-origin", "mobile-bff",
  "analytics-collector", "compliance-auditor", "rate-limiter",
  "session-manager", "feature-flag-service", "config-server",
  "webhook-dispatcher", "cache-warmer", "job-scheduler", "report-generator",
  "file-upload", "email-renderer", "sms-gateway", "push-notifier",
  "oauth-provider", "saml-bridge", "ldap-sync", "audit-log-service",
];

const DATABASES = [
  "payments-primary", "auth-replica", "analytics-warehouse", "search-elastic",
  "session-redis", "config-etcd", "events-kafka", "ml-feature-store",
  "billing-primary", "notification-queue", "user-graph-neo4j", "cache-memcached",
  "audit-timescaledb", "compliance-vault", "cdn-edge-cache",
];

const INFRA = [
  "us-east-1", "eu-west-1", "ap-southeast-1", "k8s-prod-cluster",
  "k8s-staging-cluster", "terraform-modules", "ansible-playbooks",
  "cloudflare-cdn", "datadog-monitors", "pagerduty-oncall",
  "vault-secrets", "consul-service-mesh", "envoy-sidecar",
];

const PROTOCOLS = [
  "gRPC", "REST", "GraphQL", "WebSocket", "AMQP", "Kafka protocol",
  "Redis protocol", "PostgreSQL wire protocol",
];

const COMPLIANCE_STANDARDS = [
  "SOC 2 Type II", "PCI DSS v4.0", "GDPR", "HIPAA", "ISO 27001",
  "CCPA", "FedRAMP Moderate", "SOX Section 404",
];

// ============================================================
// Signal documents — contain decision keys for Phase 5 recall
// ============================================================

const DECISION_KEYS = [
  // Auth decisions (Phase 1)
  "Ed25519 for JWT signing",
  "15-minute access token TTL",
  "opaque refresh tokens in Redis",
  "PKCE for all OAuth flows",
  // Payment decisions (Phase 2)
  "Stripe as primary processor",
  "idempotency key in X-Idempotency-Key header",
  "PCI DSS tokenization via Stripe Elements",
  "webhook signature verification with HMAC-SHA256",
  "30-day refund window policy",
  // Data pipeline (Phase 3)
  "Apache Flink for stream processing",
  "exactly-once semantics via Kafka transactions",
  "15-minute tumbling windows for aggregation",
  "dead letter queue for poison messages",
  "Parquet format for cold storage",
  // Infrastructure (Phase 4)
  "blue-green deployment strategy",
  "circuit breaker with 50% error threshold",
  "5-second timeout for inter-service calls",
  "pod disruption budget minimum 60%",
  "Argo Rollouts for canary releases",
  // Cross-cutting (Phase 5 recall)
  "mutual TLS between all services",
  "structured JSON logging with correlation IDs",
  "OpenTelemetry for distributed tracing",
  "99.95% SLA for payment endpoints",
  "data retention 7 years for financial records",
  "CQRS pattern for billing reads",
];

// Needle facts — buried in long noise docs
const NEEDLE_FACTS = [
  {
    key: "vault-transit-key-ed25519-prod-signing-v3",
    content: "The production JWT signing key is stored in Vault Transit at path `transit/keys/ed25519-prod-signing-v3`. This key was rotated on 2026-01-15 after the key compromise incident. All services must reference this exact key path.",
    buriedIn: "delta-runbook-047",
  },
  {
    key: "10.80.0.7:6379",
    content: "The session Redis cluster master is at 10.80.0.7:6379 with sentinels at 10.80.0.{8,9,10}:26379. This was migrated from the legacy 10.70.x.x subnet on 2025-11-20.",
    buriedIn: "delta-infra-032",
  },
  {
    key: "Building D Floor 2 Server Room 204",
    content: "The disaster recovery HSM appliance is physically located in Building D Floor 2 Server Room 204, rack position U24-U27. Physical access requires both Security Badge Level 4 and biometric verification.",
    buriedIn: "delta-compliance-018",
  },
  {
    key: "KAFKA_CONSUMER_GROUP_payment-settlement-v3",
    content: "The payment settlement consumer group ID is `payment-settlement-v3`. This was changed from v2 during the Kafka cluster migration. Any consumer joining with the old group ID will be rejected by the ACL policy.",
    buriedIn: "delta-inc-012",
  },
  {
    key: "feature-flag-gradual-rollout-payments-eu",
    content: "The EU payments gradual rollout uses feature flag `gradual-rollout-payments-eu` with a 5% daily increment. Current rollout is at 35% as of 2026-03-01. DO NOT override this flag manually — the rollout controller manages it.",
    buriedIn: "delta-ops-028",
  },
];

// Contradiction pairs
const CONTRADICTIONS = [
  {
    docA: "delta-adr-auth-012",
    docB: "delta-adr-auth-012-superseded",
    topicA: "Access tokens must use RS256 algorithm for JWT signing to maintain backward compatibility with legacy mobile clients",
    topicB: "Access tokens must use Ed25519 algorithm for JWT signing — RS256 is deprecated due to key size and performance concerns",
    domain: "auth",
  },
  {
    docA: "delta-spec-payments-008",
    docB: "delta-spec-payments-008-v2",
    topicA: "Payment webhook retry policy: 3 retries with exponential backoff starting at 1 second, max 30 seconds",
    topicB: "Payment webhook retry policy: 5 retries with exponential backoff starting at 5 seconds, max 300 seconds (5 minutes)",
    domain: "payments",
  },
  {
    docA: "delta-policy-data-003",
    docB: "delta-policy-data-003-updated",
    topicA: "PII data must be deleted within 30 days of account closure per GDPR Article 17",
    topicB: "PII data must be deleted within 72 hours of account closure per updated GDPR enforcement guidance from 2026-01",
    domain: "compliance",
  },
  {
    docA: "delta-adr-infra-019",
    docB: "delta-adr-infra-019-revised",
    topicA: "Database connection pool size: 20 connections per service instance (total 200 across 10 replicas)",
    topicB: "Database connection pool size: 50 connections per service instance (total 500 across 10 replicas) — increased after connection exhaustion incident INC-2026-034",
    domain: "infrastructure",
  },
];

// ============================================================
// Document generators
// ============================================================

function generateADR(id: string, title: string, content: string, domain: string, date: string, phase?: number | string): CorpusDoc {
  const fullContent = `# ADR: ${title}\n\n**Date:** ${date}\n**Status:** Accepted\n**Team:** ${pick(TEAMS)}\n**Author:** ${pick(["Sarah Chen", "Marcus Rivera", "Priya Patel", "James O'Brien", "Aisha Mohammed", "Tom Nakamura"])}\n\n## Context\n\n${content}\n\n## Decision\n\nWe will ${content.split(". ")[0].toLowerCase()}.\n\n## Consequences\n\n- Teams must update their service configurations\n- Monitoring dashboards need updating\n- Documentation to be updated within 2 weeks\n`;
  return { id, type: "decision", title, content: fullContent, tokens: estimateTokens(fullContent), domain, phase, metadata: {} };
}

function generateIncident(id: string, title: string, content: string, domain: string, date: string): CorpusDoc {
  const severity = pick(["SEV-1", "SEV-2", "SEV-3"]);
  const duration = `${Math.floor(Math.random() * 4) + 1}h ${Math.floor(Math.random() * 60)}m`;
  const fullContent = `# Incident Report: ${title}\n\n**ID:** ${id.toUpperCase()}\n**Date:** ${date}\n**Severity:** ${severity}\n**Duration:** ${duration}\n**Impacted Services:** ${pick(SERVICES)}, ${pick(SERVICES)}\n**On-Call:** ${pick(["Sarah Chen", "Marcus Rivera", "Priya Patel"])}\n\n## Timeline\n\n- ${date}T02:15Z — Alert triggered: ${title}\n- ${date}T02:18Z — On-call acknowledged\n- ${date}T02:35Z — Root cause identified\n- ${date}T03:10Z — Mitigation applied\n- ${date}T04:00Z — Service fully restored\n\n## Root Cause\n\n${content}\n\n## Impact\n\n- ${Math.floor(Math.random() * 5000) + 100} users affected\n- ${Math.floor(Math.random() * 50) + 1} failed transactions\n- Estimated revenue impact: $${Math.floor(Math.random() * 50000) + 1000}\n\n## Action Items\n\n1. Add monitoring for the identified failure mode\n2. Update runbook with mitigation steps\n3. Schedule post-mortem review\n4. Implement automated recovery\n`;
  return { id, type: "incident", title, content: fullContent, tokens: estimateTokens(fullContent), domain };
}

function generateSpec(id: string, title: string, content: string, domain: string): CorpusDoc {
  const fullContent = `# Technical Specification: ${title}\n\n**Version:** ${pick(["1.0", "1.1", "2.0", "2.1", "3.0"])}\n**Last Updated:** ${randomDate(2025, 2026)}\n**Owner:** ${pick(TEAMS)}\n**Reviewers:** ${pick(TEAMS)}, ${pick(TEAMS)}\n\n## Overview\n\n${content}\n\n## Requirements\n\n### Functional Requirements\n\n1. The system must handle ${Math.floor(Math.random() * 10000) + 1000} requests per second\n2. Response latency p99 must be under ${pick(["50ms", "100ms", "200ms", "500ms"])}\n3. Data must be replicated across ${pick(["2", "3"])} availability zones\n\n### Non-Functional Requirements\n\n1. Availability target: ${pick(["99.9%", "99.95%", "99.99%"])}\n2. Recovery time objective: ${pick(["5 minutes", "15 minutes", "1 hour"])}\n3. Recovery point objective: ${pick(["0 (zero data loss)", "1 minute", "5 minutes"])}\n\n## Architecture\n\n${content}\n\n## API Contract\n\n\`\`\`\nPOST /v1/${domain}/${pick(["process", "submit", "create", "validate"])}\nContent-Type: application/json\nAuthorization: Bearer <token>\n\n{\n  "id": "string",\n  "payload": { ... },\n  "metadata": { "correlation_id": "string" }\n}\n\`\`\`\n\n## Monitoring\n\n- Prometheus metrics: \`${domain}_requests_total\`, \`${domain}_latency_seconds\`\n- Alerts: p99 latency > ${pick(["100ms", "500ms"])}, error rate > ${pick(["1%", "5%"])}\n- Dashboard: Grafana \`${domain}-overview\`\n`;
  return { id, type: "document", title, content: fullContent, tokens: estimateTokens(fullContent), domain };
}

function generateRunbook(id: string, title: string, content: string, domain: string): CorpusDoc {
  const fullContent = `# Runbook: ${title}\n\n**Last Updated:** ${randomDate(2025, 2026)}\n**Owner:** ${pick(TEAMS)}\n**On-Call Rotation:** ${pick(["primary", "secondary", "escalation"])}\n\n## Prerequisites\n\n- Access to ${pick(INFRA)} cluster\n- kubectl configured for ${pick(["prod", "staging"])} context\n- Vault token with ${pick(["read", "admin"])} policy\n\n## Procedure\n\n### Step 1: Verify the Issue\n\n\`\`\`bash\nkubectl get pods -n ${domain} -l app=${pick(SERVICES)}\nkubectl logs -n ${domain} -l app=${pick(SERVICES)} --tail=100\n\`\`\`\n\n### Step 2: Check Dependencies\n\n\`\`\`bash\n# Check database connectivity\npsql -h ${pick(DATABASES)} -U readonly -c "SELECT 1"\n\n# Check Redis\nredis-cli -h ${pick(["10.80.1.10", "10.80.1.11"])} ping\n\`\`\`\n\n### Step 3: Apply Mitigation\n\n${content}\n\n### Step 4: Verify Recovery\n\n\`\`\`bash\n# Check service health\ncurl -s http://${pick(SERVICES)}.internal:8080/healthz | jq .\n\n# Check error rates\ncurl -s "http://prometheus:9090/api/v1/query?query=rate(http_errors_total[5m])"\n\`\`\`\n\n### Step 5: Post-Recovery\n\n1. Update the incident channel\n2. Document any manual changes made\n3. Create follow-up tickets for permanent fixes\n\n## Escalation\n\nIf steps above don't resolve:\n1. Page ${pick(TEAMS)} lead\n2. Escalate to ${pick(TEAMS)}\n3. If SEV-1: page VP Engineering\n\n## Related Runbooks\n\n- [${pick(SERVICES)} Recovery](./runbook-${Math.floor(Math.random() * 100)}.md)\n- [Database Failover](./runbook-db-failover.md)\n- [Kafka Consumer Reset](./runbook-kafka-reset.md)\n`;
  return { id, type: "document", title, content: fullContent, tokens: estimateTokens(fullContent), domain };
}

function generateMeetingNotes(id: string, title: string, domain: string): CorpusDoc {
  const attendees = Array.from({ length: Math.floor(Math.random() * 6) + 3 }, () =>
    pick(["Sarah Chen", "Marcus Rivera", "Priya Patel", "James O'Brien", "Aisha Mohammed", "Tom Nakamura", "Lisa Park", "Dev Sharma", "Ana Costa", "Chris Wong", "Emma Thompson", "Ryan Kim"])
  );
  const date = randomDate(2025, 2026);
  const fullContent = `# Meeting Notes: ${title}\n\n**Date:** ${date}\n**Attendees:** ${[...new Set(attendees)].join(", ")}\n**Scribe:** ${pick(attendees)}\n\n## Agenda\n\n1. Status updates from each team\n2. Review of open action items\n3. Discussion: ${title}\n4. Next steps\n\n## Discussion\n\n### Status Updates\n\n- ${pick(TEAMS)}: Completed migration of ${pick(SERVICES)} to new cluster. No issues reported.\n- ${pick(TEAMS)}: Working on ${pick(["performance optimization", "security audit", "feature rollout", "capacity planning"])}. ETA ${pick(["next week", "end of sprint", "Q2", "next month"])}.\n- ${pick(TEAMS)}: Blocked on ${pick(["dependency upgrade", "security review", "capacity approval", "vendor contract"])}.\n\n### Key Discussion Points\n\n1. ${pick(["We need to decide on", "Team agreed to", "Still debating"])} the approach for ${pick(["scaling", "migrating", "securing", "monitoring"])} ${pick(SERVICES)}.\n2. ${pick(TEAMS)} raised concerns about ${pick(["latency", "cost", "complexity", "security"])} of the proposed solution.\n3. Action item: ${pick(attendees)} to prepare a proposal by ${randomDate(2026, 2026)}.\n\n### Decisions Made\n\n- Approved: ${pick(["budget for", "timeline for", "approach to", "vendor for"])} ${pick(["infrastructure upgrade", "security audit", "performance testing", "new hire"])}\n- Deferred: ${pick(["Migration of", "Upgrade of", "Deprecation of"])} ${pick(SERVICES)} to ${pick(["next quarter", "after stability milestone", "pending security review"])}\n\n## Action Items\n\n| Owner | Action | Due Date |\n|-------|--------|----------|\n| ${pick(attendees)} | ${pick(["Write RFC for", "Schedule review of", "Deploy fix for", "Update docs for"])} ${pick(SERVICES)} | ${randomDate(2026, 2026)} |\n| ${pick(attendees)} | ${pick(["Review PR for", "Test rollback of", "Benchmark performance of"])} ${pick(SERVICES)} | ${randomDate(2026, 2026)} |\n| ${pick(attendees)} | ${pick(["Update monitoring for", "Create runbook for", "Audit permissions for"])} ${pick(SERVICES)} | ${randomDate(2026, 2026)} |\n\n## Next Meeting\n\n${randomDate(2026, 2026)} at ${pick(["10:00", "14:00", "15:30"])} UTC\n`;
  return { id, type: "document", title, content: fullContent, tokens: estimateTokens(fullContent), domain };
}

function generatePolicy(id: string, title: string, content: string, domain: string): CorpusDoc {
  const fullContent = `# Policy: ${title}\n\n**Effective Date:** ${randomDate(2024, 2026)}\n**Last Review:** ${randomDate(2025, 2026)}\n**Owner:** ${pick(["CISO", "VP Engineering", "CTO", "Head of Compliance"])}\n**Compliance:** ${pick(COMPLIANCE_STANDARDS)}\n**Classification:** ${pick(["Internal", "Confidential", "Restricted"])}\n\n## Purpose\n\nThis policy establishes requirements for ${title.toLowerCase()} across all production systems and services.\n\n## Scope\n\nApplies to all engineering teams, contractors, and third-party vendors with access to ${pick(["production systems", "customer data", "financial records", "infrastructure"])}.\n\n## Policy Statement\n\n${content}\n\n## Requirements\n\n### Section 1: Access Controls\n\n1. All access must use ${pick(["multi-factor authentication", "certificate-based auth", "SSO with SAML 2.0"])}\n2. Service accounts must rotate credentials every ${pick(["30", "60", "90"])} days\n3. Production access requires ${pick(["manager approval", "security team approval", "break-glass procedure"])}\n\n### Section 2: Data Handling\n\n1. PII must be encrypted at rest using ${pick(["AES-256-GCM", "ChaCha20-Poly1305"])}\n2. Data in transit must use TLS ${pick(["1.2+", "1.3 only"])}\n3. Logs must not contain ${pick(["PII", "credentials", "session tokens", "API keys"])}\n\n### Section 3: Monitoring & Audit\n\n1. All access to ${pick(["production", "PII", "financial"])} systems must be logged\n2. Audit logs must be retained for ${pick(["1 year", "3 years", "7 years"])}\n3. Anomalous access patterns must trigger alerts within ${pick(["5 minutes", "15 minutes"])}\n\n## Enforcement\n\nViolations of this policy may result in:\n- First offense: Written warning and mandatory security training\n- Second offense: Access revocation pending review\n- Third offense: Disciplinary action up to termination\n\n## Exceptions\n\nExceptions require written approval from ${pick(["CISO", "VP Engineering"])} and must be reviewed quarterly.\n\n## References\n\n- ${pick(COMPLIANCE_STANDARDS)} Section ${Math.floor(Math.random() * 12) + 1}\n- Internal Security Handbook v${pick(["3.0", "3.1", "4.0"])}\n- Vendor Security Assessment Framework\n`;
  return { id, type: "document", title, content: fullContent, tokens: estimateTokens(fullContent), domain };
}

function generateNoiseDoc(id: string, domain: string): CorpusDoc {
  const templates = [
    () => generateMeetingNotes(id, `${pick(TEAMS)} ${pick(["Weekly Sync", "Sprint Planning", "Retrospective", "Architecture Review", "Design Discussion", "Roadmap Review", "Capacity Planning", "Incident Review"])}`, domain),
    () => generateRunbook(id, `${pick(SERVICES)} ${pick(["Restart Procedure", "Scaling Guide", "Backup Recovery", "Certificate Rotation", "Log Rotation", "Cache Flush", "Connection Pool Reset", "Config Update"])}`, `Standard procedure for ${pick(SERVICES)}. Follow the checklist carefully. Contact ${pick(TEAMS)} if issues arise.`, domain),
    () => generatePolicy(id, `${pick(["Data Classification", "Incident Response", "Change Management", "Disaster Recovery", "Vendor Assessment", "Employee Offboarding", "Code Review Standards", "Release Management", "Capacity Planning", "Cost Optimization"])} Policy`, `All teams must comply with the organization's ${pick(["security", "operational", "compliance", "governance"])} standards when working with ${pick(["production systems", "customer data", "third-party integrations", "cloud resources"])}.`, domain),
    () => generateSpec(id, `${pick(SERVICES)} ${pick(["API Specification", "Data Model", "Integration Guide", "Performance Requirements", "Scaling Strategy", "Migration Plan"])}`, `This document describes the ${pick(["architecture", "requirements", "design", "implementation"])} of ${pick(SERVICES)} for the ${pick(TEAMS)} team. The service handles ${Math.floor(Math.random() * 10000) + 500} ${pick(["requests", "events", "transactions", "messages"])} per second at peak.`, domain),
    () => {
      // Long rambling design doc (noise filler)
      const service = pick(SERVICES);
      const sections = Array.from({ length: Math.floor(Math.random() * 8) + 5 }, (_, i) => {
        return `## Section ${i + 1}: ${pick(["Background", "Requirements", "Constraints", "Alternatives", "Evaluation", "Risks", "Timeline", "Dependencies", "Testing Strategy", "Rollback Plan", "Monitoring", "Cost Analysis"])}\n\n${Array.from({ length: Math.floor(Math.random() * 6) + 3 }, () =>
          `${pick(["The", "Our", "This", "Each", "Every", "All"])} ${pick(["system", "service", "component", "module", "layer", "pipeline"])} ${pick(["must", "should", "will", "can"])} ${pick(["handle", "process", "support", "manage", "validate", "transform"])} ${pick(["incoming", "outgoing", "internal", "external", "batch", "streaming"])} ${pick(["requests", "events", "messages", "data", "transactions", "records"])} ${pick(["efficiently", "reliably", "securely", "consistently", "atomically"])}. ${pick(["We evaluated", "The team considered", "After benchmarking", "Based on analysis of"])} ${pick(["several", "multiple", "three", "four"])} ${pick(["approaches", "options", "solutions", "frameworks"])} and ${pick(["chose", "selected", "decided on", "opted for"])} ${pick(["the most reliable", "the simplest", "the most cost-effective", "the industry standard"])} ${pick(["approach", "solution", "pattern", "architecture"])}.`
        ).join(" ")}\n`;
      });
      const fullContent = `# Design Document: ${service} ${pick(["Redesign", "v2", "Migration", "Optimization", "Refactor"])}\n\n**Author:** ${pick(["Sarah Chen", "Marcus Rivera", "Priya Patel"])}\n**Date:** ${randomDate(2025, 2026)}\n**Status:** ${pick(["Draft", "In Review", "Approved", "Superseded"])}\n\n${sections.join("\n")}`;
      return { id, type: "document" as const, title: `${service} Design Document`, content: fullContent, tokens: estimateTokens(fullContent), domain };
    },
  ];

  return pick(templates)();
}

// ============================================================
// Build the corpus
// ============================================================

const docs: CorpusDoc[] = [];

// --- Signal documents: Auth decisions (Phase 1) ---
docs.push(generateADR("delta-adr-auth-001", "JWT Signing Algorithm Selection", "After evaluating RS256, ES256, and Ed25519, we chose Ed25519 for JWT signing due to its compact key size (32 bytes), fast verification (62,000 ops/sec vs RS256's 8,000), and resistance to timing attacks. All services must use the `ed25519-prod-signing-v3` key from Vault Transit.", "auth", "2026-01-20", "before-phase-1"));
docs.push(generateADR("delta-adr-auth-002", "Access Token TTL Policy", "Access tokens will have a 15-minute access token TTL. This balances security (short window for stolen tokens) with user experience (minimal re-auth friction). Refresh tokens are opaque (not JWT) and stored in Redis with a 30-day expiry.", "auth", "2026-01-22", "before-phase-1"));
docs.push(generateADR("delta-adr-auth-003", "Refresh Token Storage", "Refresh tokens will be opaque refresh tokens in Redis, not JWTs. This allows immediate revocation without maintaining a blocklist. Each refresh token is a 256-bit random value mapped to a session record. Redis cluster at 10.80.0.7 handles token lookups.", "auth", "2026-01-25", "before-phase-1"));
docs.push(generateADR("delta-adr-auth-004", "OAuth PKCE Requirement", "All OAuth 2.0 flows must use PKCE for all OAuth flows, including confidential clients. This prevents authorization code interception attacks. The S256 challenge method is required; plain method is rejected.", "auth", "2026-02-01", "before-phase-1"));

// --- Signal documents: Payment decisions (Phase 2) ---
docs.push(generateADR("delta-adr-pay-001", "Payment Processor Selection", "We selected Stripe as primary processor after evaluating Stripe, Adyen, and Braintree. Key factors: developer experience, documentation quality, and native support for PCI DSS tokenization via Stripe Elements. Adyen as fallback for APAC markets.", "payments", "2025-11-15", "before-phase-1"));
docs.push(generateADR("delta-adr-pay-002", "Idempotency Strategy", "All payment mutations must include an idempotency key in X-Idempotency-Key header. The payment-service stores idempotency records for 72 hours. Duplicate requests within this window return the original response without re-processing.", "payments", "2025-11-20", "before-phase-1"));
docs.push(generateADR("delta-adr-pay-003", "PCI Compliance Approach", "We will achieve PCI DSS compliance through PCI DSS tokenization via Stripe Elements. Card data never touches our servers. Stripe.js collects card details client-side, returns a token. Our backend only handles tokens, never raw PANs.", "payments", "2025-12-01", "before-phase-1"));
docs.push(generateADR("delta-adr-pay-004", "Webhook Security", "Stripe webhooks will use webhook signature verification with HMAC-SHA256. Each webhook payload is signed with a per-endpoint secret. Verification happens in middleware before handler dispatch. Failed verification returns 401.", "payments", "2025-12-05", "before-phase-1"));
docs.push(generateADR("delta-adr-pay-005", "Refund Policy Implementation", "The system enforces a 30-day refund window policy. Refunds requested after 30 days require manual approval from the finance team. The payment-service checks the original transaction timestamp and rejects late refunds with a clear error message.", "payments", "2025-12-10", "before-phase-1"));

// --- Signal documents: Data pipeline (Phase 3) ---
docs.push(generateADR("delta-adr-data-001", "Stream Processing Framework", "We chose Apache Flink for stream processing over Kafka Streams and Spark Streaming. Flink provides true exactly-once semantics, lower latency (sub-second), and native support for event-time processing with watermarks.", "data-pipeline", "2026-01-05", "before-phase-1"));
docs.push(generateADR("delta-adr-data-002", "Delivery Guarantees", "The data pipeline provides exactly-once semantics via Kafka transactions. Flink's TwoPhaseCommitSinkFunction coordinates with Kafka's transactional producer. This is critical for financial event processing.", "data-pipeline", "2026-01-08", "before-phase-1"));
docs.push(generateADR("delta-adr-data-003", "Windowing Strategy", "Aggregation uses 15-minute tumbling windows for aggregation. This balances latency (results available every 15 minutes) with throughput (sufficient data per window for meaningful aggregates). Session windows used for user activity tracking.", "data-pipeline", "2026-01-10", "before-phase-1"));
docs.push(generateADR("delta-adr-data-004", "Error Handling", "Messages that fail processing 3 times are routed to a dead letter queue for poison messages. The DLQ is a separate Kafka topic (`*.dlq`) with infinite retention. An alerting pipeline monitors DLQ depth and pages on-call if depth exceeds 100.", "data-pipeline", "2026-01-12", "before-phase-1"));
docs.push(generateADR("delta-adr-data-005", "Cold Storage Format", "Historical data uses Parquet format for cold storage on S3. Parquet's columnar layout gives 10x compression over JSON and enables predicate pushdown for analytical queries. Hive-compatible partitioning by date and event type.", "data-pipeline", "2026-01-15", "before-phase-1"));

// --- Signal documents: Infrastructure (Phase 4) ---
docs.push(generateADR("delta-adr-infra-001", "Deployment Strategy", "Production deployments use blue-green deployment strategy via Argo Rollouts. Traffic shifts from blue to green over 30 minutes with automatic rollback on error rate spike. Zero-downtime guaranteed.", "infrastructure", "2025-10-20", "before-phase-1"));
docs.push(generateADR("delta-adr-infra-002", "Circuit Breaker Configuration", "All inter-service calls use a circuit breaker with 50% error threshold. The circuit opens after 10 consecutive failures or 50% error rate over 60 seconds. Half-open state after 30 seconds. Implemented via Envoy sidecar.", "infrastructure", "2025-10-25", "before-phase-1"));
docs.push(generateADR("delta-adr-infra-003", "Service Timeout Policy", "Standard timeout is 5-second timeout for inter-service calls. Payment-critical paths use 10-second timeout. Background jobs use 60-second timeout. All timeouts configured via Envoy, not application code.", "infrastructure", "2025-11-01", "before-phase-1"));
docs.push(generateADR("delta-adr-infra-004", "Pod Disruption Budget", "All production deployments must maintain pod disruption budget minimum 60%. This ensures at least 60% of pods remain available during voluntary disruptions (upgrades, node maintenance). Critical services (payments, auth) use 80%.", "infrastructure", "2025-11-05", "before-phase-1"));
docs.push(generateADR("delta-adr-infra-005", "Canary Release Process", "We use Argo Rollouts for canary releases. Canary receives 5% traffic, then 25%, then 50%, then 100%. Each step requires passing health checks for 5 minutes. Automatic rollback on p99 latency increase > 50% or error rate > 1%.", "infrastructure", "2025-11-10", "before-phase-1"));

// --- Signal documents: Cross-cutting (Phase 5 recall) ---
docs.push(generateADR("delta-adr-security-001", "Service Mesh mTLS", "All service-to-service communication must use mutual TLS between all services. Certificates managed by cert-manager with 24-hour rotation. Envoy sidecars handle TLS termination. No plaintext HTTP in production.", "security", "2025-09-15", "before-phase-1"));
docs.push(generateADR("delta-adr-observability-001", "Logging Standard", "All services must emit structured JSON logging with correlation IDs. Every log entry includes: timestamp, level, service, correlation_id, trace_id, span_id, message, and optional structured fields. Shipped to Elasticsearch via Fluent Bit.", "observability", "2025-10-01", "before-phase-1"));
docs.push(generateADR("delta-adr-observability-002", "Distributed Tracing", "We use OpenTelemetry for distributed tracing. All services instrument with the OpenTelemetry SDK. Traces exported to Jaeger via OTLP. Sampling rate: 10% for normal traffic, 100% for errors and payment flows.", "observability", "2025-10-05", "before-phase-1"));
docs.push(generateADR("delta-adr-sla-001", "Payment SLA", "Payment endpoints must maintain 99.95% SLA for payment endpoints (measured monthly). This translates to max 21.9 minutes downtime per month. SLA excludes scheduled maintenance windows (announced 72 hours in advance).", "payments", "2025-09-20", "before-phase-1"));
docs.push(generateADR("delta-adr-compliance-001", "Financial Data Retention", "Financial records must be retained for data retention 7 years for financial records per SOX Section 404 and PCI DSS requirements. This includes transaction logs, audit trails, and settlement records. Cold storage after 1 year, archived after 3.", "compliance", "2025-08-15", "before-phase-1"));
docs.push(generateADR("delta-adr-billing-001", "Billing Read Model", "Billing reads use CQRS pattern for billing reads. The write model (PostgreSQL) handles transactions. The read model (Elasticsearch) serves dashboards, reports, and invoice generation. Eventual consistency with 5-second lag.", "billing", "2025-09-10", "before-phase-1"));

// --- Contradiction documents ---
for (const c of CONTRADICTIONS) {
  docs.push(generateADR(c.docA, c.topicA.split(" — ")[0] || c.topicA.slice(0, 60), c.topicA, c.domain, "2025-06-15"));
  const superseded = generateADR(c.docB, (c.topicB.split(" — ")[0] || c.topicB.slice(0, 60)) + " (SUPERSEDED)", c.topicB, c.domain, "2026-02-01");
  superseded.metadata = { stale: false, contradicts: c.docA, supersedes: true };
  docs.push(superseded);
}

// --- Stale documents ---
for (let i = 0; i < 10; i++) {
  const domain = pick(["auth", "payments", "infrastructure", "data-pipeline", "observability"]);
  const doc = generateADR(
    `delta-stale-${String(i + 1).padStart(3, "0")}`,
    `[DEPRECATED] ${pick(["Legacy", "Old", "Previous", "Former"])} ${pick(["Authentication", "Payment", "Deployment", "Monitoring", "Database"])} ${pick(["Approach", "Strategy", "Configuration", "Policy"])}`,
    `THIS DOCUMENT IS OUTDATED. The approach described here was superseded by newer decisions. This document is retained for historical reference only. ${pick(["The legacy system used", "Previously we relied on", "The old approach involved"])} ${pick(["basic auth", "manual deployments", "polling", "shared database", "monolithic architecture"])} which has since been replaced.`,
    domain,
    randomDate(2023, 2024),
  );
  doc.metadata = { stale: true };
  docs.push(doc);
}

// --- Noise documents (bulk of the corpus) ---
const NOISE_DOMAINS = [
  "auth", "payments", "billing", "data-pipeline", "ml-platform",
  "infrastructure", "compliance", "mobile", "api-gateway", "observability",
  "customer-success", "devex", "growth", "search", "notifications",
  "analytics", "sre", "frontend", "content-delivery", "security",
];

const signalDocCount = docs.length;
console.log(`Signal documents: ${signalDocCount}`);

// Generate noise until we hit ~2M tokens
let noiseIndex = 0;
let totalTokens = docs.reduce((sum, d) => sum + d.tokens, 0);
const TARGET_TOKENS = 2_000_000;

while (totalTokens < TARGET_TOKENS) {
  noiseIndex++;
  const domain = pick(NOISE_DOMAINS);
  const id = `delta-noise-${String(noiseIndex).padStart(4, "0")}`;
  const doc = generateNoiseDoc(id, domain);
  docs.push(doc);
  totalTokens += doc.tokens;

  if (noiseIndex % 50 === 0) {
    console.log(`  Generated ${noiseIndex} noise docs, ${totalTokens} tokens...`);
  }
}

console.log(`Noise documents: ${noiseIndex}`);
console.log(`Total documents: ${docs.length}`);
console.log(`Total tokens: ${totalTokens}`);

// --- Inject needle facts into specific noise docs ---
for (const needle of NEEDLE_FACTS) {
  // Find or create the host document
  let host = docs.find(d => d.id === needle.buriedIn);
  if (!host) {
    // Create a long noise doc to host the needle
    host = generateRunbook(needle.buriedIn, `${pick(SERVICES)} Operations Guide`, `Standard operating procedures for the service.`, pick(NOISE_DOMAINS));
    docs.push(host);
  }
  // Inject needle fact into the middle of the document
  const lines = host.content.split("\n");
  const insertPoint = Math.floor(lines.length * 0.6); // 60% through
  lines.splice(insertPoint, 0, "", `> **Note:** ${needle.content}`, "");
  host.content = lines.join("\n");
  host.tokens = estimateTokens(host.content);
  host.metadata = { ...host.metadata, containsNeedle: needle.key };
}

// Shuffle documents to avoid signal clustering
for (let i = docs.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [docs[i], docs[j]] = [docs[j], docs[i]];
}

// Write corpus
const corpusPath = resolve(import.meta.dirname, "corpus.json");
writeFileSync(corpusPath, JSON.stringify({ documents: docs }, null, 2));

const finalTokens = docs.reduce((sum, d) => sum + d.tokens, 0);
console.log(`\nCorpus written to ${corpusPath}`);
console.log(`Documents: ${docs.length}`);
console.log(`Total tokens: ${finalTokens.toLocaleString()}`);
console.log(`File size: ${(JSON.stringify({ documents: docs }).length / 1024 / 1024).toFixed(1)} MB`);
console.log(`Signal docs: ${signalDocCount}`);
console.log(`Noise docs: ${noiseIndex}`);
console.log(`Needles: ${NEEDLE_FACTS.length}`);
console.log(`Contradictions: ${CONTRADICTIONS.length}`);
console.log(`Stale docs: 10`);
