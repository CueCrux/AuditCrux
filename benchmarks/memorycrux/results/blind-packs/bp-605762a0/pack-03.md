# Blind Evaluation Pack: pack-03
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR-004: Authentication Module Implementation

**Status:** Accepted
**Date:** 2026-01-20
**Authors:** Engineering Team
**Supersedes:** N/A
**Related:** ADR-001, SEC-2025-041, SEC-2025-042

---

## Context

The Payments API requires a complete authentication module. This ADR documents the implementation decisions for:

1. Token signing algorithm selection
2. JWT token structure and claims
3. Refresh token strategy
4. Token validation middleware design

Three prior documents constrain this work before any design choices are made:

- **SEC-2025-041 (Critical):** HS256 is explicitly rejected. RS256 is required. This is a hard compliance requirement — HS256 tokens will be rejected at the API gateway.
- **SEC-2025-042 (High):** Refresh tokens must include replay protection with family-based revocation.
- **ADR-001:** Establishes RS256 and the JWKS-based key distribution pattern. This ADR implements that decision.

The auth module must also integrate cleanly with the rate limiting (ADR-002) and error handling (ADR-003) modules, since authentication failures must return RFC 9457 Problem Details responses.

---

## Decision

### 1. Token Signing Algorithm: RS256

**We use RS256. This is not a discretionary choice.**

RS256 (RSA-SHA256, asymmetric) is required by SEC-2025-041 and ADR-001. HS256 was evaluated and explicitly rejected during the 2025-Q4 security review for two structural reasons:

| Property | HS256 | RS256 |
|---|---|---|
| Key type | Symmetric shared secret | Asymmetric key pair |
| Who can issue tokens | Any service holding the secret | Only the auth service (private key) |
| Who can validate tokens | Any service holding the secret | Any service with the public key |
| Blast radius if one service is compromised | All services — secret is exposed | Only that service — private key stays in auth service |
| Key rotation | Must redistribute secret to all services | Update JWKS endpoint; services poll automatically |
| Services needing the signing material | All 8+ validating services | Auth service only |

The asymmetric property is the critical distinction: with RS256, the private key never leaves the auth service. All other services validate tokens using the public key fetched from the JWKS endpoint. A compromised downstream service cannot forge tokens.

**A note for future developers:** If you encounter a proposal to switch to HS256 for simplicity or performance, refer to SEC-2025-041 and ADR-001. This is a compliance requirement, not a preference. HS256 tokens are rejected at the API gateway by policy.

---

### 2. JWT Token Structure

#### 2a. Access Token Claims

```json
{
  "sub": "user_abc123",
  "iss": "payments-auth",
  "aud": "payments-api",
  "iat": 1705312000,
  "exp": 1705312900,
  "jti": "tok_7f3a9b2c-1d4e-4f5a-8b6c-9d0e1f2a3b4c",
  "roles": ["merchant"],
  "permissions": ["payments:create", "payments:read"],
  "tenant_id": "tenant_xyz",
  "tier": "premium"
}
```

**Claim rationale:**

| Claim | Type | Purpose | Notes |
|---|---|---|---|
| `sub` | Standard | User identity | Stable user ID, never an email |
| `iss` | Standard | Issuer verification | Validated by middleware; must equal `payments-auth` |
| `aud` | Standard | Audience restriction | Validated by middleware; must equal `payments-api` |
| `iat` | Standard | Issued-at time | Used for token age checks |
| `exp` | Standard | Expiry | 15 minutes from issuance |
| `jti` | Standard | JWT ID (unique token ID) | Enables deny-list lookups for revoked tokens |
| `roles` | Custom | Coarse-grained authorization | e.g., `merchant`, `admin`, `readonly` |
| `permissions` | Custom | Fine-grained authorization | e.g., `payments:create`, `refunds:write` |
| `tenant_id` | Custom | Multi-tenancy isolation | Used by rate limiter to look up tier |
| `tier` | Custom | Rate limit tier | Cached from tenant lookup; avoids Redis round-trip on every request |

**What is intentionally excluded:**

- Email address — PII; not needed for authorization; changes over time
- Card data or payment details — never in a token
- Internal service names or infrastructure details — information leakage risk
- Passwords or secrets of any kind

#### 2b. Access Token Expiry

Access tokens expire after **15 minutes** (`exp = iat + 900`).

This is a deliberate security trade-off. Shorter expiry limits the window of abuse for a stolen token. The 15-minute window is short enough to be meaningful but long enough to avoid excessive refresh churn for normal user sessions. Tokens cannot be revoked mid-flight without a deny-list lookup (see below), so expiry is the primary revocation mechanism for the common case.

**Deny-list for immediate revocation:** The `jti` claim enables targeted revocation. When a user logs out or a session is force-terminated, the `jti` is written to Redis with a TTL matching the remaining token lifetime. The validation middleware checks this list. This is an O(1) Redis lookup per request — acceptable overhead.

```
deny:{jti}  →  "revoked"  (TTL: remaining seconds until exp)
```

