# Woly-Server Roadmap V8

Date: 2026-02-15
Scope: New autonomous cycle after V7 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `86524fa` (PR #184).
- Active execution branch: `feat/185-manual-ci-audit-command`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #185 `[CI] Add local manual-only run audit command`

### CI snapshot
- Repository workflows remain in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup remains disabled (`state: not-configured`).
- Workflow timeout cap standard (`timeout-minutes: 8`) is enforced across manual workflows (PR #183).
- Local manual-only run audit command is being implemented in issue #185.
- Latest manual ESLint10 watchdog run succeeded: `22037969724` (2026-02-15).
- Latest local validation gate passed on 2026-02-15:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:ci`
  - `npm run build`

## 2. Iterative Phases

### Phase 1: V7 closeout and V8 bootstrap
Issue: #178  
Labels: `priority:low`, `documentation`, `developer-experience`

Acceptance criteria:
- Mark V7 Phase 6 completed with merged PR reference.
- Refresh V7 status audit and progress log after #176 merge.
- Publish `docs/ROADMAP_V8.md` with current status and next phases.

Status: `Completed` (2026-02-15, PR #180)

### Phase 2: ESLint 10 compatibility unblock monitoring
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Re-check latest `@typescript-eslint/*` peer compatibility for ESLint 10.
- If unblocked, execute upgrade with full local validation.
- If still blocked, record current evidence and continue monitoring.

Status: `Blocked` (2026-02-15 checkpoint: `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`; ESLint 10 still unsupported)

### Phase 3: Weekly manual-only CI operations review
Issue: #179  
Labels: `priority:low`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Run the weekly manual-only CI review checklist.
- Append a review entry in `docs/CI_MANUAL_REVIEW_LOG.md`.
- Update roadmap progress with decision outcome.

Status: `Completed` (2026-02-15, PR #181)

### Phase 4: Manual workflow timeout cap enforcement
Issue: #182  
Labels: `priority:medium`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Add `timeout-minutes: 8` to all workflow jobs.
- Document timeout policy in manual CI operations guidance.
- Validate local gate remains green after workflow/doc updates.

Status: `Completed` (2026-02-15, PR #183)

### Phase 5: Local manual-only run audit automation
Issue: #185  
Labels: `priority:medium`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Add a local command to audit recent workflow runs for unexpected non-manual events.
- Support timestamp-scoped checks for weekly review windows.
- Document command usage in manual CI operations guidance.
- Validate local gate remains green.

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
5. Open PR (`Closes #<issue>`) and merge after local validation.
6. Verify post-merge state and confirm no unexpected automatic workflow runs.
7. Update roadmap progress and continue.

## 4. Progress Log

- 2026-02-15: Created ROADMAP_V8 from issue #178 after V7 dependency/CI follow-up phases merged.
- 2026-02-15: Carried forward blocker issue #150 with current peer dependency evidence.
- 2026-02-15: Added issue #179 for the weekly manual-only CI operations review cycle.
- 2026-02-15: Merged issue #178 via PR #180 and finalized V7 closeout + V8 bootstrap docs on master.
- 2026-02-15: Started issue #179 on branch `docs/179-manual-ci-review` and executed manual-only CI review checklist with no unexpected automatic runs observed.
- 2026-02-15: Merged issue #179 via PR #181 and recorded weekly manual-only review completion on master.
- 2026-02-15: Created issue #182 and started branch `fix/182-ci-timeout-caps` to enforce 8-minute manual workflow job timeouts.
- 2026-02-15: Merged issue #182 via PR #183 and enforced 8-minute timeout caps on all manual workflows.
- 2026-02-15: Ran another ESLint 10 compatibility checkpoint for issue #150; blocker unchanged (`@typescript-eslint/*@8.55.0` peer range `^8.57 || ^9`).
- 2026-02-15: Merged issue #150 checkpoint refresh via PR #184 with blocker still unchanged.
- 2026-02-15: Created issue #185 and started branch `feat/185-manual-ci-audit-command` for local manual-run audit automation.
