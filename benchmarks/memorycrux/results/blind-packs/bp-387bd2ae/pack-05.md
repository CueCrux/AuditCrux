# Blind Evaluation Pack: pack-05
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR: Authentication Module for Payments API

**Status:** Accepted

## Context

We need an authentication design for the Payments API that is secure, practical for service-to-service/API use, and understandable for future maintainers.

Available organisational memory was sparse, but one critical active constraint was present from the security review:

- **Auth tokens must use RS256, not HS256**
- Reason: security finding **SEC-2025-041** explicitly rejected HS256 because it requires sharing the signing secret with every validating service, increasing blast radius.

Additional relevant constraint:

- Error responses must use **RFC 9457 Problem Details** format.

Because prior API spec artefacts and checkpoints were not available in memory, this ADR establishes the baseline design for the auth module using the active security constraint and standard payments-grade API security practices.

## Decision

### 1. Token signing algorithm

We will use **RS256** for signing JWT access tokens.

#### Justification
- It is a **critical organisational constraint**.
- RS256 uses **asymmetric cryptography**:
  - the auth service keeps the **private key**
  - validating services use the **public key**
- This avoids distributing a shared signing secret to multiple services, which was the main reason HS256 was rejected in SEC-2025-041.
- It supports safer key distribution and rotation through a JWKS/public-key mechanism.

#### Rejected alternatives
- **HS256**: rejected by security review and active policy.
- **ES256**: technically viable, but not selected because the explicit organisational requirement mandates RS256.

---

### 2. JWT token structure

We will issue:

- **Short-lived JWT access tokens**
- **Opaque refresh tokens** stored and managed server-side
- **Refresh token rotation** on every successful refresh

#### Access token format

Header:
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2026-01"
}
```

Payload claims:
```json
{
  "iss": "https://auth.payments.internal",
  "sub": "user_or_client_id",
  "aud": "payments-api",
  "exp": 1710000000,
  "nbf": 1709996400,
  "iat": 1709996400,
  "jti": "uuid",
  "scope": "payments:read payments:write",
  "client_id": "public-or-confidential-client-id",
  "token_type": "access"
}
```

#### Required claims
- **iss**: token issuer; must exactly match the auth service
- **sub**: subject identifier; user ID or service/client ID
- **aud**: intended audience; must be `payments-api`
- **exp**: expiry time
- **nbf**: not-before time
- **iat**: issued-at time
- **jti**: unique token ID for traceability and optional revocation support
- **scope**: granted permissions
- **client_id**: calling application/client identity
- **token_type**: set to `access`

#### Optional claims
Depending on final API needs, we may later add:
- `tenant_id`
- `merchant_id`
- `roles`

These are not included by default to keep tokens minimal and avoid overloading them with authorization state better handled server-side.

#### Expiry
- **Access token TTL: 15 minutes**

Rationale:
- Short enough to reduce risk if leaked
- Long enough to avoid excessive refresh churn for normal API clients
- Appropriate for a payments context where token misuse impact is high

---

### 3. Refresh strategy

We will use **opaque refresh tokens**, not JWT refresh tokens.

#### Refresh token properties
- Random, high-entropy, non-guessable value
- Stored hashed server-side
- Bound to:
  - subject
  - client_id
  - issued time
  - expiry
  - status
  - previous token lineage for rotation tracking

#### Refresh token TTL
- **30 days maximum**
- Shorter TTLs may be applied for higher-risk clients or privileged scopes

#### Rotation
On each successful refresh:
1. validate presented refresh token
2. issue new access token
3. issue new refresh token
4. invalidate the old refresh token
5. record token lineage for replay detection

#### Replay detection
If an already-rotated refresh token is presented again:
- treat as possible token theft/replay
- revoke the active token family/session
- require re-authentication

#### Why opaque refresh tokens
- Easier revocation
- Better replay detection
- No trust in long-lived self-contained bearer artifacts
- Better fit for payments/security-sensitive systems

---

### 4. Token validation middleware

We will implement centralized authentication middleware for the Payments API.

#### Middleware responsibilities

1. **Extract bearer token**
   - Read `Authorization: Bearer <token>`
   - Reject missing or malformed headers

2. **Parse JWT header**
   - Require `alg = RS256`
   - Require `kid`
   - Reject `none` or unexpected algorithms

3. **Resolve signing key**
   - Fetch matching public key by `kid`
   - Use cached JWKS/public keys with controlled refresh

4. **Verify signature**
   - Verify JWT signature using RS256 public key

5. **Validate standard claims**
   - `iss` must equal configured issuer
   - `aud` must include/exactly match `payments-api`
   - `exp` must be in the future
   - `nbf` must be in the past
   - `iat` must be reasonable
   - `token_type` must equal `access`

6. **Validate subject and client context**
   - `sub` must be present
   - `client_id` must be present if required by client model

7. **Validate authorization**
   - Parse `scope`
   - Ensure required scope is present for route/action

8. **Attach auth context**
   - Add normalized auth principal to request context, e.g.:
     - subject
     - client_id
     - scopes
     - jti

9. **Fail securely**
   - Return 401 for authentication failures
   - Return 403 for insufficient scope
   - Use **RFC 9457 Problem Details** response bodies

#### Middleware pseudocode

```text
authenticate(request):
  token = extract_bearer_token(request)
  if missing_or_malformed(token): return 401

  header = parse_jwt_header(token)
  if header.alg != "RS256": return 401
  if no header.kid: return 401

  public_key = key_store.get(header.kid)
  if not public_key: return 401

  claims = verify_rs256_signature_and_decode(token, public_key)
  if verification_failed: return 401

  validate_issuer(claims.iss)
  validate_audience(claims.aud, "payments-api")
  validate_exp_nbf_iat(claims)
  validate_token_type(claims.token_type == "access")
  validate_subject(claims.sub)

  required_scopes = route_required_scopes(request.route)
  if !has_scopes(claims.scope, required_scopes): return 403

  request.auth = {
    sub: claims.sub,
    client_id: claims.client_id,
    scopes: claims.scope,
    jti: claims.jti
  }

  continue