#### 2c. Refresh Token Strategy

Refresh tokens are **opaque random strings**, not JWTs. They are stored server-side in PostgreSQL with the following schema:

```sql
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    BYTEA NOT NULL UNIQUE,  -- SHA-256 of the raw token
  family_id     UUID NOT NULL,          -- groups related tokens for replay detection
  user_id       TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,   -- 30 days from issuance
  rotated_at    TIMESTAMPTZ,            -- set when this token is used to issue a new one
  revoked_at    TIMESTAMPTZ,            -- set when explicitly revoked
  revoke_reason TEXT                    -- "logout", "replay_detected", "family_revoked"
);

CREATE INDEX ON refresh_tokens (family_id);
CREATE INDEX ON refresh_tokens (user_id);
```

**Why opaque tokens, not JWTs?**

Refresh tokens need to be revocable. A JWT refresh token would require a deny-list lookup on every refresh anyway, eliminating the stateless benefit of JWTs. Opaque tokens stored server-side are simpler, more auditable, and carry no risk of leaking claims if decoded.

**Rotation policy (addressing SEC-2025-042):**

Every time a refresh token is used, the following happens atomically:

1. The presented token is looked up by hash.
2. If not found → reject (unknown token).
3. If `revoked_at` is set → **replay detected** → revoke the entire family (see below).
4. If `rotated_at` is set and `NOW() > rotated_at + 30 seconds` → reject (outside grace window).
5. If `rotated_at` is set and `NOW() <= rotated_at + 30 seconds` → accept (grace window for network retries).
6. Otherwise → mark current token as rotated, issue new token in the same family, issue new access token.

**Family-based replay detection:**

Each refresh token belongs to a `family_id`. When a token family is created (at login), all tokens in that family share the same `family_id`. If a revoked token from a family is replayed (step 3 above), it means the token was stolen and used after the legitimate client already rotated it. The correct response is to revoke all tokens in the family:

```sql
UPDATE refresh_tokens
SET revoked_at = NOW(), revoke_reason = 'family_revoked'
WHERE family_id = $1 AND revoked_at IS NULL;
```

This forces the user to re-authenticate. It is a deliberate security decision: we prefer a brief user inconvenience over allowing an attacker to maintain a session.

**Grace window (30 seconds):**

After rotation, the old token is accepted for 30 seconds. This handles the case where a client sends a refresh request, receives the new token, but the network drops the response. Without a grace window, the client would be locked out. The 30-second window is short enough to be meaningless to an attacker but long enough to handle realistic network conditions.

**Refresh token expiry:** 30 days. After expiry, the user must re-authenticate.

---

### 3. Token Validation Middleware

The middleware is implemented as a shared npm package `@payments/auth-middleware` imported by all services. This ensures consistent validation logic across the system — a service cannot accidentally implement a weaker check.

#### 3a. Validation Pipeline

Every request through the middleware executes these steps in order. Any failure short-circuits to an error response.

```
Request
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 1: Extract token                               │
│  - Read Authorization header                        │
│  - Verify format: "Bearer <token>"                  │
│  - Reject if missing or malformed → 401             │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 2: Decode header (without verification)        │
│  - Check alg claim = "RS256"                        │
│  - Reject if alg is HS256 or any other value → 401  │
│  - Extract kid (key ID) for JWKS lookup             │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 3: Fetch public key from JWKS                  │
│  - Look up key by kid in local cache                │
│  - If not cached: fetch /.well-known/jwks.json      │
│  - Cache keys with 5-minute TTL                     │
│  - Reject if key not found → 401                    │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 4: Verify signature                            │
│  - Verify RS256 signature using public key          │
│  - Reject if invalid → 401                          │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 5: Validate standard claims                    │
│  - exp: reject if expired → 401                     │
│  - iss: reject if not "payments-auth" → 401         │
│  - aud: reject if not "payments-api" → 401          │
│  - iat: reject if in the future (clock skew > 5s)   │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 6: Check deny-list                             │
│  - Look up jti in Redis deny-list                   │
│  - Reject if found → 401                            │
│  - On Redis failure: log WARNING, continue          │
│    (fail-open; token is otherwise valid)            │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ Step 7: Attach context to request                   │
│  - req.auth = { sub, roles, permissions,            │
│                 tenant_id, tier, jti }              │
└─────────────────────────────────────────────────────┘
  │
  ▼
Next handler
```

#### 3b. Algorithm Enforcement (Step 2 Detail)

