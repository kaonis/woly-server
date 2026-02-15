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

| Dependency | Decision | Rationale | Tracking |
|---|---|---|---|
| ESLint v9 | Merged | Adopted with typescript-eslint v8 via PR #151 | #146 |
| ESLint v10 | Deferred pending upstream compatibility | Still blocked: latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57.0 || ^9.0.0`; Renovate PR #11 currently unstable | #150 |
| typescript-eslint v8 | Merged | Upgraded with ESLint v9 toolchain migration via PR #151 | #146 |
| eslint-config-prettier v10 | Merged | Upgraded with ESLint v9 toolchain migration via PR #151 | #146 |
| Zod v4 | Merged | Runtime schema compatibility validated across protocol/C&C/node-agent and merged via PR #152 | #147 |
| npm v11 | Merged | Workspace tooling and CI remained stable; adopted via PR #17 | #148 |
| ESLint flat config mode | Merged | Migrated to root `eslint.config.js` and removed legacy `.eslintrc` mode via PR #155 | #154 |
| Turbo v2.8.9 | Merged | Adopted and validated with local + CI gates via PR #157 (issue #156) | #156 |
| ESLint 10 watchdog automation | Merged | Added scheduled/manual watchdog workflow with sticky issue updates via PR #160 | #159 |

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
