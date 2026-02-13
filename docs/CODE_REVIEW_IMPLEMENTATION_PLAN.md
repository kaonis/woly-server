# WoLy Server — Code Review Implementation Plan

**Review Date:** 2026-02-13
**Reviewer:** GitHub Copilot (Claude Opus 4.6)
**Scope:** Full monorepo — `apps/node-agent`, `apps/cnc`, `packages/protocol`

---

## GitHub Issues

All findings have been filed as GitHub issues:

| Phase | Issue | Title |
|-------|-------|-------|
| **Bugs** | #76 | Fix HTTP 204 → 404 for not-found hosts |
| **Bugs** | #77 | Fix incorrect `discovered` and `pingResponsive` in addHost |
| **Bugs** | #78 | Fix SQLite RETURNING clause hardcoded to `nodes` table |
| **Bugs** | #79 | Fix `usePingValidation` being a no-op |
| **Bugs** | #80 | Fix seed data, JSDoc mismatch, FQN round-trip corruption |
| **Security** | #81 | Add input validation on C&C updateHost request body |
| **Security** | #82 | Add rate limiting to C&C auth token exchange endpoint |
| **Security** | #83 | Restrict default CORS and rate-limit health endpoint |
| **Code Quality** | #84 | Consolidate Joi → Zod for HTTP validation |
| **Code Quality** | #85 | Extract scan orchestration from HostDatabase (SRP) |
| **Code Quality** | #86 | Remove unused dependencies |
| **Code Quality** | #87 | Reduce `any` usage in C&C |
| **Code Quality** | #88 | Async NBT lookup, SQL dedup, isSqlite, cncClient TODOs |
| **Code Quality** | #89 | Add PUT/DELETE REST endpoints for standalone mode |
| **Performance** | #90 | Parallelize ping during network sync |
| **Performance** | #91 | O(1) socket lookup, FQN index, command pruning, health checks |
| **Testing** | #92 | C&C coverage thresholds, test infra, untested files |
| **Testing** | #93 | Protocol coverage, CORS tests, raise thresholds |
| **Docs** | #94 | Fix coverage claims, align versions, create C&C TESTING.md |

Pre-existing issues that overlap: #55, #56, #57 (security), #63 (lint debt).

---

## Executive Summary

The WoLy server monorepo is a well-architected distributed Wake-on-LAN system with strong security foundations—parameterized SQL, Zod protocol validation, timing-safe token comparison, Helmet headers, and graceful shutdown handling. The codebase demonstrates thoughtful engineering across both the node-agent and C&C services.

This review identified **8 bugs**, **12 code quality issues**, **6 security hardening opportunities**, **5 performance improvements**, **11 testing gaps**, and **7 documentation inaccuracies**. Items are organized into phased implementation with clear priorities.

---

## Phase 1: Bug Fixes (Critical)

Issues that produce incorrect behavior or could cause runtime failures.

### 1.1 Fix HTTP 204 for Not-Found Hosts → Should Be 404

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/node-agent/src/controllers/hosts.ts` |

**Problem:** `getHost` and `wakeUpHost` return HTTP 204 (No Content — success) when a host is not found. The mobile app may interpret this as a successful operation.

**Fix:**
```typescript
// Before
if (!host) { return res.status(204).send(); }

