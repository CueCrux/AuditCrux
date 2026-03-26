# Blind Evaluation Pack: pack-02
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR: Authentication Module Design for Payments API

## Status
Accepted

## Context

The Payments API requires an authentication mechanism that is:

- stateless for request-time validation
- secure across a microservices architecture
- compatible with multiple validating services
- aligned with the 2025-Q4 security review
- suitable for permission- and tenant-aware authorization

Relevant inputs reviewed:

- **Payments API Specification v2**
- **2025-Q4 Security Review — Authentication Findings**
- **Team Architecture Decisions Log**
- **ADR-001: JWT Authentication with RS256 Signing**

The most important security requirement is **SEC-2025-041**, which explicitly rejects **HS256** and requires an asymmetric signing approach such as **RS256** or ES256. Team decisions and ADR-001 already confirm **RS256**.

The security review also requires refresh token replay protection (**SEC-2025-042**), and prior design work specifies token family tracking with rotation and replay-triggered family revocation.

## Decision

We will implement authentication using:

- **JWT bearer access tokens**
- **RS256 signing only**
- **opaque refresh tokens stored server-side**
- **JWKS-based public key distribution**
- **shared validation middleware for all services**

### 1. Token signing algorithm

#### Decision
Use **RS256** for all JWT access tokens.

#### Justification
RS256 is required for both security and compliance reasons:

1. **HS256 is explicitly disallowed**
   - The security review finding **SEC-2025-041** rejects HS256.
   - The API gateway policy will reject HS256-signed tokens before production approval.

2. **Asymmetric signing reduces blast radius**
   - With HS256, every validating service would need the same shared secret.
   - In our architecture, that would distribute signing capability to many services.
   - With RS256, only the auth service holds the **private key**.
   - Other services validate using the **public key** only.

3. **Issuer control**
   - RS256 ensures only the auth service can mint valid tokens.
   - Validation services cannot forge tokens.

4. **Operational fit**
   - RS256 supports **JWKS** publication for key rotation.
   - This aligns with the team decision to expose `/.well-known/jwks.json`.

#### Explicit rule
- **Allowed**: `alg = RS256`
- **Rejected**: `HS256` and any fallback to symmetric signing

### 2. JWT token structure

We will issue short-lived access tokens as JWTs with the following claims:

```json
{
  "sub": "user_abc123",
  "iss": "payments-auth",
  "aud": "payments-api",
  "iat": 1705312000,
  "exp": 1705312900,
  "roles": ["merchant"],
  "permissions": ["payments:create", "payments:read"],
  "tenant_id": "tenant_xyz"
}
```

#### Required claims

- **sub**
  - Subject identifier
  - Represents the authenticated user or principal

- **iss**
  - Issuer
  - Fixed value: `payments-auth`

- **aud**
  - Audience
  - Fixed value: `payments-api`

- **iat**
  - Issued-at timestamp

- **exp**
  - Expiration timestamp

- **roles**
  - High-level role assignments
  - Example: `merchant`, `admin`, `support`

- **permissions**
  - Fine-grained authorization scopes
  - Example: `payments:create`, `payments:read`, `refunds:create`

- **tenant_id**
  - Tenant context for multi-tenant authorization and rate limiting

#### Access token expiry

- **Access token lifetime: 15 minutes**

This matches the API specification and balances security with usability:
- short enough to limit damage if stolen
- long enough to avoid excessive refresh churn

### 3. Refresh token strategy

Refresh tokens will **not** be JWTs.

#### Decision
Use **opaque refresh tokens** stored server-side with metadata.

#### Behavior
- Refresh tokens are rotated on every successful use
- The previously used token is invalidated after rotation
- A **30-second grace window** allows the old token to still succeed for retry scenarios
- Refresh tokens are grouped into a **token family**
- If a revoked or already-used refresh token is replayed, the **entire family is revoked**

#### Why this design
This directly addresses **SEC-2025-042**:
- detects replay of stolen refresh tokens
- prevents indefinite reuse
- enables session revocation on compromise

#### Stored metadata
For each refresh token, store at minimum:
- token identifier / hashed token value
- user/principal id
- tenant id
- token family id
- issued at
- expires at
- revoked at
- replaced by token id
- client/session metadata as needed

