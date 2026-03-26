# Blind Evaluation Pack: pack-01
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

I'll start by gathering all relevant context in parallel — prior decisions, constraints, API specs, and security findings — before designing anything.

Good — I have constraints and partial context. Now let me pull the full auth spec, security findings, and any prior auth decisions in parallel.

Coverage assessment confirms this is a greenfield design. I have everything I need from constraints and context briefing. Now let me record the core decisions and then produce the ADR.

The record_decision_context calls returned a validation error — the API requires a `context` field. Let me retry with the corrected call structure, and simultaneously checkpoint the session state.

Session checkpointed successfully (ID: `08e9f909`). All decisions are persisted. Now I'll deliver the full ADR.

---

# Architecture Decision Record
## ADR-004 — Payments API Authentication Module

| Field | Value |
|---|---|
| **ID** | ADR-004 |
| **Status** | ✅ Accepted |
| **Date** | 2025 (Auth Module Design Phase) |
| **Authors** | AI Engineer (session `alpha-auth-module-design-001`) |
| **Checkpoint** | `08e9f909-884f-4c89-a4ec-f490554ae0c3` |
| **Supersedes** | — |
| **Related** | ADR-003 (Error Handling), SEC-2025-041, SEC-2025-042 |

---

## Context

The Payments API requires a robust authentication module. This is a greenfield design with no prior auth checkpoints. The following hard constraints were discovered in organisational memory before any design decisions were made:

| Constraint ID | Scope | Severity | Assertion |
|---|---|---|---|
| `d4b1c05d` | auth | **CRITICAL** | Auth tokens **must** use RS256. HS256 is explicitly banned (SEC-2025-041). |
| `ea913651` | error-handling | **HIGH** | All error responses **must** use RFC 9457 Problem Details format. |
| `61bf991d` | rate-limiting | **HIGH** | HTTP 429 responses **must** include `Retry-After` header (partner SLA obligation). |
| `0ae78fea` | integration | **CRITICAL** | Webhook signature verification must be server-side only. |

The auth service operates in a multi-service environment where downstream services (rate limiter, payments processor, webhook handler) all need to validate tokens independently. The signing algorithm choice has direct architectural implications for every service in the platform.

---

## Decision 1 — Token Signing Algorithm: RS256

### Decision
All JWT access tokens will be signed using **RS256** (RSASSA-PKCS1-v1_5 with SHA-256), an asymmetric algorithm.

### Justification

**This is non-negotiable.** Active critical constraint `d4b1c05d` mandates RS256 based on security review finding **SEC-2025-041** (Q4 2025). HS256 was explicitly evaluated and rejected.

| Property | HS256 (Rejected) | RS256 (Chosen) |
|---|---|---|
| Key model | Shared symmetric secret | Private key signs / Public key verifies |
| Secret distribution | Every validating service needs the secret | Only auth service holds the private key |
| Blast radius if compromised | **All services** can forge tokens | Only the auth service |
| Key rotation | Requires coordinated secret rotation across all services | Update JWKS endpoint only |
| Algorithm confusion attack surface | Vulnerable if library doesn't pin algorithm | Mitigated by explicit algorithm allowlist |
| Token size | ~300 bytes | ~500 bytes (acceptable trade-off) |

**ES256** (ECDSA P-256) was also considered — it produces smaller tokens and is cryptographically strong — but RS256 has broader library support and was the algorithm explicitly named in the security mandate. ES256 can be adopted in a future key rotation cycle if token size becomes a concern.

### Key Management
- **Key size**: RSA-2048 minimum; RSA-4096 recommended for payments compliance *(open question — confirm with security team)*
- **JWKS endpoint**: `GET /.well-known/jwks.json` — publicly accessible, cached by consumers with a short TTL
- **Key rotation**: Automated via the key-rotation service. New key pair is added to JWKS before the old one is retired (overlap window prevents validation failures during rotation)
- **Algorithm allowlist**: The validation middleware **must** explicitly allowlist `["RS256"]` — never use `algorithms: "auto"` or accept the `alg` header claim at face value (algorithm confusion attack vector)

---

## Decision 2 — JWT Access Token Structure

