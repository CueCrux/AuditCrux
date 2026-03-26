# Blind Evaluation Pack: pack-04
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR: Authentication Module for Payments API

## Status
Accepted

## Context

The Payments API requires an authentication mechanism that works across multiple services, avoids per-request database lookups, supports authorization via roles and permissions, and satisfies the 2025-Q4 security review.

Relevant inputs reviewed:

- **Payments API Specification v2**
- **2025-Q4 Security Review — Authentication Findings**
- **Team Architecture Decisions Log**
- **Payments API Deployment Runbook**
- **PCI-DSS Compliance Summary**

Key requirements and constraints:

1. **JWT bearer authentication is required** for API access.
2. **Token signing must use RS256**, not HS256.
3. The security review explicitly rejected **HS256** because:
   - it requires sharing the signing secret with every validating service,
   - any validating service could also forge tokens,
   - it increases blast radius in a microservices architecture.
4. The auth design must include **refresh token replay protection**.
5. The team has already confirmed:
   - **RS256**
   - **JWKS endpoint** at `/.well-known/jwks.json`
   - shared validation via `@payments/auth-middleware`

This decision must be production-safe and compliant with security finding **SEC-2025-041**.

---

## Decision

### 1. Token signing algorithm

We will use **JWT access tokens signed with RS256**.

#### Justification

RS256 is the required choice for this system because it separates token issuance from token validation:

- **Only the auth service holds the private key** and can issue tokens.
- Other services validate tokens using the **public key** from JWKS.
- This avoids distributing a shared signing secret across services.
- It reduces compromise blast radius compared with HS256.
- It supports operationally safe **key rotation** through JWKS.
- It aligns with:
  - the API specification,
  - the security review recommendation,
  - PCI-DSS authentication expectations,
  - the deployment runbook verification criteria.

#### Explicit rejection of HS256

We explicitly reject **HS256** for access tokens.

Reasons:

- HS256 requires all validating services to know the same secret.
- Any service with that secret could mint valid tokens.
- The 2025-Q4 security review marked this as a **Critical** finding.
- The API gateway policy will reject HS256-signed tokens.

---

### 2. Token model

We will use a **two-token model**:

- **Access token**: JWT, signed with RS256
- **Refresh token**: opaque random token, stored server-side

#### Access token purpose

The access token is used for API authorization and should be:

- short-lived,
- self-contained,
- verifiable without database access in the common case.

#### Access token claims

Access tokens will include the following claims:

```json
{
  "sub": "user_abc123",
  "iss": "payments-auth",
  "aud": "payments-api",
  "iat": 1705312000,
  "exp": 1705312900,
  "jti": "jwt_01HXYZ...",
  "roles": ["merchant"],
  "permissions": ["payments:create", "payments:read"],
  "tenant_id": "tenant_xyz"
}
```

#### Claim definitions

- **sub**: subject identifier, typically the user ID
- **iss**: issuer, fixed to `payments-auth`
- **aud**: audience, fixed to `payments-api`
- **iat**: issued-at timestamp
- **exp**: expiration timestamp
- **jti**: unique token identifier for revocation tracking and auditability
- **roles**: coarse-grained role assignments
- **permissions**: fine-grained authorization scopes
- **tenant_id**: tenant context for multi-tenant authorization and rate limiting

#### Access token lifetime

Access tokens expire after **15 minutes**.

Rationale:

- Matches the API specification.
- Limits exposure if a token is stolen.
- Keeps the token stateless and efficient for normal request validation.

---

### 3. Refresh token strategy

Refresh tokens will be **opaque**, not JWTs.

They will be:

- generated as high-entropy random values,
- stored server-side with metadata,
- rotated on every successful refresh.

#### Stored refresh token metadata

Each refresh token record should include:

- token hash
- user ID
- session ID
- token family ID
- parent token ID
- issued at
- expires at
- revoked at
- replaced by token ID
- client metadata as needed (device/session label, IP/user-agent if policy allows)

#### Rotation policy

On each refresh:

1. validate presented refresh token,
2. issue a new access token,
3. issue a new refresh token,
4. revoke the old refresh token,
5. link the new token into the same token family.

#### Replay protection

We will implement **token family tracking**.

If a refresh token that has already been rotated or revoked is presented again outside the grace window, this is treated as **replay**. On replay detection:

- revoke the entire refresh token family,
- invalidate the associated session,
- require full re-authentication.

This directly addresses **SEC-2025-042**.

#### Grace window

A **30-second grace window** will be allowed after rotation.

Purpose:

- handles network retries,
- avoids false-positive replay detection when the client retries due to timeout or connection loss.

