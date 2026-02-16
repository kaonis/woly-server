# Woly-Server Roadmap V11

Date: 2026-02-16
Scope: Post-V10 operational cadence with manual-first CI checkpoint automation.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `53df133` (PR #272).
- Active execution branch: `codex/issue-251-weekly-manual-review`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #251 `[CI] Schedule weekly manual-only operations review (rolling follow-up after #249)`
- #273 `[CI] Schedule weekly manual-only operations review (rolling follow-up after #251)`

### CI snapshot
- Policy is manual-first:
  - manual `workflow_dispatch` for general workflows
  - one approved path-scoped `pull_request` exception for `.github/workflows/cnc-mobile-contract-gate.yml`
- Local guard commands remain active:
  - `npm run ci:audit:manual`
  - `npm run ci:policy:check`
- Latest scoped audit (`2026-02-16T18:29:40Z`) since `2026-02-15T17:07:43Z`:
  - `workflow_dispatch`: 2
  - allowlisted `pull_request` (`CNC Mobile Contract Gate`): 4
  - unexpected non-manual runs: 0
- Latest policy check (`2026-02-16T18:29:38Z`): PASS across all workflow files.

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

Status: `Completed` (2026-02-16, PR #272)

### Phase 2: Weekly manual-only operations review (rolling)
Issue: #251  
Labels: `priority:low`, `technical-debt`, `developer-experience`

Acceptance criteria:
- Run scoped audit since previous checkpoint:
  - `npm run ci:audit:manual -- --since <iso> --fail-on-unexpected`
- Run policy guard:
  - `npm run ci:policy:check`
- Append review entry and progress updates.

Status: `Completed` (2026-02-16, follow-up queued in #273)

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
- Link relevant blocker/next-step issues (#150, #251, #273).

Status: `Planned`

### Phase 5: Next weekly operations review cycle
Issue: #273  
Labels: `priority:low`, `technical-debt`, `developer-experience`

Acceptance criteria:
- Re-run scoped audit and policy checks for the next review window.
- Append review log and roadmap/dependency checkpoint updates.

Status: `Planned`

## 3. Progress Log

- 2026-02-16: Bootstrapped `ROADMAP_V11` after CNC sync-policy closeout in PR #270.
- 2026-02-16: Added `npm run ci:snippets:checkpoint` dry-run helper and template-render tests (`npm run test:docs-snippets`) in PR #272.
- 2026-02-16: Merged issue #252 via PR #272.
- 2026-02-16: Started issue #251 on branch `codex/issue-251-weekly-manual-review`.
- 2026-02-16: Updated manual operations policy docs and local audit/policy scripts to support the approved minimal automation exception for `CNC Mobile Contract Gate`.
- 2026-02-16: Ran scoped audit for #251 (`npm run ci:audit:manual -- --since 2026-02-15T17:07:43Z --fail-on-unexpected`) and observed 0 unexpected non-manual runs.
- 2026-02-16: Ran workflow policy guard for #251 (`npm run ci:policy:check`) and observed full PASS compliance.
- 2026-02-16: Appended review/dependency checkpoints and created follow-up issue #273.
