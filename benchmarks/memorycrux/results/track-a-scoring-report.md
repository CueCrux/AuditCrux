# MemoryCrux Benchmark — Track A Scoring Report

Generated: 2026-03-27T13:18:55.815Z

Runs scored: 15

## Project: DELTA

### Model: claude-sonnet-4-6

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 37% (11/30) | - | - | - | $0.6972 | 5 | 0 | 36.3 |
| C2 | 27% (8/30) | - | - | - | $13.4323 | 5 | 0 | 26.4 |
| F1 | 90% (27/30) | - | - | - | $6.2798 | 27 | 125 | 63.64 |
| T2 | 87% (26/30) | - | - | - | $2.5895 | 30 | 104 | 61.51 |
| T3 | 83% (25/30) | - | - | - | $2.4244 | 35 | 71 | 59 |

## Cross-Arm Comparison: delta/claude-sonnet-4-6

| Metric | C0 | C2 | F1 | T2 | T3 | Winner |
|---|---|---|---|---|---|---|
| Input tokens | 150192 | 4399762 | 1976146 | 727108 | 662791 | C0 |
| Output tokens | 16440 | 15531 | 23426 | 27213 | 29066 | - |
| Estimated cost | $0.6972 | $13.4323 | $6.2798 | $2.5895 | $2.4244 | - |
| Duration | 405.7s | 2723.3s | 453.2s | 1048.3s | 1767.9s | - |
| Tool calls | 0 | 0 | 125 | 104 | 71 | - |
| Total turns | 5 | 5 | 27 | 30 | 35 | - |

**C0 missed keys:** Ed25519 for JWT signing, opaque refresh tokens in Redis, PKCE for all OAuth flows, idempotency key in X-Idempotency-Key header, webhook signature verification with HMAC-SHA256, 30-day refund window policy, dead letter queue for poison messages, Parquet format for cold storage, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, pod disruption budget minimum 60%, OpenTelemetry for distributed tracing, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C0 tiered recall:** core=44% (11/25) needle=0% (0/5)
**C2 missed keys:** Ed25519 for JWT signing, 15-minute access token TTL, opaque refresh tokens in Redis, PKCE for all OAuth flows, idempotency key in X-Idempotency-Key header, webhook signature verification with HMAC-SHA256, 30-day refund window policy, dead letter queue for poison messages, Parquet format for cold storage, blue-green deployment strategy, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, pod disruption budget minimum 60%, mutual TLS between all services, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C2 tiered recall:** core=28% (7/25) needle=20% (1/5)
**F1 missed keys:** vault-transit-key-ed25519-prod-signing-v3, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**F1 tiered recall:** core=100% (25/25) needle=40% (2/5)
**T2 missed keys:** vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T2 tiered recall:** core=100% (25/25) needle=20% (1/5)
**T3 missed keys:** CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T3 tiered recall:** core=96% (24/25) needle=20% (1/5)

### Model: gpt-5.4

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 23% (7/30) | - | - | - | $0.4557 | 5 | 0 | 23.1 |
| C2 | 10% (3/30) | - | - | - | $10.0430 | 5 | 0 | 9.9 |
| F1 | 87% (26/30) | - | - | - | $1.7564 | 16 | 116 | 61.61 |
| T2 | 70% (21/30) | - | - | - | $1.5255 | 40 | 149 | 51.23 |
| T3 | 87% (26/30) | - | - | - | $1.2555 | 34 | 82 | 61.61 |

## Cross-Arm Comparison: delta/gpt-5.4

| Metric | C0 | C2 | F1 | T2 | T3 | Winner |
|---|---|---|---|---|---|---|
| Input tokens | 133176 | 3978686 | 983534 | 882110 | 702333 | C0 |
| Output tokens | 12280 | 9625 | 13211 | 18580 | 16828 | - |
| Estimated cost | $0.4557 | $10.0430 | $1.7564 | $1.5255 | $1.2555 | - |
| Duration | 193.8s | 202.0s | 186.9s | 781.5s | 793.8s | - |
| Tool calls | 0 | 0 | 116 | 149 | 82 | - |
| Total turns | 5 | 5 | 16 | 40 | 34 | - |

