# Woly-Server Roadmap V9

Date: 2026-02-15
Scope: New autonomous cycle after V8 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `22951e9` (PR #197).
- Active execution branch: `docs/194-manual-review-cycle`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #194 `[CI] Schedule next weekly manual-only operations review`
- #198 `[CI] Schedule weekly manual-only operations review (next cycle)`

### CI snapshot
- Repository workflows are in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup remains disabled (`state: not-configured`).
- Manual workflow jobs are capped to `timeout-minutes: 8`.
- Local manual-only run audit command is available: `npm run ci:audit:manual`.
- Local workflow policy guard command is available: `npm run ci:policy:check` (PR #193).
- Latest manual CI run succeeded: `22039325902` (PR #197, 2026-02-15).
- Latest manual ESLint10 watchdog run succeeded: `22037969724` (2026-02-15).
- Latest manual-only audit passed: `npm run ci:audit:manual -- --since 2026-02-15T15:11:32Z --fail-on-unexpected` (`2026-02-15T16:46:26Z`).
- Latest ESLint10 compatibility checkpoint remains blocked (`npm run deps:check-eslint10`, 2026-02-15).

## 2. Iterative Phases

### Phase 1: V8 closeout and V9 bootstrap
Issue: #187  
Labels: `priority:low`, `documentation`, `developer-experience`

Acceptance criteria:
- Finalize V8 status after #185 merge.
- Publish `docs/ROADMAP_V9.md` with carry-forward phases and issue links.

Status: `Completed` (2026-02-15, PR #189)

### Phase 2: ESLint 10 compatibility unblock monitoring
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Re-check latest `@typescript-eslint/*` peer compatibility for ESLint 10.
- If unblocked, execute upgrade with full local validation.
- If still blocked, record current evidence and continue monitoring.

Status: `Blocked` (2026-02-15 checkpoint: `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`; ESLint 10 still unsupported)

### Phase 3: Weekly manual-only CI operations review
Issue: #188  
Labels: `priority:low`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Run `npm run ci:audit:manual -- --since <previous-review-iso> --fail-on-unexpected`.
- Append decision entry to `docs/CI_MANUAL_REVIEW_LOG.md`.
- Update roadmap progress with decision outcome.

Status: `Completed` (2026-02-15, PR #190)

### Phase 4: Dependency dashboard checkpoint cadence
Issue: #4  
Labels: `technical-debt`

Acceptance criteria:
- Post dependency/operations checkpoints after each roadmap phase merge.
- Keep blocker issue links current (especially #150).

Status: `Completed` (2026-02-15, PR #193)

### Phase 5: Local workflow policy guardrail
Issue: #192  
Labels: `priority:medium`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Validate workflow triggers remain manual-only (`workflow_dispatch`).
- Ensure no `push`, `pull_request`, or `schedule` triggers are present.
- Ensure all workflow jobs define `timeout-minutes` with value `<= 8`.
- Provide local command + docs usage.

Status: `Completed` (2026-02-15, PR #193)

### Phase 6: Queue next weekly review cycle
Issue: #194  
Labels: `priority:low`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Create follow-up issue for next weekly manual-only review cycle.
- Keep roadmap issue snapshot and phase plan aligned with queued review work.

Status: `Completed` (2026-02-15, queued follow-up issue #198)

### Phase 7: CNC coverage hardening tranche
Issue: #196
Labels: `priority:medium`, `testing`, `cnc`

Acceptance criteria:
- Expand CNC controller/service edge-path test coverage without unintended behavior changes.
- Keep local monorepo quality gates green:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:ci`
  - `npm run build`
- Keep CNC statement coverage at/above target threshold (>= 80%) and document latest snapshot.

Status: `Completed` (2026-02-15, PR #197)

## 3. Execution Loop Rules

For each phase:
1. Create branch `feat/<issue>-<slug>` or `fix/<issue>-<slug>` (or `docs/<issue>-<slug>` for docs-only work).
2. Implement smallest complete change meeting acceptance criteria.
3. Add/update tests when behavior changes.
4. Run local gate:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:ci`
   - `npm run build`
5. Open PR (`Closes #<issue>` when issue is done, otherwise `Refs #<issue>`) and merge after validation.
6. Verify post-merge state and confirm no unexpected automatic workflow runs.
7. Update roadmap progress and continue.

## 4. Progress Log

- 2026-02-15: Bootstrapped ROADMAP_V9 from issue #187 after merging phase #185 (PR #186).
- 2026-02-15: Carried forward blocker issue #150 pending ESLint 10 peer support in `@typescript-eslint/*`.
- 2026-02-15: Added issue #188 for the next weekly manual-only CI review cycle.
- 2026-02-15: Merged issue #187 via PR #189 and published ROADMAP_V9 on master.
- 2026-02-15: Started issue #188 on branch `docs/188-manual-ci-review-cycle` and executed scoped `ci:audit:manual` check with no unexpected automatic runs.
- 2026-02-15: Merged issue #188 via PR #190 and logged weekly manual-only review completion.
- 2026-02-15: Ran another issue #150 checkpoint; blocker unchanged (`@typescript-eslint/*@8.55.0`, peer range `^8.57 || ^9`).
- 2026-02-15: Merged issue #150 checkpoint refresh via PR #191 and kept blocker status unchanged.
- 2026-02-15: Created issue #192 and started branch `feat/192-workflow-policy-guard` for local workflow policy validation.
- 2026-02-15: Merged issue #192 via PR #193 and published local workflow policy guardrails.
- 2026-02-15: Created issue #194 and started branch `docs/194-v9-followup-queue` to queue next weekly manual-only review cycle.
- 2026-02-15: Created issue #196 and started branch `feat/196-cnc-coverage-hardening` for continued CNC coverage hardening.
- 2026-02-15: Expanded CNC branch/error-path tests (notably `hostAggregator`) and re-validated local gates (`lint`, `typecheck`, `test:ci`, `build`) successfully.
- 2026-02-15: Latest CNC coverage snapshot: `86.85%` statements (`apps/cnc`) with service coverage raised (`hostAggregator.ts` now `100%` lines).
- 2026-02-15: Merged issue #196 via PR #197 after manual CI run `22039325902` passed.
- 2026-02-15: Ran scoped manual-only workflow audit for issue #194: `npm run ci:audit:manual -- --since 2026-02-15T15:11:32Z --fail-on-unexpected` (PASS).
- 2026-02-15: Created follow-up issue #198 to queue the next weekly manual-only review cycle.
