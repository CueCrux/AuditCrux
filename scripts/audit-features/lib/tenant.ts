/**
 * Audit Suite (Features) — Tenant, domains, and doc helpers.
 */

import type { CorpusDocV2 } from "./types-features.js";

export const TENANT_FEATURES = "__audit_features__";

/** Domains used across feature categories */
export const DOMAINS = {
    compliance: "compliance.meridian.test",
    security: "security.meridian.test",
    eng: "eng.meridian.test",
    platform: "platform.meridian.test",
    infra: "infra.meridian.test",
    legal: "legal.meridian.test",
    product: "product.meridian.test",
    hr: "hr.meridian.test",
    finance: "finance.meridian.test",
    ops: "ops.meridian.test",
} as const;

export type DomainKey = keyof typeof DOMAINS;

/** Deterministic date — days from T0 (12 months ago) */
export function dateDays(daysFromT0: number): string {
    const t0 = new Date(Date.now() - 365 * 86400000);
    return new Date(t0.getTime() + daysFromT0 * 86400000).toISOString();
}

/** Deterministic date — months ago from now */
export function dateMonthsAgo(months: number): string {
    return new Date(Date.now() - months * 30 * 86400000).toISOString();
}

/** Build a feature-test doc with defaults filled */
export function docFeature(
    id: string,
    domain: string,
    title: string,
    content: string,
    mime: string,
    publishedAt: string,
): CorpusDocV2 {
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
        tenantId: TENANT_FEATURES,
    };
}
