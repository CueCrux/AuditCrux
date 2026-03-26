# Blind Evaluation Pack: pack-08
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR-004: Authentication Module Design for Payments API

## Status
Accepted

## Context

The Payments API requires a stateless authentication mechanism that supports validation across multiple services, avoids per-request database lookups, and enables fine-grained authorization. The system also has explicit security and compliance constraints from the 2025-Q4 security review and prior architecture decisions.

Relevant inputs:

- **SEC-2025-041 (Critical):** JWTs must not use HS256. Symmetric signing was rejected because it requires sharing the signing secret with every validating service, creating an unacceptable blast radius and allowing any holder of the secret to forge tokens.
- **ADR-001:** JWT authentication with **RS256** signing was accepted.
- **Team Architecture Decisions Log (2026-01-12):** RS256 confirmed; auth service exposes a JWKS endpoint at `/.well-known/jwks.json`; shared middleware package `@payments/auth-middleware` will validate tokens.
- **Payments API Specification v2:** Access tokens expire after 15 minutes; refresh tokens are opaque and rotated on every use; replay detection must revoke the entire token family.
- **SEC-2025-042:** Refresh token replay protection is required.
- **ADR-003:** All error responses must use RFC 9457 Problem Details.
- **Deployment Runbook:** JWT validation must reject HS256-signed tokens.

The authentication module must therefore:
1. Issue JWT access tokens signed only with RS256.
2. Validate tokens across services using public keys from JWKS.
3. Support refresh token rotation and replay detection.
4. Produce standards-compliant error responses when authentication fails.

## Decision

### 1) Token signing algorithm

We will use **RS256** for all JWT access tokens.

#### Why RS256
- **Security isolation:** Only the auth service holds the private key. Validating services use the public key only, so compromise of one service cannot mint tokens.
- **Compliance:** This satisfies SEC-2025-041 and the accepted ADR-001 decision.
- **Operational fit:** RS256 works well with JWKS-based key distribution and key rotation.
- **Zero-trust architecture:** Validation services can verify tokens without being able to issue them.

#### Explicitly rejected
- **HS256** is not permitted because it requires a shared secret across services and creates an unacceptable blast radius.
- Any token with an unexpected `alg` header must be rejected.

---

### 2) JWT token structure

We will issue **short-lived JWT access tokens** and **opaque refresh tokens**.

#### Access token
Access tokens are JWTs signed with RS256 and contain only the claims needed for authorization and tenancy.

Required claims:

```json
{
  "sub": "user_abc123",
  "iss": "payments-auth",
  "aud": "payments-api",
  "iat": 1705312000,
  "exp": 1705312900,
  "jti": "token_uuid_123",
  "roles": ["merchant"],
  "permissions": ["payments:create", "payments:read"],
  "tenant_id": "tenant_xyz"
}
```

#### Claim meanings
- `sub`: Stable user identifier.
- `iss`: Issuer identifier, fixed to `payments-auth`.
- `aud`: Audience, fixed to `payments-api`.
- `iat`: Issued-at timestamp.
- `exp`: Expiration timestamp.
- `jti`: Unique token ID for revocation and traceability.
- `roles`: Coarse-grained role assignments.
- `permissions`: Fine-grained authorization scopes.
- `tenant_id`: Tenant context used for authorization and rate limiting.

#### Expiry
- Access token lifetime: **15 minutes**
- This matches the API specification and limits exposure if a token is stolen.

#### Refresh token strategy
Refresh tokens are **opaque strings**, not JWTs.

Properties:
- Stored server-side with metadata.
- Rotated on every use.
- Each refresh issues a new refresh token and invalidates the old one.
- A **30-second grace window** is allowed after rotation to tolerate network retries.
- Refresh tokens are tracked as a **family**; if a previously used token is replayed, the entire family is revoked.
- Refresh token records should include:
  - token ID
  - user ID
  - tenant ID
  - family ID
  - parent token ID
  - issued-at / rotated-at timestamps
  - revoked flag / revoked-at timestamp
  - last-used timestamp
  - grace-window expiry

This design satisfies SEC-2025-042 and the refresh token strategy in ADR-001.

---

### 3) Token validation middleware

We will implement shared validation middleware in `@payments/auth-middleware` for all API services.

#### Validation steps
1. **Extract token**
   - Read the `Authorization: Bearer <token>` header.
   - Reject missing or malformed headers.