The algorithm check in Step 2 deserves explicit attention. The `alg` field in the JWT header is attacker-controlled. The ["alg:none" attack](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/) and the ["RS256 to HS256 confusion attack"](https://www.nccgroup.com/us/research-blog/jwt-attack-walk-through/) are both real vulnerabilities in naive implementations.

The middleware must:

```typescript
// CORRECT: allowlist only RS256
const ALLOWED_ALGORITHMS = ['RS256'] as const;

const header = decodeHeader(token); // does NOT verify signature
if (!ALLOWED_ALGORITHMS.includes(header.alg)) {
  throw new AuthError('unsupported_algorithm', `Algorithm ${header.alg} is not permitted`);
}

// Then verify with RS256 explicitly — never use header.alg to select the algorithm
jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

The `algorithms` option in `jwt.verify` is passed explicitly and hardcoded — it is never derived from the token header. This prevents an attacker from crafting a token with `"alg": "none"` or `"alg": "HS256"` and having it accepted.

#### 3c. JWKS Caching

Fetching the JWKS endpoint on every request would be a performance and availability problem. The middleware caches public keys:

```
Cache key: kid (key ID from JWT header)
Cache TTL: 5 minutes
Cache backend: in-process LRU (per service instance)
```

On cache miss, the middleware fetches `/.well-known/jwks.json` and populates the cache. If the JWKS endpoint is unreachable and the cache is empty, authentication fails with 503 (not 401 — the failure is infrastructure, not the user's token).

Key rotation is handled gracefully: when a new key is deployed, it is added to the JWKS endpoint before old tokens expire. The old key remains in JWKS until all tokens signed with it have expired (max 15 minutes). Services will naturally pick up the new key on their next cache miss.

#### 3d. Error Responses

All authentication errors return RFC 9457 Problem Details (per ADR-003). The distinction between 401 and 403 is important:

**401 Unauthorized** — the request has no valid identity:
```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "The access token is expired. Obtain a new token using your refresh token.",
  "instance": "/v1/payments",
  "trace_id": "req_9f3a2b1c"
}
```

**403 Forbidden** — the request has a valid identity but lacks permission:
```json
{
  "type": "https://api.payments.example/errors/permission-denied",
  "title": "Permission Denied",
  "status": 403,
  "detail": "This operation requires the 'refunds:write' permission.",
  "instance": "/v1/payments/pay_xyz789/refund",
  "trace_id": "req_9f3a2b1c"
}
```

The `detail` field is human-readable but does not expose internal implementation details (no stack traces, no database errors, no service names).

#### 3e. Authorization Helper

Beyond authentication (who are you?), the middleware provides an authorization helper (can you do this?):

```typescript
// Usage in route handler:
requirePermission('payments:create')(req, res, next);

// Implementation:
function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth.permissions.includes(permission)) {
      return next(new PermissionDeniedError(permission));
    }
    next();
  };
}
```

This keeps authorization logic out of business logic handlers.

---

### 4. Key Management

| Concern | Decision |
|---|---|
| Key storage | Private key in Kubernetes Secret, mounted as env var `AUTH_PRIVATE_KEY` |
| Key format | PEM

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR-004: Rate Limiting Implementation

## Status: Accepted
## Date: 2026-01-22
## Supersedes: None
## Related: ADR-001 (JWT Auth), ADR-002 (Sliding Window), ADR-003 (RFC 9457 Errors)

---

## Context

The Payments API requires rate limiting to protect backend services from overload, enforce fair usage across tenants, and meet contractual SLA obligations to API consumers. This ADR documents the implementation decisions for the rate limiting module, resolving open questions left by ADR-002 (which established the algorithm and storage strategy but deferred implementation details).

Several constraints are non-negotiable going into this decision:

- **Retry-After header is mandatory on 429 responses** — contractual obligation per the partner integration agreement signed 2025-Q3. Omitting it violates SLA terms. (Active constraint, HIGH)
- **All error responses must use RFC 9457 Problem Details format** — per ADR-003. The 429 response body is an error response and is therefore in scope. (Active constraint, HIGH)
- **JWT tokens use RS256** — the rate limiting layer must correctly identify users from RS256-signed tokens. It must not accept HS256-signed tokens as valid identity for rate limit key derivation. (Active constraint, CRITICAL)

---

## Decision

### 1. Algorithm: Sliding Window Counter

We adopt the **sliding window counter** algorithm as specified in ADR-002. This decision is already settled; this ADR records the implementation parameters.

**Algorithm recap:**

```
effective_count = prev_window_count × overlap_ratio + curr_window_count