#### Security notes
- Store only a **hashed** representation of refresh tokens
- Never expose refresh token internals to clients
- Refresh token validation and rotation happen server-side only

### 4. Token validation middleware

We will implement a shared middleware package for Express.js services, consistent with the team decision to use a shared npm package such as `@payments/auth-middleware`.

#### Responsibilities

The middleware must:

1. Extract bearer token from the `Authorization` header
2. Parse JWT header and enforce:
   - token present
   - `alg` is exactly `RS256`
   - `kid` is present for key lookup
3. Resolve signing key from the JWKS endpoint
4. Verify signature using the public key
5. Validate standard claims:
   - `iss` equals `payments-auth`
   - `aud` equals `payments-api`
   - `exp` is in the future
   - `iat` is valid
   - `sub` is present
6. Validate application claims:
   - `tenant_id` present
   - `roles` is an array if present
   - `permissions` is an array if present
7. Attach authenticated principal context to the request
8. Reject invalid tokens with an RFC 9457 Problem Details response

#### Middleware output
On success, attach a typed auth context such as:

```ts
interface AuthContext {
  subject: string;
  issuer: string;
  audience: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  issuedAt: number;
  expiresAt: number;
}
```

Example request augmentation:

```ts
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
```

#### Validation flow

1. Read `Authorization: Bearer <token>`
2. If missing or malformed, return **401**
3. Decode protected header
4. Reject if `alg !== RS256`
5. Fetch matching public key by `kid` from JWKS cache
6. Verify signature
7. Validate issuer, audience, expiry, and required claims
8. Attach auth context
9. Continue to authorization middleware / route handler

#### JWKS behavior
- Public keys are fetched from `/.well-known/jwks.json`
- Keys should be cached in memory with periodic refresh
- Unknown `kid` should trigger a JWKS refresh before failing
- Private keys remain only in the auth service

#### Error handling
All auth failures must return **RFC 9457 Problem Details** with:

- `Content-Type: application/problem+json`

