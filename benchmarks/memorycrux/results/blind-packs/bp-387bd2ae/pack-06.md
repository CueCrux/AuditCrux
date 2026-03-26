# Blind Evaluation Pack: pack-06
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR-004: Authentication Module — JWT Access Tokens with RS256

## Status
Accepted

## Context

The Payments API requires an authentication module that supports:

- Stateless validation across multiple services
- Fine-grained authorization via roles and permissions
- Secure token issuance and verification in a microservices architecture
- Compliance with the 2025-Q4 security review findings

Relevant inputs reviewed:

- **Payments API Specification v2**
- **2025-Q4 Security Review — Authentication Findings**
- **ADR-001: JWT Authentication with RS256 Signing**
- **Team Architecture Decisions Log (Auth Deep Dive)**
- **PCI-DSS Compliance Summary**

The security review explicitly rejected HS256 for JWT signing because it requires sharing a single symmetric secret across all validating services, which creates an unacceptable blast radius if any service is compromised. The architecture also requires a JWKS endpoint for public key distribution and shared validation middleware across services.

## Decision

### 1) Token signing algorithm

We will sign JWT access tokens with **RS256** only.

#### Why RS256
- **Meets the security requirement** from SEC-2025-041.
- **Avoids shared signing secrets** across services.
- **Separates issuance from validation**:
  - Auth service holds the **private key**
  - All other services validate using the **public key** via JWKS
- **Supports key rotation** cleanly through `kid`-based JWKS publishing
- **Aligns with ADR-001** and the team auth deep-dive decision

#### Explicitly rejected
- **HS256**: rejected due to shared-secret blast radius and inability to distinguish issuers from validators.
- **Other algorithms**: not selected because RS256 is already the accepted architecture decision and has broad library support.

---

### 2) JWT token structure

We will issue **JWT access tokens** with the following claims:

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

#### Required claims
- `sub`: stable user identifier
- `iss`: issuer, fixed to `payments-auth`
- `aud`: audience, fixed to `payments-api`
- `iat`: issued-at timestamp
- `exp`: expiration timestamp
- `jti`: unique token ID for revocation/deny-list support
- `roles`: coarse-grained authorization roles
- `permissions`: fine-grained authorization permissions
- `tenant_id`: tenant scoping for rate limiting and authorization

#### Expiry
- **Access token lifetime: 15 minutes**
- Short-lived access tokens reduce exposure if a token is stolen
- This matches the API specification and the team’s security posture

#### Refresh strategy
Refresh tokens are **opaque**, not JWTs.

We will use:
- **Server-side storage** for refresh token metadata
- **Rotation on every use**
- **Family tracking** for replay detection
- **30-second grace window** after rotation to tolerate retries/network duplication

Behavior:
1. Client presents refresh token.
2. Auth service validates it server-side.
3. Auth service issues:
   - a new RS256-signed access token
   - a new opaque refresh token
4. The old refresh token is invalidated.
5. If an already-used refresh token is replayed outside the grace window, the **entire token family is revoked**.

This design satisfies SEC-2025-042 and the refresh token strategy in ADR-001.

---

### 3) Token validation middleware

All services will use a shared middleware package, `@payments/auth-middleware`, to validate JWTs consistently.

#### Middleware responsibilities
1. **Extract token**
   - Read `Authorization: Bearer <token>`

2. **Fetch signing keys**
   - Validate JWT signature using the public key from the auth service JWKS endpoint:
     - `/.well-known/jwks.json`

3. **Verify cryptographic integrity**
   - Enforce **RS256 only**
   - Reject tokens signed with any other algorithm
   - Use `kid` to select the correct public key

4. **Validate standard claims**
   - `iss === "payments-auth"`
   - `aud === "payments-api"`
   - `exp` not expired
   - `iat` is reasonable and not in the future beyond allowed skew

5. **Validate authorization context**
   - Attach decoded claims to request context
   - Enforce route-level permission checks
   - Enforce tenant scoping using `tenant_id`