where overlap_ratio = (window_size_ms - elapsed_in_current_window_ms) / window_size_ms
```

**Why this is the right choice for our context:**

| Property | Fixed Window | Sliding Window Log | Sliding Window Counter |
|---|---|---|---|
| Boundary burst risk | High (2× limit possible) | None | Low (≈±5%) |
| Memory per key | O(1) | O(requests) | O(1) |
| Implementation complexity | Low | High | Medium |
| Suitable for Redis | Yes | No (large sets) | Yes |

For a payments API where a client could time requests to double their effective rate at window boundaries, fixed window is unacceptable. The sliding window counter gives us the safety of a true sliding window at O(1) memory cost — two counters and a timestamp per rate limit key.

**Accuracy note:** The ±5% approximation error at window boundaries is acceptable. The alternative (sliding window log) would require storing every request timestamp in Redis, which is memory-prohibitive at scale and introduces a different class of failure modes.

---

### 2. Identity Resolution for Rate Limit Keys

Rate limits are applied per **authenticated identity**, not per IP address. The identity source depends on the authentication method used.

#### 2a. JWT Bearer Token requests

The rate limit key is derived from the `tenant_id` claim in the validated JWT payload:

```
rl:tenant:{tenant_id}:{window_start_unix}
```

**Why `tenant_id` and not `sub` (user ID)?**

In a multi-tenant payments API, the relevant unit of fair usage is the tenant (merchant), not the individual user. A merchant with 50 employees should not have their collective rate limit fragmented across 50 per-user buckets — nor should one employee's heavy usage be invisible to the limit applied to another employee of the same merchant.

The `tenant_id` claim is present in all JWT payloads per ADR-001:

```json
{
  "sub": "user_abc123",
  "tenant_id": "tenant_xyz",
  "roles": ["merchant"],
  ...
}
```

**JWT validation precondition:** The rate limiting middleware runs *after* the auth middleware. By the time rate limiting executes, the token has already been validated: signature verified against the JWKS endpoint (RS256 only), expiry checked, audience and issuer confirmed. The rate limiter trusts the decoded payload from the auth middleware — it does not re-validate the token. This means:

- HS256-signed tokens are rejected at the auth layer before reaching rate limiting. The rate limiter never sees an identity derived from an HS256 token.
- Expired tokens are rejected before rate limiting. A client cannot exhaust another tenant's rate limit using an expired token.
- The rate limiter reads `req.auth.tenant_id` (set by `@payments/auth-middleware`) — it does not parse the Authorization header itself.

#### 2b. API Key requests

The rate limit key is derived from the hashed API key identifier:

```
rl:apikey:{key_id}:{window_start_unix}
```

API keys are stored as SHA-256 hashes (per the 2026-01-12 architecture decision). The `key_id` used in the rate limit key is the stable identifier associated with the key record, not the raw key or its hash. This is resolved by the API key validation middleware before rate limiting runs.

API keys have their own tier assignment stored in Redis (cached from the database), independent of JWT tenant tiers.

#### 2c. Unauthenticated requests

Requests that fail authentication receive a 401 before reaching the rate limiter. The rate limiter is never invoked for unauthenticated requests. There is no IP-based fallback rate limit in this implementation — that is a separate infrastructure-level concern handled at the load balancer/WAF layer.

#### 2d. Key format summary

```
rl:{scope}:{identifier}:{window_start_unix}
```

| Auth method | scope | identifier |
|---|---|---|
| JWT | `tenant` | `tenant_id` claim value |
| API Key | `apikey` | stable key record ID |

Keys expire after `2 × window_duration` seconds (TTL set on write). This ensures stale keys are cleaned up automatically without a separate eviction job.

---

### 3. Tier Resolution

The rate limit tier for a request is resolved as follows:

**For JWT requests:** Look up `tier:{tenant_id}` in Redis (TTL: 5 minutes). On cache miss, query the database and populate the cache. The tier determines the `max_requests` and `burst_allowance` applied.

**For API key requests:** The tier is stored alongside the key record and cached at key validation time. No separate lookup is needed.

**Tier table** (from ADR-002):

| Tier | Requests/min | Burst allowance |
|---|---|---|
| Standard | 100 | 20 |
| Premium | 500 | 100 |
| Enterprise | Custom | Custom |

**Burst allowance implementation:** The burst allowance is additive to the base limit for the current window only. It is not a separate token bucket. Concretely: a Standard tenant may make up to 120 requests in a single window (100 base + 20 burst), but the sliding window calculation means sustained usage above 100 req/min will still trigger limiting. The burst allowance absorbs legitimate traffic spikes without requiring a separate algorithm layer.

**Tier resolution failure:** If the tier lookup fails (Redis down, database timeout), the request is treated as Standard tier and a `WARNING` is logged. We do not block requests due to tier resolution failure — consistent with the fail-open policy established in ADR-002.

---

### 4. Redis Operations

Each request requires two Redis operations, executed as a Lua script (atomic):

```lua
local curr_key = KEYS[1]   -- rl:{scope}:{id}:{curr_window}
local prev_key = KEYS[2]   -- rl:{scope}:{id}:{prev_window}
local window_ms = tonumber(ARGV[1])
local elapsed_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local prev_count = tonumber(redis.call('GET', prev_key) or 0)
local curr_count = tonumber(redis.call('GET', curr_key) or 0)

local overlap = (window_ms - elapsed_ms) / window_ms
local effective = prev_count * overlap + curr_count

if effective >= limit then
  -- Do not increment; return current state
  return {0, math.floor(effective), 0}
end

-- Increment current window counter
local new_count = redis.call('INCR', curr_key)
redis.call('PEXPIRE', curr_key, window_ms * 2)