```

#### Additional implementation notes
- Allow small clock skew tolerance, e.g. **30–60 seconds**
- Do not trust token claims before signature verification
- Log authentication failures without logging raw tokens
- Support key rotation by honoring `kid`
- Prefer fail-closed behavior if key resolution or verification fails

---

## Consequences

### Positive
- Aligns with the critical security requirement to use **RS256**
- Reduces blast radius by keeping signing private keys centralized
- Short-lived access tokens reduce exposure from token leakage
- Opaque rotating refresh tokens provide strong revocation and replay handling
- Centralized middleware ensures consistent enforcement across endpoints
- `kid`-based validation supports operational key rotation

### Negative
- More operational complexity than HS256
- Requires key management infrastructure and public key distribution
- Refresh token storage and rotation require persistent server-side state
- Middleware must be carefully implemented to avoid subtle validation bugs

### Risks and mitigations
- **Risk:** key rotation outages  
  **Mitigation:** cache current and previous public keys; rotate with overlap
- **Risk:** refresh token replay  
  **Mitigation:** rotate on every use and revoke token family on reuse
- **Risk:** inconsistent authorization checks  
  **Mitigation:** central middleware plus route-level scope declarations

### Follow-up implementation guidance
- Publish public keys through a JWKS-style endpoint or internal key service
- Store refresh tokens hashed, never plaintext
- Standardize auth errors as RFC 9457 Problem Details
- Add integration tests for:
  - expired token
  - wrong audience
  - wrong issuer
  - invalid signature
  - missing `kid`
  - insufficient scope
  - refresh token reuse detection

If you want, I can next turn this ADR into:
1. a concrete TypeScript/Node middleware implementation, or  
2. framework-specific code for Express, Fastify, or NestJS.

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR: Rate Limiting for the Payments API

- **Status:** Accepted
- **Date:** 2026-03-26
- **Context:** Payments API, rate limiting implementation
- **Related decisions:** ADR-002 (sliding window), ADR-003 (RFC 9457 errors), auth architecture decisions from 2026-01-12

## Context

The Payments API specification states:

- All endpoints are rate-limited.
- Limits are applied **per API key or per user JWT**.
- Default tiers:
  - Standard: **100 requests/minute**
  - Premium: **500 requests/minute**
  - Enterprise: **custom**
- Rate limit responses must include:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
  - `Retry-After` on `429`
- Error responses must use **RFC 9457 Problem Details**.

Relevant prior architectural decisions:

- Auth uses **RS256**, validated by shared middleware.
- API keys are first-class credentials for server-to-server integrations.
- API keys are hashed at rest.
- Prior rate-limiting discussion selected **sliding window** over fixed window.
- Rate limiting uses a **dedicated Redis cluster**, separate from session storage.
- On Redis failure, the system should **fail open** with warning-level logging.

## Decision

We will implement **principal-based sliding-window rate limiting** backed by a dedicated Redis cluster.

### Principal model

Rate limits are enforced against the authenticated principal:

- **JWT-authenticated requests:** limit by **user identity** (`sub`)
- **API key-authenticated requests:** limit by **API key identifier**
- **Unauthenticated or invalid-auth requests:** apply a **coarse IP-based pre-auth limiter** only as a protective measure

This preserves the API contract of limiting by user or API key while still protecting the service from unauthenticated abuse.

---

## 1. Chosen algorithm

### Decision: Sliding window

We will use a **sliding window counter/log approach** in Redis.

### Why

Compared with a fixed window, sliding window:

- avoids boundary bursts
- is fairer to clients
- better matches partner expectations for “N requests per minute”
- is already consistent with prior architecture guidance

Compared with token bucket:

- token bucket is good for burst tolerance, but our published contract is expressed as simple per-minute tiers
- sliding window is easier to reason about for support, observability, and header semantics
- it aligns with the prior ADR direction already taken

### Operational design

For each principal and route scope, store request timestamps or equivalent window state in Redis for the last 60 seconds.

On each request:

1. Determine the principal key.
2. Remove entries older than the window.
3. Count current entries.
4. If count >= limit, reject with `429`.
5. Otherwise record the request and continue.

### Key shape

Use namespaced Redis keys, for example:

- `rl:user:{sub}:{route_group}`
- `rl:api_key:{key_id}:{route_group}`
- `rl:ip:{client_ip}:preauth`

`route_group` allows future differentiation if some endpoints need stricter limits without changing the core model.

### Window

Default window: **60 seconds**

### Tiers

- Standard: `100/min`
- Premium: `500/min`
- Enterprise: configured per account/key

Tier lookup should be based on the authenticated entity’s plan metadata.

---

## 2. Rate limit response headers

### Decision

We will return the following headers on rate-limited resources:

- `X-RateLimit-Limit`: max requests allowed in the current policy window
- `X-RateLimit-Remaining`: remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp when the client can expect the window to reset enough for another request
- `Retry-After`: seconds until retry is allowed

### Header behavior

#### On successful requests

Return:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

`Retry-After` is not required on non-429 responses.

#### On `429 Too Many Requests`

Return all four:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset`
- `Retry-After`

