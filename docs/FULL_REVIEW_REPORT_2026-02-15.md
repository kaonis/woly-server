# WoLy Server Full Review Report

Date: 2026-02-15  
Repository: `woly-server`  
Reviewer: Codex (GPT-5)

## 1. Executive Summary

The repository is generally well-structured (clear monorepo boundaries, shared protocol package, broad test coverage, explicit runtime schemas, and strong logging/observability primitives). I found **8 actionable issues**:

- **High:** 2
- **Medium:** 4
- **Low:** 2

The two highest-priority issues are:

1. **`node-agent` intentional disconnect can still trigger automatic reconnect** (shutdown/control-plane reliability bug).  
2. **Network scan failures are swallowed, yet API/command paths still report success** (false-positive command completion).

## 2. Scope & Method

### Scope reviewed

- `apps/cnc` (runtime, auth, websocket, DB, command routing)
- `apps/node-agent` (runtime, DB, scanning, C&C client/service)
- `packages/protocol` (contract types/schemas)
- CI/workflow config and test preflight scripts

### Methods used

- Static code review of critical runtime paths
- Script/config/workflow audit
- Local command validation

### Commands executed (key)

- `npm run lint` (turbo cached pass)
- `npm run typecheck` (turbo cached pass)
- `npm run test:ci` (turbo cached pass)
- Direct workspace runs for non-cached verification:
  - `npm run test:ci --workspace=@kaonis/woly-protocol` (pass)
  - `npm run test --workspace=@woly-server/cnc -- --runInBand src/models/__tests__/Node.test.ts` (fail)
- `npm audit --json` (0 vulns)

## 3. Findings (By Severity)

## High

### H1. `node-agent` disconnect path can still schedule reconnect attempts

**Impact**  
Intentional shutdowns can result in unplanned reconnect attempts, causing agents to reconnect after a stop request and undermining shutdown semantics.

**Evidence**

- `apps/node-agent/src/services/cncClient.ts:41` (`shouldReconnect` defaults to `true`)
- `apps/node-agent/src/services/cncClient.ts:85` (`disconnect()` closes socket but never sets `shouldReconnect = false`)
- `apps/node-agent/src/services/cncClient.ts:395` (`handleClose()` schedules reconnect when `shouldReconnect` is true)
- `apps/node-agent/src/services/agentService.ts:178` (`stop()` calls `cncClient.disconnect()` and expects stop semantics)

**Why this matters**  
A controlled stop should not behave like transient network failure.

**Recommendation**

- In `disconnect()`, set `shouldReconnect = false` before closing socket.
- Add a unit test asserting no reconnect timer is created after intentional disconnect.

---

### H2. Scan failures are swallowed but surfaced as success in API/command flows

**Impact**  
Operators can receive successful scan responses while the scan actually failed, producing stale/inaccurate state and false operational confidence.

**Evidence**

- `apps/node-agent/src/services/scanOrchestrator.ts:136` catches scan errors and only logs; no rethrow/error signal.
- `apps/node-agent/src/controllers/hosts.ts:288` awaits `syncWithNetwork()` then always returns HTTP 200 success payload.
- `apps/node-agent/src/services/agentService.ts:869` treats `syncWithNetwork()` completion as command success for immediate scan commands.

**Why this matters**  
Failure masking compromises command reliability and monitoring correctness.

**Recommendation**

- Return a structured scan result (`{ success, error?, counts... }`) from `syncWithNetwork()`.
- Propagate non-recoverable errors to caller so API can emit 5xx and command-result can emit failure.

## Medium

### M1. Idempotency key scope is too broad (cross-command collision risk)

**Impact**  
A reused `Idempotency-Key` for different command types on the same node can return the wrong historical command record/result.

**Evidence**

- `apps/cnc/src/database/schema.sql:51` unique index is `(node_id, idempotency_key)`.
- `apps/cnc/src/database/schema.sqlite.sql:51` same uniqueness scope in SQLite.
- `apps/cnc/src/models/Command.ts:225` lookup by `node_id + idempotency_key` only.
- Host endpoints all accept user-supplied idempotency keys:
  - `apps/cnc/src/controllers/hosts.ts:195` (wake)
  - `apps/cnc/src/controllers/hosts.ts:338` (update)
  - `apps/cnc/src/controllers/hosts.ts:473` (delete)

**Why this matters**  
Idempotency should generally be scoped to operation identity (at minimum route/method or command type).

**Recommendation**

- Include `type` (and optionally normalized target) in idempotency uniqueness.
- Add migration + backfill strategy for command table/indexes.

---

### M2. No general API rate limiting on most C&C `/hosts` endpoints

**Impact**  
Authenticated clients can spam command-generating endpoints (`wake`, `update`, `delete`) without global API throttling, increasing DoS/queue pressure risk.