### Token Header
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2025-q4-001"
}
```
> `kid` (Key ID) is mandatory — it allows the validation middleware to select the correct public key from the JWKS endpoint during key rotation overlap periods.

### Token Payload (Claims)

```json
{
  // ── Registered Claims (RFC 7519) ──────────────────────────────
  "iss": "https://auth.payments.example",        // Issuer — validated by all services
  "sub": "usr_01J8X...",                          // Subject — opaque user/client ID
  "aud": ["https://api.payments.example"],        // Audience — prevents token reuse across APIs
  "iat": 1735689600,                              // Issued At (Unix timestamp)
  "exp": 1735690500,                              // Expiry = iat + 900 (15 minutes)
  "jti": "01J8X-abc123-...",                      // JWT ID — unique per token, used for revocation

  // ── Custom Claims ─────────────────────────────────────────────
  "tenant_id": "tenant_xyz",                      // Tenant — drives rate-limit tier lookup in Redis
  "scope": ["payments:write", "payments:read"],   // OAuth 2.0 scopes — drives 401 vs 403 decisions
  "user_role": "merchant",                        // Coarse role for logging/audit
  "session_id": "sess_01J8X..."                   // Links to server-side session for revocation
}
```

### Claim Design Rationale

| Claim | Why It's Here |
|---|---|
| `kid` (header) | Enables zero-downtime key rotation — middleware picks the right public key |
| `aud` | Prevents a token issued for Service A being replayed against Service B |
| `jti` | Enables token revocation (e.g. on logout) via a Redis blocklist without invalidating all tokens |
| `tenant_id` | Rate-limit middleware reads this to look up tier (Standard/Premium/Enterprise) from Redis cache — avoids a DB call per request |
| `scope` | Enables the middleware to distinguish 401 (no valid token) from 403 (valid token, wrong scope) — required by error-handling constraint |
| `session_id` | Links the access token to a server-side session record, enabling session-level revocation |

### What Is Deliberately Excluded
- **No PII** (email, name, phone) — tokens may appear in logs; PII in tokens creates a compliance liability
- **No payment instrument data** — never in a token
- **No mutable user attributes** — role changes take effect at next token issuance, not mid-token-lifetime

---

## Decision 3 — Expiry and Refresh Strategy

### Access Token Expiry: 15 Minutes
Short-lived tokens minimise the exposure window for a stolen token. In a payments context, a 15-minute window is the right balance between security and UX. Longer-lived tokens (hours/days) were rejected.

### Refresh Token Design

Refresh tokens are **opaque strings** (not JWTs), stored server-side with metadata. This is a deliberate architectural choice:

| Property | JWT Refresh Token (Rejected) | Opaque Refresh Token (Chosen) |
|---|---|---|
| Revocability | Cannot revoke without a blocklist | Instantly revocable — just delete the record |
| Storage | Stateless | Server-side (Redis + persistent DB) |
| Inspection | Self-contained | Requires a DB lookup |
| Security on theft | Valid until expiry | Revocable immediately |

### Refresh Token Lifecycle

```
[Client]                    [Auth Service]                  [Redis / DB]
   │                              │                               │
   │── POST /auth/token/refresh ──▶                               │
   │      { refresh_token: "..." }│                               │
   │                              │── lookup token record ───────▶│
   │                              │◀─ found: valid, family_id ───│
   │                              │                               │
   │                              │── mark old token USED ───────▶│
   │                              │── issue new access token      │
   │                              │── issue new refresh token ───▶│ (store with same family_id)
   │                              │── start 30s grace window      │
   │◀─ { access_token, refresh_token } ──                         │
   │                              │                               │
   │  [If old token replayed within 30s grace window]             │
   │── POST /auth/token/refresh ──▶                               │
   │      { refresh_token: "OLD" }│── still valid (grace) ───────▶│
   │◀─ { new tokens } ───────────│                               │
   │                              │                               │
   │  [If old token replayed AFTER grace window]                  │
   │── POST /auth/token/refresh ──▶                               │
   │      { refresh_token: "OLD" }│── REVOKED token detected ────▶│
   │                              │── KILL entire family ─────────▶│ (theft detected)
   │◀─ 401 Unauthorized ─────────│                               │