`Retry-After` is mandatory due to partner SLA and existing constraints.

### Semantics

#### `X-RateLimit-Limit`

The configured limit for the current principal and route scope.

Examples:

- `100`
- `500`

#### `X-RateLimit-Remaining`

Requests still available in the active sliding window after processing the current request.

Examples:

- successful request near start of window: `99`
- exhausted: `0`

#### `X-RateLimit-Reset`

Unix epoch seconds representing the earliest meaningful reset point for the current window.

For a sliding window, there is no single hard boundary like a fixed window. We define reset as:

- the timestamp when the oldest counted request will expire such that capacity becomes available again

This keeps the header useful and predictable.

#### `Retry-After`

Integer seconds until the next request should succeed, derived from the oldest blocking request’s expiry.

Example:

- `Retry-After: 17`

### 429 response body

Must use RFC 9457 Problem Details:

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "You have exceeded the allowed request rate for this resource.",
  "instance": "/v1/payments",
  "retry_after": 17,
  "trace_id": "req_123"
}
```

Response content type:

```http
Content-Type: application/problem+json
```

---

## 3. Interaction with authentication

### Decision

Rate limiting will be applied in two stages:

1. **Pre-auth protective limiter** by client IP
2. **Primary principal limiter** after authentication

### Why this split is needed

If rate limiting runs only after auth:

- unauthenticated floods can still consume app resources

If it runs only before auth by IP:

- authenticated clients behind NATs are unfairly grouped
- it violates the API contract of per-user or per-key limits

So we use both, with different purposes.

---

### Stage 1: Pre-auth IP limiter

Applied before full auth resolution.

Purpose:

- protect the service from obvious abuse
- limit repeated invalid or missing-credential requests
- reduce auth middleware and downstream load

Characteristics:

- coarse
- conservative
- not the contractual business limit
- should be set high enough not to interfere with normal traffic from shared egress networks

Example use:

- `rl:ip:{ip}:preauth`

This limiter is especially important for:

- missing auth headers
- malformed bearer tokens
- invalid API key attempts
- credential stuffing or scanning

---

### Stage 2: Principal limiter

Applied after successful authentication.

#### JWT requests

Use the validated JWT subject as the principal:

- key basis: `sub`
- optional enrichment: tenant/account/plan if needed

Example:

- `rl:user:user_123:/v1/payments`

This is consistent with prior auth decisions because JWT validation is already centralized in shared middleware.

#### API key requests

Use a stable API key identifier, not the raw key.

Because API keys are hashed at rest, the limiter should use:

- internal key ID, or
- deterministic identifier derived during key lookup

Do **not** use the raw presented secret as the Redis key.

Example:

- `rl:api_key:key_abc:/v1/payments`

This is consistent with the existing API key storage model and avoids leaking secrets into infrastructure metadata.

---

### Requests with both JWT and API key

If the API permits both credentials on a request, define precedence explicitly.

Decision:

- use the credential type that the endpoint actually authenticates against
- do not double-count a single request against both principals unless a future policy explicitly requires it

For most endpoints:

- if authenticated as API key, use API key limit
- if authenticated as bearer token, use user limit

This avoids ambiguous accounting.

---

### Invalid authentication

If authentication fails:

- return the appropriate auth error (`401` or `403`) in RFC 9457 format
- the request may still count against the **pre-auth IP limiter**
- it must **not** count against a user or API key principal, because no valid principal was established

---

## 4. Consistency with prior architectural decisions

This design is consistent with prior decisions in the following ways:

### Auth consistency

- Uses the existing **shared auth middleware**
- Assumes **RS256 JWT validation**
- Treats API keys as first-class auth credentials
- Avoids exposing or storing raw API keys in rate-limit state

### Error-handling consistency

- `429` responses use **RFC 9457 Problem Details**
- `Retry-After` is always included on `429`
- extension fields like `retry_after` and `trace_id` fit the established error model

### Infrastructure consistency

- Uses a **dedicated Redis cluster** for rate limiting
- Keeps rate limiting isolated from session storage
- Follows prior decision to **fail open** if Redis is unavailable

### API-spec consistency

- Enforces limits **per user JWT or per API key**
- Preserves published tier semantics
- returns the documented rate-limit headers

---

## Failure behavior

### Redis unavailable

Decision: **fail open**

Behavior:

- allow the request through
- emit warning-level logs
- increment operational metrics/alerts

Why:

- blocking all traffic due to rate-limit infrastructure failure is worse than temporarily allowing excess traffic
- this matches prior architecture guidance

### Observability

Emit metrics for:

- allowed requests
- rate-limited requests
- Redis failures
- pre-auth limiter hits
- principal limiter hits
- counts by auth type (`jwt`, `api_key`, `unauthenticated`)
- counts by tier

Log fields should include:

- `trace_id`
- limiter stage (`preauth` / `principal`)
- principal type
- route group
- configured limit
- retry_after on 429

---

## Middleware order

Recommended request flow:

1. request ID / tracing middleware
2. pre-auth IP limiter
3. auth middleware
4. principal resolution
5. principal rate limiter
6. authorization
7. handler

Why:

- protects the stack early
- ensures contractual limits are based on authenticated identity
- keeps authorization separate from rate limiting

---

## Consequences

### Positive

- fairer than fixed windows
- aligned with prior ADRs and API contract
- clear support/debugging story
- works for both user and server-to-server auth models

### Negative

- more complex than a simple fixed counter
- sliding-window reset semantics are less intuitive than fixed windows
- requires careful Redis implementation for performance

### Accepted tradeoff

We accept slightly higher implementation complexity in exchange for fairness, consistency, and adherence to prior architectural direction.

---

## Implementation notes

- Use Redis key TTLs aligned to the window.
- Never store raw API keys in Redis keys or logs.
- Derive `X-RateLimit-Reset` and `Retry-After` from the oldest blocking event.
- Keep route grouping configurable so future endpoint-specific limits can be added without redesign.
- Ensure 429 responses always include both headers and RFC 9457 body fields.

---

## Summary

We will implement:

- **sliding-window rate limiting**
- **principal-based enforcement** for authenticated traffic
- **IP-based pre-auth protection** for unauthenticated/invalid traffic
- standard `X-RateLimit-*` headers
- mandatory `Retry-After` on `429`
- RFC 9457 error responses
- Redis-backed state on a dedicated cluster
- fail-open behavior on Redis outage

If you want, I can next turn this ADR into:
1. a concrete middleware design for Express/Nest/Fastify, or
2. pseudocode plus Redis data structures.

---

## Phase: Error Handling Refactor

### Agent Output

I reviewed the available project memory, active constraints, and deployment/runbook knowledge. There were no retrievable explicit Phase 1/Phase 2 ADR records beyond the stored knowledge/constraints, so the design below is aligned to all recoverable prior decisions:

- ADR-003: all errors use RFC 9457 Problem Details
- Phase 1 auth direction: RS256/JWKS-based auth, with proper authn/authz separation
- Phase 2 rate limiting direction: standard rate limit headers, and `Retry-After` required on `429`
- Security guidance: no stack traces/internal leakage; include correlation/trace IDs
- Ops/runbook: verify error format and rate limit headers before deployment

## Refactored error handling design

### 1. Global strategy

Adopt a single, centralized error pipeline for the entire Payments API:

1. Route/middleware throws or returns typed domain errors
2. A global error normalizer maps all errors to a canonical internal error model
3. A single response formatter emits `application/problem+json`
4. Cross-cutting headers are attached before response:
   - trace/correlation headers
   - rate limit headers where applicable
   - auth challenge headers where applicable

This removes endpoint-specific error formatting and guarantees consistency.

### 2. Canonical error model

Internally, every error should normalize to:

- `type`
- `title`
- `status`
- `detail`
- `instance`
- `extensions`
  - `trace_id`
  - `validation_errors` when relevant
  - `retry_after` for rate limiting
  - optionally stable internal `error_code` if already agreed internally, but not as a replacement for RFC 9457 fields

### 3. Response format

All error responses must be:

- Content-Type: `application/problem+json`
- Body shape:

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 42 seconds.",
  "instance": "/v1/payments",
  "trace_id": "trc_123",
  "retry_after": 42
}
```

