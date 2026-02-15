# Woly-Server Roadmap V7

Date: 2026-02-15
Scope: New autonomous cycle after V6 closeout.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `ea6f0aa` (PR #177).
- Active execution branch: `docs/178-roadmap-v8-bootstrap`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #178 `[Roadmap] Close V7 and bootstrap ROADMAP_V8`

### CI snapshot
- Repository workflows are in temporary manual-only mode (`workflow_dispatch` only).
- GitHub CodeQL default setup is disabled (`state: not-configured`) to prevent automatic dynamic runs.
- Latest manual watchdog validation run succeeded: `22037969724` (2026-02-15).
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

### Phase 4: ESLint 10 watchdog script extraction
Issue: #172  
Labels: `priority:low`, `technical-debt`, `developer-experience`, `testing`

Acceptance criteria:
- Extract compatibility check logic into a reusable repository script.
- Add local command for manual compatibility checks.
- Update watchdog workflow to use the reusable script while keeping sticky comment behavior.

Status: `Completed` (2026-02-15, PR #173)

### Phase 5: Post-extraction watchdog validation on master
Issue: #174  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Manually dispatch ESLint 10 watchdog workflow on `master`.
- Confirm workflow success and sticky comment update on issue #150.
- Record validation evidence in roadmap/dependency tracking.

Status: `Completed` (2026-02-15, PR #175)

### Phase 6: Renovate ESLint major suppression while blocked
Issue: #176  
Labels: `priority:low`, `technical-debt`, `developer-experience`, `testing`

Acceptance criteria:
- Suppress Renovate major updates for `eslint` and `@eslint/js` while #150 is blocked.
- Keep all non-ESLint-major dependency updates unaffected.
- Document temporary rationale and traceability in config + roadmap.

Status: `Completed` (2026-02-15, PR #177)

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
- 2026-02-15: Merged issue #170 via PR #171, syncing ROADMAP_V7 to completed Phase 3 state and current open issue set.
- 2026-02-15: Added issue #172 and started Phase 4 on branch `feat/172-eslint10-watchdog-script`.
- 2026-02-15: Merged issue #172 via PR #173, extracting watchdog logic into `scripts/eslint10-compat-watchdog.cjs`, adding `npm run deps:check-eslint10`, and wiring workflow reuse.
- 2026-02-15: Added issue #174, manually dispatched watchdog workflow run `22037969724`, and validated success with sticky issue #150 comment refresh at `2026-02-15T15:11:45Z`.
- 2026-02-15: Merged issue #174 via PR #175 and logged successful post-extraction watchdog validation evidence on master.
- 2026-02-15: Added issue #176 and started Phase 6 on branch `feat/176-renovate-eslint-suppress`.
- 2026-02-15: Merged issue #176 via PR #177, adding temporary Renovate suppression for blocked ESLint major updates and reducing dependency dashboard churn.
- 2026-02-15: Added issue #178 to close out V7 and bootstrap ROADMAP_V8 with refreshed status audit.
