/**
 * Cat 2 — Format-Aware Ingestion Recall
 *
 * Same factual content expressed in 6 formats per topic (3 topics = 18 docs).
 * Measures recall stratified by MIME type to document the baseline for
 * format-agnostic ingestion.
 *
 * 18 docs, 3 queries.
 */

import type { CorpusDocV2, GroundTruth } from "../types-v3.js";
import { DOMAINS, docV3, dateMonthsAgo } from "../tenant.js";

// ═══════════════════════════════════════════════════════════════════════════
// Topic A: Rate Limiting Configuration
// Core fact: payment-service has 200 req/min per API key, burst of 50
// ═══════════════════════════════════════════════════════════════════════════

const topicA: CorpusDocV2[] = [
    docV3("v3-fmt-a-md", DOMAINS.eng, "Rate Limiting Policy",
        `# Rate Limiting Policy

## Payment Service Rate Limits

The payment-service enforces the following rate limits for all API consumers:

- **Standard tier**: 200 requests per minute per API key
- **Burst allowance**: 50 additional requests in a 10-second window
- **Premium tier**: 500 requests per minute per API key
- **Burst allowance (premium)**: 150 additional requests in a 10-second window

Rate limit headers are returned on every response:
- \`X-RateLimit-Limit\`: Current tier limit
- \`X-RateLimit-Remaining\`: Requests remaining in window
- \`X-RateLimit-Reset\`: UTC epoch when window resets

Exceeding the rate limit returns HTTP 429 with a Retry-After header.

Approved by: Karen Singh, Engineering Manager`,
        "text/markdown", dateMonthsAgo(3)),

    docV3("v3-fmt-a-json", DOMAINS.platform, "Rate Limit Config",
        `{
  "rateLimiting": {
    "payment-service": {
      "standard": {
        "requestsPerMinute": 200,
        "burstAllowance": 50,
        "burstWindowSeconds": 10
      },
      "premium": {
        "requestsPerMinute": 500,
        "burstAllowance": 150,
        "burstWindowSeconds": 10
      },
      "responseHeaders": {
        "limit": "X-RateLimit-Limit",
        "remaining": "X-RateLimit-Remaining",
        "reset": "X-RateLimit-Reset"
      },
      "exceededStatusCode": 429,
      "retryAfterEnabled": true
    }
  }
}`,
        "application/json", dateMonthsAgo(3)),

    docV3("v3-fmt-a-yaml", DOMAINS.platform, "Rate Limit K8s ConfigMap",
        `apiVersion: v1
kind: ConfigMap
metadata:
  name: payment-service-rate-limits
  namespace: production
data:
  RATE_LIMIT_STANDARD_RPM: "200"
  RATE_LIMIT_STANDARD_BURST: "50"
  RATE_LIMIT_STANDARD_BURST_WINDOW_SEC: "10"
  RATE_LIMIT_PREMIUM_RPM: "500"
  RATE_LIMIT_PREMIUM_BURST: "150"
  RATE_LIMIT_PREMIUM_BURST_WINDOW_SEC: "10"
  RATE_LIMIT_EXCEEDED_STATUS: "429"
  RATE_LIMIT_RETRY_AFTER: "true"`,
        "application/x-yaml", dateMonthsAgo(3)),

    docV3("v3-fmt-a-csv", DOMAINS.compliance, "Rate Limit Inventory",
        `service,tier,requests_per_minute,burst_allowance,burst_window_sec,exceeded_status
payment-service,standard,200,50,10,429
payment-service,premium,500,150,10,429
user-service,standard,300,75,10,429
user-service,premium,800,200,10,429
kyc-service,standard,50,10,10,429`,
        "text/csv", dateMonthsAgo(3)),

    docV3("v3-fmt-a-chat", DOMAINS.eng, "Rate Limit Discussion",
        `[2025-07-15 14:23] @ksingh: heads up team — we're changing the payment-service rate limits
[2025-07-15 14:24] @ksingh: standard tier goes to 200 rpm with a burst of 50 in a 10s window
[2025-07-15 14:24] @ksingh: premium gets 500 rpm, burst 150
[2025-07-15 14:25] @fabadi: what about the 429 response? keeping Retry-After?
[2025-07-15 14:25] @ksingh: yes, 429 with Retry-After header, same as before
[2025-07-15 14:26] @qmurphy: LGTM, deploying the config update now
[2025-07-15 14:30] @qmurphy: deployed to production, rate limits active`,
        "text/plain", dateMonthsAgo(3)),

    docV3("v3-fmt-a-notes", DOMAINS.eng, "Rate Limit Meeting Notes",
        `Rate Limit Review Meeting — 2025-07-15

Attendees: Karen Singh, Frank Abadi, Quinn Murphy

Discussion:
- Current payment-service limits too restrictive for growing API consumers
- Proposal: increase standard tier from 100 to 200 rpm
- Burst allowance: 50 requests in a 10-second window for standard
- Premium tier: 500 rpm with 150 burst allowance
- Keep 429 status code with Retry-After header for exceeded limits

Decision: Approved. Quinn to deploy config update same day.

AI: Quinn Murphy — deploy rate limit config update by EOD
AI: Karen Singh — update API documentation with new limits`,
        "text/plain", dateMonthsAgo(3)),
];