2. **Parse JWT header**
   - Read `alg` and `kid`.
   - Reject any token whose `alg` is not exactly `RS256`.
   - Reject tokens missing `kid`.

3. **Fetch signing key**
   - Resolve the public key from the auth service JWKS endpoint.
   - Cache JWKS keys locally with expiration and background refresh.
   - Use `kid` to select the correct key.

4. **Verify signature**
   - Verify the RS256 signature using the selected public key.

5. **Validate standard claims**
   - `iss` must equal `payments-auth`
   - `aud` must include `payments-api`
   - `exp` must be in the future
   - `iat` must not be unreasonably far in the future
   - Optionally validate `nbf` if present

6. **Check revocation**
   - Consult the deny-list for revoked access token `jti` values when required.
   - Use Redis-backed revocation state with TTL aligned to token expiry.

7. **Attach auth context**
   - Populate request context with:
     - `userId`
     - `tenantId`
     - `roles`
     - `permissions`
     - `tokenId`
   - Downstream handlers use this context for authorization and auditing.

#### Failure behavior
- Authentication failures must return **RFC 9457 Problem Details** with `Content-Type: application/problem+json`.
- Typical error types:
  - `/errors/authentication-required`
  - `/errors/permission-denied`
- Do not return custom JSON error shapes.

#### Middleware implementation notes
- Cache JWKS responses to avoid per-request network calls.
- Fail closed for invalid tokens.
- If JWKS is temporarily unavailable, use cached keys when valid; otherwise reject authentication.
- Log failures with correlation IDs, but do not log raw tokens or secrets.

---

### 4) Error handling

Authentication errors must conform to RFC 9457 Problem Details.

Example:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "The access token is missing, expired, or invalid.",
  "instance": "/v1/payments"
}
```

For authorization failures:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "The token does not include the required permission: payments:create.",
  "instance": "/v1/payments"
}
```

---

## Consequences

### Positive
- Meets the critical security requirement to avoid HS256.
- Supports stateless validation across services.
- Limits token issuance to the auth service only.
- Enables key rotation via JWKS without coordinated secret sharing.
- Provides a clear, reusable middleware package for all services.
- Supports replay-resistant refresh token rotation.
- Aligns with the API specification, ADR-001, ADR-002, and ADR-003.

### Negative / trade-offs
- RS256 tokens are larger and slightly slower to verify than HS256, but this is acceptable for the security benefits.
- JWKS availability becomes part of the validation path, so caching and operational monitoring are required.
- Refresh token storage is stateful and must be protected carefully.
- Access token revocation is not fully instantaneous unless the deny-list is consulted; short token lifetime mitigates this risk.

### Operational requirements
- The auth service must publish a JWKS endpoint at `/.well-known/jwks.json`.
- Key rotation must be automated and coordinated with JWKS cache expiry.
- The middleware package must be shared and versioned consistently across services.
- Authentication and authorization failures must always return RFC 9457 Problem Details responses.

### Implementation summary
- **Signing:** RS256 only
- **Access token lifetime:** 15 minutes
- **Refresh tokens:** opaque, rotated on every use, family-based replay detection
- **Validation:** JWKS-backed RS256 verification plus claim checks and revocation checks
- **Errors:** RFC 9457 Problem Details only

If you want, I can turn this ADR into a concrete implementation plan next, including TypeScript interfaces, middleware pseudocode, and JWKS/refresh-token data models.

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR-004: Rate Limiting for the Payments API

## Status
Proposed

## Date
2026-03-26

## Context

The Payments API requires rate limiting to protect backend services, enforce fair usage across tenants, and satisfy partner SLA obligations. The API specification and prior architecture decisions establish several constraints:

- All endpoints are rate-limited.
- Rate limits apply per API key or per user JWT.
- JWT authentication uses **RS256** only, with claims including `tenant_id`.
- Error responses must use **RFC 9457 Problem Details**.
- `429 Too Many Requests` responses must include `Retry-After`.
- The system already uses Redis, and the architecture log specifies a **dedicated Redis cluster** for rate limiting, separate from session storage.
- The security review recommends rate limit headers on all responses, not just 429s, to support proactive client backoff.

We need a design that is accurate enough to prevent burst abuse, efficient at scale, and consistent with the existing architecture.

## Decision

We will implement **sliding window counter** rate limiting, keyed by authenticated principal and tenant, with Redis-backed state and RFC 9457-compliant 429 responses.

