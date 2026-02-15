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

## 4. Decision Table (2026-02-15)

| Dependency | Decision | Rationale | Tracking |
|---|---|---|---|
| ESLint v9 | Merged | Adopted with typescript-eslint v8 via PR #151 | #146 |
| ESLint v10 | Deferred pending upstream compatibility | Still blocked: latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57.0 || ^9.0.0` | #150 |
| typescript-eslint v8 | Merged | Upgraded with ESLint v9 toolchain migration via PR #151 | #146 |
| eslint-config-prettier v10 | Merged | Upgraded with ESLint v9 toolchain migration via PR #151 | #146 |
| Zod v4 | Merged | Runtime schema compatibility validated across protocol/C&C/node-agent and merged via PR #152 | #147 |
| npm v11 | Merged | Workspace tooling and CI remained stable; adopted via PR #17 | #148 |
| ESLint flat config mode | In progress | Removes legacy `.eslintrc`/`ESLINT_USE_FLAT_CONFIG=false` dependency to clear ESLint 10 precondition | #154 |

## 5. Exit Criteria for #144

Issue #144 is complete when:

1. Decision table is documented and linked in roadmap progress.
2. Execution/defer follow-up issues are in place (#146, #147, #148, #150).
3. Dependency dashboard comment history references these decisions for auditability.
