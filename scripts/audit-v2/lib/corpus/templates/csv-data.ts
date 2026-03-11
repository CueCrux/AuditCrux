/**
 * CSV template generators — asset inventories, SLA metrics, vendor compliance matrices
 */

export function generateSLAMetrics(params: {
    services: {
        name: string;
        target: number;
        actual: number;
        month: string;
        incidents: number;
        p99_latency_ms: number;
    }[];
    reportPeriod: string;
}): string {
    const header = "service,sla_target_pct,sla_actual_pct,month,incident_count,p99_latency_ms,status";
    const rows = params.services.map((s) => {
        const status = s.actual >= s.target ? "PASS" : "BREACH";
        return `${s.name},${s.target},${s.actual},${s.month},${s.incidents},${s.p99_latency_ms},${status}`;
    });
    return [
        `# SLA Performance Report — ${params.reportPeriod}`,
        `# Generated: 2025-10-01T00:00:00Z`,
        header,
        ...rows,
    ].join("\n");
}

export function generateAssetInventory(params: {
    assets: {
        hostname: string;
        type: string;
        os: string;
        patchDate: string;
        owner: string;
        environment: string;
        status: string;
    }[];
}): string {
    const header = "hostname,asset_type,operating_system,last_patch_date,owner,environment,status";
    const rows = params.assets.map(
        (a) =>
            `${a.hostname},${a.type},${a.os},${a.patchDate},${a.owner},${a.environment},${a.status}`,
    );
    return [header, ...rows].join("\n");
}

export function generateVendorCompliance(params: {
    vendors: {
        name: string;
        category: string;
        soc2: string;
        gdpr: string;
        pci: string;
        lastAudit: string;
        riskRating: string;
        contractExpiry: string;
    }[];
}): string {
    const header =
        "vendor_name,category,soc2_status,gdpr_compliant,pci_dss_level,last_audit_date,risk_rating,contract_expiry";
    const rows = params.vendors.map(
        (v) =>
            `${v.name},${v.category},${v.soc2},${v.gdpr},${v.pci},${v.lastAudit},${v.riskRating},${v.contractExpiry}`,
    );
    return [header, ...rows].join("\n");
}

export function generatePerformanceMetrics(params: {
    service: string;
    period: string;
    dataPoints: {
        date: string;
        requests: number;
        errors: number;
        p50_ms: number;
        p95_ms: number;
        p99_ms: number;
        cpu_pct: number;
        memory_mb: number;
    }[];
}): string {
    const header = "date,total_requests,error_count,error_rate_pct,p50_latency_ms,p95_latency_ms,p99_latency_ms,cpu_utilization_pct,memory_usage_mb";
    const rows = params.dataPoints.map((d) => {
        const errorRate = d.requests > 0 ? ((d.errors / d.requests) * 100).toFixed(2) : "0.00";
        return `${d.date},${d.requests},${d.errors},${errorRate},${d.p50_ms},${d.p95_ms},${d.p99_ms},${d.cpu_pct},${d.memory_mb}`;
    });
    return [
        `# Performance Metrics — ${params.service} — ${params.period}`,
        header,
        ...rows,
    ].join("\n");
}

export const MIME_CSV = "text/csv";