Supported extension fields from prior knowledge:

- `validation_errors`
- `trace_id`
- `retry_after`

No custom `{ error: ... }` or `{ code, message }` payloads.

### 4. Error type registry

Use the agreed registry under:

- `https://api.payments.example/errors/...`

At minimum:

- `/authentication-required`
- `/permission-denied`
- `/rate-limited`
- `/validation-failed`
- `/idempotency-conflict`
- `/invalid-payment-method`
- `/card-declined`
- `/insufficient-funds`

Recommended additions for completeness if not already registered:

- `/resource-not-found`
- `/conflict`
- `/internal-server-error`
- `/service-unavailable`

### 5. Authentication vs authorization semantics

This must be explicit and consistent:

#### Return 401 Unauthorized when authentication is missing or invalid
Use for:
- missing bearer token
- malformed token
- expired token
- invalid signature
- wrong issuer/audience
- revoked token

Response:
- status `401`
- type `.../authentication-required`
- include `WWW-Authenticate: Bearer`
- optionally include RFC 6750-style error details in header if already supported, but body remains RFC 9457

Example:

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "A valid bearer token is required to access this resource.",
  "instance": "/v1/payments",
  "trace_id": "trc_123"
}
```

#### Return 403 Forbidden when identity is valid but not permitted
Use for:
- token valid but missing permission
- token valid but wrong role
- token valid but tenant/resource access denied

Response:
- status `403`
- type `.../permission-denied`
- no `WWW-Authenticate` challenge required
- do not leak sensitive authorization policy internals

Example:

```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "You do not have permission to perform this action.",
  "instance": "/v1/payments/pay_123/refund",
  "trace_id": "trc_123"
}
```

### 6. Rate limit handling

For all rate-limited responses, return:

Headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` required on `429`