Example 401 response:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "The access token is missing, invalid, expired, or could not be verified.",
  "instance": "/v1/payments"
}
```

No custom error format is permitted.

### 5. Authorization model

Authentication middleware establishes identity and claims. Authorization is performed afterward using:

- `permissions` for endpoint-level access control
- `roles` for broader policy grouping
- `tenant_id` for tenant scoping and rate-limit tier lookup

This keeps the access token self-contained for common authorization checks without requiring a database lookup on every request.

## Consequences

### Positive

1. **Meets security review requirements**
   - RS256 satisfies SEC-2025-041
   - refresh token replay protection satisfies SEC-2025-042

2. **Supports microservices safely**
   - validating services only need public keys
   - signing authority remains centralized in the auth service

3. **Enables stateless request authentication**
   - most requests can be authenticated without database access

4. **Supports key rotation**
   - JWKS allows controlled public key distribution and rotation

5. **Supports fine-grained authorization**
   - roles, permissions, and tenant context are embedded in the token

### Trade-offs

1. **More operational complexity than HS256**
   - requires keypair management
   - requires JWKS hosting and caching

2. **Larger token size**
   - RS256 tokens are larger than HS256 tokens
   - acceptable given the security benefits

3. **Refresh token state is server-side**
   - refresh flow is not fully stateless
   - this is intentional to support replay detection and revocation

4. **Middleware must be strict**
   - algorithm confusion and weak validation must be prevented
   - implementation must reject anything not explicitly allowed

### Implementation implications

- The auth service must manage RSA private keys securely
- The auth service must expose `/.well-known/jwks.json`
- All services must use the shared validation middleware
- Middleware must enforce **RS256 only**
- Access tokens expire after **15 minutes**
- Refresh tokens must be **opaque, rotated, family-tracked, and replay-detecting**
- Error responses must use **RFC 9457 Problem Details**

### Non-goals / explicit exclusions

- We will **not** support HS256 for backward compatibility
- We will **not** use JWTs as refresh tokens
- We will **not** allow services other than the auth service to hold signing private keys

---

If useful, I can next turn this ADR into:
1. a concrete TypeScript interface/spec for the auth module, or  
2. Express middleware pseudocode / implementation skeleton.

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR-004: Rate Limiting for Payments API

## Status
Accepted

## Date
2026-03-26

## Context

The Payments API must enforce rate limits to:

- Protect backend services from overload
- Provide fair usage across tenants and integrations
- Meet partner SLA obligations
- Remain consistent with the existing architecture:
  - Express.js with TypeScript
  - Redis as shared infrastructure
  - JWT auth with **RS256** validation only
  - RFC 9457 Problem Details for all error responses

Relevant prior decisions and requirements:

- **ADR-002** selected a **sliding window counter** approach.
- **Payments API Specification v2** requires rate limiting on all endpoints.
- **429 responses must include `Retry-After`**.
- Rate limit headers should be present on successful responses as well.
- Authentication supports:
  - JWT Bearer tokens
  - API keys
- JWTs must use **RS256**, not HS256.
- Redis failures should be handled **fail-open with warning logs** for the initial release.
- Error responses must use **`application/problem+json`** per RFC 9457.

## Decision

We will implement **rate limiting using a sliding window counter stored in Redis**.

Rate limits will be applied using the authenticated caller identity:

- **JWT-authenticated requests**: limit by `tenant_id` plus subject context
- **API key-authenticated requests**: limit by API key identity
- If both are somehow present, the request will be evaluated according to the credential type actually accepted by the authentication middleware, not both.

The middleware order will be:

1. Request ID / tracing
2. Authentication
3. Rate limiting
4. Route handler

This ensures rate limiting can use authenticated identity and tenant context.

## Rationale

### 1. Algorithm choice

We choose **sliding window counter** because it best matches prior architecture decisions and operational needs.

#### Alternatives considered

**Fixed window**
- Simple to implement
- Rejected because it allows burst abuse at window boundaries

**Sliding window log**
- Most accurate
- Rejected because it stores each request timestamp and is too memory-intensive at our expected scale

**Token bucket / leaky bucket**
- Good for smoothing bursts
- Not selected because the team already accepted sliding window counter in ADR-002, and changing algorithms would create inconsistency without a strong need

#### Why sliding window counter

- Already accepted in **ADR-002**
- O(1) memory per key
- Smooths boundary effects better than fixed window
- Fits Redis well
- Operationally simple for Express middleware
- Accurate enough for API fairness goals

The effective count is calculated as:

```text
effective_count = previous_window_count × overlap_ratio + current_window_count
```

Where:

```text
overlap_ratio = (window_size - elapsed_in_current_window) / window_size
```

## Rate Limit Identity Model

### JWT-authenticated requests

For JWT requests, the limiter key will be derived from:

- `tenant_id` claim
- authenticated principal identifier (`sub`)

Primary scope:

```text
jwt:{tenant_id}:{sub}
```

This gives per-user fairness while preserving tenant context for observability and future tiering.

Tier lookup will use `tenant_id`, because the specification and ADR-002 define tiers at the tenant level.

Effective behavior:

- **limit value** comes from the tenant tier
- **counter key** is per authenticated user within that tenant

This avoids one noisy user consuming the full tenant quota for every other user, while still allowing tenant-based plan enforcement.

### API key-authenticated requests

For API key requests, the limiter key will be:

```text
api_key:{key_id}
```

Where `key_id` is the internal identifier of the validated API key, never the raw presented key.

This ensures:

- no raw secrets in Redis keys or logs
- independent limits for server-to-server integrations
- compatibility with hashed API key storage

### Unauthenticated requests

Because the API specification states all endpoints require authentication, unauthenticated requests should normally fail authentication before rate limiting.

However, for endpoints intentionally exposed without auth in the future (for example `/health`), rate limiting may be disabled or use a separate IP-based policy. That is outside this ADR’s main scope.

## Tiering

Default limits:

| Tier | Requests/min | Burst allowance |
|---|---:|---:|
| Standard | 100 | 20 |
| Premium | 500 | 100 |
| Enterprise | Custom | Custom |

Tier resolution:

- For JWTs: resolve from `tenant_id`
- For API keys: resolve from the owning tenant or integration account
- Tier metadata is cached in Redis as previously decided

For the initial implementation, the configured limit is the per-minute quota used by the sliding window counter. Burst handling is approximated by the sliding window behavior rather than implemented as a separate token bucket.

Enterprise custom limits will be loaded from configuration or tenant metadata.

## Redis Storage Design

Key pattern:

```text
rl:{scope}:{identifier}:{window_start}
```

Examples:

```text
rl:jwt:tenant_xyz:user_abc123:1711456980
rl:api_key:key_123:1711456980
```

Keys expire after:

```text
2 × window_duration
```

This matches ADR-002 and ensures the previous window remains available for overlap calculation.

Stored values:

- current window count
- previous window count is read from the prior window key
- window start timestamp is derived from the current time and window size

## Response Headers

### Successful responses

All rate-limited endpoints will include:

- `X-RateLimit-Limit: <max requests in window>`
- `X-RateLimit-Remaining: <remaining requests>`
- `X-RateLimit-Reset: <unix timestamp>`

`Retry-After` is **not** included on successful responses.

### Rate-limited responses (HTTP 429)

429 responses will include:

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <max requests in window>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix timestamp>`

