# Woly-Server Roadmap V6

Date: 2026-02-15
Scope: New autonomous cycle after V5 completion.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `9182401` (PR #153).
- Active execution branch: `master`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #154 `[Lint] Migrate to ESLint flat config before ESLint 10 adoption`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`

### CI snapshot
- Post-merge checks for `9182401` are green (CI + CodeQL).
- Dependency triage workflow and audit/security gates are documented and active.

## 2. Iterative Phases

### Phase 1: Major dependency upgrade wave plan
Issue: #144  
Labels: `priority:low`, `technical-debt`, `security`

Acceptance criteria:
- Define migration order and risk profile for major dependency updates.
- Produce explicit merge/defer decisions with rationale.
- Link resulting execution issues for approved upgrade tracks.

Status: `Completed` (2026-02-15, PR #149)

### Phase 2: Tooling major upgrade execution
Issue: #146  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Upgrade lint toolchain to the currently compatible majors (ESLint 9 + typescript-eslint 8 family).
- Keep lint/typecheck/test gates green across workspaces.
- Document any lint rule/config migration adjustments.

Status: `Completed` (2026-02-15, PR #151)

### Phase 3: Zod v4 migration validation
Issue: #147  
Labels: `priority:low`, `technical-debt`, `protocol`

Acceptance criteria:
- Validate Zod v4 migration impact across protocol/C&C/node-agent runtime schemas.
- Preserve contract compatibility or document deliberate breaking changes.
- Keep CI and contract/schema suites green.

Status: `Completed` (2026-02-15, PR #152)

### Phase 4: npm 11 adoption decision and execution
Issue: #148  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Validate npm 11 behavior with workspace scripts and turbo tasks.
- Verify CI/local toolchain compatibility and lockfile stability.
- Produce explicit adopt/defer decision with rationale.

Status: `Completed` (2026-02-15, PR #17)

### Phase 5: ESLint 10 revisit checkpoint
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Track typescript-eslint peer dependency support for ESLint 10.
- Upgrade ESLint to 10 when compatibility is available.
- Validate lint behavior and CI stability after upgrade.

Status: `Blocked` (2026-02-15; latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`)

### Phase 6: ESLint flat config migration precondition
Issue: #154  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Migrate `cnc` and `node-agent` lint tasks to ESLint flat config mode.
- Remove legacy `.eslintrc` dependency and `ESLINT_USE_FLAT_CONFIG=false` usage.
- Keep lint/typecheck/test/build gates green.

Status: `In Progress` (2026-02-15)

## 3. Execution Loop Rules

For each phase:
1. Create branch `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
2. Implement smallest complete change meeting acceptance criteria.
3. Add/update tests.
4. Run local gate:
   - `npm run typecheck`
   - `npm run test:ci`
5. Open PR (`Closes #<issue>`) and merge after green CI.
6. Verify post-merge `master` CI.
7. Update roadmap progress and continue.

## 4. Progress Log

- 2026-02-15: Created ROADMAP_V6 after V5 completion.
- 2026-02-15: Started Phase 1 issue #144 on branch `feat/144-dependency-upgrade-wave-plan`.
- 2026-02-15: Added follow-up issue #148 for npm 11 adoption evaluation from dependency dashboard triage.
- 2026-02-15: Documented major dependency migration order, risk profile, and merge/defer decisions in `docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md`.
- 2026-02-15: Posted dependency decision summary comment on issue #4 with links to #146, #147, and #148.
- 2026-02-15: Ran local protocol gates for #144 (`npm run typecheck -w packages/protocol`, `npm run test:ci -w packages/protocol`) successfully.
- 2026-02-15: Added follow-up issue #150 and narrowed Phase 2 execution scope to ESLint 9 + typescript-eslint 8 due current peer compatibility constraints.
- 2026-02-15: Merged #144 via PR #149 and verified post-merge `master` checks green (CI + CodeQL).
- 2026-02-15: Started Phase 2 issue #146 on branch `feat/146-tooling-major-upgrade-set`.
- 2026-02-15: Upgraded lint tooling to ESLint 9 + typescript-eslint 8 + eslint-config-prettier 10 and stabilized ESLint v9 compatibility for current `.eslintrc` workflow.
- 2026-02-15: Ran local root gates for #146 (`npm run lint`, `npm run typecheck`, `npm run test:ci`) successfully.
- 2026-02-15: Merged #146 via PR #151 and verified post-merge `master` checks green (CI + CodeQL).
- 2026-02-15: Started Phase 3 issue #147 on branch `feat/147-zod-v4-migration-validation`.
- 2026-02-15: Applied Zod v4 migration updates across protocol/C&C/node-agent (`zod` dependency majors, IP validation migration from `z.string().ip()` to `node:net` `isIP` refinements, `ZodError.errors` -> `ZodError.issues`).
- 2026-02-15: Ran full local gates for #147 (`npm run typecheck`, `npm run test:ci`, `npm run lint`, `npm run build`) successfully.
- 2026-02-15: Addressed PR #152 CI regression in node-agent validation messaging by normalizing missing-field errors back to `is required` semantics and adding unit coverage for the behavior.
- 2026-02-15: Re-ran full local gates for #147 (`npm run typecheck`, `npm run test:ci`, `npm run lint`, `npm run build`) successfully after CI-fix patch.
- 2026-02-15: Merged #147 via PR #152 and verified post-merge `master` checks green (CI + CodeQL).
- 2026-02-15: Adopted npm 11 via PR #17 (`packageManager` set to `npm@11.10.0`), closing #148.
- 2026-02-15: Verified post-merge checks for npm 11 adoption green on `master` (CI + CodeQL, commit `71dd306`).
- 2026-02-15: Re-validated ESLint 10 compatibility checkpoint for #150 (`npm view @typescript-eslint/eslint-plugin@latest peerDependencies` still `^8.57.0 || ^9.0.0`), keeping #150 open and blocked.
- 2026-02-15: Merged roadmap/dependency checkpoint docs via PR #153 and verified post-merge `master` checks green (CI + CodeQL).
- 2026-02-15: Started Phase 6 issue #154 on branch `feat/154-eslint-flat-config`.
- 2026-02-15: Migrated lint configuration to root `eslint.config.js`, removed legacy `.eslintrc.json`, and switched app lint scripts to flat-config mode without `ESLINT_USE_FLAT_CONFIG=false`.
- 2026-02-15: Ran local gates for #154 (`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build`) successfully.