6. **Handle revoked tokens**
   - Check `jti` against deny-list when required
   - Support token revocation for logout, compromise, or family invalidation

7. **Return standardized errors**
   - Authentication failures must use **RFC 9457 Problem Details**
   - 401 for missing/invalid/expired tokens
   - 403 for valid tokens lacking required permissions

#### Middleware output
On success, the middleware populates request context with:
- user ID (`sub`)
- tenant ID (`tenant_id`)
- roles
- permissions
- token ID (`jti`)

#### Error handling requirements
All auth errors must be returned as `application/problem+json` per ADR-003. No custom error payloads are permitted.

---

## Consequences

### Positive
- Stronger security posture than symmetric signing
- No shared signing secret across services
- Clean support for distributed validation
- Key rotation is manageable via JWKS
- Access tokens remain short-lived and stateless
- Refresh token replay protection is built in
- Middleware can be reused across services for consistent behavior

### Negative / trade-offs
- RS256 tokens are larger than HS256 tokens
- Validation requires JWKS availability and caching
- Auth service becomes the issuer of record and must be highly available
- Refresh token handling requires server-side state and family tracking

### Implementation notes for future developers
- Do **not** introduce HS256 for convenience or test shortcuts
- Do **not** expose private keys outside the auth service
- Do **not** store refresh tokens as JWTs
- Do **not** bypass the shared middleware in downstream services
- Ensure all auth failures conform to RFC 9457 Problem Details
- Ensure token validation rejects any algorithm other than RS256

### Operational notes
- Publish public keys through JWKS with `kid`
- Cache JWKS responses to reduce latency and dependency pressure
- Rotate keys without downtime by overlapping old and new keys during transition
- Monitor token validation failures and refresh replay events as security signals

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

The Payments API needs rate limiting to protect backend services, enforce fair usage across tenants, and meet SLA commitments to API consumers. The API specification and prior architecture decisions establish several constraints:

- Authentication uses **JWT Bearer tokens signed with RS256** and **API keys** for server-to-server integrations.
- Rate limiting must apply to **all endpoints**.
- Rate limiting state is stored in **Redis**.
- The system must support **tiered limits** based on tenant/customer entitlement.
- Rate limiting responses must include **`Retry-After`** on HTTP 429 responses.
- All error responses must use **RFC 9457 Problem Details** (`application/problem+json`).
- The implementation must be consistent with the existing auth architecture and must not weaken token security.

## Decision

We will implement **sliding window counter** rate limiting, with limits enforced per authenticated principal and tier.

### 1) Algorithm Choice

We will use a **sliding window counter** algorithm.

#### Why this algorithm

We evaluated the common options:

- **Fixed window**
  - Simple, but allows burst abuse at window boundaries.
  - Not acceptable for a payments API where burst fairness matters.

- **Sliding window log**
  - Accurate, but stores every request timestamp.
  - Too memory-intensive and operationally expensive at scale.

- **Sliding window counter**
  - Uses O(1) memory per key.
  - Smooths boundary bursts while remaining efficient.
  - Matches the prior architecture decision in ADR-002.

#### Decision rationale

Sliding window counter is the best fit because it:
- prevents boundary burst abuse better than fixed windows,
- keeps Redis storage bounded,
- is straightforward to implement in middleware,
- aligns with ADR-002, which already selected this algorithm.

### 2) Rate Limit Scope and Identity

Rate limits will be enforced based on the authenticated caller:

- **JWT-authenticated requests**: rate limit per **tenant_id** and optionally per user identity if needed for future fine-grained controls.
- **API key-authenticated requests**: rate limit per **API key identifier**.

#### Primary rule

The rate limit key will be derived from the authentication mechanism:

- JWT: `rl:user:{tenant_id}` or `rl:tenant:{tenant_id}` depending on the configured policy tier
- API key: `rl:apikey:{key_id}`

#### Recommended default

For the initial implementation, enforce limits at the **tenant level for JWTs** and at the **API key level for API keys**.