// ═══════════════════════════════════════════════════════════════════════════
// Topic B: Database Backup Schedule
// Core fact: daily full backup at 02:00 UTC, hourly WAL, 30-day retention
// ═══════════════════════════════════════════════════════════════════════════

const topicB: CorpusDocV2[] = [
    docV3("v3-fmt-b-md", DOMAINS.platform, "Database Backup Procedures",
        `# Database Backup Procedures

## Schedule
- **Full backup**: Daily at 02:00 UTC (pg_basebackup)
- **Incremental**: Continuous WAL archiving (every 60 seconds)
- **Retention**: 30 days for full backups, 7 days for WAL segments

## Storage
Backups are stored in S3 bucket \`meridian-db-backups-prod\` with:
- Server-side encryption (AES-256)
- Cross-region replication to us-west-2
- Lifecycle policy: transition to Glacier after 30 days, delete after 365 days

## Recovery
- Point-in-time recovery available for any moment within the 7-day WAL window
- Full restore from latest backup: estimated 45 minutes for 500GB database
- Quarterly DR drill tests recovery procedures

Contact: James Okafor, SRE Lead`,
        "text/markdown", dateMonthsAgo(5)),

    docV3("v3-fmt-b-json", DOMAINS.platform, "Backup Config",
        `{
  "backup": {
    "schedule": {
      "full": { "cron": "0 2 * * *", "method": "pg_basebackup", "timezone": "UTC" },
      "wal": { "intervalSeconds": 60, "method": "continuous_archiving" }
    },
    "retention": {
      "fullBackupDays": 30,
      "walSegmentDays": 7,
      "glacierTransitionDays": 30,
      "deletionDays": 365
    },
    "storage": {
      "bucket": "meridian-db-backups-prod",
      "encryption": "AES-256",
      "crossRegionReplication": true,
      "replicationTarget": "us-west-2"
    },
    "recovery": {
      "pitrWindowDays": 7,
      "estimatedRestoreMinutes": 45,
      "drDrillFrequency": "quarterly"
    }
  }
}`,
        "application/json", dateMonthsAgo(5)),

    docV3("v3-fmt-b-yaml", DOMAINS.platform, "Backup CronJob K8s",
        `apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-full-backup
  namespace: production
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: pg-backup
            image: meridian/pg-backup:1.4.0
            env:
            - name: BACKUP_METHOD
              value: "pg_basebackup"
            - name: S3_BUCKET
              value: "meridian-db-backups-prod"
            - name: ENCRYPTION
              value: "AES-256"
            - name: RETENTION_DAYS
              value: "30"
            - name: WAL_INTERVAL_SEC
              value: "60"
            - name: WAL_RETENTION_DAYS
              value: "7"`,
        "application/x-yaml", dateMonthsAgo(5)),

    docV3("v3-fmt-b-csv", DOMAINS.compliance, "Backup Compliance Matrix",
        `database,backup_type,schedule,retention_days,encryption,cross_region,last_verified
engine-prod,full,daily 02:00 UTC,30,AES-256,us-west-2,2025-06-01
engine-prod,wal,continuous 60s,7,AES-256,us-west-2,2025-06-01
vaultcrux-prod,full,daily 03:00 UTC,30,AES-256,us-west-2,2025-06-01
analytics-prod,full,weekly 04:00 UTC,90,AES-256,us-west-2,2025-05-15`,
        "text/csv", dateMonthsAgo(5)),

    docV3("v3-fmt-b-chat", DOMAINS.platform, "Backup Discussion",
        `[2025-05-10 09:15] @jokafor: reminder — we're moving to daily full backups at 02:00 UTC
[2025-05-10 09:16] @jokafor: WAL archiving stays continuous, every 60 seconds
[2025-05-10 09:16] @nbrooks: retention still 30 days full, 7 days WAL?
[2025-05-10 09:17] @jokafor: correct. S3 bucket meridian-db-backups-prod with AES-256
[2025-05-10 09:18] @jokafor: cross-region replication to us-west-2 enabled
[2025-05-10 09:19] @dkim: PITR window covers the full 7-day WAL range right?
[2025-05-10 09:20] @jokafor: yes, point-in-time recovery for any moment in the 7-day window`,
        "text/plain", dateMonthsAgo(5)),

    docV3("v3-fmt-b-notes", DOMAINS.platform, "Backup Strategy Meeting",
        `Backup Strategy Review — 2025-05-10

Attendees: James Okafor, David Kim, Nathan Brooks

Summary:
- Moving to daily full backups at 02:00 UTC using pg_basebackup
- WAL archiving continuous, every 60 seconds
- Retention: 30 days full backups, 7 days WAL segments
- Storage: S3 meridian-db-backups-prod, AES-256 encrypted
- Cross-region replication to us-west-2
- Point-in-time recovery available within 7-day WAL window
- Full restore estimate: ~45 minutes for 500GB
- Quarterly DR drills to verify recovery procedures

AI: Nathan Brooks — update CronJob manifest with new schedule
AI: James Okafor — schedule next DR drill for Q3`,
        "text/plain", dateMonthsAgo(5)),
];

