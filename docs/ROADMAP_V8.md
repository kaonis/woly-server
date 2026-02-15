# Woly-Server Roadmap V8

Date: 2026-02-15
Scope: New autonomous cycle after V7 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `ea6f0aa` (PR #177).
- Active execution branch: `docs/178-roadmap-v8-bootstrap`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #178 `[Roadmap] Close V7 and bootstrap ROADMAP_V8`
- #179 `[CI] Run weekly manual-only operations review log update`

### CI snapshot
- Repository workflows remain in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup remains disabled (`state: not-configured`).
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

Status: `In Progress` (2026-02-15)

### Phase 2: ESLint 10 compatibility unblock monitoring
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Re-check latest `@typescript-eslint/*` peer compatibility for ESLint 10.
- If unblocked, execute upgrade with full local validation.
- If still blocked, record current evidence and continue monitoring.

Status: `Blocked` (2026-02-15; latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`)

### Phase 3: Weekly manual-only CI operations review
Issue: #179  
Labels: `priority:low`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Run the weekly manual-only CI review checklist.
- Append a review entry in `docs/CI_MANUAL_REVIEW_LOG.md`.
- Update roadmap progress with decision outcome.

Status: `Planned` (2026-02-15)

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