// After
if (!host) { return res.status(404).json({ error: 'Not Found', message: `Host '${name}' not found` }); }
```

**Impact:** Mobile app error handling will correctly distinguish "not found" from "success with no content."

---

### 1.2 Fix `discovered: 1` for Manually-Added Hosts → Should Be 0

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** `addHost()` inserts `discovered: 1` for manually-added hosts. The `discovered` field semantically means "automatically discovered via network scan" — manual additions should be `0`.

**Fix:** Change `discovered: 1` to `discovered: 0` in the INSERT statement of `addHost()`.

---

### 1.3 Fix `pingResponsive: undefined` in `addHost` Response

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** `addHost()` returns `pingResponsive: undefined` in the host object, but the protocol `Host` type specifies `number | null`. In JSON serialization, `undefined` is omitted entirely rather than serialized as `null`.

**Fix:** Change `pingResponsive: undefined` to `pingResponsive: null`.

---

### 1.4 Fix SQLite `RETURNING` Clause Hardcoded to `nodes` Table

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Medium | `apps/cnc/src/database/sqlite-connection.ts` |

**Problem:** The SQLite adapter's `RETURNING` clause handling for INSERT statements is hardcoded:
```typescript
const selectStmt = this.db.prepare('SELECT * FROM nodes WHERE rowid = ?');
```
This silently breaks for any `INSERT...RETURNING` on non-`nodes` tables (e.g., `aggregated_hosts`, `commands`).

For `UPDATE`/`DELETE` with `RETURNING`, the adapter strips the clause and returns `rows: []`, silently discarding return values.

**Fix:** Parse the table name from the SQL statement dynamically:
```typescript
const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i);
const tableName = tableMatch?.[1] ?? 'unknown';
const selectStmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE rowid = ?`);
```
For UPDATE/DELETE RETURNING, execute the RETURNING columns as a separate SELECT before the modification, or use SQLite 3.35+ `RETURNING` support if available.

---

### 1.5 Fix `usePingValidation` Being a No-Op

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** In `syncWithNetwork()`, the `usePingValidation` logic is dead code. Even when enabled and ping fails, `isAlive` is set back to `true` because "ARP response means it's awake." The `isAlive` variable always ends up `true` regardless of the config setting.

**Fix:** Refactor so `usePingValidation` actually determines the final status:
```typescript
if (usePingValidation) {
  const pingResult = await ping.promise.probe(host.ip, { timeout: pingTimeout });
  host.pingResponsive = pingResult.alive ? 1 : 0;
  // If ping validation is on and ping fails, mark as asleep
  isAlive = pingResult.alive;
} else {
  // ARP presence alone is sufficient
  isAlive = true;
}
```

---

### 1.6 Remove Hardcoded Seed Data

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** The database seeds with personal device names and MAC addresses (`PHANTOM-MBP`, `80:6D:97:60:39:08`). These are developer-specific and will appear for all new deployments.

**Fix:** Remove the seed data block. If seed data is needed for development, gate it behind an env var (`SEED_DEMO_DATA=true`).

---

### 1.7 Fix Rate Limiter JSDoc Mismatch

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/src/middleware/rateLimiter.ts` |

**Problem:** JSDoc says "100 requests per 15 minutes" but code implements `windowMs: 2 * 60 * 1000` (2 minutes).

**Fix:** Update JSDoc to match code: "100 requests per 2 minutes."

---

### 1.8 Fix FQN Parse/Build Asymmetry

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/cnc/src/services/commandRouter.ts`, `apps/cnc/src/services/hostAggregator.ts` |

**Problem:** `buildFQN` produces `name@location-nodeId`, replacing spaces with hyphens. `parseFQN` converts hyphens back to spaces, which corrupts locations that contain natural hyphens (e.g., "sub-network" becomes "sub network").

**Fix:** Use a non-ambiguous separator (e.g., `~` or URL-encoding) for the location-nodeId join in `buildFQN`, or store the original location separately and only use FQN for display/lookup.

---

## Phase 2: Security Hardening

### 2.1 Add Input Validation on C&C `updateHost` Request Body

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/cnc/src/controllers/hosts.ts` |

**Problem:** `updateHost` passes `req.body` (typed as `any`) directly to `routeUpdateHostCommand` with no schema validation. Arbitrary JSON is forwarded to node agents.

**Fix:** Add Zod validation using the protocol's existing types:
```typescript
const updateHostBodySchema = z.object({
  name: z.string().min(1).optional(),
  mac: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/).optional(),
  ip: z.string().ip().optional(),
  status: hostStatusSchema.optional(),
}).strict();
```

---

### 2.2 Tighten CORS Wildcard Patterns

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/src/app.ts` |

**Problem:** CORS allows any `*.ngrok-free.app` and `*.netlify.app` subdomain. An attacker could create their own subdomain on these services and make cross-origin requests.