**C0 missed keys:** 15-minute access token TTL, opaque refresh tokens in Redis, PKCE for all OAuth flows, Stripe as primary processor, idempotency key in X-Idempotency-Key header, webhook signature verification with HMAC-SHA256, 30-day refund window policy, Apache Flink for stream processing, dead letter queue for poison messages, Parquet format for cold storage, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, Argo Rollouts for canary releases, mutual TLS between all services, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C0 tiered recall:** core=28% (7/25) needle=0% (0/5)
**C2 missed keys:** 15-minute access token TTL, opaque refresh tokens in Redis, PKCE for all OAuth flows, Stripe as primary processor, idempotency key in X-Idempotency-Key header, PCI DSS tokenization via Stripe Elements, webhook signature verification with HMAC-SHA256, 30-day refund window policy, Apache Flink for stream processing, 15-minute tumbling windows for aggregation, dead letter queue for poison messages, Parquet format for cold storage, blue-green deployment strategy, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, pod disruption budget minimum 60%, Argo Rollouts for canary releases, mutual TLS between all services, structured JSON logging with correlation IDs, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C2 tiered recall:** core=8% (2/25) needle=20% (1/5)
**F1 missed keys:** vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**F1 tiered recall:** core=100% (25/25) needle=20% (1/5)
**T2 missed keys:** mutual TLS between all services, structured JSON logging with correlation IDs, OpenTelemetry for distributed tracing, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T2 tiered recall:** core=80% (20/25) needle=20% (1/5)
**T3 missed keys:** vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T3 tiered recall:** core=100% (25/25) needle=20% (1/5)

### Model: gpt-5.4-mini

| Arm | Decision Recall | Constraint | Safety | Incident | Cost | Turns | Tools | Cx (Em) |
|---|---|---|---|---|---|---|---|---|
| C0 | 17% (5/30) | - | - | - | $0.0639 | 5 | 0 | 16.5 |
| C2 | 33% (10/30) | - | - | - | $0.4182 | 5 | 0 | 33 |
| F1 | 80% (24/30) | - | - | - | $0.3252 | 23 | 112 | 57 |
| T2 | 63% (19/30) | - | - | - | $0.0689 | 29 | 44 | 44.86 |
| T3 | 0% (0/30) | - | - | - | $0.0179 | 19 | 30 | 0 |

## Cross-Arm Comparison: delta/gpt-5.4-mini

| Metric | C0 | C2 | F1 | T2 | T3 | Winner |
|---|---|---|---|---|---|---|
| Input tokens | 134911 | 1060166 | 1410827 | 272235 | 61007 | T3 |
| Output tokens | 6191 | 5832 | 8240 | 7095 | 2944 | - |
| Estimated cost | $0.0639 | $0.4182 | $0.3252 | $0.0689 | $0.0179 | - |
| Duration | 35.0s | 47.2s | 61.7s | 77.9s | 558.8s | - |
| Tool calls | 0 | 0 | 112 | 44 | 30 | - |
| Total turns | 5 | 5 | 23 | 29 | 19 | - |

**C0 missed keys:** Ed25519 for JWT signing, 15-minute access token TTL, PKCE for all OAuth flows, Stripe as primary processor, idempotency key in X-Idempotency-Key header, webhook signature verification with HMAC-SHA256, 30-day refund window policy, Apache Flink for stream processing, 15-minute tumbling windows for aggregation, dead letter queue for poison messages, Parquet format for cold storage, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, pod disruption budget minimum 60%, Argo Rollouts for canary releases, mutual TLS between all services, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C0 tiered recall:** core=20% (5/25) needle=0% (0/5)
**C2 missed keys:** PKCE for all OAuth flows, Stripe as primary processor, idempotency key in X-Idempotency-Key header, webhook signature verification with HMAC-SHA256, 30-day refund window policy, Apache Flink for stream processing, dead letter queue for poison messages, Parquet format for cold storage, 5-second timeout for inter-service calls, Argo Rollouts for canary releases, mutual TLS between all services, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**C2 tiered recall:** core=40% (10/25) needle=0% (0/5)
**F1 missed keys:** mutual TLS between all services, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**F1 tiered recall:** core=96% (24/25) needle=0% (0/5)
**T2 missed keys:** PKCE for all OAuth flows, 30-day refund window policy, 15-minute tumbling windows for aggregation, structured JSON logging with correlation IDs, OpenTelemetry for distributed tracing, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T2 tiered recall:** core=72% (18/25) needle=20% (1/5)
**T3 missed keys:** Ed25519 for JWT signing, 15-minute access token TTL, opaque refresh tokens in Redis, PKCE for all OAuth flows, Stripe as primary processor, idempotency key in X-Idempotency-Key header, PCI DSS tokenization via Stripe Elements, webhook signature verification with HMAC-SHA256, 30-day refund window policy, Apache Flink for stream processing, exactly-once semantics via Kafka transactions, 15-minute tumbling windows for aggregation, dead letter queue for poison messages, Parquet format for cold storage, blue-green deployment strategy, circuit breaker with 50% error threshold, 5-second timeout for inter-service calls, pod disruption budget minimum 60%, Argo Rollouts for canary releases, mutual TLS between all services, structured JSON logging with correlation IDs, OpenTelemetry for distributed tracing, 99.95% SLA for payment endpoints, data retention 7 years for financial records, CQRS pattern for billing reads, vault-transit-key-ed25519-prod-signing-v3, 10.80.0.7:6379, Building D Floor 2 Server Room 204, KAFKA_CONSUMER_GROUP_payment-settlement-v3, feature-flag-gradual-rollout-payments-eu
**T3 tiered recall:** core=0% (0/25) needle=0% (0/5)