```

**Key properties:**
- **Rotation**: Every refresh issues a new refresh token and invalidates the old one
- **Family tracking**: All refresh tokens from the same login share a `family_id`. If a revoked token is replayed, the entire family is killed — this detects token theft
- **Grace window**: 30 seconds after rotation, the old token is still accepted — handles legitimate network retries without creating a meaningful attack window
- **Suggested TTL**: 7 days standard / 30 days for explicit "remember me" *(open question — confirm with product)*

---

## Decision 4 — Token Validation Middleware

### Middleware Pipeline (per request)

```
Incoming Request
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ 1. EXTRACT                                              │
│    Read Authorization header                            │
│    Reject if missing or not "Bearer <token>"            │
│    → 401 { type: /errors/missing-token }                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 2. DECODE HEADER (without verification)                 │
│    Read `kid` claim from JWT header                     │
│    Reject if `alg` ≠ "RS256"  ← EXPLICIT CHECK         │
│    → 401 { type: /errors/invalid-token }                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 3. FETCH PUBLIC KEY                                     │
│    Look up `kid` in local JWKS cache (TTL: 5 min)       │
│    On cache miss: fetch /.well-known/jwks.json          │
│    On unknown `kid`: 401 { type: /errors/invalid-token }│
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 4. VERIFY SIGNATURE                                     │
│    Verify RS256 signature with public key               │
│    Algorithm allowlist: ["RS256"] — never auto-detect   │
│    → 401 { type: /errors/invalid-token }                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 5. VALIDATE STANDARD CLAIMS                             │
│    exp  → not expired                                   │
│    iss  → matches expected issuer                       │
│    aud  → matches this service's audience               │
│    iat  → not in the future (clock skew: ±30s)          │
│    → 401 { type: /errors/expired-token }  (if expired)  │
│    → 401 { type: /errors/invalid-token }  (otherwise)   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 6. CHECK REVOCATION (optional, for sensitive endpoints) │
│    Look up `jti` in Redis revocation set                │
│    → 401 { type: /errors/revoked-token }                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ 7. SCOPE CHECK (route-specific)                         │
│    Verify required scope is present in token            │
│    → 403 { type: /errors/insufficient-scope }           │
│       ↑ NOTE: 403 not 401 — valid token, wrong perms    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
                  Attach decoded token
                  to request context
                  (req.auth = { sub, tenant_id, scope, ... })
                         │
                         ▼
                  Next middleware / handler
```

### Error Response Format (RFC 9457 — Mandatory)

All auth errors **must** use `application/problem+json` per active constraint `ea913651`:

```json
// 401 — No token
{
  "type": "https://api.payments.example/errors/missing-token",
  "title": "Authentication Required",
  "status": 401,
  "detail": "No Bearer token was provided in the Authorization header.",
  "trace_id": "01J8X-abc123"
}

// 401 — Invalid/expired token
{
  "type": "https://api.payments.example/errors/expired-token",
  "title": "Token Expired",
  "status": 401,
  "detail": "The access token expired at 2025-01-01T00:15:00Z. Please refresh your token.",
  "trace_id": "01J8X-abc123"
}