### 1) Algorithm Choice: Sliding Window Counter

We will use the **sliding window counter** algorithm.

#### Why this algorithm

We considered three common approaches:

1. **Fixed window**
   - Simple, but allows boundary bursts.
   - A client can effectively send up to 2× the limit at the edge of a window.
   - Not acceptable for partner-facing APIs where fairness matters.

2. **Sliding window log**
   - Very accurate.
   - Requires storing every request timestamp.
   - Too memory-intensive for a high-throughput API.

3. **Sliding window counter**
   - Uses O(1) memory per key.
   - Smooths boundary behavior by blending current and previous window counts.
   - Good trade-off between accuracy and operational cost.

#### Algorithm

For each key:

```text
effective_count = previous_window_count × overlap_ratio + current_window_count
```

Where:

```text
overlap_ratio = (window_size - elapsed_in_current_window) / window_size
```

A request is allowed if `effective_count < limit`.

#### Storage

Rate limit state will be stored in Redis using the ADR-002 key pattern:

```text
rl:{scope}:{identifier}:{window_start}
```

Keys expire after `2 × window_size`.

This matches the existing architecture decision to use a dedicated Redis cluster for rate limiting.

---

### 2) Rate Limit Response Headers

We will include rate limit headers on **all authenticated responses**, and on 429 responses as required by the API spec and partner SLA.

#### Standard headers

- `X-RateLimit-Limit`: maximum requests allowed in the current window
- `X-RateLimit-Remaining`: remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the current window resets
- `Retry-After`: seconds until retry is allowed; **required on 429 responses**

#### Behavior

- On successful requests:
  - Include `X-RateLimit-Limit`
  - Include `X-RateLimit-Remaining`
  - Include `X-RateLimit-Reset`
  - Do **not** include `Retry-After`

- On `429 Too Many Requests`:
  - Include all of the above
  - Include `Retry-After`

#### Error format for 429

All 429 responses will use **RFC 9457 Problem Details** with:

- `type`: `https://api.payments.example/errors/rate-limited`
- `title`: `Rate Limit Exceeded`
- `status`: `429`
- `detail`: human-readable explanation
- `instance`: request path
- extension field `retry_after`: seconds until retry

This is required by ADR-003.

---

### 3) Interaction with Authentication

Rate limiting will be applied **after authentication** for authenticated endpoints, because the principal identity is needed to determine the correct limit scope.

#### Primary scoping rules

We will rate limit by the most specific authenticated identity available:

1. **JWT-authenticated requests**
   - Scope by `tenant_id` and user identity (`sub`)
   - This prevents one user from consuming another user’s quota within the same tenant
   - Tenant-level tier lookup determines the applicable limit

2. **API key-authenticated requests**
   - Scope by API key identifier
   - API keys are already scoped to specific operations and are intended for server-to-server usage
   - Rate limits are applied independently per API key

#### Why not rate limit only by IP

IP-based limiting is too coarse for our use case:
- Shared NATs can cause false positives
- Mobile clients and enterprise proxies can rotate IPs
- It does not align with tenant-based billing and partner contracts

#### JWT-specific identity

For JWTs, the middleware already validates:
- signature
- expiry
- audience
- issuer

Per the auth architecture, JWTs are RS256-signed and include `tenant_id`. Rate limiting will use:
- `tenant_id` for tier selection
- `sub` for principal identity

This ensures the rate limiter is consistent with the auth module and does not depend on token internals beyond validated claims.

#### API key-specific identity

For API keys:
- Use the hashed key record’s stable identifier as the rate limit key
- Do not use the raw API key value
- Do not infer tenant from the key unless the key record explicitly carries tenant association

#### Anonymous requests

The API specification says all endpoints require authentication. If an unauthenticated request reaches the rate limiter, it should be treated as an authentication failure, not rate-limited.

---

### 4) Tier Resolution

Rate limits are determined by tenant tier:

- Standard: 100 requests/minute
- Premium: 500 requests/minute
- Enterprise: custom

#### JWT requests
- Resolve tier from `tenant_id`
- Use Redis-cached tier lookup
- Fall back to the source of truth if cache misses

#### API key requests
- Resolve tier from the API key’s associated tenant or plan
- If the API key is tied to a tenant, use that tenant’s tier
- If the key has an explicit override, honor the override

#### Custom enterprise limits
- Enterprise tenants may have custom limits stored in configuration or tenant metadata
- The rate limiter must support per-tenant overrides without code changes