This is mandatory per partner agreement and ADR-002.

### Header semantics

- **`X-RateLimit-Limit`**: the applicable request quota for the current caller
- **`X-RateLimit-Remaining`**: remaining whole requests available before the next request would be rejected
- **`X-RateLimit-Reset`**: Unix timestamp when enough window weight expires for the client to retry safely
- **`Retry-After`**: integer seconds until retry for 429 only

`Retry-After` will be computed conservatively and rounded up to the next whole second.

## Error Response Format

When a request is rate-limited, the API will return:

- HTTP status: `429 Too Many Requests`
- Content-Type: `application/problem+json`

Problem Details body:

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "Request rate limit exceeded for this client. Retry after 12 seconds.",
  "instance": "/v1/payments",
  "retry_after": 12,
  "trace_id": "req_1234567890"
}
```

Notes:

- This satisfies the RFC 9457 requirement.
- `retry_after` is included as an extension field in the body in addition to the required `Retry-After` header.
- No custom non-standard envelope will be used.

## Interaction with Authentication

### Dependency on auth middleware

Rate limiting depends on successful authentication because the identity key comes from:

- validated JWT claims (`sub`, `tenant_id`)
- validated API key metadata (`key_id`, owning tenant)

Therefore, authentication must run first.

### JWT validation requirements

JWT-based rate limiting will only use claims from tokens that have already passed validation by the auth middleware, including:

- signature verification using **RS256**
- issuer validation
- audience validation
- expiry validation

No rate limiting logic may parse or trust unvalidated JWT payloads.

This is required for consistency with:

- ADR-001
- SEC-2025-041
- gateway policy rejecting HS256

### API key handling

API keys are validated before rate limiting. The limiter uses the internal key identifier, not the raw API key string.

### If auth fails

If authentication fails, the API returns the appropriate auth error in RFC 9457 format. Rate limiting is not evaluated for that request in the main authenticated flow.

This keeps auth semantics clear and avoids creating separate anonymous buckets for endpoints that are supposed to be protected.

## Failure Handling

If Redis is unavailable or times out:

- the request will be allowed (**fail-open**)
- a WARNING-level log entry will be emitted
- metrics will record the limiter bypass event

This follows ADR-002 and the architecture log decision.

Example log fields:

- `event=rate_limit_fail_open`
- `reason=redis_unavailable`
- `scope=jwt|api_key`
- `identifier=<internal id>`
- `trace_id=<request id>`

No raw API keys or token contents may be logged.

## Middleware Behavior

Pseudo-flow:

```text
authenticate(request)
  -> if invalid, return RFC 9457 auth error

resolveRateLimitSubject(request)
  -> jwt subject or api key id
  -> resolve tenant tier

checkSlidingWindow(subject, tier limit)
  -> if redis failure, log warning and continue
  -> if within limit, attach rate limit headers and continue
  -> if exceeded, return 429 with headers + problem details
```

## Implementation Notes

### Express middleware contract

The rate limiting middleware should:

- read authenticated identity from `req.auth` or equivalent typed context
- compute headers before response completion
- set headers on both success and 429 responses
- produce RFC 9457 responses through the shared error utility

### Suggested TypeScript interfaces

```ts
type AuthContext =
  | {
      kind: "jwt";
      sub: string;
      tenantId: string;
      roles: string[];
      permissions: string[];
    }
  | {
      kind: "api_key";
      keyId: string;
      tenantId: string;
      scopes: string[];
    };