return {1, math.floor(effective + 1), math.floor(limit - effective - 1)}
-- returns: {allowed, effective_count, remaining}
```

Using a Lua script ensures the read-compute-write sequence is atomic. Without atomicity, two concurrent requests near the limit could both read `effective < limit`, both increment, and both succeed — allowing a brief overage. The Lua script eliminates this race condition.

**Redis failure handling:** If the Lua script call throws (connection error, timeout), the middleware catches the exception, logs a `WARNING` with the error details, and allows the request through (fail-open). This is consistent with ADR-002's explicit decision to prefer availability over strict enforcement during Redis outages.

---

### 5. Response Headers

#### 5a. All responses within limit (2xx, 4xx non-429, 5xx)

These headers are included on every response from a rate-limited endpoint, regardless of whether the request succeeded or failed for other reasons:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1705312860
```

- `X-RateLimit-Limit` — the effective limit for this request (base + burst if applicable)
- `X-RateLimit-Remaining` — requests remaining in the current window, floored at 0
- `X-RateLimit-Reset` — Unix timestamp (seconds) at which the current window expires and the counter resets

#### 5b. Rate-limited responses (429)

All three headers above, plus:

```
Retry-After: 23
```

`Retry-After` is the number of **whole seconds** until the client may retry. It is calculated as:

```
retry_after = ceil((window_end_ms - now_ms) / 1000)
```

This is the time until the current window closes. At that point, the previous window counter becomes the new previous window, and the effective count drops. In practice, the client may be able to retry sooner (if the sliding window calculation drops below the limit before the window fully closes), but we report the conservative upper bound. Reporting an optimistic value that turns out to be wrong would cause clients to retry and receive another 429, which is worse than asking them to wait slightly longer.

**Why seconds, not a date?** RFC 7231 permits `Retry-After` as either a delay-seconds integer or an HTTP-date. We use delay-seconds because it is unambiguous with respect to timezone and clock skew between client and server.

#### 5c. Header presence on auth errors

Rate limit headers are **not** included on 401 or 403 responses. The request did not reach the rate limiter (auth middleware runs first and short-circuits), so there is no rate limit state to report. Including fabricated or zero-value rate limit headers on auth errors would be misleading.

---

### 6. Error Response Body (RFC 9457)

Per ADR-003, the 429 response body must use `application/problem+json`. The rate limit error type is registered at `/errors/rate-limited`.

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "You have exceeded the rate limit of 100 requests per minute for tenant tenant_xyz. Your request quota resets in 23 seconds.",
  "instance": "/v1/payments",
  "retry_after": 23,
  "trace_id": "req_01HN4X7K2M3P5Q8R9S0T"
}
```

**Extension fields used:**

- `retry_after` — mirrors the `Retry-After` header value. Included as an extension field per ADR-003's guidance and the error handling patterns document, which explicitly calls for this field on rate limit errors.
- `trace_id` — correlation ID from request context, for debugging and support.

**`detail` field:** The detail string includes the limit value and reset time in human-readable form. It does not include internal Redis keys, server hostnames, or any information that would aid abuse. The tenant identifier is included because the client already knows their own tenant ID (it is in their JWT).

**Content-Type:** `application/problem+json` — required by RFC 9457 and ADR-003.

---

### 7. Middleware Ordering

The Express middleware chain for rate-limited endpoints is:

```
Request
  │
  ▼
1. Request ID middleware        (attaches trace_id to req context)
  │
  ▼
2. Auth middleware              (validates JWT/API key; sets req.auth)
  │  → 401 if no/invalid credentials (no rate limit headers)
  ▼
3. Rate limit middleware        (reads req.auth; checks/increments Redis)
  │  → 429 with Retry-After if over limit
  │  → attaches rate limit state to req for header injection
  ▼
4. Route handler
  │
  ▼
5. Response middleware          (injects X-RateLimit-* headers on all responses)
  │
  ▼
Response
```

**Why auth before rate limiting?**

- Rate limiting requires a validated identity (tenant_id or key_id). Without auth running first, we have no reliable identity to key on.
- An unauthenticated request should receive a 401, not a 429. The 401 is more actionable for the client.
- Prevents a class of abuse where an attacker sends unauthenticated requests to exhaust another tenant's rate limit (since we cannot derive the target tenant's identity without a valid token).

**Why a separate response middleware for headers?**

Attaching rate limit headers in a response middleware (rather than inline in the rate limit middleware) ensures the headers are present on all responses — including error responses generated by downstream route handlers. If the route handler throws a validation error (400) or a payment processing error (402), the rate limit headers still appear. This is consistent with the API specification's requirement that rate limit headers appear on all responses, not just 200s.

---

### 8. Idempotency Key Interaction

Requests replayed via `Idempotency-Key` (returning a cached response) **do** count against the rate limit. The rate limit check happens before the idempotency cache lookup. Rationale: the rate limiter's purpose is to protect backend resources. A replayed idempotent request still consumes a rate limit slot — it just does not consume downstream resources. This is the simpler and safer default; we can revisit if partners report that idempotent replays are consuming meaningful quota.

---

### 9. Implementation Notes

**Package:** The rate limiting middleware will be implemented in `src/middleware/rate-limit.ts` and exported from `@payments/rate-limit-middleware` for potential reuse by other services.

**Configuration:** Limits are not hardcoded. The middleware accepts a configuration object:

```typescript
interface RateLimitConfig {
  windowMs: number;           // default: 60_000 (1 minute)
  defaultTier: TierConfig;    // Standard tier as fallback
  redisClient: Redis;
  getTierForIdentity: (identity: RateLimitIdentity) => Promise<TierConfig>;
}

