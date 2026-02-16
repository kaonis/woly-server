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

## 4. Decision Table (2026-02-16 refresh)

| Dependency | Decision | Rationale | Tracking |
|---|---|---|---|
| ESLint v9 | Merged | Adopted with typescript-eslint v8 via PR #151 | #146 |
| ESLint v10 | Merged | Unblocked by `@typescript-eslint/*@8.56.0` peer support (`eslint ^8.57.0 || ^9.0.0 || ^10.0.0`); adopted with local gate validation in issue #150 | #150 |
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

## 6. Rolling Operations Checkpoints

- 2026-02-16: Manual-CI operations checkpoint (issue #251) confirmed no unexpected workflow events since `2026-02-15T17:07:43Z`; observed 4 allowlisted `pull_request` runs for `CNC Mobile Contract Gate` and 2 `workflow_dispatch` runs.
- 2026-02-16: Policy baseline remains manual-first with one approved automation exception (path-scoped `CNC Mobile Contract Gate`), and next weekly review is queued in #273.
- 2026-02-16: Manual-CI operations checkpoint (issue #273) confirmed no unexpected workflow events since `2026-02-16T18:31:42Z`; scoped window contained 0 runs.
- 2026-02-16: Manual-first policy baseline remains unchanged; next weekly review is queued in #275.
- 2026-02-16: Manual-CI operations checkpoint (issue #275) confirmed no unexpected workflow events since `2026-02-16T18:33:09Z`; scoped window contained 0 runs.
- 2026-02-16: Manual-first policy baseline remains unchanged; next weekly review is queued in #277.
- 2026-02-16: ESLint 10 compatibility checkpoint (issue #150) is unblocked (`eslint@10.0.0`, `@typescript-eslint/*@8.56.0`) and adopted with local gate validation.
