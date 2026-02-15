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

## 4. Decision Table (2026-02-15)

| Dependency | Decision | Rationale | Tracking |
|---|---|---|---|
| ESLint v9 | Merge candidate | Compatible major with typescript-eslint v8 peer requirements | #146 |
| ESLint v10 | Deferred pending upstream compatibility | Blocked by current typescript-eslint peer dependency range | #150 |
| typescript-eslint v8 | Merge candidate | Coupled with ESLint v9 upgrade under current compatibility constraints | #146 |
| eslint-config-prettier v10 | Merge candidate | Companion lint stack upgrade with low runtime risk | #146 |
| Zod v4 | Deferred pending validation | Runtime schema behavior can affect protocol/API contract guarantees | #147 |
| npm v11 | Deferred pending compatibility evaluation | Potential workspace/CI/lockfile behavior changes require explicit validation | #148 |

## 5. Exit Criteria for #144

Issue #144 is complete when:

1. Decision table is documented and linked in roadmap progress.
2. Execution/defer follow-up issues are in place (#146, #147, #148, #150).
3. Dependency dashboard comment history references these decisions for auditability.
