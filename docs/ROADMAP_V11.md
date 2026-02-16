# Woly-Server Roadmap V11

Date: 2026-02-16
Scope: Post-V10 operational cadence with manual-CI checkpoint automation.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `fc1e022` (PR #270).
- Active execution branch: `codex/issue-252-checkpoint-snippets`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #251 `[CI] Schedule weekly manual-only operations review (rolling follow-up after #249)`
- #252 `[DX][Docs] Generate rolling-cycle checkpoint markdown snippets`

### CI snapshot
- All GitHub Actions workflows remain in temporary manual-only mode (`workflow_dispatch` only).
- Local guard commands remain active:
  - `npm run ci:audit:manual`
  - `npm run ci:policy:check`

## 2. Iterative Phases

### Phase 1: Rolling-cycle checkpoint snippet helper
Issue: #252  
Labels: `priority:low`, `technical-debt`, `developer-experience`

Acceptance criteria:
- One command outputs copy-ready markdown snippets for:
  - `docs/CI_MANUAL_REVIEW_LOG.md`
  - `docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md`
  - roadmap progress bullets in active roadmap file
- Dry-run preview only (no direct file writes).
- Template-render tests are included.

Status: `Completed` (2026-02-16)

### Phase 2: Weekly manual-only operations review (rolling)
Issue: #251  
Labels: `priority:low`, `technical-debt`, `developer-experience`

Acceptance criteria:
- Run scoped audit since previous checkpoint:
  - `npm run ci:audit:manual -- --since <iso> --fail-on-unexpected`
- Run policy guard:
  - `npm run ci:policy:check`
- Append review entry and progress updates using the checkpoint snippet helper.

Status: `Planned`

### Phase 3: ESLint 10 compatibility checkpoint
Issue: #150  
Labels: `priority:low`, `technical-debt`, `testing`

Acceptance criteria:
- Re-run compatibility check:
  - `npm run deps:check-eslint10`
- If support is unblocked, open implementation issue and execute full local gates.
- If still blocked, record current evidence and continue monitoring.

Status: `Blocked` (last checkpoint 2026-02-15: latest `@typescript-eslint/*` peer range excludes ESLint 10)

### Phase 4: Dependency dashboard checkpoint consistency
Issue: #4  
Labels: `technical-debt`

Acceptance criteria:
- Keep dependency dashboard comment trail aligned with phase outcomes.
- Link relevant blocker/next-step issues (#150, #251, #252).

Status: `Planned`

## 3. Progress Log

- 2026-02-16: Bootstrapped `ROADMAP_V11` after CNC sync-policy closeout in PR #270.
- 2026-02-16: Started issue #252 on branch `codex/issue-252-checkpoint-snippets`.
- 2026-02-16: Added `npm run ci:snippets:checkpoint` dry-run helper to generate weekly checkpoint markdown blocks for review log, dependency plan, and roadmap progress.
- 2026-02-16: Added template-render tests for checkpoint snippet output (`npm run test:docs-snippets`).