This is consistent with the API spec, which states:
- “Rate limits are applied per API key or per user JWT.”
- Tier is determined from the JWT `tenant_id` claim and a Redis-cached tier lookup.

#### Why tenant-level for JWTs

- The spec explicitly ties tiering to `tenant_id`.
- It avoids unfairly splitting usage across multiple users in the same tenant.
- It matches commercial billing and entitlement boundaries better than per-user limits.

#### Why API-key-level for API keys

- API keys are already scoped to server-to-server integrations.
- Per-key limits provide clear isolation and easier operational attribution.
- It prevents one integration credential from starving another.

### 3) Tier Resolution

Tier will be resolved as follows:

1. If the request uses a JWT:
   - validate the token using the existing **RS256** auth middleware,
   - extract `tenant_id`,
   - look up the tenant tier from Redis cache,
   - fall back to the configured default tier if no cached tier exists.

2. If the request uses an API key:
   - identify the key,
   - resolve its assigned rate limit policy from the API key store or cache.

#### Tier defaults

- Standard: 100 requests/minute
- Premium: 500 requests/minute
- Enterprise: custom

Burst allowance will be supported as defined in ADR-002.

### 4) Response Headers

All responses from rate-limited endpoints will include rate limit headers.

#### On successful requests and non-429 responses

Include:
- `X-RateLimit-Limit`: maximum requests per window
- `X-RateLimit-Remaining`: remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the current window resets

#### On 429 responses

Include all of the above, plus:
- `Retry-After`: number of seconds until the client should retry

This is mandatory per the partner SLA and the API specification.

#### Header semantics

- `X-RateLimit-Limit` reflects the configured effective limit for the caller’s tier.
- `X-RateLimit-Remaining` reflects the computed remaining requests after applying the sliding window estimate.
- `X-RateLimit-Reset` reflects the next reset boundary used for client backoff calculations.
- `Retry-After` is computed from the same reset boundary and must be present on every 429.

### 5) Error Format for Rate Limit Responses

Rate limit failures will return:

- HTTP status: `429 Too Many Requests`
- Content-Type: `application/problem+json`
- Problem type: `https://api.payments.example/errors/rate-limited`

The response body will include:
- `type`
- `title`
- `status`
- `detail`
- `instance`
- extension field `retry_after` matching the `Retry-After` header

This is required by ADR-003 and the error-handling guidance.

### 6) Redis Storage and Expiry

Rate limit state will be stored in Redis using the ADR-002 key pattern:

```text
rl:{scope}:{identifier}:{window_start}
```

Keys will expire after **2× the window duration**.

This supports:
- bounded memory usage,
- sliding window calculations,
- safe cleanup of stale counters.

### 7) Failure Handling

If Redis is unavailable, the rate limiter will **fail open** with warning-level logging.

#### Why fail open

- The architecture decision log explicitly states that rate limiting should fail open on Redis failure for the initial release.
- This avoids turning a Redis outage into a full API outage.
- It preserves availability while still logging the incident for operational follow-up.

## Consequences

### Positive

- Smooth, fair rate limiting without fixed-window burst abuse.
- Efficient Redis usage with O(1) memory per key.
- Clear separation between JWT and API key enforcement.
- Consistent with RS256 auth architecture and tenant-based entitlement model.
- Compliant with partner SLA and RFC 9457 error requirements.

### Negative

- Slight approximation at window boundaries.
- Requires Redis availability for accurate enforcement.
- Adds middleware complexity for identity extraction and tier resolution.

### Operational Notes

- The rate limiter must run **after authentication** so it can derive the caller identity and tier.
- The middleware must not assume HS256 or any shared-secret JWT validation; it must rely on the existing RS256 auth middleware.
- Rate limit headers should be attached consistently across all endpoints.
- 429 responses must always include `Retry-After`.

## Implementation Notes

1. Authenticate request using existing auth middleware.
2. Determine principal:
   - JWT → tenant_id
   - API key → key identifier