Body:
- RFC 9457 problem details
- include `retry_after` extension mirroring header value

Example:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1760000000
Retry-After: 42
```

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Retry after 42 seconds.",
  "instance": "/v1/payments",
  "trace_id": "trc_123",
  "retry_after": 42
}
```

Per the recovered knowledge, rate limit headers should ideally be present on all responses, not just `429`, to support proactive client backoff. At minimum, `Retry-After` is mandatory on `429`.

### 7. Validation and domain errors

#### 400/422 validation failures
Prefer one consistent validation status across the API. Since prior memory only guarantees RFC 9457 and `validation_errors`, keep the existing API convention if already established; otherwise choose one and apply globally.

Recommended payload:

```json
{
  "type": "https://api.payments.example/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "instance": "/v1/payments",
  "trace_id": "trc_123",
  "validation_errors": [
    {
      "field": "amount_cents",
      "message": "Must be greater than 0"
    }
  ]
}
```

#### 404 not found
```json
{
  "type": "https://api.payments.example/errors/resource-not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "The requested payment was not found.",
  "instance": "/v1/payments/pay_missing",
  "trace_id": "trc_123"
}
```

#### 409 conflicts
Use for idempotency conflicts or state conflicts.

### 8. 5xx handling

For unexpected server errors:

- always return RFC 9457
- never expose stack traces, SQL errors, internal hostnames, or service topology
- log full internal details server-side with `trace_id`
- return generic client-safe detail

