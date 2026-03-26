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
**Authors:** Payments API Team  
**Supersedes:** None  
**Related:** ADR-001, SEC-2025-041, SEC-2025-042

---

## Context

The Payments API requires an authentication module that satisfies several overlapping requirements:

1. **Security review compliance** — Finding SEC-2025-041 (Critical) explicitly rejects HS256 and mandates RS256 or ES256 before production deployment.
2. **Stateless validation** — Multiple downstream services must validate tokens without a database round-trip on every request.
3. **Zero-trust architecture** — No single compromised service should be able to forge tokens or expose the signing secret to other services.
4. **Replay protection** — Finding SEC-2025-042 (High) requires refresh token replay detection with automatic family revocation.
5. **Consistency with prior decisions** — ADR-001 already established RS256 and the JWKS distribution model. This ADR operationalizes those decisions into concrete implementation specifications.

The team evaluated HS256 during the initial design phase and it was rejected. That decision is not revisited here. This ADR focuses on *how* to implement the RS256-based system correctly.

---

## Decision

### 1. Token Signing Algorithm: RS256

**Algorithm chosen: RS256 (RSA-SHA256)**

This is not a new decision — it is a compliance requirement from SEC-2025-041 and was confirmed in the 2026-01-12 architecture session. The reasoning is documented here for completeness so future developers understand why HS256 must never be substituted, even in development shortcuts.

| Property | HS256 (rejected) | RS256 (chosen) |
|---|---|---|
| Key type | Symmetric shared secret | Asymmetric key pair |
| Who can issue tokens | Any service holding the secret | Only the auth service (private key) |
| Who can validate tokens | Any service holding the secret | Any service with the public key |
| Secret distribution | Secret must reach all 8+ services | Public key only — safe to distribute |
| Blast radius if service compromised | Entire signing secret exposed | Only that service's access is affected |
| Key rotation | Requires coordinated secret rotation across all services | Update JWKS endpoint; services pick up new key automatically |

**Implementation note:** The API gateway is configured to reject tokens signed with any algorithm other than RS256. This is enforced at the infrastructure level, not just in application code. Do not attempt to use HS256 even in test environments that share infrastructure with production.

**Key management:**
- The RSA private key (2048-bit minimum, 4096-bit preferred) lives exclusively in the auth service, loaded from a secrets manager (e.g., AWS Secrets Manager or Vault) at startup — never from environment variables in plaintext.
- The corresponding public key is exposed via `/.well-known/jwks.json` on the auth service.
- All validating services fetch the JWKS endpoint on startup and cache it, with a background refresh every 15 minutes and an on-demand refresh when a `kid` (key ID) is encountered that is not in the local cache (handles key rotation without downtime).

---

### 2. JWT Token Structure

#### 2a. Access Token

Access tokens are short-lived JWTs signed with RS256. They are bearer tokens — possession is sufficient for access, so expiry must be short.