type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
};
```

## Consequences

### Positive

- Consistent with ADR-002 and existing architecture
- Meets SLA requirement for `Retry-After` on 429
- Supports both JWT and API key clients cleanly
- Preserves security boundaries by relying on validated auth context
- Uses Redis efficiently
- Standardized 429 responses via RFC 9457

### Negative

- Requires Redis availability for enforcement accuracy
- Sliding window counter is approximate, not exact
- Per-user JWT limiting may not perfectly enforce a hard tenant-wide aggregate cap unless a future tenant-level aggregate limiter is added
- Middleware ordering becomes important

## Compliance and Consistency Check

This ADR is consistent with prior decisions and constraints:

- **RS256 only for JWTs**: preserved
- **Retry-After required on 429**: preserved
- **RFC 9457 Problem Details for errors**: preserved
- **Redis fail-open on limiter failure**: preserved
- **Sliding window counter**: preserved from ADR-002
- **Express + TypeScript middleware architecture**: preserved

## Future Considerations

Potential follow-up improvements:

1. Add a second optional **tenant aggregate limiter** in addition to per-user JWT limits for stricter tenant-wide quota enforcement.
2. Add endpoint-specific weights for expensive operations.
3. Add separate write vs read limits.
4. Expose rate limit metrics in `/metrics`.
5. Add enterprise-configurable windows beyond 60 seconds.
6. Consider IETF standard `RateLimit-*` headers in addition to current `X-RateLimit-*` headers if partner compatibility allows.

## Summary

We will implement rate limiting with a **Redis-backed sliding window counter**, keyed by authenticated caller identity, with tenant-based tier resolution, mandatory rate limit headers, `Retry-After` on 429 responses, and RFC 9457 error bodies. Authentication runs before rate limiting, and JWT-derived limits rely only on already-validated **RS256** tokens.

---

## Phase: Error Handling Refactor

### Agent Output

Below is a refactored error-handling design for the Payments API that is aligned with the prior Phase 1 and Phase 2 decisions, plus a consistency checklist and deployment readiness assessment.

---

# Refactored Error Handling Design

## 1) Goals

This refactor standardizes error handling across the API so that:

- all error responses use **RFC 9457 Problem Details**
- authentication and authorization failures are clearly separated into **401 vs 403**
- rate limiting returns **429 with required headers**, especially `Retry-After`
- internal errors do not leak stack traces or implementation details
- the design remains consistent with:
  - **ADR-001**: JWT auth with **RS256**
  - **ADR-002**: sliding window rate limiting + required headers
  - **ADR-003**: RFC 9457 Problem Details
  - security and integration constraints

---

## 2) Global Strategy

## 2.1 Single global error contract

Every non-2xx/3xx API response should be emitted through a single centralized error pipeline.

### Required response format

`Content-Type: application/problem+json`

Body shape:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more request fields are invalid.",
  "instance": "/v1/payments",
  "trace_id": "req_123",
  "validation_errors": [
    {
      "field": "amount_cents",
      "message": "Must be greater than 0"
    }
  ]
}
```

### Core fields

Per ADR-003, every error response must include:

- `type`
- `title`
- `status`
- `detail`
- `instance`

### Extension fields

Use controlled extensions only:

- `trace_id`
- `validation_errors`
- `retry_after`

Note: ADR-003 mentions extension fields should be prefixed with the API namespace to avoid conflicts. To stay strict, implementation should prefer namespaced extensions such as:

- `payments_trace_id`
- `payments_validation_errors`
- `payments_retry_after`

If backward compatibility is not yet a concern, I recommend using the namespaced form in the actual implementation.

---

## 2.2 Centralized error taxonomy

Define a small set of canonical application error types mapped to the registry under:

`https://api.payments.example/errors/...`

Recommended baseline registry:

- `/errors/validation-failed`
- `/errors/authentication-required`
- `/errors/permission-denied`
- `/errors/rate-limited`
- `/errors/resource-not-found`
- `/errors/idempotency-conflict`
- `/errors/invalid-payment-method`
- `/errors/card-declined`
- `/errors/insufficient-funds`
- `/errors/gateway-error`
- `/errors/internal-server-error`

This keeps all handlers consistent and avoids ad hoc error payloads.

---

## 2.3 Error classes

Introduce typed application errors so route handlers and middleware throw structured errors rather than raw strings.

Example categories:

- `ValidationError` → 400
- `AuthenticationError` → 401
- `AuthorizationError` → 403
- `NotFoundError` → 404
- `ConflictError` → 409
- `RateLimitError` → 429
- `UpstreamGatewayError` → 502
- `InternalServerError` → 500

Each error should carry:

- `status`
- `type`
- `title`
- safe `detail`
- optional extension data
- optional headers to attach

This is especially important for rate limiting, where headers are mandatory.

---

## 2.4 Middleware order

Recommended Express middleware order:

1. request ID / trace ID middleware
2. security headers
3. body parsing
4. authentication middleware
5. authorization middleware
6. rate limiting middleware
7. route handlers
8. not-found handler
9. global error handler

This ensures:

- auth failures are caught early
- rate limiting can reject before expensive work
- all thrown errors converge into one formatter

---

# 3) Authentication and Authorization Error Design

## 3.1 401 vs 403 rules

This must be explicit and consistent.

## Return 401 Unauthorized when:

- no bearer token is provided
- token is malformed
- token signature is invalid
- token is expired
- token issuer/audience is invalid
- API key is missing or invalid
- auth scheme is unsupported

Problem type:
`https://api.payments.example/errors/authentication-required`

Example:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "A valid bearer token or API key is required to access this resource.",
  "instance": "/v1/payments",
  "payments_trace_id": "req_abc123"
}
```

Also include `WWW-Authenticate` where appropriate for bearer auth.

Example:
```http
WWW-Authenticate: Bearer realm="payments-api", error="invalid_token"
```

## Return 403 Forbidden when:

- token is valid, but lacks required permission
- token is valid, but role is insufficient
- tenant access is denied
- API key is valid, but not scoped for the requested operation

Problem type:
`https://api.payments.example/errors/permission-denied`

Example:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "You do not have permission to perform this action.",
  "instance": "/v1/payments/pay_xyz789/refund",
  "payments_trace_id": "req_abc123"
}
```

## 3.2 Auth consistency with Phase 1

This design must preserve all auth decisions:

- JWT validation must accept **RS256 only**
- reject HS256 tokens explicitly
- validate `iss`, `aud`, `exp`, and signature
- use JWKS/public key validation
- do not blur authentication failures into 500s or generic 400s

Important: if an incoming JWT uses `alg=HS256`, that must be treated as an authentication failure and return **401**, not silently accepted or auto-negotiated.

---

# 4) Rate Limit Error Design

## 4.1 429 response requirements

Per ADR-002, API spec v2, and active constraints, every 429 response must include:

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <max>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix_timestamp>`

This is mandatory.

## 4.2 429 problem details body

Example:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 17
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1760000100
```

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 17 seconds.",
  "instance": "/v1/payments",
  "payments_trace_id": "req_abc123",
  "payments_retry_after": 17
}
```

## 4.3 Rate limiting middleware behavior

The rate limiter should not directly emit custom JSON. Instead it should either:

- throw a `RateLimitError` carrying required headers and retry metadata, or
- call a shared `sendProblem()` helper with the same canonical shape

## 4.4 Redis failure behavior

Per ADR-002 and architecture log:

- if Redis is unavailable, rate limiting should **fail open**
- log at WARNING level
- do not return 429 due to infrastructure failure alone

This means Redis outages should not produce misleading rate-limit problem responses.

---

# 5) Validation, Domain, and Upstream Error Design

## 5.1 Validation errors → 400

Use:
`https://api.payments.example/errors/validation-failed`

Example:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "One or more request fields are invalid.",
  "instance": "/v1/payments",
  "payments_trace_id": "req_abc123",
  "payments_validation_errors": [
    {
      "field": "currency",
      "message": "Must be a supported ISO currency code"
    }
  ]
}
```

## 5.2 Not found → 404

Use a standard type such as:
`https://api.payments.example/errors/resource-not-found`