If the old token is reused within the grace window and policy conditions are met, the server may return the already-issued replacement result rather than treating it as malicious replay.

---

### 4. Key distribution and rotation

The auth service will expose a JWKS endpoint:

```text
/.well-known/jwks.json
```

#### Key management rules

- Private keys remain only in the auth service.
- Public keys are published via JWKS.
- JWTs include a `kid` header identifying the signing key.
- Validators select the correct public key by `kid`.
- Key rotation is handled by publishing new keys in JWKS before switching signing.
- Old public keys remain available until all issued tokens signed with them have expired.

---

### 5. Token validation middleware

We will implement shared token validation middleware in the package:

```text
@payments/auth-middleware
```

This middleware will be used by API services to enforce authentication consistently.

#### Validation steps

For each request using bearer authentication:

1. Read the `Authorization` header.
2. Require the format `Bearer <token>`.
3. Parse the JWT header and claims.
4. Verify the token is signed with **RS256** only.
5. Reject tokens declaring any other algorithm, including HS256.
6. Resolve the public key from JWKS using `kid`.
7. Verify the signature.
8. Validate registered claims:
   - `iss` must equal `payments-auth`
   - `aud` must equal `payments-api`
   - `exp` must be in the future
   - `iat` must be valid
   - `sub` must be present
   - `jti` must be present
9. Optionally check deny-list / revocation cache for revoked `jti` where applicable.
10. Attach authenticated principal data to the request context.
11. Continue to authorization middleware.

#### Request context attached by middleware

The middleware should attach a normalized auth object such as:

```ts
interface AuthContext {
  subject: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  tokenId: string;
  issuer: string;
  audience: string;
  expiresAt: number;
}
```

#### Authorization behavior

Authentication middleware only establishes identity and token validity.

Separate authorization middleware or route guards will enforce:

- required permissions,
- role checks,
- tenant scoping.

Examples:

- missing/invalid/expired token → **401 Unauthorized**
- valid token but missing permission → **403 Forbidden**

#### Error handling requirements

All authentication and authorization errors must use **RFC 9457 Problem Details** with content type:

```text
application/problem+json
```

Example 401 response:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "The access token is missing, invalid, or expired.",
  "instance": "/v1/payments"
}
```

Example 403 response:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "The authenticated principal does not have permission to perform this action.",
  "instance": "/v1/payments/pay_xyz789/refund"
}
```

---

## Consequences

### Positive consequences

1. **Security compliance**
   - Satisfies critical finding **SEC-2025-041** by using RS256 only.
   - Satisfies replay protection expectations from **SEC-2025-042**.

2. **Reduced blast radius**
   - Validating services do not receive the private signing key.
   - Compromise of a consumer service does not allow token issuance.

3. **Scalable validation**
   - Access tokens can be validated locally using JWKS without database lookups on every request.

4. **Operational flexibility**
   - Key rotation is manageable through JWKS and `kid`.
   - Shared middleware ensures consistent validation across services.

5. **Clear separation of concerns**
   - Access tokens handle short-lived API access.
   - Refresh tokens handle session continuity with stronger server-side control.

### Trade-offs and costs

1. **More operational complexity than HS256**
   - Requires RSA key management and JWKS hosting.
   - Validators must cache and refresh JWKS safely.

2. **Larger token size**
   - RS256 JWTs are larger than HS256 tokens.
   - This is acceptable given the security benefits.

3. **Refresh token statefulness**
   - Opaque refresh tokens require server-side storage and family tracking.
   - Additional logic is needed for rotation, replay detection, and revocation.

4. **Revocation is not fully free**
   - Stateless access tokens still need optional deny-list support for immediate revocation scenarios.
   - This introduces some cache/storage overhead.

5. **Auth service becomes critical infrastructure**
   - Token issuance and JWKS availability are essential dependencies.
   - This must be mitigated through redundancy and monitoring.

### Implementation notes for future developers

- Do not allow algorithm negotiation from untrusted token headers; enforce **RS256** explicitly.
- Do not implement refresh tokens as JWTs.
- Do not share private keys outside the auth service.
- Do not return custom error JSON; use **RFC 9457 Problem Details** only.
- Ensure revoked or replayed refresh tokens invalidate the full token family.
- Keep old JWKS keys published until all tokens signed with them have expired.

--- 

If useful, I can next turn this ADR into:
1. a concrete TypeScript interface/spec for the auth module, or  
2. Express middleware skeletons for issuance, validation, and refresh flows.

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR-004: Rate Limiting for Payments API

## Status
Accepted

## Date
2026-03-26