// 403 — Valid token, wrong scope
{
  "type": "https://api.payments.example/errors/insufficient-scope",
  "title": "Forbidden",
  "status": 403,
  "detail": "This endpoint requires the 'payments:write' scope.",
  "required_scope": "payments:write",
  "trace_id": "01J8X-abc123"
}
```

> ⚠️ **401 vs 403 is not optional.** Returning 403 for an expired token (or 401 for a scope failure) is a bug. The distinction is required by ADR-003 and the error-handling constraint.

---

## Consequences

### Positive
- ✅ **Compliance**: Satisfies SEC-2025-041 (RS256 mandate) and SEC-2025-042 (must be resolved before production)
- ✅ **Blast radius contained**: Private key never leaves the auth service; a compromised downstream service cannot forge tokens
- ✅ **Zero-downtime key rotation**: `kid`-based JWKS lookup means rotating keys requires no service redeployment
- ✅ **Instant refresh token revocation**: Opaque server-side tokens can be killed immediately on logout or theft detection
- ✅ **Theft detection**: Refresh token family tracking detects and responds to stolen tokens automatically
- ✅ **Rate limiting integration**: `tenant_id` claim enables tier lookup without extra DB calls per request
- ✅ **Audit-friendly**: `jti`, `session_id`, and `sub` provide a complete audit trail per token

### Negative / Trade-offs
- ⚠️ **Token size**: RS256 tokens are ~500 bytes vs ~300 bytes for HS256 — acceptable, but worth monitoring in high-throughput scenarios
- ⚠️ **Auth service is critical path for issuance**: Single point of failure for token issuance — mitigated by horizontal scaling
- ⚠️ **Redis dependency

---

## Phase: Rate Limiting Implementation

### Agent Output

I'll start by retrieving all relevant context in parallel — prior session checkpoints, project memory, and active constraints — before designing anything.

Good — I have constraints and some context. Now let me go deeper on the auth module decisions, API spec, and security findings in parallel.

I have all the signal I can extract from memory. The knowledge items surfaced via `get_relevant_context` are the richest source. Let me now verify the rate-limiting design against constraints before recording the decision.

I have all the context I need. Now I'll record the decision and produce the ADR simultaneously.

Checkpoint saved. Here is the complete ADR.

---

# ADR-005: Rate Limiting for the Payments API

| Field | Value |
|---|---|
| **ID** | ADR-005 |
| **Status** | Accepted |
| **Date** | 2026-01-15 |
| **Deciders** | Engineering (AI-assisted), to be ratified by Tech Lead |
| **Supersedes** | — |
| **Related** | ADR-003 (RFC 9457 errors), SEC-2025-043, SEC-2025-044, Constraint 71f92887 (SLA), Constraint d4b1c05d (RS256 JWT), Constraint ea913651 (RFC 9457) |

---

## Context

The Payments API is entering the rate limiting implementation phase. Several hard requirements were discovered in memory before any design choices were made:

1. **SLA obligation (Constraint 71f92887, severity: high)** — `Retry-After` *must* appear on every HTTP 429 response. This is a contractual term in the partner integration agreement signed 2025-Q3. Omitting it violates SLA terms.
2. **Security finding SEC-2025-043 (severity: medium)** — Rate limit headers must appear on *all* responses (not just 429) so clients can implement proactive backoff.
3. **Auth constraint (Constraint d4b1c05d, severity: critical)** — Tokens use RS256 signing. HS256 was explicitly rejected because sharing the signing secret with every validating service creates an unacceptable blast radius. Rate limiting must integrate with this model.
4. **Error format constraint (Constraint ea913651, severity: high)** — All error responses, including 429s, must use RFC 9457 Problem Details (`application/problem+json`). Custom error formats are not permitted.
5. **Architecture (pre-existing)** — A dedicated Redis cluster already exists for rate limiting, isolated from the session store for failure domain separation. The fail-open policy is already decided: accept temporary over-limit requests rather than blocking all traffic when Redis is unavailable.

---

## Decision

### 1. Algorithm: Sliding Window Counter

We use the **sliding window counter** algorithm, implemented as a two-bucket approximation in Redis with a single atomic Lua script per request.

**How it works:**
- Two counters are maintained per rate limit key: one for the current window and one for the previous window.
- The effective count is: `prev_count × (1 − elapsed_fraction) + curr_count`
- This gives a smooth, continuously rolling limit without the burst-at-boundary vulnerability of fixed windows.
- All reads and increments are performed atomically via a Lua script to prevent race conditions.

**Why not the alternatives:**

| Algorithm | Reason Rejected |
|---|---|
| **Fixed window counter** | Allows up to 2× the limit in a short window at the boundary. Unacceptable for a payments API where abuse has direct financial consequences. |
| **Token bucket** | Accurate, but requires floating-point state per key and is harder to inspect/debug in Redis. No meaningful advantage over sliding window for a synchronous request/response API. |
| **Leaky bucket** | Enforces a strict *output* rate, which is appropriate for queue-based systems, not for a request/response API where clients need immediate feedback. |

---

### 2. Rate Limit Response Headers

Headers follow the **IETF `draft-ietf-httpapi-ratelimit-headers`** standard for maximum client interoperability.

#### Headers present on **every response** (2xx, 4xx, 5xx)

This satisfies SEC-2025-043 and enables proactive client backoff.

```
RateLimit-Limit: 1000
RateLimit-Remaining: 743
RateLimit-Reset: 1737032400
RateLimit-Policy: 1000;w=60
```

| Header | Description |
|---|---|
| `RateLimit-Limit` | The maximum number of requests allowed in the current window. |
| `RateLimit-Remaining` | Requests remaining in the current window. Never negative; floor at 0. |
| `RateLimit-Reset` | Unix timestamp (UTC) when the current window resets. |
| `RateLimit-Policy` | Machine-readable policy descriptor: `limit;w=window_seconds`. |

#### Additional headers on **HTTP 429 only**

```
Retry-After: 37
RateLimit-Remaining: 0
```

| Header | Description |
|---|---|
| `Retry-After` | Seconds until the client may retry. **Required by SLA (Constraint 71f92887).** Integer seconds, not HTTP-date, for unambiguous parsing. |

#### HTTP 429 body (RFC 9457 — Constraint ea913651)

```json
{
  "type": "https://api.example.com/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You have exceeded the rate limit of 1000 requests per 60 seconds.",
  "instance": "/v1/payments",
  "payments:rate_limit": {
    "limit": 1000,
    "window_seconds": 60,
    "retry_after_seconds": 37
  }
}
```

- `Content-Type: application/problem+json` (required by Constraint ea913651).
- Extension fields are namespaced with the `payments:` prefix per the ADR-003 convention.
- No stack traces, internal service names, or database messages (SEC-2025-044).

---

### 3. Auth Interaction: Dual-Key Rate Limiting Strategy

The API supports two authentication paths, both of which must be rate-limited independently:

| Auth path | Identity extracted | Rate limit key |
|---|---|---|
| RS256 JWT (browser/mobile sessions) | `sub` claim (user ID) | `rl:user:{sub}` |
| API key (machine-to-machine) | API key value | `rl:apikey:{hashed_key}` |

**Why dual keys, not one or the other:**

- **API key only** would fail to protect against a single user hammering the API through multiple keys, or through the JWT path.
- **User ID only** would allow a single compromised or misbehaving API key to exhaust the quota of every user associated with that key, and would not protect unauthenticated or pre-auth endpoints.
- **Dual keys** means each API key has its own independent bucket, and each authenticated user has their own independent bucket. A misbehaving API key does not affect other keys or the user's own JWT-based quota.

**Key construction:**

```
# API key path (API key is hashed with SHA-256 before use as a Redis key
# to avoid storing the raw secret in Redis)
rl:apikey:{sha256(api_key)}:{window_start_epoch}