Example:

```json
{
  "type": "https://api.payments.example/errors/internal-server-error",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred.",
  "instance": "/v1/payments/pay_123/confirm",
  "trace_id": "trc_123"
}
```

### 9. Middleware architecture

Recommended middleware order:

1. request ID / trace ID middleware
2. security headers
3. auth extraction
4. auth validation
5. authorization checks
6. rate limiting
7. routing/controllers
8. not-found handler
9. global error handler

Implementation pattern:

- `AuthenticationError` -> 401
- `AuthorizationError` -> 403
- `RateLimitError` -> 429 + required headers
- `ValidationError` -> 422/400 + `validation_errors`
- `NotFoundError` -> 404
- `ConflictError` -> 409
- fallback -> 500

### 10. Pseudocode sketch

```ts
type ProblemDetails = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  trace_id?: string
  validation_errors?: Array<{ field: string; message: string }>
  retry_after?: number
}

function globalErrorHandler(err, req, res, next) {
  const traceId = req.traceId
  const instance = req.originalUrl

  const normalized = normalizeError(err, { traceId, instance })

  if (normalized.status === 401) {
    res.setHeader("WWW-Authenticate", "Bearer")
  }

  if (normalized.status === 429) {
    res.setHeader("X-RateLimit-Limit", String(normalized.rate.limit))
    res.setHeader("X-RateLimit-Remaining", String(normalized.rate.remaining))
    res.setHeader("X-RateLimit-Reset", String(normalized.rate.reset))
    res.setHeader("Retry-After", String(normalized.rate.retryAfter))
  }

  res
    .status(normalized.status)
    .type("application/problem+json")
    .json({
      type: normalized.type,
      title: normalized.title,
      status: normalized.status,
      detail: normalized.detail,
      instance,
      trace_id: traceId,
      ...(normalized.validationErrors && {
        validation_errors: normalized.validationErrors
      }),
      ...(normalized.rate?.retryAfter && {
        retry_after: normalized.rate.retryAfter
      })
    })
}
```