## Context

The Payments API requires rate limiting to:

- protect backend services from overload
- enforce fair usage across tenants and integrations
- provide predictable behavior for partner clients
- satisfy contractual SLA requirements for rate limit signaling

This ADR follows and must remain consistent with prior decisions and requirements:

- **ADR-001**: authentication uses JWTs signed with **RS256**, not HS256
- **ADR-002**: sliding window rate limiting was selected
- **ADR-003**: all error responses must use **RFC 9457 Problem Details**
- **Payments API Specification v2**: all endpoints are rate-limited and 429 responses must include `Retry-After`
- **Team Architecture Decisions Log**: Express.js + TypeScript, Redis-backed rate limiting, fail-open on Redis failure
- **Security review SEC-2025-041**: JWT validation must accept **RS256 only**

## Decision

We will implement **Redis-backed sliding window counter** rate limiting for the Payments API.

Rate limits will be enforced:

- **per API key** for authenticated server-to-server requests using API keys
- **per user/tenant context** for authenticated JWT bearer token requests
- with tenant-aware tiering derived from authenticated identity
- in Express middleware before request handling reaches business logic

When a request exceeds its limit, the API will return:

- HTTP `429 Too Many Requests`
- required rate limit headers, including **`Retry-After`**
- an **RFC 9457 Problem Details** response body with content type `application/problem+json`

If Redis is unavailable, the system will **fail open** for the initial release and emit warning-level logs and metrics.

---

## 1. Chosen Algorithm and Justification

### Algorithm
We will use a **sliding window counter**.

Effective usage is calculated as:

```text
effective_count = previous_window_count × overlap_ratio + current_window_count
```

Where:

```text
overlap_ratio = (window_size - elapsed_in_current_window) / window_size
```

### Why this algorithm

We considered the standard options:

1. **Fixed window**
   - simple
   - but allows burst abuse at window boundaries
   - can effectively permit nearly 2× the intended limit

2. **Sliding window log**
   - highly accurate
   - but requires storing each request timestamp
   - too memory-intensive at our expected scale

3. **Sliding window counter**
   - smooths boundary effects
   - bounded memory usage
   - operationally simple in Redis
   - already selected in **ADR-002**

### Justification

The sliding window counter is the best fit because it:

- aligns with **ADR-002**
- avoids the worst burst behavior of fixed windows
- uses **O(1)** storage per key/window
- works well with Redis in our existing architecture
- is accurate enough for API fairness and SLA enforcement

This keeps the implementation consistent with prior architecture decisions and avoids reopening a decision that has already been accepted.

---

## 2. Rate Limit Response Headers

### Required headers