**Fix:**
- Add `NODE_CORS_ORIGINS` environment variable for explicit origins
- When set, use only those explicit origins
- Keep wildcard patterns only when `NODE_ENV !== 'production'`
- Log a warning when wildcard patterns are used

---

### 2.3 Add Rate Limiting to C&C Auth Endpoint

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/cnc/src/middleware/rateLimiter.ts`, `apps/cnc/src/routes/index.ts` |

**Problem:** `POST /api/auth/token` can be brute-forced with no throttling. Rate limiter exists but is not applied to the auth endpoint specifically.

**Fix:** Create a strict auth rate limiter (5 requests per 15 minutes per IP) and apply it to the auth route.

---

### 2.4 Add WebSocket Connection Rate Limiting

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/cnc/src/websocket/server.ts` |

**Problem:** The WebSocket upgrade path has no connection rate limiting. A malicious actor could rapidly open/close connections to exhaust server resources.

**Fix:** Track connection attempts per IP with a sliding window. Reject upgrades (HTTP 429) exceeding the threshold. Make configurable via `WS_MAX_CONNECTIONS_PER_IP` env var.

---

### 2.5 Restrict Default CORS to Reject All Origins

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/src/config/index.ts` |

**Problem:** Default `CORS_ORIGINS` is `['*']` when env var is unset, allowing all origins in production.

**Fix:** Default to `[]` (no origins) in production, `['*']` only in development. Log a startup warning when no CORS origins are configured.

---

### 2.6 Add Rate Limiting to Health Endpoint

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/src/app.ts` |

**Problem:** The `/health` endpoint queries the database but is not rate-limited.

**Fix:** Apply a generous rate limiter (e.g., 60 req/min) to the health endpoint.

---

## Phase 3: Code Quality Improvements

### 3.1 Consolidate Joi → Zod in Node Agent

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Large | `apps/node-agent/src/validators/`, `apps/node-agent/src/middleware/validateRequest.ts` |

**Problem:** The node-agent uses Joi for HTTP request validation while the protocol package and C&C use Zod. This creates cognitive overhead, dual dependency weight (~150KB combined), and inconsistent validation patterns.

**Fix:**
1. Rewrite `hostValidator.ts` schemas using Zod
2. Create a Zod-based `validateRequest` middleware (replacing Joi middleware)
3. Remove `joi`, `@types/joi` dependencies
4. Update all tests

**Alternative:** Keep Joi for now if the migration effort is too high. Mark this as tech debt.

---

### 3.2 Extract Scan Orchestration from `HostDatabase`

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** `HostDatabase` violates SRP — it's a database class that also orchestrates network scanning (`syncWithNetwork`), timer management (`startPeriodicSync`), and event emission. This makes it hard to test and understand.

**Fix:** Extract a `ScanOrchestrator` service:
```
HostDatabase → pure DB CRUD + event emission
ScanOrchestrator → scan scheduling, network sync, host reconciliation
```

---

### 3.3 Remove Unused `express-validator` Dependency

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/package.json` |

**Problem:** `express-validator` is listed in dependencies but never imported anywhere.

**Fix:** `npm uninstall express-validator -w apps/node-agent`

---

### 3.4 Remove Unused `uuid` Dependency (C&C)

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/cnc/package.json` |

**Problem:** `uuid` and `@types/uuid` are in dependencies, but the codebase uses `crypto.randomUUID()` (native Node 19+) everywhere.

**Fix:** `npm uninstall uuid @types/uuid -w apps/cnc`

---

