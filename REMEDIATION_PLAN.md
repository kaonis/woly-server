# WoLy Backend Remediation Plan

_Date:_ 2026-02-07  
_Branch target:_ `master` (or feature branch merged into `master`)  
_Status:_ Planned

## Objective

Address all issues identified in the latest review:

1. Dependency vulnerabilities (`npm audit` findings)
2. Partially implemented agent commands (`update-host`, `delete-host`)
3. Dead/suspicious DB query in sync loop
4. Validation/schema mismatch in wake route
5. Lint debt (`any`, unused imports/vars)
6. Missing `typecheck` script for CI/dev ergonomics

---

## Scope and Non-Goals

### In Scope

- Code and config changes in backend repo
- Test/lint/build/audit validation
- Documentation updates for behavior/API changes

### Out of Scope (for this pass)

- Full architectural rewrite of discovery stack
- Migrating away from SQLite entirely
- Solving upstream advisories with no available fixed releases (will be mitigated/documented)

---

## Workstreams

## 1) Security Dependencies (Highest Priority)

### Problem

`npm audit --omit=dev` reports high/moderate vulnerabilities, notably in:

- `local-devices` transitive chain (`ip`, `get-ip-range`)
- `sqlite3` transitive chain (`node-gyp`, `tar`, `cacache`)
- `body-parser` / `qs`

### Plan

1. **Create an SBOM-like dependency snapshot**
   - Record direct deps and vulnerable paths (`npm audit --json` output summarized).
2. **Apply safe upgrades where available without breaking runtime**
   - Run `npm update` selectively for direct dependencies with non-breaking updates.
   - Re-run tests/build after each update batch.
3. **Handle unfixable transitive vulnerabilities explicitly**
   - For `local-devices` chain with no fix:
     - Evaluate replacement options for ARP/network discovery library.
     - If replacement is too risky for immediate patch, create a tracked issue + risk note in README/SECURITY section.
4. **Revisit sqlite3 dependency strategy**
   - Verify whether current `sqlite3@^5.1.7` can resolve to safer transitive set; if not, evaluate alternatives (`better-sqlite3` or pinned secure path) in a dedicated follow-up.
5. **Add/adjust overrides only when proven safe**
   - Keep current overrides reviewable and documented with rationale.

### Acceptance Criteria

- Audit report reduced as far as practically possible in this cycle.
- Remaining vulnerabilities are documented with:
  - exploitability context,
  - compensating controls,
  - follow-up issue references.
- CI still green (`test`, `lint`, `build`).

---

## 2) Agent Mode Command Completeness

### Problem

`update-host` and `delete-host` C&C commands are stubbed as "not implemented yet".

### Plan

1. **Define command contracts**
   - Confirm payload schema for both commands (`commandId`, fields required in `data`).
2. **Implement `update-host`**
   - Validate input.
   - Resolve host by name/MAC.
   - Update DB record fields safely.
   - Emit `host-updated` event and return successful `command-result`.
3. **Implement `delete-host`**
   - Validate input.
   - Delete by stable identifier (prefer name + optional MAC guard).
   - Emit `host-removed` event and return successful `command-result`.
4. **Error handling parity**
   - Standardize failures (`success: false`, meaningful `error`, timestamp).

### Acceptance Criteria

- Both commands perform real DB operations.
- Result messages are deterministic and test-covered.
- No regressions in standalone mode.

---

## 3) Remove Dead Query in Sync Loop

### Problem

`syncWithNetwork()` performs an unused call: `await this.getHost('')`.

### Plan

1. Remove dead statement.
2. Keep intended `getHostByMAC(formattedMac)` event emission path.
3. Validate behavior with existing tests and runtime scan path.

### Acceptance Criteria

- Dead call removed.
- No behavior change other than avoiding wasted DB query.

---

## 4) Validation / Route Schema Mismatch

### Problem

`wakeHostSchema` is imported but unused while route is `/wakeup/:name`.

### Plan

Choose one consistent API contract (recommended below):

**Recommended Option A (minimal disruption):**

- Keep wake endpoint by host name (`POST /hosts/wakeup/:name`).
- Remove unused `wakeHostSchema` import and obsolete schema if not used elsewhere.
- Add/ensure parameter validation for `:name` (length/charset constraints).

**Option B (API expansion):**

- Add separate endpoint for MAC-based wake if required by clients.
- Keep schemas aligned with each route.

### Acceptance Criteria

- No unused wake schema/import remains.
- Route contract is explicit and validated.
- Swagger docs match real behavior.

---

## 5) Lint Debt Cleanup (Type Safety + Hygiene)

### Problem

19 lint warnings (unused imports/vars + `any` usage), concentrated in agent/network code.

### Plan

1. **Quick hygiene fixes**
   - Remove unused imports (`MacVendorResponse`, `ErrorResponse`, `wakeHostSchema`, etc.).
   - Prefix intentionally unused middleware args with `_` where appropriate.
2. **Reduce `any` in command handlers**
   - Introduce command payload types/interfaces.
   - Parse unknown input into typed structures with guards.
3. **Keep strictness pragmatic**
   - Replace `any` with `unknown` + narrowing where full typing is not trivial.

### Acceptance Criteria

- Lint warnings reduced to zero (or documented intentional exceptions with inline rationale).
- Stronger typings around C&C command boundaries.

---

## 6) Add `typecheck` Script

### Problem

No dedicated `typecheck` script, only `build` (`tsc`) script.

### Plan

1. Add script to `package.json`:
   - `"typecheck": "tsc --noEmit"`
2. Optionally wire into CI/local workflow docs.

### Acceptance Criteria

- `npm run typecheck` exists and passes.
- Developer workflow docs mention it.

---

## Execution Order

1. Dead query + lint hygiene quick wins
2. Validation/route consistency + Swagger sync
3. Agent command implementations + tests
4. Type hardening in agent/network surfaces
5. Dependency remediation and documentation
6. Final verification and release notes

---

## Test & Verification Matrix

Run after each major step and at the end:

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run typecheck` (after script is added)
- `npm audit --omit=dev`

Additional focused checks:

- Manual wake by host name
- Manual scan endpoint behavior
- Agent mode websocket lifecycle:
  - register
  - `wake` command
  - `scan` command
  - `update-host` command
  - `delete-host` command

---

## Deliverables

- Code changes implementing all in-scope fixes
- Updated docs (README/Swagger/changelog notes)
- Final summary with:
  - before/after lint/test/audit metrics,
  - residual risk list,
  - suggested next-phase work (if any)

---

## Risks & Mitigations

1. **Upstream packages with no fixes**
   - Mitigation: document residual risk + open tracked issues + evaluate replacement package.
2. **Behavior regressions in agent mode**
   - Mitigation: add targeted tests and staged rollout.
3. **API contract drift**
   - Mitigation: align route validation + Swagger in same PR.

---

## Estimated Effort

- Quick fixes (lint/dead code/typecheck script): **0.5 day**
- Agent command implementation + tests: **1 day**
- Dependency remediation + documentation: **0.5–1 day** (depends on upstream constraints)

**Total:** ~2–2.5 days