**Evidence**

- `apps/cnc/src/routes/index.ts:37` applies auth to `/hosts` but not `apiLimiter`.
- `apps/cnc/src/routes/index.ts:52`–`54` host mutation routes are unthrottled.
- Only `/hosts/mac-vendor/:mac` is explicitly limited (`apps/cnc/src/routes/index.ts:47`).

**Recommendation**

- Apply `apiLimiter` to `/hosts` route group (or dedicated command limiter).
- Consider stricter limits for mutation routes vs read routes.

---

### M3. `HostDatabase` methods can dereference uninitialized DB after failed connection

**Impact**  
After connection failure paths, method calls can throw generic runtime errors (e.g., `Cannot read properties of undefined (reading 'prepare')`) instead of clear operational errors.

**Evidence**

- `apps/node-agent/src/services/hostDatabase.ts:15` uses definite assignment assertion (`db!`).
- `apps/node-agent/src/services/hostDatabase.ts:58` rejects ready promise after retries.
- Methods call `this.db.prepare(...)` directly, e.g. `apps/node-agent/src/services/hostDatabase.ts:106`, `apps/node-agent/src/services/hostDatabase.ts:162` without readiness guard.

**Recommendation**

- Add an internal guard (e.g., `assertReady()`) used by all DB methods.
- Convert thrown runtime type errors into explicit operational errors.

---

### M4. Node runtime consistency is fragile across workspace execution contexts

**Impact**  
Workspace test runs can fail due ABI mismatch for native modules (`better-sqlite3`) when different Node binaries are resolved by cwd/context.

**Evidence (reproduced)**

- Root context: `node -p process.versions.modules` => `137` (Node 24).  
- Workspace context (`apps/cnc`, `apps/node-agent`): `141` (Node 25) in this environment.
- Direct workspace test failure:
  - `npm run test --workspace=@woly-server/cnc -- --runInBand src/models/__tests__/Node.test.ts`
  - Error: `better_sqlite3.node ... compiled against NODE_MODULE_VERSION 141 ... requires 137`.

**Recommendation**

- Enforce exact Node major/minor in scripts/tooling (`volta`, stricter preflight, or CI bootstrap script checks).
- Ensure preflight and test runner execute under the same Node binary.

## Low

### L1. Deprecated URL parsing API used in websocket auth path

**Impact**  
Triggers deprecation warnings and increases long-term maintenance/security risk due legacy parser behavior.

**Evidence**

- `apps/cnc/src/websocket/auth.ts:2` imports `parse` from `url`.
- `apps/cnc/src/websocket/auth.ts:55` uses `parse(request.url, true)` for token extraction.

**Recommendation**

- Replace with WHATWG `URL` parsing against a safe base URL.

---

### L2. Malformed percent-encoding in FQN can bubble into 500 errors

**Impact**  
Invalid user input can trigger `decodeURIComponent` exceptions and be surfaced as internal errors rather than client validation errors.

**Evidence**

- `apps/cnc/src/services/commandRouter.ts:502` directly calls `decodeURIComponent(parts[1])`.
- Parsing exceptions are not converted to explicit 400-level validation failures.

**Recommendation**

- Wrap decode in validation and return typed client error (`400 Bad Request`) for malformed FQNs.

## 4. Quality Signals (Positive)

- Strong protocol-contract discipline with shared runtime schemas in `packages/protocol`.
- Good observability scaffolding (`runtimeMetrics`, `runtimeTelemetry`, correlation IDs).
- Auth token comparison uses constant-time checks in both C&C and node-agent paths.
- Dependency audit currently clean (`npm audit`: 0 vulnerabilities).
- Broad automated test surface exists across services.

## 5. Test & Coverage Notes

- Turbo-cached monorepo checks were green.
- Direct workspace verification exposed environment/runtime consistency issues (native module ABI mismatch) and thus should be part of local gate hardening.
- Coverage is generally healthy, but critical runtime entrypoints (`apps/cnc/src/server.ts`, `apps/cnc/src/init-db.ts`) remain lower-covered in CI reports.

## 6. Priority Remediation Plan

1. Fix intentional-disconnect reconnect bug (`H1`).  
2. Make scan failure propagation explicit (`H2`).  
3. Scope idempotency keys by operation (`M1`).  
4. Add host-route throttling (`M2`).  
5. Harden DB readiness/error semantics (`M3`).  
6. Stabilize Node runtime selection across workspaces (`M4`).  
7. Clean up parser/validation edge cases (`L1`, `L2`).

## 7. Appendix: Verification Snapshot

- `npm audit --json`: no known vulnerabilities.
- `npm run test --workspace=@woly-server/cnc -- --runInBand src/models/__tests__/Node.test.ts`: fails with `better-sqlite3` ABI mismatch (`141` vs `137`) in this environment.