### 3.5 Remove Unnecessary `@types/express-rate-limit`

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/package.json` |

**Problem:** `express-rate-limit` v8+ ships its own TypeScript types. The separate `@types/express-rate-limit` package is unnecessary and may cause type conflicts.

**Fix:** `npm uninstall @types/express-rate-limit -w apps/node-agent`

---

### 3.6 Reduce `any` Usage in C&C

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | Multiple files in `apps/cnc/src/` |

**Problem:** `any` is used extensively for database query results, row mappings, and request bodies. This undermines TypeScript strictness.

**Key areas:**
- `IDatabase.query()` → Add generic return type: `query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>`
- `mapRowToNode(row: any)` → Define `NodeRow` interface
- `rowToRecord(row: any)` → Define proper row types

---

### 3.7 Centralize Database Dialect Branching

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Large | `apps/cnc/src/models/`, `apps/cnc/src/services/` |

**Problem:** ~15 places independently check `config.dbType === 'sqlite'` and provide dual SQL implementations. This is scattered across `NodeModel`, `CommandModel`, `HostAggregator`, and the database layer.

**Fix (short-term):** Add `isSqlite: boolean` property to the `IDatabase` interface and read from the db instance instead of config.

**Fix (long-term):** Consider a query builder like Knex.js, or a dialect-aware SQL helper that encapsulates differences.

---

### 3.8 Extract Duplicated SQL Column Mappings

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/cnc/src/services/hostAggregator.ts` |

**Problem:** The `SELECT` column list with alias mappings (`ah.node_id as "nodeId"`, etc.) is copy-pasted across 7+ methods.

**Fix:** Extract to a constant:
```typescript
const HOST_SELECT_COLUMNS = `
  ah.name, ah.mac, ah.ip, ah.status, ah.last_seen as "lastSeen",
  ah.discovered, ah.ping_responsive as "pingResponsive",
  ah.node_id as "nodeId", ah.node_name as "nodeName", ...
`;
```

---

### 3.9 Add Request Correlation ID Middleware

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | Both apps |

**Problem:** HTTP requests don't carry a correlation ID, making it very hard to trace a request through logs across services.

**Fix:** Add middleware that assigns a `X-Request-ID` (or reads from incoming header) and attaches it to log context.

---

### 3.10 Make `getHostnameViaNBT` Async

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/src/services/networkDiscovery.ts` |

**Problem:** `getHostnameViaNBT` uses `execFileSync`, blocking the event loop. With many hosts lacking DNS entries, this causes significant blocking during network discovery.

**Fix:** Replace `execFileSync` with async `execFile` using `util.promisify`.

---

### 3.11 Add Missing PUT/DELETE REST Endpoints for Standalone Mode

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/node-agent/src/routes/hosts.ts`, `apps/node-agent/src/controllers/hosts.ts` |

**Problem:** `hostDatabase.ts` has `updateHost()` and `deleteHost()` methods, but there are no REST endpoints for them. Standalone-mode users can add hosts but cannot edit or delete them via the API — these operations are only available through C&C commands.

**Fix:** Add `PUT /hosts/:name` and `DELETE /hosts/:name` endpoints with appropriate validation and rate limiting.

---

### 3.12 Resolve the 3 TODOs in `cncClient.ts`

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/node-agent/src/services/cncClient.ts` |

**Problem:** Three hardcoded placeholders in the registration message:
```typescript
version: '1.0.0',          // TODO: Get from package.json
subnet: '0.0.0.0/0',       // TODO: Get actual subnet
gateway: '0.0.0.0',        // TODO: Get actual gateway
```

**Fix:**
1. Read version from `package.json` at startup
2. Detect network interface via `os.networkInterfaces()` for subnet/gateway
3. Fall back gracefully if detection fails

---

## Phase 4: Performance Improvements

### 4.1 Parallelize Ping During Network Sync

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/node-agent/src/services/hostDatabase.ts` |

**Problem:** During `syncWithNetwork`, each host is pinged sequentially. With 50+ hosts and a 2s timeout, a scan takes 100+ seconds.

**Fix:** Use `Promise.all` with concurrency limit (e.g., `p-limit` or manual batching):
```typescript
const PING_CONCURRENCY = 10;
// Batch hosts in groups of 10 for parallel pinging
```

---

### 4.2 Fix `getConnectionBySocket` O(n) Lookup

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/cnc/src/services/nodeManager.ts` |

**Problem:** Every WebSocket message does an `Array.from(this.connections.values()).find(c => c.ws === ws)` scan over all connections.

**Fix:** Add a reverse lookup map:
```typescript
private socketToNodeId = new WeakMap<WebSocket, string>();
// Populate on connection, O(1) lookup on message
```

---

### 4.3 Add Database Index on `fully_qualified_name`

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/cnc/src/database/schema.sql`, `apps/cnc/src/database/schema.sqlite.sql` |