For all rate-limited responses (`429`), the API will include:

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <max_requests>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix_timestamp>`

For successful in-limit responses, the API will include:

- `X-RateLimit-Limit: <max_requests>`
- `X-RateLimit-Remaining: <remaining_requests>`
- `X-RateLimit-Reset: <unix_timestamp>`

This matches **ADR-002**, the API specification, and the deployment checklist.

### Header semantics

#### `X-RateLimit-Limit`
The maximum allowed requests for the current policy window.

Example:
```http
X-RateLimit-Limit: 100
```

#### `X-RateLimit-Remaining`
The remaining requests available before the next request would be rejected.

Example:
```http
X-RateLimit-Remaining: 42
```

For rejected requests:
```http
X-RateLimit-Remaining: 0
```

#### `X-RateLimit-Reset`
Unix timestamp indicating when the client can expect the effective window to reset sufficiently for retry behavior.

Example:
```http
X-RateLimit-Reset: 1767225600
```

#### `Retry-After`
Number of seconds the client should wait before retrying.

Example:
```http
Retry-After: 17
```

This header is **mandatory on 429 responses** due to partner SLA obligations.

### 429 response body format

All 429 responses must use **RFC 9457 Problem Details**.

Example:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 17
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1767225600
```

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Rate limit exceeded for this client. Retry after 17 seconds.",
  "instance": "/v1/payments",
  "retry_after": 17,
  "trace_id": "req_123456789"
}
```

Notes:

- `Content-Type` must be `application/problem+json`
- `retry_after` in the body must match the `Retry-After` header
- `trace_id` should be included from request context where available
- no custom non-standard error envelope is permitted

---

## 3. Interaction Between Rate Limiting and Authentication

Rate limiting depends on authenticated identity type.

### Authentication prerequisites

The API supports:

- **JWT bearer tokens**
- **API keys**

JWT validation must remain consistent with **ADR-001** and the security review:

- JWTs must be validated using **RS256**
- HS256 tokens must not be accepted

Rate limiting must not weaken or bypass authentication requirements.

### Identity selection for rate limiting

#### JWT-authenticated requests
For bearer token requests, the rate limit key will be based on authenticated token claims.

Primary dimensions:

- `tenant_id`
- `sub` (user ID)

Recommended key scope:

```text
jwt:{tenant_id}:{sub}
```

This gives per-user isolation while preserving tenant attribution for tier lookup.

Tier determination:

- derive tenant tier from `tenant_id`
- use Redis-cached tier metadata as defined in ADR-002

This supports:
- fair use per authenticated user
- tenant-based service plans
- future tenant-wide aggregate controls if needed

#### API key-authenticated requests
For API key requests, the rate limit key will be based on the API key identity.

Recommended key scope:

```text
api_key:{key_id}
```

Important:
- use the internal API key identifier, not the raw presented key
- raw API keys must not be logged or used directly as Redis keys

This supports:
- independent limits for server-to-server integrations
- revocation and auditing by key identity
- separation from end-user JWT traffic

### Precedence rules

If a request is authenticated with an API key, apply **API key rate limiting**.

If a request is authenticated with a JWT, apply **JWT/user rate limiting**.

If the platform ever permits both credentials on one request, the API must define deterministic precedence. For now:

1. API key authentication, if used for the route, determines the rate limit identity
2. otherwise JWT authentication determines the rate limit identity

This avoids ambiguous double-counting.

### Unauthenticated requests

The current API specification states all endpoints require authentication. Therefore:

- unauthenticated requests should normally fail authentication before business logic
- they should receive a proper RFC 9457 `401` response
- they should not consume authenticated user or API key quotas

If public endpoints are introduced later, a separate anonymous/IP-based policy must be defined in a future ADR.

### Middleware ordering

Recommended request flow:

1. request ID / trace context middleware
2. authentication middleware
3. rate limiting middleware
4. authorization middleware
5. route handler
6. global error handler

Why this order:

- rate limiting needs authenticated identity to choose the correct key and tier
- authorization should not run if the request is already over limit
- trace context should exist before any error response is generated

### Why not rate limit before authentication

Rate limiting before authentication would force fallback to IP-based identity, which would:

- be less fair behind NAT/shared networks
- conflict with per-user and per-API-key requirements
- make tenant-tier enforcement harder
- create inconsistent behavior for authenticated clients

Therefore, authenticated identity is the primary rate limit subject.

---

## 4. Storage and Key Design

### Redis key pattern

Consistent with ADR-002:

```text
rl:{scope}:{identifier}:{window_start}
```

Examples:

```text
rl:jwt:tenant_xyz:user_abc123:1767225540
rl:api_key:key_789:1767225540
```

If strict adherence to the original 3-part pattern is preferred, the identifier may be composed:

```text
rl:jwt:tenant_xyz:user_abc123:1767225540
```

or normalized as:

```text
rl:jwt:tenant_xyz|user_abc123:1767225540
rl:api_key:key_789:1767225540
```

### Expiry

Keys auto-expire after:

```text
2 × window_duration
```

This preserves both current and previous window counters for overlap calculation.

### Atomicity

Redis operations should be performed atomically, preferably using:

- a Lua script, or
- a Redis transaction pattern that safely reads/increments current and previous counters

A Lua script is preferred to avoid race conditions under concurrency.

---

## 5. Tiered Limits

Default tiers remain:

| Tier | Requests/min | Burst allowance |
|------|--------------|----------------|
| Standard | 100 | 20 |
| Premium | 500 | 100 |
| Enterprise | Custom | Custom |

### Tier source

- For JWTs: tier is determined from `tenant_id`, using Redis-cached tenant metadata
- For API keys: tier is determined from the owning account/integration record

### Policy model

Each request resolves to a policy:

```ts
type RateLimitPolicy = {
  tier: "standard" | "premium" | "enterprise";
  requestsPerMinute: number;
  burstAllowance: number;
  windowSeconds: number; // 60
};
```

Burst allowance is represented in the effective threshold calculation and should remain consistent with the selected sliding window behavior.

---

## 6. Error Handling Requirements

All rate limit errors must comply with **ADR-003**.

### Problem Details shape

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Rate limit exceeded for this client. Retry after 17 seconds.",
  "instance": "/v1/payments",
  "retry_after": 17,
  "trace_id": "req_123456789"
}
```

### Requirements

- `type` must use the registered error URI
- `title` must be stable and human-readable
- `status` must be `429`
- `detail` should explain retry timing
- `instance` should identify the request path
- `retry_after` should mirror the header value
- `trace_id` should be included when available