interface TierConfig {
  limit: number;
  burstAllowance: number;
}

interface RateLimitIdentity {
  type: 'tenant' | 'apikey';
  id: string;
}
```

**Testing:** The Lua script logic will be unit-tested with a Redis mock (ioredis-mock). Integration tests will use a real Redis instance (via Docker in CI) to verify atomicity under concurrent load. The fail-open behavior will be tested by simulating Redis connection failures.

---

## Consequences

### Positive

- Sliding window counter eliminates boundary burst abuse that fixed windows permit.
- Lua script atomicity prevents race conditions at the limit boundary.
- Tenant-level rate limiting correctly aggregates usage across all users of a merchant.
- Auth-before-rate-limit ordering prevents identity spoofing and ensures 401 takes precedence over 429.
- `Retry-After` header is always present on 429 responses — SLA obligation met.
- RFC 9457 error body on 429 — ADR-003 compliance met.
- Fail-open on Redis failure — availability preserved during infrastructure incidents.

### Negative / Trade-offs

- **Fail-open risk:** During Redis outages, rate limits are not enforced. This is an explicit, documented trade-off from ADR-002. Mitigation: Redis cluster with replication; alert on Redis errors; circuit breaker to detect sustained outages.
- **Tenant-level granularity:** A single high-volume user within a tenant can exhaust the tenant's quota. This is intent

---

## Phase: Error Handling Refactor

### Agent Output

# Error Handling Refactor — Phase 3 Design

## Preliminary Review of Prior Decisions

Before writing a single line of design, I'm reviewing all binding decisions from Phases 1 and 2:

| Source | Binding Requirement |
|--------|-------------------|
| SEC-2025-041 (CRITICAL) | JWT signing MUST be RS256. HS256 tokens must be rejected. |
| ADR-001 | Token validation checks: signature (RS256), expiry, audience (`payments-api`), issuer (`payments-auth`). 401 vs 403 distinction required. |
| ADR-002 | Rate limit 429 responses MUST include `Retry-After`. All responses include `X-RateLimit-*` headers. |
| ADR-003 | ALL error responses MUST use RFC 9457 (`application/problem+json`). No custom formats. |
| Partner SLA (HIGH) | `Retry-After` on 429 is a contractual obligation — not optional. |
| Error Handling Doc | Global handler, validation formatter, auth error clarity, error type registry completeness. |
| Stripe Integration (CRITICAL) | Webhook secret stays server-side. Never in client-facing error responses. |
| PCI-DSS | No card data, stack traces, internal service names, or secrets in any response. |

---

## 1. Error Type Registry

All error types must be registered before the handler can reference them. This is the authoritative list.

```typescript
// src/errors/registry.ts

const BASE_URL = 'https://api.payments.example/errors';

export const ErrorTypes = {
  // Authentication (401)
  AUTHENTICATION_REQUIRED:   `${BASE_URL}/authentication-required`,
  TOKEN_EXPIRED:             `${BASE_URL}/token-expired`,
  TOKEN_INVALID:             `${BASE_URL}/token-invalid`,
  // NOTE: HS256 rejection gets its own type so clients get an actionable message.
  // This is important: a misconfigured client using HS256 needs to know *why*
  // their token was rejected, not just that authentication failed.
  TOKEN_ALGORITHM_REJECTED:  `${BASE_URL}/token-algorithm-rejected`,

  // Authorization (403)
  PERMISSION_DENIED:         `${BASE_URL}/permission-denied`,

  // Client errors (400-series)
  VALIDATION_FAILED:         `${BASE_URL}/validation-failed`,
  IDEMPOTENCY_CONFLICT:      `${BASE_URL}/idempotency-conflict`,
  INVALID_PAYMENT_METHOD:    `${BASE_URL}/invalid-payment-method`,

  // Payment-specific (402)
  INSUFFICIENT_FUNDS:        `${BASE_URL}/insufficient-funds`,
  CARD_DECLINED:             `${BASE_URL}/card-declined`,

  // Not found (404)
  PAYMENT_NOT_FOUND:         `${BASE_URL}/payment-not-found`,
  SUBSCRIPTION_NOT_FOUND:    `${BASE_URL}/subscription-not-found`,  // was missing

  // Business rule violations (422)
  REFUND_EXCEEDS_AMOUNT:     `${BASE_URL}/refund-exceeds-amount`,    // was missing
  WEBHOOK_VERIFICATION_FAILED: `${BASE_URL}/webhook-verification-failed`, // was missing

  // Rate limiting (429)
  RATE_LIMITED:              `${BASE_URL}/rate-limited`,

  // Server errors (500-series)
  INTERNAL_ERROR:            `${BASE_URL}/internal-error`,
  GATEWAY_ERROR:             `${BASE_URL}/gateway-error`,
} as const;