---

## Consequences

### Positive
- Prevents burst abuse better than fixed windows
- Uses bounded memory and Redis efficiently
- Aligns with existing Redis architecture
- Supports tenant-based billing and partner SLA requirements
- Produces standardized error responses via RFC 9457

### Negative
- Slight approximation at window boundaries
- Requires Redis availability for precise enforcement
- Adds dependency on authenticated identity before rate limiting can be applied

### Operational behavior on Redis failure
Per the architecture decision log, if Redis is unavailable, the system will **fail open** with warning-level logging for the initial release.

This is a deliberate availability trade-off:
- Prefer temporary over-limit requests over blocking all traffic
- Log and monitor Redis failures aggressively
- Revisit this policy after production traffic data is available

---

## Implementation Notes

- Implement rate limiting as middleware after authentication middleware.
- Use a dedicated Redis cluster for rate limiting state.
- Emit rate limit headers on all authenticated responses.
- Return RFC 9457 Problem Details for 429 responses.
- Ensure `Retry-After` is always present on 429 responses.
- Keep the algorithm and headers consistent with ADR-002 and ADR-003.
- Do not introduce any custom error format.

---

## Alternatives Considered

### Fixed window
Rejected due to boundary burst abuse.

### Sliding window log
Rejected due to memory overhead and operational cost.

### Token bucket
Rejected for this phase because it is less aligned with the existing ADR-002 decision and would require a separate policy discussion to define header semantics and reset behavior.

---

## Open Questions

1. Whether to expose separate per-route limits in the future.
2. Whether enterprise tenants should be able to configure burst allowances independently of sustained rate.
3. Whether to move from fail-open to fail-closed after the initial release.

For this phase, the above design is sufficient and consistent with the current architecture.

---

## Phase: Error Handling Refactor

### Agent Output

## Refactored Error Handling Design

### Goals
Create one global error handling strategy that:
- Uses **RFC 9457 Problem Details** for every error response
- Preserves **rate limit headers**, including `Retry-After` on 429s
- Correctly distinguishes **401 Unauthorized** vs **403 Forbidden**
- Avoids leaking internal implementation details
- Remains consistent with the auth and rate limiting decisions already made

---

### 1) Global error response contract

All API errors must return:

- `Content-Type: application/problem+json`
- RFC 9457 body with:
  - `type`
  - `title`
  - `status`
  - `detail`
  - `instance`
- Optional extension fields:
  - `trace_id`
  - `validation_errors`
  - `retry_after` for rate limit responses

Example:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "detail": "The request body contains invalid fields.",
  "instance": "/v1/payments",
  "trace_id": "req_01HXYZ..."
}
```

---

### 2) Centralized error taxonomy

Introduce a shared error model in the API layer:

#### Base application errors
- `ValidationError` → 400
- `AuthenticationRequiredError` → 401
- `PermissionDeniedError` → 403
- `NotFoundError` → 404
- `ConflictError` → 409
- `IdempotencyConflictError` → 409
- `RateLimitError` → 429
- `UpstreamDependencyError` → 502
- `InternalServerError` → 500

Each error maps to a stable Problem Details `type` URI from the registry.

---

### 3) Authentication error handling

#### 401 Unauthorized
Return 401 when:
- No credentials are provided
- Bearer token is missing
- JWT is invalid
- JWT is expired
- JWT signature verification fails
- API key is missing or malformed

Response should include:
- `WWW-Authenticate` when applicable for bearer auth
- Problem Details body with type:
  - `https://api.payments.example/errors/authentication-required`

Example:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "Valid authentication credentials were not provided.",
  "instance": "/v1/payments"
}
```

#### 403 Forbidden
Return 403 when:
- Credentials are valid
- User/API key is authenticated
- But the caller lacks permission for the requested operation

Use:
- `https://api.payments.example/errors/permission-denied`

Example:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "You do not have permission to confirm this payment.",
  "instance": "/v1/payments/pay_xyz789/confirm"
}
```

---

### 4) Rate limit error handling

When a request is rate-limited:

- Return **429**
- Use Problem Details type:
  - `https://api.payments.example/errors/rate-limited`
- Include required headers:
  - `Retry-After: <seconds>`
  - `X-RateLimit-Limit: <max>`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: <unix_timestamp>`

Example response headers:
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1760000123
```