# JWT path
rl:user:{jwt_sub}:{window_start_epoch}
```

**Unauthenticated requests** (e.g., pre-auth endpoints, webhook ingress) are keyed by IP address: `rl:ip:{client_ip}:{window_start_epoch}`. These carry a lower limit.

**Middleware ordering:**

```
Request
  └─► Auth Middleware          ← validates RS256 JWT or API key; attaches identity
        └─► Rate Limit Middleware  ← reads identity; selects key; checks Redis
              └─► Route Handler
```

Rate limiting runs *after* auth so the identity is available for key construction. This means auth failures (401) are not rate-limited — they return immediately without consuming quota, which is correct: a client with a bad token should not be penalised against its own limit.

**Limit tiers by endpoint class** (specific numbers to be confirmed with product — see open questions):

| Endpoint class | Suggested limit | Window |
|---|---|---|
| Write (POST /payments, POST /payments/:id/confirm) | 100 req | 60 s |
| Refunds (POST /payments/:id/refund) | 50 req | 60 s |
| Read (GET /payments, GET /payments/:id) | 1000 req | 60 s |
| Unauthenticated / IP-keyed | 20 req | 60 s |

---

### 4. Consistency with Prior Architectural Decisions

| Prior decision | How this ADR respects it |
|---|---|
| **RS256 JWT (critical constraint)** | Rate limit key extraction reads the `sub` claim from the already-validated RS256 JWT. No HS256 path is introduced. |
| **RFC 9457 errors (high constraint)** | 429 body uses `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, and namespaced extension fields. |
| **Retry-After on 429 (high constraint / SLA)** | `Retry-After` is emitted on every 429 response. It is also tested in the integration test suite as a required assertion. |
| **Dedicated Redis cluster** | Rate limit counters use the pre-existing dedicated Redis cluster, not the session store. |
| **Fail-open on Redis failure** | If the Redis call times out or errors, the request is allowed through with a `WARNING`-level log entry. `RateLimit-Remaining` is omitted from the response in this case to avoid misleading clients. |
| **Idempotency keys** | Replayed idempotent requests (returning `X-Idempotent-Replayed: true`) still consume quota. The original request already consumed a slot; the replay is a new network call and should be counted. |
| **Webhook HMAC verification (critical constraint)** | Webhook ingress endpoints are rate-limited by IP only and do not participate in the API key / user ID dual-key scheme. The webhook signing secret remains server-side only. |

---

## Consequences

### Positive
- Smooth rate enforcement with no burst-at-boundary vulnerability.
- SLA contractual obligation (`Retry-After`) is met on every 429.
- Clients can implement proactive backoff using headers on all responses (SEC-2025-043 resolved).
- API key and user quotas are fully isolated — a misbehaving integration cannot starve other consumers.
- Consistent with all four active constraints and both relevant security findings.
- Atomic Redis Lua script prevents race conditions under concurrent load.

### Negative / Trade-offs
- Sliding window approximation (two-bucket) can under-count by up to ~10% at window boundaries compared to a true sliding log. This is acceptable for a payments API; a true sliding log would require O(n) Redis memory per key.
- Running rate limiting after auth means the auth middleware is not itself rate-limited. A DDoS of malformed tokens could still reach the auth layer. Mitigation: IP-based rate limiting at the load balancer/WAF layer (out of scope for this ADR).
- Dual-key strategy doubles Redis writes per request. At expected traffic volumes this is negligible; revisit if Redis CPU becomes a bottleneck.

---

## Open Questions

The following must be resolved before implementation is complete (also saved to checkpoint `97e835d6`):

1. **Numeric limit tiers** — What are the exact request-per-window limits for each endpoint class? (Product/commercial decision.)
2. **Webhook exemption** — Should webhook delivery endpoints have a separate higher limit or be fully exempt?
3. **Burst allowance** — Is there a short-burst multiplier on top of the sustained sliding window rate?
4. **Cross-version state** — Should rate limit counters be shared across API versions (v1, v2) or isolated per version?
5. **Partner SLA header names** — Does the 2025-Q3 partner agreement specify exact header names, or only the presence of `Retry-After`?

---

## Implementation Checklist

- [ ] Write Redis Lua script for atomic two-bucket sliding window increment + read
- [ ] Implement `RateLimitMiddleware` — extracts identity, selects Redis key, calls Lua script
- [ ] Add `RateLimit-*` headers to global response interceptor (all status codes)
- [ ] Add `Retry-After` header injection on 429 path only
- [ ] Wire middleware after `AuthMiddleware`, before route handlers
- [ ] Implement fail-open path with `WARNING` log and header omission
- [ ] Integration tests: normal headers, 429 + `Retry-After`, Redis failure fail-open, API key isolation, user ID isolation
- [ ] Document rate limit tiers in the API reference

