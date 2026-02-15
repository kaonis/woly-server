# Woly-Server Roadmap V4

Date: 2026-02-15
Scope: New autonomous cycle after V3 completion.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `742a801` (PR #132).
- Active execution branch: `feat/133-cnc-zero-warning-lint`.

### Open issue snapshot (`kaonis/woly-server`)
- #133 `[C&C] Eliminate lint warnings and enforce zero-warning gate`
- #134 `[C&C] Complete auth 401/403 integration coverage`
- #135 `[Protocol] Define external publish readiness workflow`
- #4 `Dependency Dashboard`

### CI snapshot
- Post-merge checks for `742a801` are green (CI + CodeQL).
- New node-agent dependency audit gate is active in CI validate job.

## 2. Iterative Phases

### Phase 1: C&C zero-warning lint enforcement
Issue: #133  
Labels: `priority:low`, `technical-debt`, `cnc`

Acceptance criteria:
- Remove current C&C `no-explicit-any` warnings.
- Enforce zero-warning lint gate for C&C.
- Keep all local gates green after typing refactors.

Status: `Completed` (2026-02-15, PR #136)

### Phase 2: C&C auth integration coverage completion
Issue: #134  
Labels: `priority:low`, `testing`, `cnc`

Acceptance criteria:
- Add/verify 401 and 403 integration coverage for protected endpoints.
- Cover missing token, malformed token, invalid signature, expired token, and role mismatch.
- Update checklist status to reflect delivered coverage.

Status: `In Progress` (2026-02-15)

### Phase 3: Protocol external publish readiness
Issue: #135  
Labels: `priority:low`, `protocol`, `technical-debt`

Acceptance criteria:
- Document concrete publish readiness criteria.
- Document external release + rollback workflow.
- Align checklist/docs state with publish decision.

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

- 2026-02-15: Created ROADMAP_V4 after V3 phase set completion.
- 2026-02-15: Started Phase 1 issue #133 on branch `feat/133-cnc-zero-warning-lint`.
- 2026-02-15: Implemented #133 lint warning removals in C&C and enforced `--max-warnings=0` for `apps/cnc`.
- 2026-02-15: Ran local gates for #133 (`npm run lint -w apps/cnc`, `npm run typecheck -w apps/cnc`, `npm run test:ci -w apps/cnc`) successfully.
- 2026-02-15: Merged #133 via PR #136 and verified post-merge `master` checks green (CI + CodeQL).
- 2026-02-15: Started Phase 2 issue #134 on branch `feat/134-cnc-auth-integration-coverage`.