Example body:
```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limited",
  "status": 429,
  "detail": "Too many requests. Please retry after 12 seconds.",
  "instance": "/v1/payments",
  "retry_after": 12
}
```

---

### 5) Validation and domain error handling

#### Validation failures
- Return 400
- Use `validation-failed`
- Include `validation_errors`

#### Domain errors
Map business failures to registry types:
- insufficient funds → 402
- card declined → 402
- invalid payment method → 400
- idempotency conflict → 409

Example:
```json
{
  "type": "https://api.payments.example/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 402,
  "detail": "The payment method does not have sufficient funds.",
  "instance": "/v1/payments/pay_xyz789/confirm"
}
```

---

### 6) Internal and upstream errors

For unexpected exceptions:
- Return 500
- Use a generic internal error type
- Do not expose stack traces, SQL errors, service names, or secrets
- Log full details server-side with trace correlation

For upstream gateway failures:
- Return 502
- Use a gateway/dependency error type
- Keep detail user-safe and non-sensitive

---

### 7) Middleware flow

Implement a single global error pipeline:

1. **Request context middleware**
   - Generate `trace_id`
   - Attach request path as `instance`

2. **Auth middleware**
   - Validate JWT/API key
   - Throw 401 on missing/invalid credentials
   - Throw 403 on insufficient permissions

3. **Rate limit middleware**
   - Evaluate sliding window counter
   - On limit exceeded, throw `RateLimitError` with computed headers

4. **Route handlers**
   - Throw typed domain errors only
   - Never write ad hoc error JSON directly

5. **Global error handler**
   - Normalize all errors into RFC 9457
   - Set headers
   - Set content type
   - Ensure no custom format escapes

---

### 8) Implementation rules

- No route may return custom error JSON
- No middleware may send error responses directly except through the global handler
- All thrown errors must be mapped to a known Problem Details type
- Unknown errors default to 500 with a generic internal type
- Rate limit metadata must be attached before serialization so headers are preserved
- Authentication middleware must not conflate 401 and 403

---

## Checklist Verifying Consistency with Prior Decisions

### Phase 1: Authentication
- [x] JWT validation remains **RS256 only**
- [x] No HS256 fallback or shared-secret validation path exists
- [x] Auth errors return **401** for missing/invalid credentials
- [x] Auth errors return **403** only for authenticated-but-unauthorized access
- [x] JWKS-based validation remains compatible with the design
- [x] No auth secrets are exposed to client-side code

### Phase 2: Rate Limiting
- [x] Sliding window counter remains the rate limiting algorithm
- [x] 429 responses include **Retry-After**
- [x] 429 responses include `X-RateLimit-Limit`
- [x] 429 responses include `X-RateLimit-Remaining: 0`
- [x] 429 responses include `X-RateLimit-Reset`
- [x] Rate limit errors use RFC 9457 Problem Details
- [x] Redis failure behavior can still fail open with logging, without breaking error format

### Error Handling ADR
- [x] All error responses use `application/problem+json`
- [x] No custom error format is used anywhere
- [x] Problem Details fields are present on every error
- [x] Extension fields are limited and purposeful
- [x] Error type URIs align with the registry

### Security Constraints
- [x] No HS256 auth tokens are introduced
- [x] No webhook signing secrets are exposed client-side
- [x] No internal stack traces or sensitive backend details are returned to clients
- [x] Error responses do not leak implementation details

---

## Deployment Readiness Assessment

### Status: **Conditionally Ready**

The design is ready for implementation and deployment **if** the following are completed and verified:

#### Must complete before deployment
- Implement the global error middleware
- Replace all route-level custom error responses
- Add tests for:
  - 401 vs 403 behavior
  - 429 headers
  - RFC 9457 serialization
  - fallback 500 handling
- Verify all existing endpoints emit `application/problem+json` on failure
- Confirm rate limit middleware passes header metadata through the error pipeline

#### Risks to resolve
- Legacy handlers may still emit non-compliant JSON if not fully migrated
- Some upstream dependency errors may need explicit mapping to avoid generic 500s
- Client integrations may need notification of the new standardized error format if they currently parse custom errors

### Final assessment
- **Authentication consistency:** Pass
- **Rate limiting consistency:** Pass
- **Error format consistency:** Pass
- **Security compliance:** Pass
- **Production readiness:** Pending implementation and test verification

If you want, I can next turn this into a concrete Express/TypeScript middleware design with error classes and example code.

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