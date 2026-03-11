/**
 * YAML template generators — K8s manifests, CI pipelines, OpenAPI fragments
 *
 * All templates produce valid YAML as plain strings (no yaml library dependency).
 */

export function generateK8sDeployment(params: {
    service: string;
    namespace: string;
    replicas: number;
    image: string;
    tag: string;
    memoryLimit: string;
    cpuLimit: string;
    memoryRequest: string;
    cpuRequest: string;
    env: { name: string; value: string }[];
    port: number;
}): string {
    const envLines = params.env
        .map((e) => `        - name: ${e.name}\n          value: "${e.value}"`)
        .join("\n");

    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${params.service}
  namespace: ${params.namespace}
  labels:
    app: ${params.service}
    team: platform
spec:
  replicas: ${params.replicas}
  selector:
    matchLabels:
      app: ${params.service}
  template:
    metadata:
      labels:
        app: ${params.service}
    spec:
      containers:
      - name: ${params.service}
        image: ${params.image}:${params.tag}
        ports:
        - containerPort: ${params.port}
        resources:
          requests:
            memory: "${params.memoryRequest}"
            cpu: "${params.cpuRequest}"
          limits:
            memory: "${params.memoryLimit}"
            cpu: "${params.cpuLimit}"
        env:
${envLines}
        livenessProbe:
          httpGet:
            path: /health
            port: ${params.port}
          initialDelaySeconds: 15
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: ${params.port}
          initialDelaySeconds: 5
          periodSeconds: 5
`;
}

export function generateCIPipeline(params: {
    service: string;
    language: string;
    testCommand: string;
    buildCommand: string;
    deployTarget: string;
    secretScanning: boolean;
    dependencyAudit: boolean;
}): string {
    const securitySteps = [];
    if (params.secretScanning) {
        securitySteps.push(`      - name: Secret Scanning
        run: trufflehog filesystem --directory . --fail`);
    }
    if (params.dependencyAudit) {
        securitySteps.push(`      - name: Dependency Audit
        run: npm audit --audit-level=high`);
    }

    return `name: ${params.service}-ci
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup ${params.language}
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Dependencies
        run: npm ci
      - name: Run Tests
        run: ${params.testCommand}

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${securitySteps.join("\n")}

  build-deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: ${params.buildCommand}
      - name: Deploy to ${params.deployTarget}
        run: kubectl apply -f k8s/
        env:
          KUBECONFIG: \${{ secrets.KUBECONFIG }}
`;
}

export function generateOpenAPIFragment(params: {
    service: string;
    basePath: string;
    endpoints: {
        path: string;
        method: string;
        summary: string;
        responseCode: number;
        responseDescription: string;
    }[];
}): string {
    const paths = params.endpoints
        .map(
            (e) => `  ${params.basePath}${e.path}:
    ${e.method}:
      summary: ${e.summary}
      tags:
        - ${params.service}
      responses:
        "${e.responseCode}":
          description: ${e.responseDescription}`,
        )
        .join("\n");

    return `openapi: "3.0.3"
info:
  title: ${params.service} API
  version: "1.0.0"
  description: API specification for ${params.service}
servers:
  - url: https://api.meridian.internal
    description: Internal API
paths:
${paths}
`;
}

export const MIME_YAML = "application/x-yaml";
