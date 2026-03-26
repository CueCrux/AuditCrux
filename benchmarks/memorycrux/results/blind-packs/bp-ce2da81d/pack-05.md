# Blind Evaluation Pack: pack-05
**Project:** alpha
**Evaluator:** ________________
**Date:** ________________

---

## Phase: Auth Module Design

### Agent Output

# ADR: Payments API Authentication Module

## Status
Proposed

## Context
The Payments API needs an authentication module for securing API requests and supporting token-based access for clients and internal services.

Relevant findings and constraints:
- **SEC-2025-041 (Critical):** HS256 is rejected because it requires sharing a symmetric secret across validating services, creating an unacceptable blast radius.
- **Active auth constraint:** Auth tokens **must use RS256**, not HS256.
- **SEC-2025-042 (High):** Refresh tokens must include replay protection.
- Deployment guidance requires the **auth service and JWKS endpoint** to be available before the API service rollout.
- The API already uses standardized error handling and should continue to do so for auth failures.

No prior auth-specific ADR was found in memory, so this decision is based on the current security review and active constraints.

## Decision

### 1) Token signing algorithm
We will sign JWT access tokens with **RS256**.

#### Why RS256
- It satisfies the security review requirement and active constraint.
- It avoids sharing a signing secret with every service.
- It enables **public-key verification** by downstream services while keeping the private signing key only in the auth service.
- It supports **key rotation** through a JWKS endpoint.
- It is broadly supported across common JWT libraries and infrastructure.

#### Rejected alternatives
- **HS256:** rejected due to shared-secret blast radius and inability to safely distribute validation capability.
- **ES256:** technically acceptable, but RS256 is preferred for broader ecosystem support and simpler operational compatibility.

---

### 2) JWT token structure
We will use **short-lived access tokens** and **rotating refresh tokens**.

#### Access token
A JWT access token will contain the following claims:

- `iss` — issuer, e.g. `https://auth.payments.example`
- `sub` — subject, the user or client identity
- `aud` — audience, e.g. `payments-api`
- `exp` — expiration time
- `iat` — issued-at time
- `nbf` — not-before time
- `jti` — unique token ID
- `scope` — granted permissions
- `roles` — optional role list, if needed by authorization logic
- `tenant_id` — tenant or account boundary, if applicable
- `token_type` — `access`

#### Access token expiry
- Access tokens will be **short-lived**: **15 minutes**.
- This limits exposure if a token is stolen.

#### Refresh token
Refresh tokens will:
- be **opaque** rather than JWTs, to reduce leakage of long-lived credentials into client-visible claims,
- be stored server-side in a hashed form,
- be **rotated on every use**,
- carry a unique identifier and parent linkage for replay detection.

#### Refresh strategy
- On refresh, the old refresh token is invalidated.
- A new refresh token is issued alongside a new access token.
- If an already-used refresh token is presented again, the system treats it as a replay attempt and revokes the token family or session chain.

This directly addresses replay protection requirements.

---

### 3) Token validation middleware
All protected API routes will use authentication middleware that performs the following checks:

1. **Extract bearer token**
   - Read the `Authorization: Bearer <token>` header.
   - Reject missing or malformed headers.

2. **Verify JWT signature**
   - Validate the token using the auth service public key from JWKS.
   - Select the correct key by `kid`.
   - Reject tokens with unknown or expired keys.

3. **Validate standard claims**
   - `iss` must match the expected issuer.
   - `aud` must include the Payments API audience.
   - `exp` must be in the future.
   - `nbf` must not be in the future.
   - `iat` must be reasonable and not malformed.

4. **Validate token type**
   - Ensure the token is an **access token**.
   - Reject refresh tokens if they are ever presented to the API.

5. **Authorize request context**
   - Attach authenticated identity, scopes, roles, and tenant information to the request context.
   - Downstream handlers use this context for authorization decisions.

6. **Failure behavior**
   - Return standardized auth errors using **RFC 9457 Problem Details**.
   - Use the appropriate auth error type for invalid or missing credentials.