---

## Checklist verifying consistency with prior decisions

### Error format
- [x] All error responses use RFC 9457 Problem Details
- [x] Content type is `application/problem+json`
- [x] No legacy/custom error payloads remain
- [x] `type`, `title`, `status`, `detail`, `instance` are always present
- [x] `trace_id` is included as an extension field
- [x] `validation_errors` is used for field-level validation failures

### Authentication Phase 1 consistency
- [x] Design preserves RS256/JWKS auth model; no change to token strategy
- [x] Missing/invalid/expired/revoked token maps to `401`
- [x] Valid token lacking permission/role/tenant access maps to `403`
- [x] `401` responses include `WWW-Authenticate: Bearer`
- [x] `403` responses do not masquerade as authentication failures
- [x] Error bodies do not leak sensitive auth internals

### Rate Limiting Phase 2 consistency
- [x] `429` responses use RFC 9457 body format
- [x] `429` responses include `Retry-After`
- [x] `429` responses include `X-RateLimit-Limit`
- [x] `429` responses include `X-RateLimit-Remaining`
- [x] `429` responses include `X-RateLimit-Reset`
- [x] Design supports including rate limit headers on non-429 responses as recommended by prior security/partner guidance

### Security consistency
- [x] No stack traces in production responses
- [x] No internal service names or database errors exposed
- [x] Correlation via `trace_id` supported for debugging
- [x] Unexpected errors are logged internally and sanitized externally

### Operational consistency
- [x] Design aligns with deployment runbook verification steps
- [x] Supports smoke tests for 400/401/404/429 response shape
- [x] Supports post-deploy verification of rate limit headers

### Constraint compliance
- [x] High constraint respected: all errors use RFC 9457
- [x] High constraint respected: `429` includes `Retry-After`
- [x] Critical auth constraint not violated: no change away from RS256
- [x] Critical webhook constraint unaffected by this design

---

## Deployment readiness assessment

## Status
**Conditionally ready**

The design is deployment-ready from an architecture standpoint, but implementation should not ship until the following verification items pass.

### Ready aspects
- Centralized strategy is consistent with recovered ADR/constraint knowledge
- Auth and rate-limit semantics are clearly separated
- Required `429` headers are explicitly covered
- RFC 9457 formatting is enforced globally
- Security leakage risks are addressed

### Required implementation checks before deploy
1. **Contract tests**
   - 401 returns RFC 9457 + `WWW-Authenticate`
   - 403 returns RFC 9457 and no auth challenge unless intentionally required
   - 429 returns RFC 9457 + all rate limit headers + `Retry-After`
   - 400/404/409/422/500 all return RFC 9457

2. **Regression sweep across all endpoints**
   - create payment
   - confirm payment
   - get payment
   - refund payment
   - list payments
   - auth-protected admin/merchant routes if present

3. **Production safety checks**
   - confirm no stack traces in prod mode
   - confirm `trace_id` is present and matches logs
   - confirm middleware order prevents route-level custom error formatting from bypassing the global handler

4. **SLA/compliance checks**
   - verify `Retry-After` on every `429`
   - verify rate limit headers on sample successful responses if partner SLA requires all-response coverage
   - verify invalid HS256 tokens still fail as `401`

### Risks / gaps
- I could not retrieve explicit full ADR documents for all Phase 1 and Phase 2 decisions; only the stored knowledge/constraints were available.
- If there was a previously agreed status choice for validation errors (`400` vs `422`), that should be confirmed and applied uniformly.
- If there is an existing internal error taxonomy beyond the known registry, it should be reconciled before rollout.

### Recommended go-live gate
**Go** only if:
- all endpoint error responses are migrated to the global handler,
- automated tests confirm RFC 9457 everywhere,
- 401/403 behavior is verified,
- 429 headers are verified in integration and smoke tests.

If you want, I can next turn this into:
1. an ADR draft, or  
2. a concrete Express/Nest/Fastify middleware implementation plan.

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