**Problem:** `getHostByFQN()` queries by `fully_qualified_name` but there's no index. Query degrades linearly with host count.

**Fix:** Add `CREATE INDEX idx_aggregated_hosts_fqn ON aggregated_hosts (fully_qualified_name);` to both schema files and as a migration.

---

### 4.4 Add Command Table Pruning

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Medium | `apps/cnc/src/models/Command.ts`, `apps/cnc/src/services/commandReconciler.ts` |

**Problem:** The `commands` table grows indefinitely with no retention policy.

**Fix:** Add a periodic cleanup that removes commands older than a configurable TTL (e.g., `COMMAND_RETENTION_DAYS=30`). Run on startup and every 24 hours.

---

### 4.5 Deepen Health Check Endpoints

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | Both apps |

**Problem:** Health endpoints return `{ status: 'healthy' }` unconditionally without checking subsystem liveness.

**Fix:** Check database connectivity, last scan time (node-agent), WebSocket server status (C&C), and connected node count. Return `{ status: 'healthy' | 'degraded', checks: { db, ws, ... } }`.

---

## Phase 5: Testing Improvements

### 5.1 Add Coverage Thresholds to C&C

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/cnc/jest.config.js`, `apps/cnc/package.json` |

**Problem:** C&C has no coverage thresholds and `test:ci` doesn't collect coverage.

**Fix:**
1. Add `--ci --coverage --maxWorkers=2` to `test:ci` script
2. Add `coverageThreshold: { global: { branches: 50, functions: 50, lines: 50, statements: 50 } }`
3. Create `tsconfig.test.json` for relaxed test-specific TypeScript settings

---

### 5.2 Add Tests for Untested C&C Files

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Large | Multiple C&C files |

**Untested files (10):**
| File | Priority |
|------|----------|
| `services/commandReconciler.ts` | High — startup path |
| `websocket/server.ts` | Medium — WS lifecycle |
| `middleware/errorHandler.ts` | Medium — error formatting |
| `config/index.ts` | Medium — validation logic |
| `database/sqlite-connection.ts` | High — RETURNING bug lives here |
| `database/connection.ts` | Low — factory pattern |
| `controllers/admin.ts` | Medium — admin operations |
| `controllers/nodes.ts` | Medium — node queries |
| `utils/logger.ts` | Low |
| `init-db.ts` | Low |

---

### 5.3 Add Protocol Package Coverage Configuration

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `packages/protocol/jest.config.js` |

**Fix:** Add `collectCoverageFrom` and `coverageThreshold` settings.

---

### 5.4 Add CORS Policy Unit Test

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/src/__tests__/` |

**Problem:** The dynamic CORS origin function with ngrok/Netlify/helios patterns is logic-heavy but untested.

---

### 5.5 Raise Coverage Thresholds to 70%

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Ongoing | Both `jest.config.js` files |

**Problem:** Node-agent enforces 50% thresholds but actual coverage is ~84%. For a production service managing network infrastructure, 70–80% is more appropriate.

**Fix:** Raise thresholds incrementally: 50% → 60% → 70% as test coverage stabilizes.

---

## Phase 6: Documentation Fixes

### 6.1 Fix Coverage Claims in TESTING.md

| Severity | Effort | Files |
|----------|--------|-------|
| **HIGH** | Small | `apps/node-agent/TESTING.md` |

**Problem:** TESTING.md claims coverage thresholds are 80/70/85/80%, but `jest.config.js` enforces 50% across the board. Appears in two locations in the file.

**Fix:** Update both occurrences to match actual `jest.config.js` values (50% all four metrics).

---

### 6.2 Fix "90%+ Coverage" Claim in Node Agent README

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | `apps/node-agent/README.md` |

**Problem:** README claims "240+ tests with 90%+ coverage" but actual coverage is 84.36% statements / 71% branches.

**Fix:** Change to "240+ tests with 80%+ coverage" or "84% statement coverage."

---

### 6.3 Align Node.js Version Requirements