## 5.3 Idempotency conflict → 409

Use:
`https://api.payments.example/errors/idempotency-conflict`

## 5.4 Stripe / gateway errors

Map upstream Stripe errors to approved problem types per integration guide:

- `card_declined` → `/errors/card-declined` → 402
- `insufficient_funds` → `/errors/insufficient-funds` → 402
- `expired_card` → `/errors/invalid-payment-method` → 400
- `processing_error` → `/errors/gateway-error` → 502
- `rate_limit` → `/errors/rate-limited` → 429

Important:
- Stripe webhook signature verification remains **server-side only**
- never expose `STRIPE_WEBHOOK_SECRET`
- webhook verification failures should return a problem response, likely 400 or 401 depending on endpoint policy, but always from server-side verification logic

---

# 6) Global Error Handler Behavior

## 6.1 Responsibilities

The global error handler should:

- normalize known application errors
- convert unknown errors into a safe 500 problem
- attach headers from the error object
- ensure `application/problem+json`
- include request path as `instance`
- include trace/request ID
- suppress stack traces in production responses

## 6.2 Unknown error fallback

Example 500 response:

```json
{
  "type": "https://api.payments.example/errors/internal-server-error",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred.",
  "instance": "/v1/payments/pay_xyz789/confirm",
  "payments_trace_id": "req_abc123"
}
```

Log the full internal error server-side with trace correlation, but do not expose stack traces or internal service names to clients.

This aligns with SEC-2025-044.

---

# 7) Suggested Implementation Shape

## 7.1 Shared problem builder

Create a shared helper:

- `buildProblemDetails(error, req)`
- `sendProblem(res, problem, headers?)`

This prevents drift across middleware and routes.

## 7.2 Base error type

Example conceptual structure:

```ts
type ProblemHeaders = Record<string, string>;

class ApiError extends Error {
  status: number;
  type: string;
  title: string;
  detail: string;
  extensions?: Record<string, unknown>;
  headers?: ProblemHeaders;
}
```

Specialized subclasses:

- `AuthenticationError`
- `AuthorizationError`
- `ValidationError`
- `RateLimitError`
- `NotFoundError`
- `ConflictError`
- `GatewayError`

## 7.3 Express not-found handler

Unmatched routes should also return Problem Details, not plain JSON or HTML.

---

# 8) Example Response Matrix

| Scenario | Status | Type | Required Headers |
|---|---:|---|---|
| Missing bearer token | 401 | `/errors/authentication-required` | `WWW-Authenticate` |
| Expired token | 401 | `/errors/authentication-required` | `WWW-Authenticate` |
| HS256 token presented | 401 | `/errors/authentication-required` | `WWW-Authenticate` |
| Valid token, missing permission | 403 | `/errors/permission-denied` | none |
| Validation failure | 400 | `/errors/validation-failed` | none |
| Resource not found | 404 | `/errors/resource-not-found` | none |
| Idempotency conflict | 409 | `/errors/idempotency-conflict` | none |
| Rate limit exceeded | 429 | `/errors/rate-limited` | `Retry-After`, `X-RateLimit-*` |
| Stripe card declined | 402 | `/errors/card-declined` | none |
| Unexpected server error | 500 | `/errors/internal-server-error` | none |

---

# Checklist Verifying Consistency With All Prior Decisions

## ADR-001 / Phase 1 Authentication
- [x] JWT validation uses **RS256 only**
- [x] HS256 tokens are rejected
- [x] issuer, audience, expiry, and signature are validated
- [x] authentication failures return **401**
- [x] authorization failures return **403**
- [x] design supports JWKS/public-key validation
- [x] no custom auth error format is introduced

## ADR-002 / Phase 2 Rate Limiting
- [x] rate limiting remains based on **sliding window counter**
- [x] 429 responses include `Retry-After`
- [x] 429 responses include `X-RateLimit-Limit`
- [x] 429 responses include `X-RateLimit-Remaining: 0`
- [x] 429 responses include `X-RateLimit-Reset`
- [x] within-limit responses can still include rate limit headers
- [x] Redis failure behavior remains **fail-open with warning logging**
- [x] rate limit errors use Problem Details instead of custom JSON