3. Resolve tier and effective limit.
4. Read/update Redis counters using sliding window counter logic.
5. Compute remaining quota and reset timestamp.
6. If over limit:
   - return 429 Problem Details,
   - include `Retry-After`,
   - include rate limit headers.
7. If within limit:
   - continue request,
   - include rate limit headers in the response.

## Open Questions

- Whether future versions should support per-user JWT limits in addition to tenant-level limits.
- Whether enterprise customers should be able to configure custom burst allowances per endpoint.

For the initial release, tenant-level JWT limits and API-key-level limits are sufficient and consistent with the current specification.

---

## Phase: Error Handling Refactor

### Agent Output

## Refactored Error Handling Design

### Goals
Create one unified error-handling pipeline for the entire Payments API that:

- Uses **RFC 9457 Problem Details** for every error response
- Preserves **rate limiting requirements** including `Retry-After`
- Distinguishes **authentication** failures from **authorization** failures
- Avoids leaking internal implementation details
- Works consistently across Express middleware, route handlers, validation, auth, rate limiting, and webhook verification

---

### 1) Global Error Handling Strategy

#### A. Standard error response shape
All errors must return:

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
  - `retry_after`

#### B. Centralized error mapping layer
Introduce a single error translation layer that converts internal errors into Problem Details.

Example categories:

- Validation errors → `400`
- Authentication failures → `401`
- Authorization failures → `403`
- Not found → `404`
- Conflict/idempotency → `409`
- Rate limit exceeded → `429`
- Upstream gateway/payment processor failures → `502`
- Unexpected/unhandled errors → `500`

#### C. Global Express error middleware
Add a final Express error handler that:

1. Catches all uncaught route/middleware errors
2. Logs the full internal error with correlation metadata
3. Maps the error to a registered Problem Details type
4. Returns a sanitized RFC 9457 response
5. Suppresses stack traces in production

#### D. Request correlation
Every request should carry a `trace_id`:

- Generated at request entry if absent
- Propagated through logs and error responses
- Included in Problem Details as an extension field

---

### 2) Rate Limit Error Handling

#### Required behavior on 429
When rate limiting triggers, the response must include:

- `Retry-After: <seconds>`
- `X-RateLimit-Limit: <max>`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: <unix_timestamp>`

And the body must be:

- `Content-Type: application/problem+json`
- `type: https://api.payments.example/errors/rate-limited`
- `retry_after` extension field matching the header value

#### Implementation rule
The rate limiting middleware should not emit ad hoc JSON. It should construct a Problem Details response directly or throw a typed rate-limit error that the global handler converts into the correct response.

#### Non-429 responses
For successful requests, include rate limit headers as specified by the API spec and ADR-002, but omit `Retry-After`.

---

### 3) Authentication Error Handling

#### Distinguish 401 vs 403
Authentication and authorization must be separated clearly:

##### 401 Unauthorized
Use when the client is not authenticated or authentication failed:
- Missing token
- Malformed token
- Expired token
- Invalid signature
- Wrong issuer/audience
- Invalid API key

Suggested Problem Details types:
- `/errors/authentication-required`
- `/errors/invalid-token`
- `/errors/token-expired`

##### 403 Forbidden
Use when the token is valid but lacks permission:
- Missing required scope
- Missing required role
- Tenant access denied
- Operation not allowed for this API key

Suggested Problem Details type:
- `/errors/permission-denied`

#### Important
Do not leak whether a user exists, whether a token was “almost valid,” or any cryptographic details. Keep details user-safe and operationally useful.

---

### 4) Validation and Domain Error Handling

#### Validation failures
Return `400` with:

- `type: https://api.payments.example/errors/validation-failed`
- `validation_errors` array
- Human-readable `detail`

#### Domain errors
Map business-rule failures to registered Problem Details types, for example:

- insufficient funds
- card declined
- invalid payment method
- idempotency conflict
- refund exceeds amount
- subscription not found
- webhook verification failed

#### Unexpected errors
Any unhandled exception becomes:

- `500 Internal Server Error`
- generic Problem Details response
- no stack trace in production
- full internal logging only

---