No stack traces, internal Redis details, or infrastructure names should be exposed.

---

## 7. Failure Behavior

### Redis unavailable

For the initial release, if Redis is unavailable or the rate limiter cannot evaluate policy:

- **fail open**
- allow the request to proceed
- emit warning-level logs
- increment a metric for rate limiter failures

This is consistent with:

- ADR-002
- Team Architecture Decisions Log
- operational preference to avoid full API outage due to rate limiter dependency failure

### Observability

Emit metrics for:

- allowed requests
- blocked requests
- Redis failures
- policy resolution failures
- per-tier usage
- retry-after durations

Logs must avoid sensitive data:
- do not log raw API keys
- do not log JWTs
- do not log cardholder data

---

## 8. Implementation Guidance

### Express middleware responsibilities

The rate limiting middleware should:

1. read authenticated identity from prior auth middleware
2. resolve subject type:
   - `jwt`
   - `api_key`
3. resolve tier/policy
4. compute current and previous window keys
5. atomically update/read counters in Redis
6. compute:
   - effective count
   - remaining
   - reset timestamp
   - retry-after seconds
7. set response headers on all responses
8. short-circuit with RFC 9457 `429` when over limit

### Pseudocode

```ts
if (!req.auth) {
  return next(); // auth middleware should already reject protected routes
}

const subject = resolveRateLimitSubject(req.auth);
const policy = await resolvePolicy(subject);

try {
  const result = await redisSlidingWindowCheck(subject, policy);

  res.setHeader("X-RateLimit-Limit", policy.requestsPerMinute.toString());
  res.setHeader("X-RateLimit-Remaining", Math.max(0, result.remaining).toString());
  res.setHeader("X-RateLimit-Reset", result.resetAtUnix.toString());

  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfterSeconds.toString());

    return res
      .status(429)
      .type("application/problem+json")
      .json({
        type: "https://api.payments.example/errors/rate-limited",
        title: "Rate Limited",
        status: 429,
        detail: `Rate limit exceeded for this client. Retry after ${result.retryAfterSeconds} seconds.`,
        instance: req.originalUrl,
        retry_after: result.retryAfterSeconds,
        trace_id: req.traceId
      });
  }

  return next();
} catch (err) {
  logger.warn({ err, subjectType: subject.type }, "rate limiter unavailable; failing open");
  return next();
}
```

---

## 9. Consequences

### Positive

- consistent with accepted architecture decisions
- fairer than fixed-window limiting
- bounded Redis memory usage
- supports both JWT and API key clients cleanly
- satisfies SLA requirement for `Retry-After`
- uses RFC 9457-compliant error responses

### Negative

- slightly approximate near window boundaries
- introduces Redis dependency in request path
- requires careful atomic implementation
- policy resolution adds some complexity for tenant-aware tiers

### Risks

- incorrect middleware ordering could cause wrong subject selection
- missing `Retry-After` on 429 would violate partner obligations
- non-RFC-9457 error bodies would violate ADR-003
- accepting HS256 JWTs in auth middleware would violate security requirements and undermine rate limit identity trust

---

## 10. Compliance With Prior Decisions

This ADR is explicitly aligned with prior decisions:

- **ADR-001**: JWT-authenticated rate limiting depends on trusted **RS256** token validation
- **ADR-002**: uses **sliding window counter**
- **ADR-003**: 429 responses use **application/problem+json**
- **API Spec v2**: includes `X-RateLimit-*` headers and mandatory `Retry-After`
- **Architecture log**: Redis-backed implementation, Express middleware, fail-open on Redis failure

No part of this ADR changes the authentication decision. In particular:

- JWT signing/validation remains **RS256-only**
- no HS256 support is introduced
- webhook verification remains unrelated and server-side only

---

## Implementation Notes

1. Build shared Express middleware in TypeScript.
2. Use Redis Lua scripting for atomic counter evaluation.
3. Add integration tests for:
   - JWT-authenticated requests
   - API key-authenticated requests
   - 429 includes `Retry-After`
   - 429 body is RFC 9457
   - in-limit responses include `X-RateLimit-*`
   - Redis failure fail-open behavior
   - HS256 JWT rejection remains enforced by auth middleware
4. Add runbook verification steps for sample 429 responses.

## Supersedes
None.

## Related
- ADR-001: JWT Authentication with RS256 Signing
- ADR-002: Sliding Window Rate Limiting
- ADR-003: RFC 9457 Problem Details for Error Responses

---

## Phase: Error Handling Refactor

### Agent Output