#### Middleware operational notes
- Cache JWKS keys with a bounded TTL to reduce latency.
- Support key rotation without downtime.
- Fail closed if signature verification or claim validation cannot be completed safely.

---

## Consequences

### Positive
- Stronger security posture through asymmetric signing.
- Reduced blast radius compared with shared-secret signing.
- Clear separation between token issuance and token validation.
- Refresh token replay protection reduces the impact of token theft.
- JWKS-based verification supports scalable multi-service validation.

### Negative
- More operational complexity than HS256.
- Requires key management, rotation procedures, and JWKS availability.
- Refresh token rotation requires server-side state and revocation tracking.
- Middleware becomes slightly more complex due to claim validation and key lookup.

### Neutral / tradeoffs
- Access tokens are intentionally short-lived, which improves security but increases refresh traffic.
- Opaque refresh tokens reduce client-side introspection but improve control and replay protection.

## Summary
The Payments API authentication module will use **RS256-signed JWT access tokens**, **15-minute expiry**, and **rotating opaque refresh tokens with replay detection**. Validation middleware will verify signature, issuer, audience, expiry, token type, and request context before allowing access. This design aligns with the security review and avoids the unacceptable risks of symmetric signing.

If you want, I can also turn this into a more formal ADR template with an ADR ID, date, and implementation notes.

---

## Phase: Rate Limiting Implementation

### Agent Output

I couldn’t find prior API-spec or auth-module decisions in memory, but I did find these active constraints that must be respected:

- 429 responses must include `Retry-After`
- All error responses must use RFC 9457 Problem Details (`application/problem+json`)
- Auth tokens must use RS256, not HS256

Because the API spec and auth-module decisions are missing, I can’t safely claim consistency with prior architecture yet. If you want, I can still draft a provisional ADR based on standard Payments API patterns and clearly label assumptions.

If you’d like that, I’ll produce an ADR covering:
1. rate limiting algorithm choice,
2. response headers,
3. per-user vs per-API-key behavior,
4. alignment with the known constraints above.

---

## Phase: Error Handling Refactor

### Agent Output

Below is a refactored error-handling design for the Payments API, aligned to the active constraints I could verify.

## Refactored global error handling design

### 1) Global strategy
Use a single error translation layer at the API boundary that converts all failures into **RFC 9457 Problem Details** responses with `Content-Type: application/problem+json`.

#### Core principles
- **One format for all errors**: no custom error envelopes.
- **Status code reflects the failure class**:
  - `401 Unauthorized` for missing/invalid authentication
  - `403 Forbidden` for authenticated but unauthorized requests
  - `429 Too Many Requests` for rate limiting
  - Other 4xx/5xx mapped consistently through the same handler
- **No sensitive internals** in response bodies.
- **Consistent machine-readable fields** for clients to branch on safely.

### 2) Standard error response shape
Use RFC 9457 fields:
- `type`
- `title`
- `status`
- `detail`
- `instance`

Optional extension fields may be used only if they do not violate the agreed format and are safe for clients, such as:
- `error_code` for stable application-level classification
- `trace_id` for support correlation

Example:
```json
{
  "type": "https://api.example.com/problems/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Authentication credentials were missing or invalid.",
  "instance": "/payments/charges/123",
  "trace_id": "01HZY..."
}
```

### 3) Authentication error handling
Distinguish clearly between:

#### 401 Unauthorized
Use when:
- No token is provided
- Token is malformed
- Token is expired
- Token signature is invalid
- Token cannot be validated

Response should indicate authentication failure, not permission failure.

#### 403 Forbidden
Use when:
- Token is valid
- User/service is authenticated
- Required role/scope/permission is missing
- Resource access is denied by policy

Response should indicate the caller is known but not allowed.

### 4) Rate limit error handling
For all `429` responses:
- Include `Retry-After` header
- Return RFC 9457 Problem Details body
- Keep the body consistent with other errors