**Header:**
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "payments-auth-2026-01"
}
```

The `kid` (key ID) field is mandatory. It allows validating services to select the correct public key from the JWKS endpoint during key rotation, without needing to try all keys.

**Payload:**
```json
{
  "sub": "user_abc123",
  "iss": "payments-auth",
  "aud": "payments-api",
  "iat": 1705312000,
  "exp": 1705312900,
  "jti": "tok_7f3a9b2c1d4e5f6a",
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
| `iss` | Standard | Issuer verification | Validated against `payments-auth` — rejects tokens from other issuers |
| `aud` | Standard | Audience restriction | Validated against `payments-api` — rejects tokens intended for other services |
| `iat` | Standard | Issued-at timestamp | Used for deny-list TTL calculation |
| `exp` | Standard | Expiry | 15 minutes from `iat` — short to limit exposure of stolen tokens |
| `jti` | Standard | JWT ID | Unique token identifier; used for deny-list lookups on logout/revocation |
| `roles` | Custom | Coarse-grained access | e.g., `merchant`, `admin`, `readonly` |
| `permissions` | Custom | Fine-grained access | Specific operation permissions; checked per-endpoint |
| `tenant_id` | Custom | Multi-tenancy isolation | All data access is scoped to this tenant; never trust the request body for tenant identity |
| `tier` | Custom | Rate limit tier | Embedded to avoid a Redis lookup on every request for tier determination |

**What is intentionally excluded from the token:**
- Email address — PII that doesn't belong in a bearer token
- Payment method details — never in a token
- Internal service names or infrastructure details

**Expiry: 15 minutes.** This is short by design. A stolen access token is valid for at most 15 minutes. The refresh token mechanism handles session continuity without requiring longer-lived access tokens.

#### 2b. Refresh Token

Refresh tokens are **opaque** (not JWTs). They are random, high-entropy strings stored server-side with associated metadata. They are never decoded by the client — they are simply exchanged for a new access token.

**Why opaque, not JWT?**
- Refresh tokens need to be revocable. A JWT refresh token cannot be revoked without a deny-list, at which point you've lost the stateless benefit anyway.
- Opaque tokens stored server-side can be deleted on revocation, logout, or replay detection.
- Clients have no reason to inspect refresh token contents.

**Server-side storage schema (PostgreSQL):**
```sql
CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    BYTEA NOT NULL UNIQUE,  -- SHA-256 of the raw token
  family_id     UUID NOT NULL,          -- Groups related tokens for replay detection
  user_id       TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,   -- 30 days from issuance
  rotated_at    TIMESTAMPTZ,            -- Set when this token is rotated (not yet expired)
  revoked_at    TIMESTAMPTZ,            -- Set when explicitly revoked
  replaced_by   UUID REFERENCES refresh_tokens(id),
  user_agent    TEXT,                   -- For session display in account UI
  ip_address    INET                    -- For anomaly detection
);

CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

The raw token is never stored — only its SHA-256 hash. This means a database breach does not expose usable refresh tokens.

#### 2c. Refresh Token Rotation Strategy

This implements SEC-2025-042 (replay protection) using the family-based approach from ADR-001.

**Normal rotation flow:**
```
Client sends refresh_token_A
  → Server looks up hash(refresh_token_A) in DB
  → Token is valid and not rotated/revoked
  → Server generates refresh_token_B
  → Server stores refresh_token_B, sets refresh_token_A.replaced_by = B, refresh_token_A.rotated_at = NOW()
  → Server issues new access_token + refresh_token_B to client
  → refresh_token_A is now "rotated" — it will be accepted for 30 more seconds (grace window) then rejected
```

**Replay detection flow (stolen token scenario):**
```
Attacker sends refresh_token_A (already rotated — legitimate client has refresh_token_B)
  → Server looks up hash(refresh_token_A)
  → Token exists but rotated_at is set AND grace window has passed
  → SECURITY EVENT: This token was already rotated. Replay detected.
  → Server revokes ALL tokens in the same family_id (sets revoked_at = NOW())
  → Server returns 401 with problem detail type /errors/authentication-required
  → Legitimate user is forced to re-authenticate (acceptable security trade-off)
  → Security event is logged with family_id, user_id, IP addresses of both uses
```

**Grace window (30 seconds):** Handles the case where the client successfully receives the new token but the network drops before the old token is marked as used. Without a grace window, this would cause spurious logouts. The 30-second window is short enough to not meaningfully help an attacker.

**Refresh token expiry: 30 days.** After 30 days, the user must re-authenticate with their credentials. This is enforced by `expires_at`, not by the rotation chain.

---

### 3. Token Validation Middleware

The middleware is implemented as a shared npm package `@payments/auth-middleware` imported by all services. This ensures consistent validation logic — no service can accidentally implement a weaker check.

#### 3a. Validation Pipeline

Every protected request passes through these checks in order. A failure at any step short-circuits to a 401 response — the specific step is logged internally but the error response does not reveal which check failed (to avoid leaking information to attackers).

```
Request arrives
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 1: Extract token                               │
│ - Check Authorization header                        │
│ - Must be "Bearer <token>" format                   │
│ - Reject if missing or malformed → 401              │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 2: Decode header (without verification)        │
│ - Extract `kid` claim from JWT header               │
│ - Reject if `kid` is missing → 401                  │
│ - Reject if `alg` is not "RS256" → 401              │
│   (algorithm confusion attack prevention)           │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 3: Fetch public key                            │
│ - Look up `kid` in local JWKS cache                 │
│ - If not found: refresh JWKS from auth service      │
│ - If still not found: reject → 401                  │
│ - Cache TTL: 15 minutes; max 10 keys cached         │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 4: Verify signature                            │
│ - Cryptographic RS256 signature verification        │
│ - Reject if invalid → 401                           │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 5: Validate standard claims                    │
│ - exp: reject if expired (no clock skew tolerance)  │
│ - iss: must equal "payments-auth"                   │
│ - aud: must equal "payments-api"                    │
│ - iat: must not be in the future (>5s tolerance)    │
│ - Reject any failure → 401                          │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 6: Check deny-list                             │
│ - Look up jti in Redis deny-list                    │
│ - Reject if present (token was explicitly revoked)  │
│ - On Redis failure: FAIL CLOSED → 401 + alert       │
│   (unlike rate limiting, auth must not fail-open)   │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Step 7: Attach context to request                   │
│ - req.auth = { sub, tenant_id, roles,               │
│                permissions, tier, jti }             │
│ - Downstream handlers use req.auth — never          │
│   re-parse the token themselves                     │
└─────────────────────────────────────────────────────┘
    │
    ▼
  next()
```

#### 3b. Algorithm Confusion Attack Prevention

Step 2 explicitly checks that `alg === "RS256"` before proceeding. This prevents the well-known algorithm confusion attack where an attacker:
1. Takes a valid RS256 token
2. Changes the header to `"alg": "none"` or `"alg": "HS256"`
3. Signs it with the public key (which is public knowledge) as if it were an HS256 secret

The JWT library must also be configured with `algorithms: ["RS256"]` — never `algorithms: ["*"]` or allowing the library to accept the algorithm from the token header without restriction.

#### 3c. Fail Behavior

| Failure scenario | Behavior | Rationale |
|---|---|---|
| Missing/malformed token | 401, no retry | Client error |
| Invalid signature | 401, no retry | Possible attack |
| Expired token | 401, client should refresh | Normal flow |
| Token on deny-list | 401, no retry | Revoked session |
| JWKS endpoint unreachable | 401, alert ops | Fail closed — auth must not fail open |
| Redis deny-list unreachable | 401, alert ops | Fail closed — cannot verify revocation |

**Auth fails closed.** This is the opposite of the rate limiting decision (which fails open). The reasoning: a rate limit failure means some requests get through that shouldn't — annoying but not a security breach. An auth failure that fails open means unverified requests reach protected resources — a security breach.

#### 3d. Error Response Format

All auth failures return RFC 9457 Problem Details (per ADR-003):

```json
{
  "type": "https://api.payments.example/errors/authentication-required",
  "title": "Authentication Required",
  "status": 401,
  "detail": "A valid Bearer token is required to access this resource.",
  "instance": "/v1/payments",
  "trace_id": "req_4f8a2b1c9d3e7f0a"
}
```

Note: The `detail` field uses a generic message regardless of which validation step failed. Do not include messages like "token expired" or "invalid signature" — these help attackers understand the system's behavior. The `trace_id` allows internal debugging without exposing details externally.

#### 3e. Permission Checking

The middleware (Step 7) only validates *authentication* — that the token is genuine and belongs to a real user. *Authorization* (does this user have permission to do this specific thing?) is handled by per-route permission guards that run after the middleware:

```typescript
// Middleware: validates token, attaches req.auth
app.use('/v1/payments', authMiddleware);

// Route guard: checks specific permission
router.post('/v1/payments', 
  requirePermission('payments:create'),
  createPaymentHandler
);

// requirePermission implementation
function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth.permissions.includes(permission)) {
      return res.status(403).json({
        type: 'https://api.payments.example/errors/permission-denied',
        title: 'Permission Denied',
        status: 403,
        detail: `This operation requires the '${permission}' permission

---

## Phase: Rate Limiting Implementation

### Agent Output

# ADR-002: Sliding Window Rate Limiting

**Status:** Accepted
**Date:** 2026-01-15
**Supersedes:** —
**Related:** ADR-001 (JWT/RS256 Auth), ADR-003 (RFC 9457 Errors), SEC-2025-041, SEC-2025-043

---

## Context

The Payments API needs rate limiting to protect backend services from overload, enforce fair usage across tenants, and meet SLA commitments to API consumers. This ADR documents the algorithm choice, header design, identity resolution strategy, and failure behavior.

Several constraints are non-negotiable before we reach algorithm selection:

- **[HIGH] `Retry-After` header is mandatory on HTTP 429 responses.** This is a contractual obligation per the partner integration agreement signed 2025-Q3. Omitting it violates SLA terms (see also SEC-2025-043 and the API spec).
- **[HIGH] Error responses must use RFC 9457 Problem Details format** (`application/problem+json`) per ADR-003.
- **Rate limit identity derives from the auth layer**, which uses RS256-signed JWTs (ADR-001). The rate limiter must handle both JWT-authenticated users and API key-authenticated server-to-server clients.

---

## Decision

### 1. Algorithm: Sliding Window Counter

Three algorithms were evaluated:

| Algorithm | Accuracy | Memory | Burst safety |
|---|---|---|---|
| Fixed window | Low — allows 2× burst at boundary | O(1) per key | Poor |
| Sliding window log | Exact | O(requests) per key | Excellent |
| Sliding window counter | Good (~±5% at boundary) | O(1) per key | Good |

**Fixed window** is rejected. A client can send `limit` requests at 23:59:59 and another `limit` at 00:00:00, effectively doubling throughput at every window boundary. For a payments API this is unacceptable — a burst of 200 requests in two seconds can cause real downstream harm.

**Sliding window log** is rejected for operational reasons. Storing every request timestamp per key means memory usage scales with request volume. At 500 req/min for enterprise tenants across many keys, this becomes a Redis memory problem under load.

**Sliding window counter** is chosen. It approximates the true sliding window by blending the previous and current fixed-window counts:

```
effective_count = (previous_window_count × overlap_ratio) + current_window_count

overlap_ratio = (window_duration_ms - elapsed_ms_in_current_window) / window_duration_ms
```

The ±5% inaccuracy at window boundaries is acceptable. It eliminates the 2× burst problem of fixed windows while keeping memory bounded at two counters and a timestamp per key. This is the standard approach used by Cloudflare, Nginx, and most production rate limiters.

**Window duration:** 60 seconds for all tiers. Shorter windows increase boundary inaccuracy; longer windows make `Retry-After` values uncomfortably large for clients.

---

### 2. Storage

Rate limit state is stored in Redis. Redis is already in the infrastructure for the session store (Team Architecture Decisions Log, 2026-01-08). Per the 2026-01-16 architecture discussion, rate limiting uses a **dedicated Redis cluster** separate from the session store to isolate failure domains.

Key pattern:

```
rl:{scope}:{identifier}:{window_start_unix}
```

Examples:

```
rl:user:user_abc123:1705312800
rl:tenant:tenant_xyz:1705312800
rl:apikey:pk_live_a1b2c3:1705312800
```

Keys expire after `2 × window_duration` (120 seconds). This ensures the previous window's counter is always available for the overlap calculation without unbounded accumulation.

The counter increment and read are done in a single Lua script to avoid race conditions:

```lua
local key_current = KEYS[1]
local key_previous = KEYS[2]
local window_start = tonumber(ARGV[1])
local now_ms = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local current = redis.call('INCR', key_current)
if current == 1 then
  redis.call('PEXPIRE', key_current, ttl)
end

local previous = tonumber(redis.call('GET', key_previous) or 0)
local elapsed_ms = now_ms - (window_start * 1000)
local overlap = (window_ms - elapsed_ms) / window_ms
local effective = (previous * overlap) + current

return {current, previous, effective}
```

Using a Lua script ensures atomicity without a distributed lock. Redis executes scripts as a single command.

---

### 3. Rate Limit Response Headers

**On every response** (within limits):

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1705312860
```

**On HTTP 429 responses** (limit exceeded), all of the above plus:

```
Retry-After: 23
```

`Retry-After` is in seconds (integer). It is calculated as:

```
retry_after = ceil(window_reset_unix - now_unix)
```

This is always a positive integer. If the calculation produces zero or negative (clock skew edge case), we floor at 1 to avoid sending `Retry-After: 0`, which some clients interpret as "retry immediately."

**Header semantics:**

| Header | Value | Notes |
|---|---|---|
| `X-RateLimit-Limit` | Max requests per window | Reflects the caller's tier |
| `X-RateLimit-Remaining` | `max(0, limit - effective_count)` | Uses effective count, not raw current count |
| `X-RateLimit-Reset` | Unix timestamp of window reset | Clients can compute exact wait time |
| `Retry-After` | Seconds until retry (429 only) | **Contractual obligation — never omit on 429** |

`X-RateLimit-Remaining` is derived from the effective (blended) count, not the raw current-window count. This gives clients an accurate picture of their remaining budget and avoids the confusing situation where `Remaining` appears to reset mid-window.

---

### 4. HTTP 429 Response Body

Per ADR-003, all error responses use RFC 9457 Problem Details with `Content-Type: application/problem+json`. A rate limit error looks like:

```json
{
  "type": "https://api.payments.example/errors/rate-limited",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You have exceeded the rate limit of 100 requests per minute. Your effective request count is 103.",
  "instance": "/v1/payments",
  "retry_after": 23,
  "trace_id": "01HXYZ..."
}
```

The `retry_after` extension field mirrors the `Retry-After` header value. Clients that parse the body rather than headers get the same information. The `trace_id` field allows support to correlate the event in logs.

The error type URI (`/errors/rate-limited`) must be registered in the error type registry per ADR-003.

---

### 5. Identity Resolution: JWT Users vs. API Keys

The rate limiter runs **after** the authentication middleware. By the time a request reaches the rate limiter, the auth middleware has already validated the token (RS256 signature, expiry, audience, issuer) and attached the resolved identity to the request context.

The rate limiter reads identity from context — it never re-parses or re-validates tokens.

**Identity resolution rules:**

```
if request has valid JWT:
    primary key  = tenant_id claim      (tenant-level limit)
    secondary key = sub claim           (per-user limit within tenant)
    tier         = lookup(tenant_id) from Redis-cached tier table

elif request has valid API key:
    primary key  = api_key_id           (per-key limit)
    tier         = lookup(api_key_id) from Redis-cached tier table

else:
    → auth middleware already rejected with 401; rate limiter never runs
```

**Two-level limiting for JWT requests:**

JWT-authenticated requests are checked against two limits in sequence:

1. **Per-user limit** — prevents a single user from monopolizing a tenant's quota.
2. **Per-tenant limit** — prevents a tenant from monopolizing shared infrastructure.

Both checks happen in the same Redis round-trip (pipelined). If either limit is exceeded, the response reflects the binding limit (the one that triggered 429). The `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers reflect the more restrictive of the two.

API key requests are checked against a single per-key limit. API keys are used for server-to-server integrations where the caller is already a trusted, identified service — per-user sub-limits don't apply.

**Tier lookup:**

Tier is determined from `tenant_id` (JWT) or `api_key_id` (API key) via a Redis-cached lookup. Cache TTL is 60 seconds. On cache miss, the tier service is queried and the result is cached. If the tier service is unreachable, the request is treated as Standard tier (fail-safe, not fail-open to a higher tier).

---

### 6. Tiered Limits

| Tier | Requests/min (per user) | Requests/min (per tenant) | Burst allowance |
|---|---|---|---|
| Standard | 100 | 500 | +20% |
| Premium | 500 | 2,000 | +20% |
| Enterprise | Custom | Custom | Custom |

Burst allowance means the effective limit is `limit × 1.2` for short spikes. This is implemented by setting the Redis limit check threshold at `limit × 1.2` while reporting `limit` in `X-RateLimit-Limit`. Clients see the nominal limit; the actual enforcement threshold has a 20% headroom to absorb legitimate bursts (e.g., a retry storm after a transient error).

---

### 7. Failure Behavior (Redis Unavailable)

If the rate limiting Redis cluster is unavailable:

- **Fail-open**: requests are allowed through without rate limit enforcement.
- A `WARNING`-level log entry is emitted for every request that bypasses rate limiting.
- Rate limit headers are **omitted** from responses during the outage (rather than sending misleading values).
- An alert fires if the Redis cluster is unreachable for more than 30 seconds.

Rationale: failing closed (rejecting all requests when Redis is down) would cause a complete API outage for a non-critical infrastructure component. For a payments API, availability during a Redis blip is preferable to a hard outage. This matches the decision recorded in the 2026-01-16 architecture log.

The one exception: if the Redis cluster is degraded but partially available (some nodes up), the Lua script may fail on specific keys. These individual failures also fail-open, with per-request logging.

---

### 8. Middleware Ordering

```
Request
  │
  ▼
TLS termination (ingress)
  │
  ▼
Request ID / trace context injection
  │
  ▼
Auth middleware          ← validates RS256 JWT or API key, attaches identity to context
  │
  ▼
Rate limit middleware    ← reads identity from context, checks Redis, sets headers
  │
  ▼
Route handlers
  │
  ▼
Response
```

Auth runs before rate limiting for two reasons:

1. The rate limiter needs the resolved identity (tenant, user, tier) that auth provides. Running rate limiting before auth would require the rate limiter to re-parse tokens, duplicating logic and creating a divergence risk.
2. Unauthenticated requests are rejected at the auth layer with a 401 before they consume any rate limit budget. This prevents unauthenticated callers from depleting a tenant's quota.

One consequence: a flood of unauthenticated requests (e.g., a credential-stuffing attack) is not rate-limited by this middleware. That traffic should be handled at the ingress/WAF layer, which is outside the scope of this ADR.

---

### 9. Interaction with Idempotency

Idempotent replays (requests with an `Idempotency-Key` that matches a cached response) **do not consume rate limit budget**. The idempotency middleware runs after the rate limiter in the stack, but the rate limiter checks a flag set by a lightweight idempotency pre-check:

```
Rate limit middleware:
  if idempotency_key present AND key exists in idempotency cache:
    skip rate limit increment, set X-Idempotent-Replayed: true, return cached response
  else:
    proceed with normal rate limit check
```

This prevents clients from being penalized for retrying requests that already succeeded — a common pattern after network failures.

---

## Consequences

**Positive:**
- Sliding window counter eliminates the 2× burst problem of fixed windows.
- O(1) memory per key keeps Redis footprint predictable.
- Two-level limiting (user + tenant) prevents noisy-neighbor problems within a tenant.
- Fail-open on Redis failure preserves API availability.
- `Retry-After` header on all 429 responses satisfies the contractual SLA obligation.
- RFC 9457 error body is consistent with ADR-003.

**Negative / trade-offs:**
- ±5% inaccuracy at window boundaries is inherent to the algorithm. Accepted.
- Two Redis keys per JWT request (user + tenant) doubles the Redis operations for that path. Mitigated by pipelining both checks in a single round-trip.
- Fail-open means a Redis outage allows unlimited traffic. Mitigated by alerting and the fact that the downstream services have their own capacity limits.
- Tier cache with 60-second TTL means a tier upgrade takes up to 60 seconds to take effect. Accepted.

**Open questions:**
- Enterprise tier limits are "custom" — the mechanism for configuring per-tenant custom limits needs a follow-up design (likely a configuration table in PostgreSQL, cached in Redis).
- IP-based rate limiting for unauthenticated traffic is explicitly out of scope here and should be handled at the ingress layer.

---

## Checklist Against Active Constraints

| Constraint | Status |
|---|---|
| `Retry-After` header on all 429 responses [HIGH] | ✅ Mandatory, calculated as `ceil(reset - now)`, floored at 1 |
| RFC 9457 error format on 429 [HIGH] | ✅ `application/problem+json` with all required fields |
| Auth tokens use RS256, not HS256 [CRITICAL] | ✅ Rate limiter reads identity from auth context; does not re-validate tokens |
| Stripe webhook secret server-side only [CRITICAL] | ✅ Not applicable to this ADR |

---

## Phase: Error Handling Refactor

### Agent Output

# Error Handling Refactor — Phase 3

## Pre-Work: Review of Prior Decisions

Before writing a line of code, I'm reviewing all constraints and ADRs to ensure nothing is missed.

**From Phase 1 (Authentication):**
- RS256 signing only — HS256 explicitly rejected (SEC-2025-041, CRITICAL)
- Auth errors must distinguish 401 (unauthenticated) from 403 (authenticated but unauthorized)
- Webhook signing secret stays server-side only (CRITICAL)

**From Phase 2 (Rate Limiting):**
- Sliding window counter algorithm
- 429 responses MUST include `Retry-After` header (contractual, HIGH)
- Also include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Redis fail-open behavior

**From ADR-003 (Error Handling):**
- All errors MUST use RFC 9457 Problem Details (`application/problem+json`)
- Required fields: `type`, `title`, `status`, `detail`, `instance`
- Optional: `validation_errors`, `trace_id`, `retry_after`
- Error type URIs from the registry at `https://api.payments.example/errors/`

---

## 1. Refactored Error Handling Design

### 1.1 Error Class Hierarchy

```typescript
// src/errors/base.ts

import { v4 as uuidv4 } from 'uuid';

/**
 * RFC 9457 Problem Details structure.
 * Every field here maps directly to the spec.
 * Extension fields are typed separately to make the boundary explicit.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  trace_id?: string;
  // Extension fields (RFC 9457 §3.2 allows these)
  [key: string]: unknown;
}

/**
 * Base class for all API errors.
 *
 * Design rationale: We extend Error so that instanceof checks work correctly
 * in Express error middleware. We carry the full ProblemDetails payload so
 * the error handler never has to reconstruct it — the error itself knows
 * how to be serialized.
 */
export abstract class ApiError extends Error {
  public readonly status: number;
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string;
  public readonly traceId: string;
  // Extension fields beyond the RFC 9457 base set
  protected extensions: Record<string, unknown> = {};

  constructor(
    status: number,
    type: string,
    title: string,
    detail: string,
  ) {
    super(detail);
    this.name = this.constructor.name;
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.traceId = uuidv4();

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize to RFC 9457 Problem Details.
   * The `instance` field is injected by the error handler because it
   * requires the request path, which the error itself doesn't own.
   */
  toProblemDetails(instance: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance,
      trace_id: this.traceId,
      ...this.extensions,
    };
  }

  /**
   * HTTP headers to add to the error response.
   * Subclasses override this to inject required headers (e.g., Retry-After).
   */
  responseHeaders(): Record<string, string> {
    return {};
  }
}
```

```typescript
// src/errors/auth.ts

import { ApiError } from './base';

const ERROR_BASE_URL = 'https://api.payments.example/errors';

/**
 * 401 Unauthenticated — the request has no valid credentials.
 *
 * Use when:
 * - No Authorization header present
 * - Token is malformed / unparseable
 * - Token signature is invalid
 * - Token is expired
 * - Token uses wrong algorithm (HS256 instead of RS256)
 *
 * Do NOT use for "valid token but wrong permissions" — that is 403.
 *
 * RFC 7235 requires a WWW-Authenticate header on 401 responses.
 * We include it here so it's never accidentally omitted.
 */
export class AuthenticationRequiredError extends ApiError {
  private readonly wwwAuthenticateValue: string;

  constructor(
    detail: string,
    wwwAuthenticateValue = 'Bearer realm="payments-api"',
  ) {
    super(
      401,
      `${ERROR_BASE_URL}/authentication-required`,
      'Authentication Required',
      detail,
    );
    this.wwwAuthenticateValue = wwwAuthenticateValue;
  }

  override responseHeaders(): Record<string, string> {
    return {
      'WWW-Authenticate': this.wwwAuthenticateValue,
    };
  }
}

/**
 * 403 Permission Denied — the request is authenticated but not authorized.
 *
 * Use when:
 * - Token is valid and not expired
 * - Token algorithm is RS256 (correct)
 * - But the token's permissions/roles do not allow the requested operation
 *
 * Critical distinction from 401:
 * - 401 → "I don't know who you are"
 * - 403 → "I know who you are, but you can't do this"
 *
 * Returning 403 when you mean 401 leaks information (confirms a resource
 * exists). Returning 401 when you mean 403 confuses clients into retrying
 * with different credentials when the problem is permissions, not identity.
 */
export class PermissionDeniedError extends ApiError {
  constructor(detail: string) {
    super(
      403,
      `${ERROR_BASE_URL}/permission-denied`,
      'Permission Denied',
      detail,
    );
  }
}

/**
 * Specific 401 for algorithm mismatch.
 *
 * SEC-2025-041 (CRITICAL): HS256 tokens must be rejected.
 * We use a distinct error subclass so:
 * 1. We can log these separately (algorithm mismatch is a security signal)
 * 2. The detail message is always accurate
 * 3. Future alerting rules can target this specific error type
 */
export class InvalidTokenAlgorithmError extends AuthenticationRequiredError {
  constructor(receivedAlgorithm: string) {
    super(
      // Detail is intentionally vague to avoid leaking implementation details
      // to external callers, but specific enough for debugging.
      `Token uses unsupported signing algorithm. Expected RS256.`,
      'Bearer realm="payments-api", error="invalid_token", ' +
        'error_description="unsupported algorithm"',
    );
    // Store for internal logging — NOT included in the response body
    this.extensions['_internal_algorithm'] = receivedAlgorithm;
  }

  /**
   * Override toProblemDetails to strip the internal field before
   * sending to the client. The underscore prefix is a convention,
   * but explicit stripping is safer.
   */
  override toProblemDetails(instance: string) {
    const details = super.toProblemDetails(instance);
    delete details['_internal_algorithm'];
    return details;
  }
}
```

```typescript
// src/errors/rate-limit.ts

import { ApiError } from './base';

const ERROR_BASE_URL = 'https://api.payments.example/errors';

export interface RateLimitErrorOptions {
  retryAfterSeconds: number;
  limit: number;
  resetTimestamp: number; // Unix timestamp
}

/**
 * 429 Rate Limited
 *
 * CONTRACTUAL REQUIREMENT (HIGH): The Retry-After header MUST be present
 * on all 429 responses. This is a partner SLA obligation from the 2025-Q3
 * integration agreement. Omitting it violates SLA terms.
 *
 * We enforce this by making retryAfterSeconds a required constructor
 * argument — it is impossible to construct this error without it.
 *
 * All four rate limit headers are included in responseHeaders() so the
 * error handler never has to remember to add them separately.
 */
export class RateLimitError extends ApiError {
  private readonly retryAfterSeconds: number;
  private readonly limit: number;
  private readonly resetTimestamp: number;

  constructor(options: RateLimitErrorOptions) {
    super(
      429,
      `${ERROR_BASE_URL}/rate-limited`,
      'Too Many Requests',
      `Rate limit exceeded. You have sent too many requests. ` +
        `Please retry after ${options.retryAfterSeconds} seconds.`,
    );
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.limit = options.limit;
    this.resetTimestamp = options.resetTimestamp;

    // retry_after is an RFC 9457 extension field — include it in the body
    // as well as the header so clients that only read the body still get it
    this.extensions['retry_after'] = options.retryAfterSeconds;
  }

  /**
   * Returns ALL required rate limit headers.
   *
   * Retry-After: required by partner SLA (ADR-002, partner agreement 2025-Q3)
   * X-RateLimit-*: required by API spec
   *
   * These are returned from the error itself so the global error handler
   * doesn't need rate-limit-specific logic. The handler just calls
   * error.responseHeaders() for any ApiError.
   */
  override responseHeaders(): Record<string, string> {
    return {
      'Retry-After': String(this.retryAfterSeconds),
      'X-RateLimit-Limit': String(this.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(this.resetTimestamp),
    };
  }
}
```

```typescript
// src/errors/payment.ts

import { ApiError } from './base';

const ERROR_BASE_URL = 'https://api.payments.example/errors';

export class InsufficientFundsError extends ApiError {
  constructor(detail: string) {
    super(402, `${ERROR_BASE_URL}/insufficient-funds`, 'Insufficient Funds', detail);
  }
}

export class CardDeclinedError extends ApiError {
  constructor(detail: string) {
    super(402, `${ERROR_BASE_URL}/card-declined`, 'Card Declined', detail);
  }
}

export class InvalidPaymentMethodError extends ApiError {
  constructor(detail: string) {
    super(400, `${ERROR_BASE_URL}/invalid-payment-method`, 'Invalid Payment Method', detail);
  }
}

export class GatewayError extends ApiError {
  constructor(detail: string) {
    super(502, `${ERROR_BASE_URL}/gateway-error`, 'Payment Gateway Error', detail);
  }
}

export class IdempotencyConflictError extends ApiError {
  constructor(idempotencyKey: string) {
    super(
      409,
      `${ERROR_BASE_URL}/idempotency-conflict`,
      'Idempotency Conflict',
      `A request with idempotency key '${idempotencyKey}' is already in progress.`,
    );
  }
}
```

```typescript
// src/errors/validation.ts

import { ApiError } from './base';

const ERROR_BASE_URL = 'https://api.payments.example/errors';

export interface ValidationFailure {
  field: string;
  message: string;
  received?: unknown;
}

/**
 * 422 Validation Failed
 *
 * Uses the RFC 9457 extension field `validation_errors` to carry
 * field-level detail. This is explicitly listed in ADR-003 as an
 * approved extension field.
 */
export class ValidationError extends ApiError {
  constructor(failures: ValidationFailure[]) {
    super(
      422,
      `${ERROR_BASE_URL}/validation-failed`,
      'Validation Failed',
      `The request body contains ${failures.length} validation error(s).`,
    );
    this.extensions['validation_errors'] = failures;
  }
}

/**
 * 404 Not Found
 *
 * Kept generic — we intentionally do not distinguish "never existed"
 * from "exists but you can't see it" to avoid resource enumeration.
 */
export class NotFoundError extends ApiError {
  constructor(resourceType: string, id: string) {
    super(
      404,
      `${ERROR_BASE_URL}/not-found`,
      'Not Found',
      `${resourceType} '${id}' was not found.`,
    );
  }
}
```

```typescript
// src/errors/index.ts — barrel export

export { ApiError } from './base';
export type { ProblemDetails } from './base';
export {
  AuthenticationRequiredError,
  PermissionDeniedError,
  InvalidTokenAlgorithmError,
} from './auth';
export { RateLimitError } from './rate-limit';
export type { RateLimitErrorOptions } from './rate-limit';
export {
  InsufficientFundsError,
  CardDeclinedError,
  InvalidPaymentMethodError,
  GatewayError,
  IdempotencyConflictError,
} from './payment';
export { ValidationError, NotFoundError } from './validation';
export type { ValidationFailure } from './validation';
```

---

### 1.2 Global Error Handler Middleware

```typescript
// src/middleware/errorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { ApiError, ProblemDetails } from '../errors';
import { logger } from '../lib/logger';

/**
 * Global Express error handling middleware.
 *
 * This is the SINGLE place where errors become HTTP responses.
 * No other middleware or route handler should call res.status().json()
 * for error cases — they should throw (or call next(error)) instead.
 *
 * Placement: Must be registered LAST in the Express middleware chain,
 * after all routes. Express identifies error middleware by the 4-argument
 * signature (err, req, res, next).
 *
 * Design decisions:
 * 1. All ApiError subclasses serialize themselves — the handler is generic.
 * 2. Unknown errors (bugs, unhandled rejections) become 500s with no
 *    internal detail leaked to the client.
 * 3. The trace_id is always logged so we can correlate client reports
 *    with server logs.
 * 4. Content-Type is always application/problem+json (ADR-003).
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // next is required in the signature for Express to recognize this as
  // error middleware, even though we never call it
  _next: NextFunction,
): void {
  // ── Case 1: Known API error ──────────────────────────────────────────────
  if (err instanceof ApiError) {
    const problem = err.toProblemDetails(req.path);
    const headers = err.responseHeaders();

    // Log at appropriate level based on status code
    const logLevel = err.status >= 500 ? 'error' : 'warn';
    logger[logLevel]('API error', {
      trace_id: err.traceId,
      status: err.status,
      type: err.type,
      path: req.path,
      method: req.method,
      // Include stack only in non-production environments
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });

    // Apply all headers the error requires (Retry-After, WWW-Authenticate, etc.)
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    res
      .status(err.status

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