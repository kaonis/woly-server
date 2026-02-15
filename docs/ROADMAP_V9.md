# Woly-Server Roadmap V9

Date: 2026-02-15
Scope: New autonomous cycle after V8 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `ebf5b5c` (PR #193).
- Active execution branch: `docs/194-v9-followup-queue`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #194 `[CI] Schedule next weekly manual-only operations review`

### CI snapshot
- Repository workflows are in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup remains disabled (`state: not-configured`).
- Manual workflow jobs are capped to `timeout-minutes: 8`.
- Local manual-only run audit command is available: `npm run ci:audit:manual`.
- Local workflow policy guard command is available: `npm run ci:policy:check` (PR #193).
- Latest manual ESLint10 watchdog run succeeded: `22037969724` (2026-02-15).
- Latest manual-only audit passed: `npm run ci:audit:manual -- --since 2026-02-15T15:11:32Z --fail-on-unexpected` (2026-02-15).
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

Status: `In Progress` (2026-02-15)

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