Below is a Phase 3 error-handling refactor design for the Payments API, aligned with the prior authentication and rate-limiting decisions and the active constraints.

---

# Refactored Error Handling Design

## 1. Goals

This refactor standardizes all API error responses so that:

- all errors use **RFC 9457 Problem Details**
- authentication errors clearly distinguish **401 vs 403**
- rate limit errors always include **`Retry-After`**
- production responses never leak stack traces or internal details
- the design remains compatible with:
  - **ADR-001**: JWT auth with **RS256**
  - **ADR-002**: sliding window rate limiting
  - **ADR-003**: RFC 9457 Problem Details
  - Stripe webhook security requirements

---

## 2. Core Design Principles

## A. Single global error contract

Every non-2xx response generated by the API should be emitted as:

- `Content-Type: application/problem+json`
- body containing:
  - `type`
  - `title`
  - `status`
  - `detail`
  - `instance`

Supported extension fields:

- `trace_id`
- `validation_errors`
- `retry_after`

This directly follows **ADR-003**.

---

## B. Centralized error normalization

All route handlers and middleware should either:

- throw typed application errors, or
- pass unexpected errors to `next(err)`

A single global Express error handler should:

1. classify the error
2. map it to a registered problem type URI
3. set required headers
4. emit RFC 9457 JSON
5. log the full internal error separately

This eliminates inconsistent formats like:

- `{ error: "message" }`
- `{ code: "...", message: "..." }`

---

## C. Explicit separation of concerns

### Middleware order

Recommended request pipeline:

1. request ID / trace ID middleware
2. security headers / request context
3. auth middleware
4. rate limiting middleware
5. validation middleware
6. route handlers
7. not-found handler
8. global error handler

This ensures all failures are transformed consistently.

---

## 3. Error Taxonomy

## A. Base problem shape

Example:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "2 validation error(s) in request body",
  "instance": "/v1/payments",
  "trace_id": "req_123"
}
```

---

## B. Standard error types

The following problem types should be used consistently:

### 400
- `/errors/validation-failed`
- `/errors/invalid-payment-method`

### 401
- `/errors/authentication-required`

Use for:
- missing bearer token
- malformed token
- expired token
- invalid signature
- invalid issuer/audience

### 403
- `/errors/permission-denied`

Use for:
- valid token, but missing required permission/role
- tenant access denied

### 404
- `/errors/subscription-not-found`
- resource-specific not-found types if defined later

### 409
- `/errors/idempotency-conflict`

### 429
- `/errors/rate-limited`

### 402 / 502 gateway mappings
- `/errors/card-declined`
- `/errors/insufficient-funds`
- `/errors/gateway-error`

### webhook-specific
- `/errors/webhook-verification-failed`

This is consistent with ADR-003 and the anti-patterns document.

---

## 4. Global Error Handler

## A. Responsibilities

The global error handler should:

- convert all known internal errors to Problem Details
- preserve HTTP status
- add `trace_id`
- set `Content-Type: application/problem+json`
- suppress stack traces in production
- log full details internally
- attach special headers where required, especially for 429

## B. Behavior by error class

### 1. Validation errors
Map to:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "N validation error(s) in request body",
  "instance": "/path",
  "validation_errors": [
    { "field": "amount_cents", "message": "must be a positive integer" }
  ],
  "trace_id": "..."
}
```

### 2. Authentication failures
Map to 401:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "Bearer token is missing, invalid, or expired.",
  "instance": "/path",
  "trace_id": "..."
}
```

Optional `WWW-Authenticate: Bearer` header is recommended.

### 3. Authorization failures
Map to 403:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "The authenticated principal does not have permission to perform this action.",
  "instance": "/path",
  "trace_id": "..."
}
```

### 4. Rate limit failures
Map to 429 with required headers and body extensions:

Headers:
- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <max>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix_timestamp>`

Body:
```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 12 seconds.",
  "instance": "/path",
  "trace_id": "...",
  "retry_after": 12
}
```

This satisfies both ADR-002 and the contractual requirement.

### 5. Unexpected internal errors
Map to 500:

```json
{
  "type": "https://api.payments.example/errors/internal-server-error",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred.",
  "instance": "/path",
  "trace_id": "..."
}
```

No stack trace or internal service names in response.

---

## 5. Typed Error Model

Introduce typed internal error classes so middleware and handlers can throw structured errors.

Suggested classes:

- `AppError`
- `ValidationError`
- `AuthenticationError`
- `AuthorizationError`
- `RateLimitError`
- `NotFoundError`
- `ConflictError`
- `WebhookVerificationError`
- `GatewayError`

Each should carry:

- `status`
- `type`
- `title`
- `detail`
- optional `extensions`
- optional `headers`
- optional `cause`

This keeps route code simple and ensures consistency.

---

## 6. Authentication Error Design

## A. 401 vs 403 rules

This must be explicit and enforced consistently.

### Return 401 when:
- no `Authorization` header
- malformed bearer token
- invalid JWT signature
- expired JWT
- wrong issuer
- wrong audience
- revoked token
- unsupported signing algorithm

### Return 403 when:
- token is valid
- identity is established
- but required permission/role/tenant scope is missing

This matches the anti-patterns guidance and avoids ambiguity.

---

## B. RS256-only enforcement

Per **ADR-001** and the critical security finding, auth middleware must validate JWTs using **RS256 only**.

Important design note:

- do not allow algorithm negotiation from token header
- explicitly configure verifier to accept only `RS256`
- reject HS256 tokens with 401

This is critical for compliance with **SEC-2025-041**.

Example 401 detail:
- "Token signing algorithm is not accepted."

But avoid overexposing internals beyond what is useful.

---

## 7. Rate Limiting Error Design

## A. Required 429 headers

Per ADR-002 and the partner SLA, every 429 response must include:

- `Retry-After`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

This is mandatory.

## B. Non-429 responses

Per ADR-002, successful in-limit responses should also include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

No `Retry-After` unless the response is 429.

## C. Redis failure behavior

Per ADR-002 and the architecture log:

- if Redis rate-limit storage fails, the API should **fail open**
- log at WARNING level
- do not emit 429 due to Redis outage alone

This should not be treated as an application error response to clients unless policy changes later.

---

## 8. Validation Error Design

Validation middleware should stop returning plain text or ad hoc JSON.

Instead, return 400 Problem Details with:

- `type: /errors/validation-failed`
- `validation_errors` array

Example:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "2 validation error(s) in request body",
  "instance": "/v1/payments",
  "trace_id": "req_abc",
  "validation_errors": [
    { "field": "amount_cents", "message": "must be a positive integer" },
    { "field": "currency", "message": "must be a valid ISO 4217 currency code" }
  ]
}
```

---

## 9. Not Found and Method Errors

## A. 404 handler
A dedicated not-found middleware should convert unmatched routes into Problem Details.

Example:

```json
{
  "type": "https://api.payments.example/errors/resource-not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "The requested resource was not found.",
  "instance": "/v1/unknown",
  "trace_id": "..."
}
```

## B. 405 handling
If implemented, method-not-allowed should also use Problem Details.

---

## 10. Stripe Webhook Error Handling

For Stripe webhook endpoints:

- verification must occur **server-side only**
- `STRIPE_WEBHOOK_SECRET` must never be exposed to client code
- verification failures should return:
  - 400 or 401/403 depending on policy, but 400 is common for invalid webhook signature
  - Problem Details type: `/errors/webhook-verification-failed`

Example:

```json
{
  "type": "https://api.payments.example/errors/webhook-verification-failed",
  "title": "Webhook Verification Failed",
  "status": 400,
  "detail": "The webhook signature could not be verified.",
  "instance": "/webhooks/stripe",
  "trace_id": "..."
}
```

This respects the critical Stripe constraint.

---

## 11. Logging and Information Exposure

## A. Client response
Never include:
- stack traces
- Prisma/database errors
- internal hostnames/service names
- Stripe secrets or webhook secrets
- JWT internals beyond necessary detail

## B. Internal logs
Do log:
- trace ID
- status
- problem type
- route
- authenticated subject if available
- full stack/cause internally
- rate-limit Redis failures at WARNING
- auth verification failures with sanitized reason

Also ensure logs do not contain cardholder data, consistent with PCI guidance.

---

## 12. Suggested Express Implementation Shape

## A. Request context middleware
Adds:
- `req.traceId`
- response header if desired, e.g. `X-Trace-Id`

## B. Auth middleware
- validates JWT with **RS256 only**
- checks issuer, audience, expiry
- throws `AuthenticationError` on invalid token
- throws `AuthorizationError` on permission failure

## C. Rate limit middleware
- computes sliding window counters in Redis
- sets rate-limit headers on all responses
- on exceed, throws `RateLimitError` with:
  - `retryAfter`
  - `limit`
  - `remaining = 0`
  - `reset`

## D. Validation middleware
- throws `ValidationError` with field list

## E. Global not-found middleware
- emits 404 Problem Details

## F. Global error middleware
- normalizes all errors to RFC 9457

---

# Checklist Verifying Consistency With All Prior Decisions