// ═══════════════════════════════════════════════════════════════════════════
// Topic C: Alerting Thresholds
// Core fact: p95 > 200ms warning, p99 > 500ms critical, 5min eval window
// ═══════════════════════════════════════════════════════════════════════════

const topicC: CorpusDocV2[] = [
    docV3("v3-fmt-c-md", DOMAINS.platform, "Alerting Threshold Standards",
        `# Alerting Threshold Standards

## Latency Alerts
All production services must configure latency alerts with the following thresholds:

| Severity | Metric | Threshold | Evaluation Window |
|----------|--------|-----------|-------------------|
| Warning | p95 latency | > 200ms | 5 minutes |
| Critical | p99 latency | > 500ms | 5 minutes |
| Emergency | p99 latency | > 2000ms | 1 minute |

## Error Rate Alerts
| Severity | Metric | Threshold | Evaluation Window |
|----------|--------|-----------|-------------------|
| Warning | 5xx rate | > 0.1% | 5 minutes |
| Critical | 5xx rate | > 1.0% | 3 minutes |

## Notification Routing
- Warning: Slack #ops-alerts
- Critical: PagerDuty on-call rotation
- Emergency: PagerDuty + SMS to SRE lead

Owner: James Okafor, SRE Lead`,
        "text/markdown", dateMonthsAgo(2)),

    docV3("v3-fmt-c-json", DOMAINS.platform, "Alert Rules Config",
        `{
  "alertRules": {
    "latency": {
      "warning": { "metric": "p95", "thresholdMs": 200, "evaluationWindowMin": 5 },
      "critical": { "metric": "p99", "thresholdMs": 500, "evaluationWindowMin": 5 },
      "emergency": { "metric": "p99", "thresholdMs": 2000, "evaluationWindowMin": 1 }
    },
    "errorRate": {
      "warning": { "metric": "5xx_rate", "thresholdPct": 0.1, "evaluationWindowMin": 5 },
      "critical": { "metric": "5xx_rate", "thresholdPct": 1.0, "evaluationWindowMin": 3 }
    },
    "notification": {
      "warning": { "channel": "slack", "target": "#ops-alerts" },
      "critical": { "channel": "pagerduty", "target": "oncall-rotation" },
      "emergency": { "channel": "pagerduty+sms", "target": "sre-lead" }
    }
  }
}`,
        "application/json", dateMonthsAgo(2)),

    docV3("v3-fmt-c-yaml", DOMAINS.platform, "Prometheus Alert Rules",
        `apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: latency-alerts
  namespace: monitoring
spec:
  groups:
  - name: latency
    rules:
    - alert: HighP95Latency
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.2
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "p95 latency > 200ms for {{ $labels.service }}"
    - alert: CriticalP99Latency
      expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 0.5
      for: 5m
      labels:
        severity: critical
    - alert: EmergencyP99Latency
      expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[1m])) > 2.0
      for: 1m
      labels:
        severity: emergency`,
        "application/x-yaml", dateMonthsAgo(2)),

    docV3("v3-fmt-c-csv", DOMAINS.compliance, "Alert Threshold Inventory",
        `service,severity,metric,threshold,unit,eval_window_min,notification_channel
all,warning,p95_latency,200,ms,5,slack #ops-alerts
all,critical,p99_latency,500,ms,5,pagerduty oncall
all,emergency,p99_latency,2000,ms,1,pagerduty+sms sre-lead
all,warning,5xx_rate,0.1,%,5,slack #ops-alerts
all,critical,5xx_rate,1.0,%,3,pagerduty oncall`,
        "text/csv", dateMonthsAgo(2)),

    docV3("v3-fmt-c-chat", DOMAINS.platform, "Alert Threshold Discussion",
        `[2025-08-20 10:30] @jokafor: updating alert thresholds based on last quarter's noise analysis
[2025-08-20 10:31] @jokafor: new thresholds — warning at p95 > 200ms, critical at p99 > 500ms
[2025-08-20 10:31] @jokafor: both on 5-minute eval windows
[2025-08-20 10:32] @jokafor: adding emergency tier: p99 > 2000ms on 1-minute window
[2025-08-20 10:33] @dkim: what about error rate alerts?
[2025-08-20 10:34] @jokafor: 5xx warning at 0.1% (5min window), critical at 1.0% (3min window)
[2025-08-20 10:35] @jokafor: routing: warning→slack, critical→pagerduty, emergency→pagerduty+sms`,
        "text/plain", dateMonthsAgo(2)),

    docV3("v3-fmt-c-notes", DOMAINS.platform, "Alert Review Meeting Notes",
        `Alert Threshold Review — 2025-08-20

Attendees: James Okafor, David Kim

Current state: too many false-positive warnings causing alert fatigue
Proposal: tighten thresholds and add emergency tier

New thresholds agreed:
- Warning: p95 latency > 200ms over 5 minute window
- Critical: p99 latency > 500ms over 5 minute window
- Emergency (NEW): p99 latency > 2000ms over 1 minute window
- Error rate warning: 5xx > 0.1% over 5 minutes
- Error rate critical: 5xx > 1.0% over 3 minutes

Notification routing unchanged: warning to Slack, critical to PagerDuty, emergency to PagerDuty + SMS

AI: James — update PrometheusRule manifest
AI: David — update runbook with new severity definitions`,
        "text/plain", dateMonthsAgo(2)),
];