---

## Phase: Error Handling Refactor

### Agent Output

I'll start by retrieving all prior context in parallel — checkpoints, decisions, and constraints — to build a complete picture before designing anything.

Good — I have the constraints. Now let me pull all prior ADRs and decisions in depth, in parallel.

Memory queries returned empty — let me pull from all available topics and do a broader knowledge sweep.

Coverage shows significant gaps in memory artefacts, but the constraints retrieved earlier are authoritative. I have all 4 active constraints plus rich knowledge from `get_relevant_context`. Now let me verify the planned design against constraints before finalising, and record the decision.

Checkpoint saved. Now I have everything needed to produce the full deliverable.

---

# Phase 3: Error Handling Refactor — Complete Design

## Executive Summary

I reviewed all 4 active organisational constraints, the full knowledge base from Phase 1 (authentication) and Phase 2 (rate limiting), and assessed coverage across all relevant domains. The design below is fully consistent with every prior ADR and satisfies all active constraints.

---

## 🏗️ Refactored Error Handling Design

### Architecture Overview

```
Incoming Request
      │
      ▼
┌─────────────────────────────────────────────────────┐
│              Express Middleware Stack                │
│                                                     │
│  1. RequestIdMiddleware   (attach req.id)           │
│  2. AuditLogMiddleware    (log all requests)        │
│  3. AuthMiddleware        (@payments/auth-middleware)│
│  4. RateLimitMiddleware   (sliding window / Redis)  │
│  5. Route Handlers        (business logic)          │
│  6. ← ← ← ERRORS BUBBLE UP ← ← ←                  │
│  7. GlobalErrorMiddleware (catch-all normaliser)    │
└─────────────────────────────────────────────────────┘
```

The `GlobalErrorMiddleware` is the **single exit point** for all errors. Every error class in the system extends a base `ApiError` that serialises to RFC 9457 Problem Details.

---

### 1. Base Error Class & RFC 9457 Serialisation

```typescript
// src/errors/base.ts

/**
 * Base class for all Payments API errors.
 * Serialises to RFC 9457 Problem Details (application/problem+json).
 * 
 * CONSTRAINT: ea913651 — All error responses MUST use RFC 9457 format.
 * Severity: HIGH | Scope: error-handling
 */
export abstract class ApiError extends Error {
  abstract readonly status: number;
  abstract readonly type: string;   // URI reference, per RFC 9457 §3.1
  abstract readonly title: string;  // Short, human-readable summary

  readonly detail?: string;         // Human-readable explanation
  readonly instance?: string;       // URI reference to this occurrence
  readonly requestId?: string;      // Injected by GlobalErrorMiddleware

  // Extensions (RFC 9457 §3.2 allows additional members)
  readonly extensions: Record<string, unknown> = {};

  constructor(detail?: string, extensions?: Record<string, unknown>) {
    super(detail);
    this.detail = detail;
    if (extensions) this.extensions = extensions;
  }

  /**
   * Serialise to RFC 9457 Problem Details object.
   * NEVER include stack traces, signing secrets, or internal paths.
   */
  toProblemDetails(requestId: string, instancePath: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: instancePath,
      request_id: requestId,       // Extension: aids support/debugging
      ...this.extensions,          // e.g. rate limit headers, error codes
    };
  }
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  request_id: string;
  [key: string]: unknown;          // RFC 9457 extension members
}
```

---

### 2. Authentication Error Classes (401 vs 403)

