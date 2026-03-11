/**
 * HTML report template generators — QBR reports, compliance dashboards, audit findings
 *
 * Generates realistic report fragments (not full pages) as enterprises
 * typically export these from BI tools and internal dashboards.
 */

export function generateQBRReport(params: {
    quarter: string;
    year: number;
    department: string;
    highlights: { metric: string; target: string; actual: string; status: string }[];
    narrative: string;
    risks: { description: string; severity: string; mitigation: string }[];
}): string {
    const highlightRows = params.highlights
        .map(
            (h) =>
                `      <tr>
        <td>${h.metric}</td>
        <td>${h.target}</td>
        <td>${h.actual}</td>
        <td class="${h.status === "On Track" ? "status-ok" : "status-warn"}">${h.status}</td>
      </tr>`,
        )
        .join("\n");

    const riskRows = params.risks
        .map(
            (r) =>
                `      <tr>
        <td>${r.description}</td>
        <td class="severity-${r.severity.toLowerCase()}">${r.severity}</td>
        <td>${r.mitigation}</td>
      </tr>`,
        )
        .join("\n");

    return `<div class="qbr-report">
  <h1>Quarterly Business Review — ${params.quarter} ${params.year}</h1>
  <h2>Department: ${params.department}</h2>

  <h3>Key Performance Indicators</h3>
  <table>
    <thead>
      <tr><th>Metric</th><th>Target</th><th>Actual</th><th>Status</th></tr>
    </thead>
    <tbody>
${highlightRows}
    </tbody>
  </table>

  <h3>Executive Summary</h3>
  <p>${params.narrative}</p>

  <h3>Risk Register</h3>
  <table>
    <thead>
      <tr><th>Risk</th><th>Severity</th><th>Mitigation</th></tr>
    </thead>
    <tbody>
${riskRows}
    </tbody>
  </table>
</div>`;
}

export function generateComplianceDashboard(params: {
    reportDate: string;
    framework: string;
    controls: {
        id: string;
        name: string;
        status: string;
        lastTested: string;
        owner: string;
        finding?: string;
    }[];
    overallScore: number;
}): string {
    const controlRows = params.controls
        .map(
            (c) =>
                `      <tr>
        <td>${c.id}</td>
        <td>${c.name}</td>
        <td class="status-${c.status.toLowerCase().replace(/\s/g, "-")}">${c.status}</td>
        <td>${c.lastTested}</td>
        <td>${c.owner}</td>
        <td>${c.finding ?? "—"}</td>
      </tr>`,
        )
        .join("\n");

    return `<div class="compliance-dashboard">
  <h2>${params.framework} Compliance Dashboard</h2>
  <p>Report Date: ${params.reportDate}</p>
  <p>Overall Compliance Score: <strong>${params.overallScore}%</strong></p>

  <table>
    <thead>
      <tr><th>Control ID</th><th>Control</th><th>Status</th><th>Last Tested</th><th>Owner</th><th>Finding</th></tr>
    </thead>
    <tbody>
${controlRows}
    </tbody>
  </table>
</div>`;
}

export function generateAuditFindings(params: {
    auditTitle: string;
    auditDate: string;
    auditor: string;
    findings: {
        id: string;
        severity: string;
        title: string;
        description: string;
        recommendation: string;
        owner: string;
        dueDate: string;
        status: string;
    }[];
}): string {
    const findingBlocks = params.findings
        .map(
            (f) => `  <div class="finding">
    <h3>Finding ${f.id}: ${f.title}</h3>
    <p><strong>Severity:</strong> <span class="severity-${f.severity.toLowerCase()}">${f.severity}</span></p>
    <p><strong>Description:</strong> ${f.description}</p>
    <p><strong>Recommendation:</strong> ${f.recommendation}</p>
    <p><strong>Owner:</strong> ${f.owner} | <strong>Due:</strong> ${f.dueDate} | <strong>Status:</strong> ${f.status}</p>
  </div>`,
        )
        .join("\n\n");

    return `<div class="audit-report">
  <h1>${params.auditTitle}</h1>
  <p>Date: ${params.auditDate} | Auditor: ${params.auditor}</p>
  <p>Total Findings: ${params.findings.length} | Critical: ${params.findings.filter((f) => f.severity === "Critical").length} | High: ${params.findings.filter((f) => f.severity === "High").length}</p>

${findingBlocks}
</div>`;
}

export const MIME_HTML = "text/html";