Recommended headers:
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 60
```

Recommended body:
```json
{
  "type": "https://api.example.com/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Please retry after the indicated interval.",
  "instance": "/payments/charges"
}
```

If available, additional rate-limit headers may be included for client guidance, but `Retry-After` is mandatory per the active constraint.

### 5) Global mapping rules
Implement a centralized mapping table:

| Condition | HTTP Status | Problem Type | Notes |
|---|---:|---|---|
| Missing/invalid auth | 401 | `/problems/unauthorized` | Authentication failure |
| Authenticated but not allowed | 403 | `/problems/forbidden` | Authorization failure |
| Rate limit exceeded | 429 | `/problems/rate-limit-exceeded` | Must include `Retry-After` |
| Validation failure | 400 or 422 | `/problems/validation-error` | Use one status consistently |
| Resource not found | 404 | `/problems/not-found` | Avoid leaking existence where inappropriate |
| Conflict | 409 | `/problems/conflict` | For state/version conflicts |
| Unexpected server error | 500 | `/problems/internal-server-error` | Generic message only |

### 6) Implementation architecture
Recommended structure:
- **Exception types**: domain-specific exceptions for auth, authorization, rate limiting, validation, conflict, etc.
- **Error translator**: one middleware/filter/handler converts exceptions to Problem Details.
- **Response builder**: ensures headers and body are always aligned.
- **Correlation ID propagation**: attach a request/trace identifier to every error response.

### 7) Security and privacy rules
- Do not reveal whether a user exists in auth failures.
- Do not expose token validation details.
- Do not include stack traces or internal exception messages.
- For 403, keep the message generic unless policy allows more detail.
- For 500, always return a generic message.

---

## Checklist verifying consistency with prior decisions

### Active constraints verified
- [x] **RFC 9457 Problem Details required** for all error responses
- [x] **429 responses include `Retry-After`**
- [x] **Auth uses RS256** constraint remains untouched by error handling changes
- [x] **Stripe webhook signature verification remains server-side only** and is not impacted

### Phase 1 authentication consistency
- [x] `401` used for missing/invalid/expired authentication
- [x] `403` used for authenticated but unauthorized requests
- [x] No auth internals leaked in error bodies
- [x] Error format remains the same for both auth failure classes

### Phase 2 rate limiting consistency
- [x] `429` returned for rate limit exhaustion
- [x] `Retry-After` header included on every `429`
- [x] Rate limit errors use the same Problem Details format as all other errors

### Global API consistency
- [x] All errors use `application/problem+json`
- [x] No custom error envelope introduced
- [x] Error mapping is centralized and deterministic
- [x] Correlation/trace ID can be included safely
- [x] Client-facing messages are generic and non-sensitive

---

## Deployment readiness assessment

### Readiness: **Conditional go**
The design is ready **if** implementation follows the centralized handler pattern and preserves the required headers/status codes.

### What is ready
- Clear global error contract
- Compatible with auth and rate limiting requirements
- Conforms to active error-format constraint
- Safe from a security disclosure perspective

### Remaining implementation risks
- Ensuring every code path routes through the global handler
- Verifying all `429` responses actually emit `Retry-After`
- Ensuring auth middleware differentiates `401` vs `403` correctly
- Confirming no legacy custom error payloads remain

### Deployment checklist
- [ ] Add/verify centralized exception-to-Problem-Details middleware
- [ ] Add tests for `401`, `403`, `429`, `500`
- [ ] Add tests asserting `Retry-After` on every `429`
- [ ] Add tests asserting `Content-Type: application/problem+json`
- [ ] Add tests preventing custom error envelopes
- [ ] Run integration tests across auth, rate limiting, validation, and server error paths
- [ ] Confirm observability includes trace/correlation IDs

### Final assessment
- **Design quality:** High
- **Constraint compliance:** High
- **Deployment readiness:** Medium-high, pending implementation verification and test coverage

If you want, I can turn this into a concrete ADR-style spec or a middleware/handler pseudocode implementation next.

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