export type ErrorType = typeof ErrorTypes[keyof typeof ErrorTypes];
```

---

## 2. Base Error Classes

```typescript
// src/errors/AppError.ts

import { ErrorType } from './registry';

/**
 * Base class for all application errors.
 *
 * Design note: We extend Error rather than using plain objects so that
 * the call stack is preserved for internal logging, even though the stack
 * is NEVER sent to clients (PCI-DSS + SEC-2025-044).
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly type: ErrorType;
  abstract readonly title: string;

  constructor(
    public readonly detail: string,
    public readonly extensions: Record<string, unknown> = {}
  ) {
    super(detail);
    this.name = this.constructor.name;
    // Maintains proper prototype chain in transpiled TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── 401 Authentication Errors ───────────────────────────────────────────────

/**
 * No credentials provided, or credentials are structurally invalid.
 * Distinct from TokenExpiredError and TokenAlgorithmRejectedError
 * so clients get actionable messages.
 */
export class AuthenticationRequiredError extends AppError {
  readonly statusCode = 401;
  readonly type = ErrorTypes.AUTHENTICATION_REQUIRED;
  readonly title = 'Authentication Required';
}

export class TokenExpiredError extends AppError {
  readonly statusCode = 401;
  readonly type = ErrorTypes.TOKEN_EXPIRED;
  readonly title = 'Token Expired';
}

export class TokenInvalidError extends AppError {
  readonly statusCode = 401;
  readonly type = ErrorTypes.TOKEN_INVALID;
  readonly title = 'Invalid Token';
}

/**
 * Raised specifically when a token uses HS256 or any algorithm other than RS256.
 * Per SEC-2025-041 (CRITICAL): RS256 is mandatory. HS256 was explicitly rejected
 * because it requires sharing the signing secret with every validating service.
 *
 * Giving this a distinct error type means:
 * - Clients misconfigured to use HS256 get a clear, actionable error
 * - Security teams can monitor for HS256 attempts specifically
 * - The error message does NOT reveal what algorithm would be accepted
 *   in a way that helps an attacker (RS256 is public knowledge from ADR-001)
 */
export class TokenAlgorithmRejectedError extends AppError {
  readonly statusCode = 401;
  readonly type = ErrorTypes.TOKEN_ALGORITHM_REJECTED;
  readonly title = 'Token Algorithm Not Permitted';
}

// ─── 403 Authorization Errors ────────────────────────────────────────────────

/**
 * Token is valid but the caller lacks the required permission.
 *
 * IMPORTANT: 401 vs 403 distinction matters:
 * - 401 means "I don't know who you are" → client should re-authenticate
 * - 403 means "I know who you are, you just can't do this" → re-authenticating
 *   with the same credentials won't help
 *
 * Conflating these (returning 403 for expired tokens, or 401 for permission
 * failures) causes clients to retry uselessly or fail to retry when they should.
 */
export class PermissionDeniedError extends AppError {
  readonly statusCode = 403;
  readonly type = ErrorTypes.PERMISSION_DENIED;
  readonly title = 'Permission Denied';
}

// ─── 400 Validation Errors ───────────────────────────────────────────────────

export interface ValidationErrorDetail {
  field: string;
  message: string;
  received?: unknown; // Include what was received, but NEVER card data
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly type = ErrorTypes.VALIDATION_FAILED;
  readonly title = 'Validation Failed';

  constructor(
    public readonly validationErrors: ValidationErrorDetail[],
    detail?: string
  ) {
    super(
      detail ?? `${validationErrors.length} validation error(s) in request`,
      { validation_errors: validationErrors }
    );
  }
}

// ─── 402 Payment Errors ──────────────────────────────────────────────────────

export class InsufficientFundsError extends AppError {
  readonly statusCode = 402;
  readonly type = ErrorTypes.INSUFFICIENT_FUNDS;
  readonly title = 'Insufficient Funds';
}

export class CardDeclinedError extends AppError {
  readonly statusCode = 402;
  readonly type = ErrorTypes.CARD_DECLINED;
  readonly title = 'Card Declined';
}

// ─── 404 Not Found Errors ────────────────────────────────────────────────────

export class PaymentNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly type = ErrorTypes.PAYMENT_NOT_FOUND;
  readonly title = 'Payment Not Found';
}

export class SubscriptionNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly type = ErrorTypes.SUBSCRIPTION_NOT_FOUND;
  readonly title = 'Subscription Not Found';
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class IdempotencyConflictError extends AppError {
  readonly statusCode = 409;
  readonly type = ErrorTypes.IDEMPOTENCY_CONFLICT;
  readonly title = 'Idempotency Conflict';
}

// ─── 422 Business Rule Violations ────────────────────────────────────────────

export class RefundExceedsAmountError extends AppError {
  readonly statusCode = 422;
  readonly type = ErrorTypes.REFUND_EXCEEDS_AMOUNT;
  readonly title = 'Refund Exceeds Original Amount';
}