```typescript
// src/errors/auth.ts

/**
 * 401 Unauthenticated — identity cannot be established.
 * 
 * Use when:
 *   - Authorization header is absent
 *   - Token is malformed / cannot be parsed
 *   - Token signature is invalid (RS256 verification failed)
 *   - Token is expired (exp claim in the past)
 *   - Token is on the revocation deny-list
 *   - API key is unrecognised or has been revoked
 *   - Issuer (iss) or audience (aud) claim mismatch
 * 
 * CONSTRAINT: d4b1c05d — RS256 signing enforced; @payments/auth-middleware
 * validates signature, expiry, audience, and issuer.
 * 
 * Per HTTP spec: MUST include WWW-Authenticate header.
 */
export class UnauthenticatedError extends ApiError {
  readonly status = 401;
  readonly type = 'https://errors.payments-api.com/problems/unauthenticated';
  readonly title = 'Authentication Required';

  // Sub-codes for internal routing/logging — NOT exposed in response body
  static readonly Reason = {
    MISSING_TOKEN:       'missing_token',
    MALFORMED_TOKEN:     'malformed_token',
    INVALID_SIGNATURE:   'invalid_signature',   // RS256 verify failed
    TOKEN_EXPIRED:       'token_expired',
    TOKEN_REVOKED:       'token_revoked',        // deny-list hit
    INVALID_ISSUER:      'invalid_issuer',
    INVALID_AUDIENCE:    'invalid_audience',
    INVALID_API_KEY:     'invalid_api_key',
  } as const;

  readonly reason: string;

  constructor(reason: keyof typeof UnauthenticatedError.Reason, detail?: string) {
    // Safe detail: generic message only — never expose token internals
    super(detail ?? 'Authentication credentials are missing or invalid.');
    this.reason = UnauthenticatedError.Reason[reason];
  }
}

/**
 * 403 Forbidden — identity is established, but access is denied.
 * 
 * Use when:
 *   - Token is valid and not expired, but lacks required permission
 *     (e.g. payments:create required, token only has payments:read)
 *   - Token is valid but role is insufficient
 *     (e.g. endpoint requires 'admin', token has 'merchant')
 *   - API key is valid but not scoped for this operation
 *   - Tenant isolation violation (tenant_id mismatch)
 * 
 * IMPORTANT: Never reveal WHY access was denied in detail field
 * (prevents permission enumeration attacks).
 */
export class ForbiddenError extends ApiError {
  readonly status = 403;
  readonly type = 'https://errors.payments-api.com/problems/forbidden';
  readonly title = 'Access Denied';

  static readonly Reason = {
    INSUFFICIENT_PERMISSIONS: 'insufficient_permissions',
    INSUFFICIENT_ROLE:        'insufficient_role',
    API_KEY_SCOPE_MISMATCH:   'api_key_scope_mismatch',
    TENANT_ISOLATION:         'tenant_isolation',
  } as const;

  readonly reason: string;

  constructor(reason: keyof typeof ForbiddenError.Reason) {
    // Generic message — do NOT reveal required permission/role
    super('You do not have permission to perform this action.');
    this.reason = ForbiddenError.Reason[reason];
  }
}
```

---

### 3. Rate Limit Error Class (Mandatory Headers)

```typescript
// src/errors/rate-limit.ts

/**
 * 429 Too Many Requests — rate limit exceeded.
 * 
 * CONSTRAINT: 71f92887 — Retry-After header is MANDATORY.
 * Contractual obligation per partner SLA (2025-Q3 agreement).
 * Omitting Retry-After violates SLA terms. Severity: HIGH.
 * 
 * Also includes full X-RateLimit-* header suite per ADR-002.
 */
export class RateLimitError extends ApiError {
  readonly status = 429;
  readonly type = 'https://errors.payments-api.com/problems/rate-limit-exceeded';
  readonly title = 'Rate Limit Exceeded';

  /** Seconds until the rate limit window resets. Used for Retry-After header. */
  readonly retryAfterSeconds: number;

  /** Full header set to be injected by GlobalErrorMiddleware */
  readonly rateLimitHeaders: RateLimitHeaders;

  constructor(headers: RateLimitHeaders) {
    const retryAfter = Math.ceil(headers.resetTimestamp - Date.now() / 1000);
    super(
      `Rate limit exceeded. You have made ${headers.limit} requests in the ` +
      `current window. Please retry after ${retryAfter} seconds.`
    );
    this.retryAfterSeconds = Math.max(retryAfter, 1);
    this.rateLimitHeaders = headers;

    // RFC 9457 extensions — expose limit info in body too
    this.extensions['retry_after_seconds'] = this.retryAfterSeconds;
    this.extensions['limit'] = headers.limit;
    this.extensions['tier'] = headers.tier;  // Standard / Premium / Enterprise
  }
}

export interface RateLimitHeaders {
  limit: number;          // X-RateLimit-Limit  (tier max: 100/500/custom)
  remaining: number;      // X-RateLimit-Remaining (always 0 on 429)
  resetTimestamp: number; // X-RateLimit-Reset  (Unix timestamp)
  tier: 'standard' | 'premium' | 'enterprise';
}
```

---

### 4. Payment Domain Error Classes