// ── Exports ──────────────────────────────────────────────────────────────

export const CAT2_DOCS: CorpusDocV2[] = [...topicA, ...topicB, ...topicC];

/** Map from doc ID suffix to format label for stratified recall */
export const FORMAT_LABELS: Record<string, string> = {
    "-md": "text/markdown",
    "-json": "application/json",
    "-yaml": "application/x-yaml",
    "-csv": "text/csv",
    "-chat": "text/plain (chat)",
    "-notes": "text/plain (notes)",
};

export function getFormatLabel(docId: string): string {
    for (const [suffix, label] of Object.entries(FORMAT_LABELS)) {
        if (docId.endsWith(suffix)) return label;
    }
    return "unknown";
}

export const CAT2_GROUND_TRUTH: GroundTruth[] = [
    {
        query: "What are the rate limiting rules for the payment service? What are the request limits and burst allowances?",
        mode: "verified",
        topK: 10,
        expectedDocIds: [
            "v3-fmt-a-md", "v3-fmt-a-json", "v3-fmt-a-yaml",
            "v3-fmt-a-csv", "v3-fmt-a-chat", "v3-fmt-a-notes",
        ],
    },
    {
        query: "What is the database backup schedule? How often are full backups and WAL archives taken?",
        mode: "verified",
        topK: 10,
        expectedDocIds: [
            "v3-fmt-b-md", "v3-fmt-b-json", "v3-fmt-b-yaml",
            "v3-fmt-b-csv", "v3-fmt-b-chat", "v3-fmt-b-notes",
        ],
    },
    {
        query: "What are the alerting threshold configurations? What latency and error rate thresholds trigger alerts?",
        mode: "verified",
        topK: 10,
        expectedDocIds: [
            "v3-fmt-c-md", "v3-fmt-c-json", "v3-fmt-c-yaml",
            "v3-fmt-c-csv", "v3-fmt-c-chat", "v3-fmt-c-notes",
        ],
    },
];