export class WebhookVerificationFailedError extends AppError {
  readonly statusCode = 400;
  readonly type = ErrorTypes.WEBHOOK_VERIFICATION_FAILED;
  readonly title = 'Webhook Verification Failed';

  /**
   * CRITICAL CONSTRAINT (Stripe integration): This error must NEVER include
   * the webhook signing secret, the expected signature, or any information
   * that would help an attacker forge a valid signature.
   *
   * Safe to include: that verification failed, the timestamp tolerance window.
   * Never include: STRIPE_WEBHOOK_SECRET, computed HMAC values, raw signatures.
   */
}

// ─── 429 Rate Limit Errors ───────────────────────────────────────────────────

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly type = ErrorTypes.RATE_LIMITED;
  readonly title = 'Rate Limit Exceeded';

  /**
   * retryAfterSeconds is REQUIRED per:
   * - ADR-002: Retry-After header is mandatory on 429
   * - Partner SLA (HIGH constraint): contractual obligation
   *
   * Making it a required constructor parameter (not optional) ensures
   * it can never be accidentally omitted.
   */
  constructor(
    public readonly retryAfterSeconds: number,
    detail: string
  ) {
    super(detail, { retry_after: retryAfterSeconds });
  }
}

// ─── 500/502 Server Errors ───────────────────────────────────────────────────

export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly type = ErrorTypes.INTERNAL_ERROR;
  readonly title = 'Internal Server Error';
}

export class GatewayError extends AppError {
  readonly statusCode = 502;
  readonly type = ErrorTypes.GATEWAY_ERROR;
  readonly title = 'Payment Gateway Error';
}
```

---

## 3. RFC 9457 Response Serializer

```typescript
// src/errors/serializer.ts

/**
 * Serializes any AppError into a valid RFC 9457 Problem Details object.
 *
 * RFC 9457 required fields:
 *   type     - URI identifying the error type
 *   title    - Short human-readable summary (MUST NOT change between occurrences)
 *   status   - HTTP status code (integer)
 *   detail   - Human-readable explanation of THIS occurrence
 *   instance - URI of the specific occurrence (request path)
 *
 * Extension fields we add:
 *   trace_id          - Correlation ID for log lookup (always present)
 *   validation_errors - Field-level errors (ValidationError only)
 *   retry_after       - Seconds until retry (RateLimitError only)
 *
 * NEVER include in any response:
 *   - Stack traces (PCI-DSS, SEC-2025-044)
 *   - Internal service names or database error messages
 *   - Signing secrets, API keys, or credentials of any kind
 *   - Raw Stripe error objects (may contain sensitive metadata)
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  trace_id: string;
  [extension: string]: unknown;
}

export function serializeProblemDetails(
  error: AppError,
  instance: string,
  traceId: string
): ProblemDetails {
  const body: ProblemDetails = {
    type: error.type,
    title: error.title,
    status: error.statusCode,
    detail: error.detail,
    instance,
    trace_id: traceId,
  };

  // Merge extension fields (validation_errors, retry_after, etc.)
  // These are set by individual error constructors and are always safe to expose.
  for (const [key, value] of Object.entries(error.extensions)) {
    body[key] = value;
  }

  return body;
}

/**
 * Fallback serializer for unexpected errors (non-AppError).
 *
 * When an unknown error reaches the global handler, we MUST NOT expose
 * its message (could contain SQL errors, internal paths, secrets).
 * We log the full error internally and return a generic 500.
 */
export function serializeUnknownError(
  instance: string,
  traceId: string
): ProblemDetails {
  return {
    type: ErrorTypes.INTERNAL_ERROR,
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred. Use the trace_id to look up details.',
    instance,
    trace_id: traceId,
  };
}
```

---

## 4. Global Error Handler Middleware

```typescript
// src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { getTraceId } from '../lib/tracing';
import { AppError, RateLimitError } from '../errors/AppError';
import { serializeProblemDetails, serializeUnknownError } from '../errors/serializer';

/**
 * Global Express error handler. Must be registered LAST, after all routes.
 *
 * Express identifies error handlers by their 4-argument signature (err, req, res, next).
 * Do not remove the `next` parameter even if unused — Express requires it.
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction  // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  const traceId = getTraceId(req);
  const instance = req.path;

  // ── Case 1: Known application error ────────────────────────────────────────
  if (err instanceof AppError) {
    // Log at appropriate level: 5xx = error, 4xx = warn (not our fault)
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger[logLevel]('Application error', {
      trace_id: traceId,
      error_type: err.type,
      status: err.statusCode,
      // Stack is logged internally but NEVER sent to client
      stack: err.stack,
    });

    const body = serializeProblemDetails(err, instance, traceId);

    // ── Rate limit errors: MUST include Retry-After header ──────────────────
    // This satisfies:
    //   - ADR-002: Retry-After required on 429
    //   - Partner SLA (HIGH constraint): contractual obligation
    //   - Active constraint: "Rate limit responses (HTTP 429) must include
    //     the Retry-After header"
    if (err instanceof RateLimitError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.set

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