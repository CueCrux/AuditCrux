/**
 * JSON config template generators — Terraform outputs, feature flags, API gateway configs
 */

export function generateTerraformOutput(params: {
    resources: {
        type: string;
        name: string;
        values: Record<string, string | number | boolean>;
    }[];
    region: string;
    workspace: string;
}): string {
    const output: Record<string, unknown> = {
        terraform_version: "1.7.4",
        workspace: params.workspace,
        region: params.region,
        timestamp: "2025-10-15T14:30:00Z",
        resources: params.resources.map((r) => ({
            resource_type: r.type,
            resource_name: r.name,
            attributes: r.values,
            status: "applied",
        })),
    };
    return JSON.stringify(output, null, 2);
}

export function generateFeatureFlags(params: {
    service: string;
    environment: string;
    flags: {
        key: string;
        enabled: boolean;
        description: string;
        rollout_percentage?: number;
        owner?: string;
    }[];
}): string {
    const config = {
        service: params.service,
        environment: params.environment,
        last_updated: "2025-10-20T09:15:00Z",
        flags: Object.fromEntries(
            params.flags.map((f) => [
                f.key,
                {
                    enabled: f.enabled,
                    description: f.description,
                    ...(f.rollout_percentage !== undefined && {
                        rollout_percentage: f.rollout_percentage,
                    }),
                    ...(f.owner && { owner: f.owner }),
                },
            ]),
        ),
    };
    return JSON.stringify(config, null, 2);
}

export function generateApiGatewayConfig(params: {
    service: string;
    routes: {
        path: string;
        method: string;
        backend: string;
        rateLimit: number;
        auth: string;
        timeout_ms: number;
    }[];
    globalRateLimit: number;
    cors: { origins: string[]; methods: string[] };
}): string {
    const config = {
        api_gateway: {
            service: params.service,
            version: "2.4.1",
            global_rate_limit_rps: params.globalRateLimit,
            cors: params.cors,
            routes: params.routes,
            health_check: {
                path: "/health",
                interval_seconds: 10,
                timeout_ms: 2000,
            },
        },
    };
    return JSON.stringify(config, null, 2);
}

export function generateDatabaseConfig(params: {
    service: string;
    host: string;
    port: number;
    database: string;
    pool: {
        maxConnections: number;
        minConnections: number;
        idleTimeoutMs: number;
        connectionTimeoutMs: number;
    };
    ssl: boolean;
    readReplicas?: string[];
}): string {
    const config = {
        database: {
            service: params.service,
            primary: {
                host: params.host,
                port: params.port,
                database: params.database,
                ssl: params.ssl,
            },
            pool: params.pool,
            ...(params.readReplicas?.length && {
                read_replicas: params.readReplicas.map((h) => ({
                    host: h,
                    port: params.port,
                })),
            }),
            query_timeout_ms: 30000,
            statement_timeout_ms: 60000,
        },
    };
    return JSON.stringify(config, null, 2);
}

export const MIME_JSON = "application/json";
