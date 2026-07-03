# Dependency Major Upgrade Wave Plan

Date: 2026-02-15
Owner: Platform Team
Source: Dependency Dashboard (`#4`)

## 1. Scope

This plan covers the currently deferred or high-risk major dependency updates:

- ESLint v9 and v10
- typescript-eslint v8
- eslint-config-prettier v10
- Zod v4
- npm v11
- Turbo v2.8.9
- ESLint 10 compatibility watchdog automation

## 2. Risk Profile

### Tooling-only risk (medium)

- ESLint v9/v10
- typescript-eslint v8
- eslint-config-prettier v10

Primary impact:

- lint configuration and rule behavior changes
- developer/CI lint task stability

### Runtime schema risk (high)

- Zod v4

Primary impact:

- runtime validation behavior across `packages/protocol`, `apps/cnc`, and `apps/node-agent`
- potential contract/serialization edge differences

### Package manager/runtime risk (medium)

- npm v11

Primary impact:

- workspace install/task behavior
- lockfile and CI reproducibility

## 3. Sequenced Execution Waves

1. Wave A: tooling major upgrades  
   Tracking issue: #146
2. Wave B: Zod v4 migration and validation  
   Tracking issue: #147
3. Wave C: npm 11 adoption decision  
   Tracking issue: #148
4. Wave D: ESLint 10 compatibility revisit  
   Tracking issue: #150
5. Wave E: ESLint flat config migration precondition  
   Tracking issue: #154
6. Wave F: Turbo workspace runner update  
   Tracking issue: #156
7. Wave G: ESLint 10 compatibility watchdog automation  
   Tracking issue: #159

## 4. Decision Table (2026-02-15)

| Dependency                    | Decision                            | Rationale                                                                                                               | Tracking |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| ESLint v9                     | Merged                              | Adopted with typescript-eslint v8 via PR #151                                                                           | #146     |
| ESLint v10                    | Unblocked by upstream compatibility | Latest `@typescript-eslint/*@8.62.1` peers include `eslint ^10.0.0`; continue through Renovate PR #398 with local gates | #150     |
| typescript-eslint v8          | Merged                              | Upgraded with ESLint v9 toolchain migration via PR #151                                                                 | #146     |
| eslint-config-prettier v10    | Merged                              | Upgraded with ESLint v9 toolchain migration via PR #151                                                                 | #146     |
| Zod v4                        | Merged                              | Runtime schema compatibility validated across protocol/C&C/node-agent and merged via PR #152                            | #147     |
| npm v11                       | Merged                              | Workspace tooling and CI remained stable; adopted via PR #17                                                            | #148     |
| ESLint flat config mode       | Merged                              | Migrated to root `eslint.config.js` and removed legacy `.eslintrc` mode via PR #155                                     | #154     |
| Turbo v2.8.9                  | Merged                              | Adopted and validated with local + CI gates via PR #157 (issue #156)                                                    | #156     |
| ESLint 10 watchdog automation | Merged                              | Added scheduled/manual watchdog workflow with sticky issue updates via PR #160                                          | #159     |

## 5. Exit Criteria for #144

Issue #144 is complete when:

1. Decision table is documented and linked in roadmap progress.
2. Execution/defer follow-up issues are in place (#146, #147, #148, #150).
3. Dependency dashboard comment history references these decisions for auditability.

## 6. Checkpoint Updates

- 2026-02-15 (V15 / issue #210 checkpoint):
  - Re-checked latest `@typescript-eslint/eslint-plugin` metadata:
    - version: `8.55.0`
    - peer `eslint`: `^8.57.0 || ^9.0.0`
  - Status for ESLint 10 adoption (`#150`): still blocked pending upstream peer compatibility.
- 2026-02-15 (V15 / issue #150 checkpoint):
  - Ran `npm run deps:check-eslint10` at `2026-02-15T21:35:59Z`.
  - Watchdog status: blocked.
  - Latest values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V16 / issue #230 checkpoint):
  - Ran scoped manual CI audit for policy review:
    - `npm run ci:audit:manual -- --since 2026-02-15T21:31:02Z --fail-on-unexpected` (PASS; 0 runs).
  - ESLint 10 compatibility status unchanged from latest watchdog checkpoint (`2026-02-15T21:35:59Z`): still blocked pending upstream peer range support.
- 2026-02-15 (V17 / issue #233 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest watchdog checkpoint `2026-02-15T21:35:59Z`).
- 2026-02-15 (V18 / issue #236 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest watchdog checkpoint `2026-02-15T21:35:59Z`).
- 2026-02-15 (V18 / issue #150 checkpoint refresh):
  - Re-ran watchdog: `npm run deps:check-eslint10` at `2026-02-15T21:49:51Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V19 / issue #238 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest watchdog checkpoint `2026-02-15T21:49:51Z`).
- 2026-02-15 (V19 / issue #240 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest watchdog checkpoint `2026-02-15T21:49:51Z`).
- 2026-02-15 (V19 / issue #150 checkpoint refresh):
  - Re-ran watchdog: `npm run deps:check-eslint10` at `2026-02-15T22:04:02Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V20 / issue #150 checkpoint refresh):
  - Posted checkpoint comments using `npm run deps:checkpoint:eslint10:post` with payload timestamp `2026-02-15T22:06:14Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V20 / issue #241 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest checkpoint payload `2026-02-15T22:06:14Z`).
- 2026-02-15 (V21 / issue #150 checkpoint refresh):
  - Posted checkpoint comments using `npm run deps:checkpoint:eslint10:post` with payload timestamp `2026-02-15T22:11:32Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V21 / issue #243 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest checkpoint payload `2026-02-15T22:11:32Z`).
- 2026-02-15 (V22 / issue #150 checkpoint refresh):
  - Posted checkpoint comments using `npm run deps:checkpoint:eslint10:post` with payload timestamp `2026-02-15T22:14:39Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V22 / issue #245 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest checkpoint payload `2026-02-15T22:14:39Z`).
- 2026-02-15 (V23 / issue #150 checkpoint refresh):
  - Posted checkpoint comments using `npm run deps:checkpoint:eslint10:post` with payload timestamp `2026-02-15T22:17:35Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V23 / issue #247 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest checkpoint payload `2026-02-15T22:17:35Z`).
- 2026-02-15 (V24 / issue #150 checkpoint refresh):
  - Posted checkpoint comments using `npm run deps:checkpoint:eslint10:post` with payload timestamp `2026-02-15T22:19:54Z`.
  - Result: blocked (no upstream peer range change).
  - Current values:
    - `eslint`: `10.0.0`
    - `@typescript-eslint/eslint-plugin`: `8.55.0`
    - `@typescript-eslint/parser`: `8.55.0`
    - peer `eslint` range: `^8.57.0 || ^9.0.0`
- 2026-02-15 (V24 / issue #249 checkpoint):
  - Ran rolling policy audit via helper:
    - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
  - ESLint 10 compatibility status unchanged (`#150` remains blocked; latest checkpoint payload `2026-02-15T22:19:54Z`).
- 2026-02-18 (V25 / issue #280 checkpoint):
  - Ran scoped audit:
    - `npm run ci:audit:manual -- --since 2026-02-16T18:35:12Z --fail-on-unexpected` (PASS; `pull_request` runs were limited to approved `CNC Sync Policy` automation exception).
  - Ran policy guard:
    - `npm run ci:policy:check` (PASS; approved exceptions remain `pull_request` for `cnc-sync-policy.yml` and `schedule` for `dependency-health.yml`).
  - Aligned audit allowlist logic in `scripts/manual-ci-run-audit.cjs` to match policy guard exceptions.
- 2026-07-03 (maintenance dependency/policy checkpoint):
  - Ran dependency inventory and applied conservative security maintenance:
    - `npm audit fix` for non-major audit remediations.
    - `npm install --save-dev @typescript-eslint/eslint-plugin@^8.62.1 @typescript-eslint/parser@^8.62.1`.
    - `npm update brace-expansion`.
  - Result: `npm audit --omit=dev --audit-level=high` PASS and full `npm audit --audit-level=moderate` reports 0 vulnerabilities.
  - ESLint 10 watchdog status is now compatible with current metadata:
    - `eslint`: `10.6.0`
    - `@typescript-eslint/eslint-plugin`: `8.62.1`
    - `@typescript-eslint/parser`: `8.62.1`
    - peer `eslint` range: `^8.57.0 || ^9.0.0 || ^10.0.0`
  - Major upgrade deferrals remain unchanged: TypeScript 6 and lint-staged 17 stay out of this security maintenance round.
- 2026-07-03 (maintenance runtime compatibility checkpoint):
  - Observed `npm ci` failure on Node `v26.3.0` because pinned `better-sqlite3@12.6.2` supports Node `20.x || 22.x || 23.x || 24.x || 25.x` and native rebuild fails against Node 26.
  - Constrained repo and app engine ranges to `>=24.0.0 <26.0.0`, enabled npm `engine-strict`, and aligned CNC/node-agent test preflights to fail fast on unsupported Node versions.
  - Node 26 adoption remains deferred until the SQLite runtime is upgraded and local gates pass under Node 26.
- 2026-07-03 (maintenance review checkpoint):
  - Confirmed the default shell still runs Node `v26.3.0`; `npm ci` correctly fails fast under the repo engine guard.
  - Re-ran install and dependency inventory under Node `v24.13.0` / npm `11.6.2`:
    - `npm ci` PASS.
    - `npm run deps:check` PASS for high-severity production audit and ESLint 10 watchdog.
    - `npm outdated` remains informational; no dependency upgrade was applied in this review round.
  - Node 26 adoption remains deferred pending `better-sqlite3` compatibility and successful local gates.
