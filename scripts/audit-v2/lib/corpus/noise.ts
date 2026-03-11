/**
 * Heterogeneous MIME noise generator for Cat 3 scale testing.
 *
 * Unlike v1 which only generates text/plain noise, v2 noise cycles through
 * all 9 MIME types to test retrieval under format-diverse corpus growth.
 *
 * All generation is deterministic: same index → same content.
 */

import { createHash } from "node:crypto";
import type { CorpusDocV2 } from "../types-v2.js";
import { ALL_DOMAINS, TENANT_V2, SERVICES, EMPLOYEES } from "./tenant.js";

const MIME_TYPES = [
    "text/markdown",
    "application/json",
    "application/x-yaml",
    "text/csv",
    "text/html",
    "text/plain", // email
    "text/plain", // meeting notes
    "text/plain", // chat
    "text/markdown", // wiki
] as const;

// ─── Noise content templates by MIME type ───────────────────────────────

const MARKDOWN_PARAGRAPHS = [
    "The deployment checklist must be completed before any production release. Teams should verify that all automated tests pass, staging validation is complete, and the rollback plan has been reviewed by at least one engineer who was not involved in the change.",
    "Service mesh observability requires careful configuration of trace sampling rates. Over-sampling increases storage costs while under-sampling reduces debugging effectiveness. The recommended sampling rate of 1% provides sufficient coverage for most production workloads while keeping costs manageable.",
    "Database migration scripts must be idempotent and backward-compatible. This means each migration should check whether it has already been applied before executing, and the resulting schema should work with both the current and previous application versions during the rollout window.",
    "Rate limiting is applied at two layers: the API gateway enforces global rate limits per client IP, while individual services enforce per-tenant rate limits based on the subscription tier. The two layers operate independently to provide defense in depth against traffic spikes.",
    "Container image scanning runs in the CI pipeline before images are pushed to the registry. Images with critical or high vulnerabilities are blocked from deployment. Medium vulnerabilities trigger a warning but do not block deployment. The scanning tool is updated daily with the latest vulnerability database.",
    "Load balancing for WebSocket connections uses sticky sessions based on the connection ID. This ensures that all messages within a WebSocket session are routed to the same backend instance, maintaining state consistency. The sticky session cookie has a 24-hour expiration.",
    "The backup retention policy specifies different durations for different data tiers. Transaction data is retained for 7 years to meet regulatory requirements. User profile data is retained for the duration of the account plus 90 days. System logs are retained for 12 months.",
    "Network policies in Kubernetes restrict pod-to-pod communication using label selectors. By default, all ingress traffic is denied and must be explicitly allowed. Egress traffic is allowed by default but can be restricted for high-security namespaces.",
    "The feature flag system supports gradual rollouts using percentage-based targeting. Flags can target specific user segments, geographic regions, or tenant tiers. All flag changes are logged in the audit trail with the identity of the person who made the change.",
    "Performance testing environments mirror production configuration at 25% scale. Load tests run nightly against the performance environment using recorded production traffic patterns. Results are compared against baseline metrics to detect regressions before they reach production.",
];

const JSON_TEMPLATES = [
    (svc: string, seed: number) => JSON.stringify({ service: svc, config: { timeout_ms: 5000 + (seed % 10) * 1000, retry_count: 3 + (seed % 3), circuit_breaker: { threshold: 5, window_ms: 60000, recovery_ms: 30000 }, logging: { level: "info", format: "json" } }, version: "1.0.0", last_updated: "2025-01-15T00:00:00Z" }, null, 2),
    (svc: string, seed: number) => JSON.stringify({ monitoring: { service: svc, alerts: [{ name: "high_error_rate", condition: `error_rate > ${(seed % 5) + 1}%`, severity: "warning", channel: "#ops-alerts" }, { name: "latency_spike", condition: `p99_latency > ${100 + seed * 50}ms`, severity: "critical", channel: "#oncall" }], dashboards: [`${svc}-overview`, `${svc}-performance`, `${svc}-errors`] } }, null, 2),
    (svc: string, seed: number) => JSON.stringify({ scaling: { service: svc, horizontal_pod_autoscaler: { min_replicas: 2 + (seed % 4), max_replicas: 10 + (seed % 20), target_cpu_pct: 70, target_memory_pct: 80, scale_up_stabilization_sec: 60, scale_down_stabilization_sec: 300 }, resource_quotas: { cpu_limit: `${1 + seed % 4}000m`, memory_limit: `${512 + (seed % 8) * 256}Mi` } } }, null, 2),
];