| Severity | Effort | Files |
|----------|--------|-------|
| **MEDIUM** | Small | Multiple |

**Problem:** Four different minimum versions cited across docs:
| Source | Claims |
|--------|--------|
| `.nvmrc` | Node 24 |
| Root `package.json` engines | `>=24.0.0` |
| `TESTING.md` | "Node.js v22+" |
| Both test preflight scripts | Check for v20+ |
| `CONTRIBUTING.md` | "Node.js 24+" |

**Fix:** Align all to Node 24+ (per `engines` field). Update preflight scripts to check `>= 24`.

---

### 6.4 Fix CLAUDE.md "Zod for validation" Claim

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `CLAUDE.md` |

**Problem:** States "Both apps use Express 5, Jest 30, Zod for validation" — node-agent uses Joi.

**Fix:** Change to "Both apps use Express 5 and Jest 30. Node-agent uses Joi for HTTP validation; C&C and protocol use Zod."

---

### 6.5 Create C&C TESTING.md

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Medium | `apps/cnc/TESTING.md` (new) |

**Problem:** No testing documentation exists for the C&C app. Node-agent has a thorough `TESTING.md`.

**Fix:** Create `apps/cnc/TESTING.md` with test running instructions, mocking patterns, and coverage details.

---

### 6.6 Add Testing Section to Protocol README

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `packages/protocol/README.md` |

**Problem:** Protocol package has tests (`__tests__/schemas.test.ts`) but README has no testing section.

---

### 6.7 Fix `deleteHostSchema` Dead Code

| Severity | Effort | Files |
|----------|--------|-------|
| **LOW** | Small | `apps/node-agent/src/validators/hostValidator.ts` |

**Problem:** `deleteHostSchema` with `macAddress` field is exported but never wired to any route.

**Fix:** Either wire it to the DELETE route (when 3.11 is implemented) or remove it.

---

## Implementation Schedule

### Sprint 1 (Week 1–2): Critical Bugs + Security

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1.1 | Fix 204 → 404 for not-found hosts | 1h | High |
| 1.2 | Fix `discovered: 1` → `0` for manual hosts | 30m | Medium |
| 1.3 | Fix `pingResponsive: undefined` → `null` | 30m | Low |
| 1.4 | Fix SQLite RETURNING clause | 3h | High |
| 1.6 | Remove hardcoded seed data | 30m | Medium |
| 1.7 | Fix rate limiter JSDoc | 15m | Low |
| 2.1 | Add C&C updateHost body validation | 1h | High |
| 6.1 | Fix TESTING.md coverage claims | 30m | Medium |
| 6.2 | Fix README 90%+ claim | 15m | Low |

**Estimated total:** ~8 hours

### Sprint 2 (Week 3–4): Security + Performance

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1.5 | Fix `usePingValidation` no-op | 2h | Medium |
| 1.8 | Fix FQN parse/build asymmetry | 3h | Medium |
| 2.2 | Tighten CORS wildcards | 1h | Medium |
| 2.3 | Add C&C auth rate limiting | 1h | Medium |
| 2.5 | Restrict default CORS | 30m | Low |
| 4.1 | Parallelize ping during sync | 2h | High |
| 4.2 | Fix O(n) socket lookup | 1h | Medium |
| 5.1 | Add C&C coverage thresholds | 1h | Medium |

**Estimated total:** ~11 hours

### Sprint 3 (Week 5–6): Code Quality

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 3.3 | Remove unused `express-validator` | 15m | Low |
| 3.4 | Remove unused `uuid` | 15m | Low |
| 3.5 | Remove unnecessary `@types/express-rate-limit` | 15m | Low |
| 3.8 | Extract SQL column mappings | 1h | Low |
| 3.10 | Make `getHostnameViaNBT` async | 1h | Medium |
| 3.11 | Add PUT/DELETE REST endpoints | 3h | Medium |
| 3.12 | Resolve cncClient TODOs | 3h | Medium |
| 4.3 | Add FQN database index | 30m | Low |
| 6.3 | Align Node.js version docs | 30m | Medium |
| 6.4 | Fix CLAUDE.md Zod claim | 15m | Low |