### 5) Webhook Verification Errors

Stripe webhook verification must remain **server-side only**.

If verification fails:
- return a Problem Details error
- use a dedicated type such as `/errors/webhook-verification-failed`
- do not expose signing secret, signature internals, or raw verification output

This respects the critical constraint that the webhook signing secret never reaches client-side code.

---

### 6) Error Type Registry

Ensure all error types are registered and documented under:

`https://api.payments.example/errors/`

Minimum registry entries should include:

- `/errors/insufficient-funds`
- `/errors/card-declined`
- `/errors/invalid-payment-method`
- `/errors/rate-limited`
- `/errors/authentication-required`
- `/errors/permission-denied`
- `/errors/idempotency-conflict`
- `/errors/validation-failed`
- `/errors/subscription-not-found`
- `/errors/refund-exceeds-amount`
- `/errors/webhook-verification-failed`

---

## Checklist Verifying Consistency with Prior Decisions

### Phase 1: Authentication
- [x] JWT signing remains **RS256 only**
- [x] No HS256 usage introduced
- [x] JWKS-based validation remains compatible
- [x] Authentication failures return **401**
- [x] Authorization failures return **403**
- [x] No sensitive token or key material is exposed in errors

### Phase 2: Rate Limiting
- [x] Sliding window counter remains the rate limiting algorithm
- [x] `Retry-After` is included on every `429`
- [x] `X-RateLimit-Limit` is included
- [x] `X-RateLimit-Remaining` is included
- [x] `X-RateLimit-Reset` is included
- [x] Rate limit errors use RFC 9457 format
- [x] `retry_after` extension matches the header value

### Error Handling ADRs
- [x] All errors use `application/problem+json`
- [x] No custom error formats are used
- [x] Problem Details fields are present
- [x] `validation_errors` extension is supported
- [x] `trace_id` is included for observability
- [x] Stack traces are suppressed in production

### Security Constraints
- [x] RS256 compliance requirement is preserved
- [x] Stripe webhook signing secret remains server-side only
- [x] No client-side webhook verification is introduced
- [x] Error responses do not leak internal service names or secrets
- [x] Error handling does not weaken PCI-related logging restrictions

### Operational Requirements
- [x] Rate limit responses satisfy partner SLA
- [x] Error responses are consistent across endpoints
- [x] Internal errors are logged for debugging
- [x] Public responses remain sanitized

---

## Deployment Readiness Assessment

### Status: **Conditionally Ready**

The design is ready for implementation, but deployment should wait until the following are completed and verified:

#### Must complete before release
- [ ] Global Express error middleware implemented
- [ ] All route handlers migrated to throw/return typed errors
- [ ] Rate limiting middleware updated to emit Problem Details + `Retry-After`
- [ ] Auth middleware updated to distinguish 401 vs 403
- [ ] Validation middleware updated to emit `validation_errors`
- [ ] Error type registry updated with missing types
- [ ] Integration tests added for 401/403/429/500 paths
- [ ] Production logging verified to exclude stack traces and secrets

#### Verification tests required
- [ ] 401 for missing/invalid/expired JWT
- [ ] 403 for valid JWT lacking permission
- [ ] 429 includes `Retry-After`
- [ ] All errors return `application/problem+json`
- [ ] `trace_id` appears in error responses
- [ ] Webhook verification failure is server-side only
- [ ] No endpoint returns legacy `{ error: ... }` or `{ code: ... }` formats

### Risk assessment
- **Low architectural risk**: aligns with ADR-003 and existing API spec
- **Medium implementation risk**: legacy handlers may still emit non-standard errors until fully migrated
- **Low security risk**: design preserves RS256 and server-side webhook verification
- **Low compliance risk**: rate limit headers and Problem Details requirements are explicitly satisfied

### Final recommendation
Proceed with implementation, but do **not** deploy until the migration checklist is green and integration tests confirm:
- RFC 9457 everywhere
- `Retry-After` on every 429
- 401/403 separation
- no HS256 or client-side webhook secret exposure

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