const YAML_TEMPLATES = [
    (svc: string, seed: number) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${svc}-config
  namespace: production
data:
  LOG_LEVEL: "info"
  METRICS_ENABLED: "true"
  CACHE_TTL: "${60 + seed * 30}"
  MAX_RETRIES: "${2 + (seed % 4)}"
  HEALTH_CHECK_INTERVAL: "10s"
`,
    (svc: string, seed: number) => `apiVersion: v1
kind: Service
metadata:
  name: ${svc}
  namespace: production
spec:
  type: ClusterIP
  ports:
  - port: ${3000 + (seed % 10)}
    targetPort: ${3000 + (seed % 10)}
    protocol: TCP
  selector:
    app: ${svc}
`,
];

const CSV_TEMPLATES = [
    (svc: string, seed: number) => {
        const header = "timestamp,service,request_count,error_count,p50_ms,p95_ms,p99_ms";
        const rows = Array.from({ length: 5 }, (_, i) => {
            const d = seed + i;
            return `2025-${String((d % 12) + 1).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")},${svc},${10000 + d * 100},${d % 50},${5 + (d % 20)},${20 + (d % 40)},${50 + (d % 80)}`;
        });
        return [header, ...rows].join("\n");
    },
    (svc: string, seed: number) => {
        const header = "resource,type,status,owner,last_reviewed";
        const statuses = ["active", "pending", "deprecated"];
        const rows = Array.from({ length: 4 }, (_, i) => {
            const emp = EMPLOYEES[(seed + i) % EMPLOYEES.length];
            return `${svc}-${i},${i % 2 === 0 ? "compute" : "storage"},${statuses[(seed + i) % statuses.length]},${emp.name},2025-${String(((seed + i) % 12) + 1).padStart(2, "0")}-15`;
        });
        return [header, ...rows].join("\n");
    },
];

const HTML_TEMPLATES = [
    (svc: string, seed: number) => `<div class="status-report">
  <h2>${svc} — Status Report</h2>
  <p>Period: ${2025}-${String((seed % 12) + 1).padStart(2, "0")}</p>
  <table>
    <tr><th>Metric</th><th>Value</th><th>Status</th></tr>
    <tr><td>Uptime</td><td>${99 + (seed % 10) / 10}%</td><td>OK</td></tr>
    <tr><td>Response Time</td><td>${10 + (seed % 50)}ms</td><td>OK</td></tr>
    <tr><td>Error Rate</td><td>${(seed % 30) / 100}%</td><td>${seed % 30 > 10 ? "WARN" : "OK"}</td></tr>
  </table>
  <p>Notes: Service operating within normal parameters. Routine maintenance scheduled for next window.</p>
</div>`,
];

const EMAIL_TEMPLATES = [
    (svc: string, seed: number) => {
        const from = EMPLOYEES[seed % EMPLOYEES.length];
        const to = EMPLOYEES[(seed + 1) % EMPLOYEES.length];
        return `From: ${from.name} <${from.handle}@meridian.test>
To: ${to.name} <${to.handle}@meridian.test>
Date: 2025-${String((seed % 12) + 1).padStart(2, "0")}-${String((seed % 28) + 1).padStart(2, "0")} ${9 + (seed % 8)}:${String(seed % 60).padStart(2, "0")}
Subject: ${svc} operational update

Hi ${to.name.split(" ")[0]},

Quick update on ${svc}: everything is running smoothly after the last maintenance window. We applied the latest patches and restarted the service with zero downtime.

The monitoring dashboards show stable performance metrics. No action needed from your side.

Best,
${from.name.split(" ")[0]}`;
    },
];

const MEETING_TEMPLATES = [
    (svc: string, seed: number) => {
        const attendees = Array.from({ length: 3 }, (_, i) => EMPLOYEES[(seed + i) % EMPLOYEES.length].name);
        return `${svc} review — 2025-${String((seed % 12) + 1).padStart(2, "0")}-${String((seed % 28) + 1).padStart(2, "0")}

Attendees: ${attendees.join(", ")}

- reviewed current status of ${svc}
- no major issues identified
- discussed upcoming maintenance window
- agreed to proceed with planned updates next sprint
- monitoring looks good, no alerts in past 2 weeks

TODO:
  - update runbook with latest config changes
  - schedule capacity review for next month`;
    },
];

