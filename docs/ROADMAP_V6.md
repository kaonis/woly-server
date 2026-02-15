# Woly-Server Roadmap V6

Date: 2026-02-15
Scope: New autonomous cycle after V5 completion.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `9b027df` (PR #145).
- Active execution branch: `master`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #144 `[Dependencies] Plan major dashboard upgrade wave (ESLint 10, TS-ESLint 8, Zod 4, npm 11)`
- #146 `[Dependencies] Execute tooling major upgrade set (ESLint 10 + typescript-eslint 8)`
- #147 `[Dependencies] Evaluate and stage Zod v4 migration across protocol and services`
- #148 `[Dependencies] Evaluate npm 11 adoption and CI/runtime compatibility`

### CI snapshot
- Post-merge checks for `9b027df` are green (CI + CodeQL).
- Dependency triage workflow and audit/security gates are documented and active.

## 2. Iterative Phases

### Phase 1: Major dependency upgrade wave plan
Issue: #144  
Labels: `priority:low`, `technical-debt`, `security`

Acceptance criteria:
- Define migration order and risk profile for major dependency updates.
- Produce explicit merge/defer decisions with rationale.
- Link resulting execution issues for approved upgrade tracks.

Status: `In Progress` (2026-02-15)

### Phase 2: Tooling major upgrade execution
Issue: #146  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Upgrade lint toolchain majors (ESLint 10 + typescript-eslint 8 family).
- Keep lint/typecheck/test gates green across workspaces.
- Document any lint rule/config migration adjustments.

Status: `Pending`

### Phase 3: Zod v4 migration validation
Issue: #147  
Labels: `priority:low`, `technical-debt`, `protocol`

Acceptance criteria:
- Validate Zod v4 migration impact across protocol/C&C/node-agent runtime schemas.
- Preserve contract compatibility or document deliberate breaking changes.
- Keep CI and contract/schema suites green.

Status: `Pending`

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