## Authentication / Phase 1
- [x] JWT validation uses **RS256 only**
- [x] HS256 is rejected
- [x] issuer and audience are validated
- [x] invalid/missing/expired token returns **401**
- [x] valid token without permission returns **403**
- [x] design is compatible with JWKS-based public key validation
- [x] no auth error format deviates from RFC 9457

## Rate Limiting / Phase 2
- [x] sliding window counter remains the rate-limiting algorithm
- [x] Redis remains the backing store
- [x] Redis failure behavior remains **fail-open with warning logs**
- [x] all 429 responses include **`Retry-After`**
- [x] 429 responses also include:
  - [x] `X-RateLimit-Limit`
  - [x] `X-RateLimit-Remaining`
  - [x] `X-RateLimit-Reset`
- [x] in-limit responses include rate-limit headers except `Retry-After`
- [x] 429 body uses RFC 9457 with `retry_after` extension

## Error Handling / ADR-003
- [x] all error responses use `application/problem+json`
- [x] all error responses include:
  - [x] `type`
  - [x] `title`
  - [x] `status`
  - [x] `detail`
  - [x] `instance`
- [x] `trace_id` is included as an extension field
- [x] validation failures use `validation_errors`
- [x] custom legacy error formats are eliminated

## Stripe / Integration Security
- [x] webhook signature verification is server-side only
- [x] `STRIPE_WEBHOOK_SECRET` is never exposed client-side
- [x] webhook verification failures are returned as Problem Details
- [x] no design element requires browser-side webhook verification

## Security / Compliance
- [x] no stack traces in production responses
- [x] no internal service names or DB errors in client responses
- [x] no cardholder data in logs
- [x] traceability is preserved via `trace_id`
- [x] design aligns with deployment runbook checks

---

# Deployment Readiness Assessment

## Overall assessment
**Conditionally ready**, pending implementation verification and test coverage.

The design is aligned with the documented decisions and critical constraints. The main remaining risk is execution consistency across all existing endpoints and middleware.

---

## What is ready at the design level
- RFC 9457 is the single error format everywhere
- 401 vs 403 semantics are clearly defined
- 429 responses are specified with mandatory headers
- RS256-only auth behavior is preserved
- Stripe webhook verification remains server-side only
- production-safe error exposure rules are defined

---

## Required implementation checks before deployment

## 1. Automated tests
Must add/verify tests for:

### Error format
- every representative 400/401/403/404/409/429/500 response uses `application/problem+json`
- body contains required RFC 9457 fields

### Authentication
- missing token -> 401
- expired token -> 401
- invalid signature -> 401
- HS256 token -> 401
- valid token, missing permission -> 403

### Rate limiting
- over limit -> 429
- 429 includes `Retry-After`
- 429 includes all rate-limit headers
- body `retry_after` matches header
- in-limit responses include rate-limit headers
- Redis outage -> request allowed, warning logged

### Validation
- invalid request -> 400 with `validation_errors`

### Webhooks
- invalid Stripe signature -> Problem Details error
- verification performed only server-side

---

## 2. Error type registry completeness
Before deployment, ensure the registry includes at least:
- `/errors/rate-limited`
- `/errors/authentication-required`
- `/errors/permission-denied`
- `/errors/validation-failed`
- `/errors/subscription-not-found`
- `/errors/refund-exceeds-amount`
- `/errors/webhook-verification-failed`
- `/errors/internal-server-error`
- `/errors/resource-not-found`
- `/errors/gateway-error`

---

## 3. Middleware audit
Audit all existing endpoints to remove:
- direct `res.status(...).json({ error: ... })`
- plain text validation failures
- route-local inconsistent auth errors
- any 429 path that omits `Retry-After`

This is likely the biggest migration task.

---

## 4. Production safety checks
Verify:
- stack traces suppressed in production
- logs retain full internal detail
- trace IDs propagate through request lifecycle
- no secrets are emitted in logs or responses

---

## 5. Runbook alignment
This design supports the deployment runbook items:

- [x] error responses use RFC 9457
- [x] JWT validation uses RS256 only
- [x] rate limit headers present
- [x] webhook verification is server-side only

But deployment should be blocked until smoke tests confirm:
- intentional 401/403/429 responses match the new contract
- HS256 tokens are rejected
- 429 includes `Retry-After`

---

## Final recommendation

Proceed with implementation using:

1. typed application errors
2. centralized global error middleware
3. explicit auth middleware split for 401 vs 403
4. rate-limit middleware that always sets required headers
5. endpoint-by-endpoint migration away from legacy error responses

From an architecture and compliance perspective, this design is consistent with all prior decisions and respects all critical constraints.

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