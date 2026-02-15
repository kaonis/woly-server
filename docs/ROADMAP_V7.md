# Woly-Server Roadmap V7

Date: 2026-02-15
Scope: New autonomous cycle after V6 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `fab2643` (PR #169).
- Active execution branch: `docs/170-roadmap-v7-sync`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #170 `[Roadmap] Sync ROADMAP_V7 after #167 merge`

### CI snapshot
- Repository workflows are in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup is disabled (`state: not-configured`) to prevent automatic dynamic runs.
- Latest local validation gate passed on 2026-02-15:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:ci`
  - `npm run build`

## 2. Iterative Phases

### Phase 1: V6 closeout and V7 bootstrap
Issue: #166  
Labels: `priority:low`, `documentation`, `developer-experience`

Acceptance criteria:
- Mark V6 Phase 10 as completed with merged PR reference.
- Add V6 post-merge log entries for #164 / PR #165.
- Publish `docs/ROADMAP_V7.md` with current status audit and phased plan.

Status: `Completed` (2026-02-15, PR #168)

### Phase 2: ESLint 10 compatibility unblock monitoring
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Re-check latest `@typescript-eslint/*` peer compatibility for ESLint 10.
- If unblocked, execute upgrade and validate full local gates.
- If still blocked, record evidence and keep issue in blocked state.

Status: `Blocked` (2026-02-15; latest `@typescript-eslint/*@8.55.0` peers `eslint ^8.57 || ^9`)

### Phase 3: Manual-only CI review cadence and exit policy
Issue: #167  
Labels: `priority:low`, `developer-experience`, `technical-debt`

Acceptance criteria:
- Document weekly review checklist for manual-only CI operations.
- Define objective exit criteria for re-enabling automatic workflows.
- Document decision ownership and recording process.

Status: `Completed` (2026-02-15, PR #169)

## 3. Execution Loop Rules

For each phase:
1. Create branch `feat/<issue>-<slug>` or `fix/<issue>-<slug>` (or `docs/<issue>-<slug>` for docs-only work).
2. Implement smallest complete change meeting acceptance criteria.
3. Add/update tests when code behavior changes.
4. Run local gate:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:ci`
   - `npm run build`
5. Open PR (`Closes #<issue>`) and merge after local validation.
6. Verify post-merge state and confirm no unexpected auto workflow runs in manual-only mode.
7. Update roadmap progress and continue.

## 4. Progress Log

- 2026-02-15: Created ROADMAP_V7 from issue #166 after V6 manual-only CI transition merged.
- 2026-02-15: Re-checked ESLint 10 blocker for #150: `eslint@10.0.0` exists, but latest `@typescript-eslint/*@8.55.0` still peers `eslint ^8.57.0 || ^9.0.0`.
- 2026-02-15: Added follow-up issue #167 to formalize manual-only CI review cadence and re-enable criteria.
- 2026-02-15: Merged roadmap bootstrap issue #166 via PR #168 and advanced V7 execution to Phase 3.
- 2026-02-15: Started issue #167 on branch `docs/167-ci-review-cadence` to add weekly manual-only CI review process and decision log.
- 2026-02-15: Merged issue #167 via PR #169, adding weekly review cadence, ownership, objective exit criteria, and `docs/CI_MANUAL_REVIEW_LOG.md`.
- 2026-02-15: Started issue #170 to sync ROADMAP_V7 after #167 merge and refresh open-issue snapshot.