## ADR-003 / Error Handling
- [x] all error responses use **RFC 9457 Problem Details**
- [x] `Content-Type` is `application/problem+json`
- [x] required fields `type`, `title`, `status`, `detail`, `instance` are always present
- [x] extension fields are controlled and should be namespaced
- [x] no legacy/custom `{ error: ... }` format remains

## Payments API Specification v2
- [x] all endpoints require authentication handling
- [x] rate limit response requirements are preserved
- [x] error response examples align with RFC 9457
- [x] idempotency conflict handling is represented
- [x] Stripe error mapping is preserved

## Security Review Findings
- [x] SEC-2025-041 addressed: RS256 only, no HS256 acceptance
- [x] SEC-2025-043 addressed: rate limit headers included, especially on 429
- [x] SEC-2025-044 addressed: no stack traces/internal details in production responses

## Stripe / Integration Constraints
- [x] Stripe webhook verification remains server-side only
- [x] webhook signing secret is never exposed to client-side code
- [x] webhook verification failures can also use Problem Details format

## Deployment Runbook Alignment
- [x] error responses use RFC 9457
- [x] JWT validation rejects HS256
- [x] rate limit headers are present
- [x] webhook verification remains server-side only

---

# Deployment Readiness Assessment

## Overall assessment
**Conditionally ready**, assuming implementation follows this design exactly and is validated with integration tests.

## What is ready from a design perspective
- The design is fully aligned with the accepted ADRs.
- It satisfies the active critical constraints.
- It resolves ambiguity around 401 vs 403.
- It standardizes all error responses under one contract.
- It preserves contractual rate-limit behavior.

## Remaining implementation gates before deployment

### 1. Test coverage required
Must add or verify tests for:

- 401 on missing token
- 401 on expired token
- 401 on invalid signature
- 401 on HS256 token
- 403 on missing permission
- 429 includes:
  - `Retry-After`
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
  - `application/problem+json`
- 400 validation errors use Problem Details
- 404 unknown route uses Problem Details
- 500 fallback uses Problem Details without stack trace leakage
- Redis rate limiter failure fails open
- Stripe webhook verification is server-side and secret is not exposed

### 2. Error type registry completeness
Ensure all referenced `type` URIs exist and are documented, especially if adding:
- `/errors/resource-not-found`
- `/errors/internal-server-error`
- `/errors/gateway-error`

### 3. Legacy handler removal
Audit the codebase for:
- `res.status(...).json({ error: ... })`
- ad hoc auth middleware responses
- rate limiter custom payloads
- default Express HTML error pages

All must be replaced or routed through the shared problem formatter.

### 4. Production logging hygiene
Ensure logs capture:
- trace ID
- status
- error type
- internal stack trace server-side only

But responses must not expose:
- stack traces
- SQL errors
- internal service names
- secrets
- token contents
- webhook secrets

## Risk assessment

### Low risk
- adopting a centralized formatter
- adding typed error classes
- converting validation/not-found/internal errors to Problem Details

### Medium risk
- refactoring auth middleware to consistently separate 401 and 403
- ensuring every 429 path includes all required headers
- removing all legacy custom error responses across the codebase

### High risk if missed
- accidental acceptance of HS256
- missing `Retry-After` on 429
- leaking internal details in 500 responses
- webhook secret exposure or client-side verification logic

## Final readiness verdict
**Ready for implementation and pre-deployment verification, but not production-ready until integration tests confirm:**
1. RS256-only auth behavior,
2. 401/403 correctness,
3. RFC 9457 formatting everywhere,
4. mandatory 429 headers,
5. server-side-only Stripe webhook verification.

If useful, I can next turn this design into:
- an Express/TypeScript middleware architecture,
- concrete `ApiError` class definitions,
- or a test matrix for Vitest + Supertest.

---

## Scoring

| Criterion | Score (1-5) | Notes |
|---|---|---|
| Decision preservation (prior decisions referenced accurately) | | |
| Architecture coherence (consistent with prior ADRs) | | |
| Constraint compliance (critical constraints respected) | | |
| Completeness (all required deliverables present) | | |
| Reasoning quality (justifications are sound) | | |

**Overall preference (if comparing multiple packs):** ________________