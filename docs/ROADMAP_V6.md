# Woly-Server Roadmap V6

Date: 2026-02-15
Scope: New autonomous cycle after V5 completion.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `3bff69a` (PR #161).
- Active execution branch: `master`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #166 `[Roadmap] Close V6 and bootstrap ROADMAP_V7`
- #167 `[CI] Define review cadence and exit criteria for manual-only mode`

### CI snapshot
- Post-merge checks for `69adf2e` did not auto-run by design (manual-only mode enabled).
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

Status: `Blocked` (2026-02-15; `eslint@10.0.0` available, but latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`; Renovate PR #11 remains unstable)

### Phase 6: ESLint flat config migration precondition
Issue: #154  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Migrate `cnc` and `node-agent` lint tasks to ESLint flat config mode.
- Remove legacy `.eslintrc` dependency and `ESLINT_USE_FLAT_CONFIG=false` usage.
- Keep lint/typecheck/test/build gates green.

Status: `Completed` (2026-02-15, PR #155)

### Phase 7: Turbo workspace runner update
Issue: #156  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Adopt Turbo `2.8.9` update from dependency dashboard track.
- Keep lint/typecheck/test/build gates green after the update.
- Verify PR and post-merge `master` CI + CodeQL are green.

Status: `Completed` (2026-02-15, PR #157)

### Phase 8: ESLint 10 compatibility watchdog automation
Issue: #159  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Add a scheduled + manual GitHub workflow that checks latest `@typescript-eslint` peer support for ESLint 10.
- Upsert a sticky status comment on issue #150 with blocker/unblock evidence.
- Keep workflow informational (no fail-on-blocked behavior).

Status: `Completed` (2026-02-15, PR #160)

### Phase 9: Manual-only GitHub workflow policy (temporary)
Issue: #162  
Labels: `priority:medium`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Disable automatic workflow triggers (`push`, `pull_request`, `schedule`, tag push) across repo workflows.
- Keep workflows runnable via `workflow_dispatch`.
- Continue enforcing quality via local gates before merge.

Status: `Completed` (2026-02-15, PR #163)

### Phase 10: Manual CI operations documentation and rollback criteria
Issue: #164  
Labels: `priority:low`, `documentation`, `developer-experience`

Acceptance criteria:
- Add a repo doc defining local CI gate and manual workflow dispatch commands.
- Define explicit rollback criteria and steps to re-enable automatic workflows.
- Update README/roadmap references to reflect the temporary manual-only CI mode.

Status: `Completed` (2026-02-15, PR #165)

## 3. Execution Loop Rules

For each phase:
1. Create branch `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
2. Implement smallest complete change meeting acceptance criteria.
3. Add/update tests.
4. Run local gate:
   - `npm run typecheck`
   - `npm run test:ci`
5. Open PR (`Closes #<issue>`) and merge after green CI (or local gate in manual-only mode).
6. Verify post-merge `master` CI (or confirm no unexpected auto runs in manual-only mode).
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
- 2026-02-15: Merged #154 via PR #155 and verified post-merge `master` checks green (CI + CodeQL, commit `e8e7aa8`).
- 2026-02-15: Re-validated ESLint 10 compatibility for #150: `eslint@10.0.0` is available but latest `@typescript-eslint/*@8.55.0` still peers `eslint ^8.57.0 || ^9.0.0`; phase remains blocked.
- 2026-02-15: Added follow-up issue #156 for Turbo `2.8.9` adoption and started Phase 7 on branch `feat/156-turbo-runner-update`.
- 2026-02-15: Applied Turbo `2.8.9` lockfile update on #156 (`npm update turbo --save-dev --package-lock-only`) matching dependency dashboard PR #75 scope.
- 2026-02-15: Ran local gates for #156 (`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build`) successfully.
- 2026-02-15: Re-installed workspace dependencies with `npm ci`, confirmed `npx turbo --version` = `2.8.9`, and re-ran `npm run lint` successfully under Turbo `2.8.9`.
- 2026-02-15: Merged #156 via PR #157 and verified post-merge `master` checks green (CI + CodeQL, commit `8b3fbd5`).
- 2026-02-15: Confirmed dependency dashboard Turbo Renovate PR #75 is closed as superseded by merged PR #157.
- 2026-02-15: Re-checked ESLint 10 blocker for #150: latest `@typescript-eslint/eslint-plugin@8.55.0` still peers `eslint ^8.57.0 || ^9.0.0`; Renovate ESLint 10 PR #11 remains open and unstable (Protocol Compatibility Check failing).
- 2026-02-15: Merged blocker-checkpoint docs via PR #158 and verified post-merge `master` checks green (CI + CodeQL, commit `2b23575`).
- 2026-02-15: Added follow-up issue #159 and started Phase 8 on branch `feat/159-eslint10-watchdog-workflow`.
- 2026-02-15: Implemented `.github/workflows/eslint10-compat-watchdog.yml` to run scheduled/manual ESLint 10 compatibility checks and upsert a sticky watchdog comment on issue #150.
- 2026-02-15: Ran local gates for #159 (`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build`) successfully.
- 2026-02-15: Merged #159 via PR #160 and verified post-merge `master` checks green (CI + CodeQL, commit `7d811dc`).
- 2026-02-15: Manually dispatched `ESLint 10 Compatibility Watchdog` workflow run `22036729002`; it completed successfully and updated sticky comment `#issuecomment-3904488716` on issue #150.
- 2026-02-15: Added follow-up issue #162 and started Phase 9 on branch `chore/162-manual-only-workflows`.
- 2026-02-15: Updated workflow triggers to manual-only dispatch in `ci.yml`, `eslint10-compat-watchdog.yml`, and `publish-protocol.yml` to temporarily reduce Actions spend.
- 2026-02-15: Merged #162 via PR #163 and confirmed no automatic workflow runs were triggered on `master` merge commit `0763bf7`.
- 2026-02-15: Disabled GitHub CodeQL default setup (`state: not-configured`) to stop automatic `dynamic` CodeQL workflow runs.
- 2026-02-15: Added follow-up issue #164, started Phase 10 on branch `docs/164-manual-ci-ops`, and drafted manual CI operations documentation.
- 2026-02-15: Merged #164 via PR #165, adding `docs/CI_MANUAL_OPERATIONS.md` and updating README CI guidance for manual-only mode.
- 2026-02-15: Updated dependency dashboard issue #4 with manual-only CI policy and local gate expectations.
- 2026-02-15: Added follow-up roadmap issue #166 and CI policy review issue #167 to continue post-V6 execution.