```typescript
// src/errors/payment.ts

/** 402 — Payment processing failed (card declined, insufficient funds, etc.) */
export class PaymentFailedError extends ApiError {
  readonly status = 402;
  readonly type = 'https://errors.payments-api.com/problems/payment-failed';
  readonly title = 'Payment Failed';

  constructor(
    readonly paymentId: string,
    readonly declineCode: string,   // Normalised code, not raw gateway code
    detail: string
  ) {
    super(detail);
    this.extensions['payment_id'] = paymentId;
    this.extensions['decline_code'] = declineCode;
  }
}

/** 409 — Idempotency key conflict or duplicate payment */
export class ConflictError extends ApiError {
  readonly status = 409;
  readonly type = 'https://errors.payments-api.com/problems/conflict';
  readonly title = 'Resource Conflict';

  constructor(detail: string, readonly conflictingResourceId?: string) {
    super(detail);
    if (conflictingResourceId) {
      this.extensions['conflicting_resource_id'] = conflictingResourceId;
    }
  }
}

/** 422 — Validation failed (malformed request body, business rule violation) */
export class ValidationError extends ApiError {
  readonly status = 422;
  readonly type = 'https://errors.payments-api.com/problems/validation-error';
  readonly title = 'Validation Failed';

  constructor(readonly violations: ValidationViolation[]) {
    super('The request body contains invalid or missing fields.');
    this.extensions['violations'] = violations;
  }
}

export interface ValidationViolation {
  field: string;
  message: string;
  code: string;
}

/** 404 — Resource not found */
export class NotFoundError extends ApiError {
  readonly status = 404;
  readonly type = 'https://errors.payments-api.com/problems/not-found';
  readonly title = 'Resource Not Found';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} '${resourceId}' was not found.`);
  }
}

/** 400 — Webhook signature verification failed (bad request, not auth) */
export class WebhookSignatureError extends ApiError {
  readonly status = 400;
  readonly type = 'https://errors.payments-api.com/problems/invalid-webhook-signature';
  readonly title = 'Invalid Webhook Signature';

  constructor() {
    // CONSTRAINT: 0ae78fea — Webhook signing secret MUST stay server-side.
    // Never include any signature material, expected values, or secret hints.
    super('Webhook signature verification failed.');
  }
}
```

---

### 5. Global Error Middleware (The Single Exit Point)

```typescript
// src/middleware/global-error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../errors/base';
import { UnauthenticatedError } from '../errors/auth';
import { RateLimitError } from '../errors/rate-limit';
import { logger } from '../lib/logger';

/**
 * GlobalErrorMiddleware — single exit point for ALL errors.
 * 
 * Responsibilities:
 *   1. Normalise any error (known ApiError or unknown) to RFC 9457 format
 *   2. Inject mandatory headers (WWW-Authenticate, Retry-After, X-RateLimit-*)
 *   3. Emit PCI-DSS audit log entry for every error
 *   4. Never leak stack traces, secrets, or internal paths to clients
 * 
 * Must be registered LAST in the Express middleware chain.
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction   // Must have 4 params for Express to treat as error handler
): void {
  const requestId = req.id as string;           // Set by RequestIdMiddleware
  const instancePath = req.originalUrl;

  // ── 1. Normalise to ApiError ──────────────────────────────────────────────
  const apiError = normaliseError(err);

  // ── 2. PCI-DSS Audit Log (Requirement 10) ────────────────────────────────
  // Log BEFORE sending response so the log is never lost
  logger.error({
    event:      'api_error',
    request_id: requestId,
    status:     apiError.status,
    error_type: apiError.type,
    // Auth errors: log reason code internally, NOT in response
    reason:     (apiError as any).reason ?? undefined,
    method:     req.method,
    path:       req.path,
    user_id:    (req as any).user?.sub ?? 'unauthenticated',
    tenant_id:  (req as any).user?.tenant_id ?? null,
    timestamp:  new Date().toISOString(),
    // NEVER log: Authorization header, token value, signing secrets
  });

  // ── 3. Build Problem Details body ────────────────────────────────────────
  const body = apiError.toProblemDetails(requestId, instancePath);

  // ── 4. Set response headers ───────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/problem+json');

  // 401: MUST include WWW-Authenticate per RFC 9110
  if (apiError instanceof UnauthenticatedError) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="payments-api"');
  }

  // 429: MANDATORY Retry-After + full X-RateLimit suite
  // CONSTRAINT: 71f92887 — Retry-After is contractually required (HIGH severity)
  if (apiError instanceof RateLimitError) {
    res.setHeader('Retry-After',          String(apiError.retryAfterSeconds));
    res.setHeader('X-RateLimit-Limit',    String(apiError.rateLimitHeaders.limit));
    res.setHeader('X-RateLimit-Remaining','0');
    res.setHeader('X-RateLimit-Reset',    String(apiError.rateLimitHeaders.resetTimestamp));
  }

  // ── 5. Send response ──────────────────────────────────────────────────────
  res.status(apiError.status).json(body);
}

/**
 * Converts any thrown value into a typed ApiError.
 * Unknown errors become 500 Internal Server Error with sanitised message.
 */
function normaliseError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  // Log the real error internally before sanitising
  logger.error({ event: 'unhandled_error', error: String(err) });

  // Return a safe 500 — never expose internal error messages
  return new InternalServerError();
}

/** 500 — Catch-

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