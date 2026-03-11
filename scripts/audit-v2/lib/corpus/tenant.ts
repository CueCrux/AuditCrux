/**
 * Audit Suite v2 — Meridian Financial Services
 *
 * Constants, domain registry, and deterministic name/service registries
 * for the enterprise corpus scenario.
 */

export const TENANT_V2 = "__audit_v2__";

export const DOMAINS = {
    eng: "eng.meridian.test",
    security: "security.meridian.test",
    compliance: "compliance.meridian.test",
    platform: "platform.meridian.test",
    product: "product.meridian.test",
    leadership: "leadership.meridian.test",
} as const;

export const ALL_DOMAINS = Object.values(DOMAINS);

export type DomainKey = keyof typeof DOMAINS;

/** Fixed employee registry — index % length for deterministic selection */
export const EMPLOYEES = [
    { name: "Alice Chen", dept: "eng" as DomainKey, handle: "achen", title: "Staff Engineer" },
    { name: "Bob Martinez", dept: "security" as DomainKey, handle: "bmartinez", title: "Security Lead" },
    { name: "Carol Okonkwo", dept: "compliance" as DomainKey, handle: "cokonkwo", title: "Compliance Manager" },
    { name: "David Kim", dept: "platform" as DomainKey, handle: "dkim", title: "Platform Engineer" },
    { name: "Elena Voronova", dept: "product" as DomainKey, handle: "evoronova", title: "Product Manager" },
    { name: "Frank Abadi", dept: "eng" as DomainKey, handle: "fabadi", title: "Senior Engineer" },
    { name: "Grace Huang", dept: "leadership" as DomainKey, handle: "ghuang", title: "VP Engineering" },
    { name: "Hasan Patel", dept: "security" as DomainKey, handle: "hpatel", title: "Security Engineer" },
    { name: "Isabel Torres", dept: "compliance" as DomainKey, handle: "itorres", title: "Audit Analyst" },
    { name: "James Okafor", dept: "platform" as DomainKey, handle: "jokafor", title: "SRE Lead" },
    { name: "Karen Singh", dept: "eng" as DomainKey, handle: "ksingh", title: "Engineering Manager" },
    { name: "Liam Zhao", dept: "product" as DomainKey, handle: "lzhao", title: "Technical PM" },
    { name: "Mia Petrov", dept: "leadership" as DomainKey, handle: "mpetrov", title: "CTO" },
    { name: "Nathan Brooks", dept: "platform" as DomainKey, handle: "nbrooks", title: "DevOps Engineer" },
    { name: "Olivia Tanaka", dept: "security" as DomainKey, handle: "otanaka", title: "AppSec Engineer" },
    { name: "Paul Dubois", dept: "compliance" as DomainKey, handle: "pdubois", title: "Regulatory Affairs" },
    { name: "Quinn Murphy", dept: "eng" as DomainKey, handle: "qmurphy", title: "Backend Engineer" },
    { name: "Rachel Ndong", dept: "product" as DomainKey, handle: "rndong", title: "UX Researcher" },
    { name: "Sam Wallace", dept: "platform" as DomainKey, handle: "swallace", title: "Infrastructure Lead" },
    { name: "Tanya Rossi", dept: "leadership" as DomainKey, handle: "trossi", title: "Head of Product" },
] as const;

/** Fixed service names */
export const SERVICES = [
    "payment-service",
    "user-service",
    "notification-service",
    "settlement-engine",
    "kyc-service",
    "risk-scoring",
    "ledger-service",
    "api-gateway",
    "auth-service",
    "reporting-service",
    "card-issuing",
    "fx-service",
    "compliance-monitor",
    "webhook-relay",
    "document-store",
] as const;

/** Fixed project codenames */
export const PROJECTS = [
    "Project Atlas",
    "Project Beacon",
    "Project Compass",
    "Project Delphi",
    "Project Echo",
    "Project Falcon",
    "Project Granite",
    "Project Horizon",
    "Project Iris",
    "Project Keystone",
] as const;

/** Deterministic date helper — months ago from a fixed epoch */
export function meridianDate(monthsAgo: number): string {
    return new Date(Date.now() - monthsAgo * 30 * 86400000).toISOString();
}

/** Deterministic date helper — days from T0 (12 months ago) */
export function meridianDateDays(daysFromT0: number): string {
    const t0 = new Date(Date.now() - 365 * 86400000); // 12 months ago
    return new Date(t0.getTime() + daysFromT0 * 86400000).toISOString();
}

/** Build a v2 doc with all defaults filled */
export function docV2(
    id: string,
    domain: string,
    title: string,
    content: string,
    mime: string,
    publishedAt: string,
): {
    id: string;
    domain: string;
    url: string;
    title: string;
    content: string;
    mime: string;
    publishedAt: string;
    licenseId: string;
    riskFlag: string;
    tenantId: string;
} {
    return {
        id,
        domain,
        url: `https://${domain}/docs/${id}`,
        title,
        content,
        mime,
        publishedAt,
        licenseId: "proprietary",
        riskFlag: "none",
        tenantId: TENANT_V2,
    };
}

/** Pick employee by index (wraps around) */
export function employee(index: number) {
    return EMPLOYEES[index % EMPLOYEES.length];
}

/** Pick service by index (wraps around) */
export function service(index: number) {
    return SERVICES[index % SERVICES.length];
}

/** Pick project by index (wraps around) */
export function project(index: number) {
    return PROJECTS[index % PROJECTS.length];
}