const CHAT_TEMPLATES = [
    (svc: string, seed: number) => {
        const h1 = EMPLOYEES[seed % EMPLOYEES.length];
        const h2 = EMPLOYEES[(seed + 1) % EMPLOYEES.length];
        return `#ops-general — 2025-${String((seed % 12) + 1).padStart(2, "0")}-${String((seed % 28) + 1).padStart(2, "0")}
--- exported chat log ---

[${9 + (seed % 4)}:${String(10 + (seed % 50)).padStart(2, "0")}] @${h1.handle}: ${svc} health check passed after the restart
[${9 + (seed % 4)}:${String(12 + (seed % 50)).padStart(2, "0")}] @${h2.handle}: good to hear, latency looking normal
[${9 + (seed % 4)}:${String(15 + (seed % 45)).padStart(2, "0")}] @${h1.handle}: yeah, all metrics within expected range`;
    },
];

const WIKI_TEMPLATES = [
    (svc: string, seed: number) => {
        const author = EMPLOYEES[seed % EMPLOYEES.length];
        return `# Notes: ${svc} setup

> Last edited by ${author.name} on 2025-${String((seed % 12) + 1).padStart(2, "0")}-${String((seed % 28) + 1).padStart(2, "0")}

## Configuration

- Port: ${3000 + (seed % 100)}
- Environment: production
- Replicas: ${2 + (seed % 6)}

## Known issues

- TODO: document the retry behavior
- [link to runbook](???)

## References

- See also: monitoring setup docs`;
    },
];

const TEMPLATE_FNS = [
    MARKDOWN_PARAGRAPHS,
    JSON_TEMPLATES,
    YAML_TEMPLATES,
    CSV_TEMPLATES,
    HTML_TEMPLATES,
    EMAIL_TEMPLATES,
    MEETING_TEMPLATES,
    CHAT_TEMPLATES,
    WIKI_TEMPLATES,
] as const;

function hashSeed(index: number): number {
    const hash = createHash("sha256").update(index.toString()).digest("hex");
    return parseInt(hash.slice(0, 8), 16);
}

function generateNoiseContent(index: number): { content: string; mime: string } {
    const mimeIdx = index % 9;
    const mime = MIME_TYPES[mimeIdx];
    const seed = hashSeed(index);
    const svc = SERVICES[index % SERVICES.length];

    switch (mimeIdx) {
        case 0: { // markdown
            const p1 = MARKDOWN_PARAGRAPHS[seed % MARKDOWN_PARAGRAPHS.length];
            const p2 = MARKDOWN_PARAGRAPHS[(seed + 3) % MARKDOWN_PARAGRAPHS.length];
            const p3 = MARKDOWN_PARAGRAPHS[(seed + 7) % MARKDOWN_PARAGRAPHS.length];
            return { content: `# ${svc} — Practice Note ${index}\n\n${p1}\n\n${p2}\n\n${p3}`, mime };
        }
        case 1: // json
            return { content: JSON_TEMPLATES[seed % JSON_TEMPLATES.length](svc, seed), mime };
        case 2: // yaml
            return { content: YAML_TEMPLATES[seed % YAML_TEMPLATES.length](svc, seed), mime };
        case 3: // csv
            return { content: CSV_TEMPLATES[seed % CSV_TEMPLATES.length](svc, seed), mime };
        case 4: // html
            return { content: HTML_TEMPLATES[0](svc, seed), mime };
        case 5: // email
            return { content: EMAIL_TEMPLATES[0](svc, seed), mime };
        case 6: // meeting notes
            return { content: MEETING_TEMPLATES[0](svc, seed), mime };
        case 7: // chat
            return { content: CHAT_TEMPLATES[0](svc, seed), mime };
        case 8: // wiki
            return { content: WIKI_TEMPLATES[0](svc, seed), mime };
        default:
            return { content: MARKDOWN_PARAGRAPHS[0], mime: "text/plain" };
    }
}

/**
 * Generate heterogeneous noise documents for Cat 3 scale testing.
 * Deterministic: same startIndex + count always produces same docs.
 */
export function generateNoiseDocsV2(startIndex: number, count: number): CorpusDocV2[] {
    const docs: CorpusDocV2[] = [];

    for (let i = 0; i < count; i++) {
        const idx = startIndex + i;
        const seed = hashSeed(idx);
        const domain = ALL_DOMAINS[idx % ALL_DOMAINS.length];
        const { content, mime } = generateNoiseContent(idx);
        const monthsAgo = 1 + (seed % 12);

        docs.push({
            id: `v2-scale-noise-${idx}`,
            domain,
            url: `https://${domain}/docs/v2-scale-noise-${idx}`,
            title: `${domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1)} Document ${idx}`,
            content,
            mime,
            publishedAt: new Date(Date.now() - monthsAgo * 30 * 86400000).toISOString(),
            licenseId: "proprietary",
            riskFlag: "none",
            tenantId: TENANT_V2,
        });
    }

    return docs;
}