**Estimated total:** ~10 hours

### Sprint 4 (Week 7–8): Testing + Long-term Quality

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 2.4 | WebSocket connection rate limiting | 4h | Medium |
| 3.2 | Extract scan orchestration from HostDatabase | 6h | Medium |
| 3.6 | Reduce `any` usage in C&C | 4h | Medium |
| 4.4 | Command table pruning | 3h | Medium |
| 4.5 | Deepen health checks | 2h | Medium |
| 5.2 | Add tests for untested C&C files | 8h | Medium |

**Estimated total:** ~27 hours

### Backlog (Future Sprints)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 2.6 | Rate limit health endpoint | 30m | Low |
| 3.1 | Consolidate Joi → Zod | 8h | Medium |
| 3.7 | Centralize DB dialect branching | 12h | Low |
| 3.9 | Request correlation ID middleware | 2h | Low |
| 5.3 | Protocol coverage config | 30m | Low |
| 5.4 | CORS policy unit test | 1h | Low |
| 5.5 | Raise coverage thresholds to 70% | Ongoing | Low |
| 6.5 | Create C&C TESTING.md | 2h | Low |
| 6.6 | Protocol README testing section | 30m | Low |
| 6.7 | Fix/wire `deleteHostSchema` | 30m | Low |

---

## Appendix A: What's Done Well

The review also identified numerous strengths worth preserving:

| Area | Details |
|------|---------|
| **Security foundations** | Timing-safe token comparison, Helmet, parameterized SQL, TLS enforcement in production, log sanitization |
| **Protocol-first design** | Shared Zod schemas ensure type safety across services at both compile-time and runtime |
| **Graceful shutdown** | Both apps properly handle SIGTERM/SIGINT with cleanup |
| **Durable command lifecycle** | Commands persisted through state machine transitions, surviving restarts via reconciliation |
| **Cross-platform network discovery** | macOS, Linux, Windows ARP table parsing with DNS/NetBIOS fallback |
| **Secret rotation** | WS session token secrets support rotation via comma-separated values |
| **Comprehensive Swagger docs** | Full OpenAPI 3.0 specs with schemas, examples, and auth definitions |
| **MAC-first reconciliation** | C&C host aggregator handles hostname changes gracefully |
| **Docker security** | Multi-stage builds, non-root user, Alpine images |
| **Test infrastructure** | 330+ tests across both apps with proper mocking patterns |

---

## Appendix B: Dependencies to Watch

| Package | Concern | Action |
|---------|---------|--------|
| `wake_on_lan` | Pinned to `1.0.0`, very old, possibly unmaintained | Evaluate `wol` or `wake-on-lan` alternatives |
| `swagger-jsdoc` | v6 is stable but v7 exists | Upgrade when feasible |
| `ts-jest` 29.x | Paired with Jest 30.x — potential compat gaps | Monitor for issues, upgrade to ts-jest 30 when released |
| `axios` | Used in both apps, but Node 24 has native `fetch` | Consider eliminating in favor of native fetch |
| `joi` (node-agent) | Only used in one app while Zod is used elsewhere | Consolidate (see 3.1) |

---

## Appendix C: Items Already Tracked in IMPROVEMENTS.md

The following items from `IMPROVEMENTS.md` were also identified in this review and are cross-referenced here for deduplication. **Do not create duplicate issues for these**:

| IMPROVEMENTS.md § | This Plan § | Notes |
|------|------|-------|
| 1.1 Node-Agent API Auth | 2.2, 2.5 | Related — CORS tightening is a subset |
| 1.3 CnC Rate Limiting | 2.3 | Exact match |
| 1.4 WS Message Rate Limiting | 2.4 | Related |
| 1.6 CORS Configuration | 2.2 | Exact match |
| 2.1 Version from package.json | 3.12 | Included in TODO resolution |
| 2.2 Actual Subnet/Gateway | 3.12 | Included in TODO resolution |
| 4.1 Health Check Improvements | 4.5 | Exact match |

---

*Generated by GitHub Copilot code review — 2026-02-13*
