# Woly-Server Roadmap V5

Date: 2026-02-15
Scope: New autonomous cycle after V4 completion.

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `1868364` (PR #138).
- Active execution branch: `master`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #139 `[C&C] Reconcile implementation checklist Definition-of-Done status`
- #140 `[Testing] Define and enforce staged coverage-ratchet policy`
- #141 `[Dependencies] Operationalize Dependency Dashboard triage workflow`

### CI snapshot
- Post-merge checks for `1868364` are green (CI + CodeQL).
- Protocol compatibility and C&C schema gates are active in CI.

## 2. Iterative Phases

### Phase 1: C&C checklist DoD reconciliation
Issue: #139  
Labels: `priority:low`, `technical-debt`, `cnc`

Acceptance criteria:
- Audit C&C checklist Definition-of-Done items against current docs/CI implementation.
- Update checklist statuses to match verifiable repository state.
- Add references to concrete docs/workflows for completed DoD items.

Status: `Completed` (2026-02-15, PR #142)

### Phase 2: Coverage ratchet policy and gate
Issue: #140  
Labels: `priority:medium`, `testing`, `technical-debt`

Acceptance criteria:
- Document baseline coverage and staged thresholds.
- Configure tests/CI to fail when coverage regresses below baseline.
- Publish phased plan for threshold increases.

Status: `In Progress` (2026-02-15)

### Phase 3: Dependency dashboard triage workflow
Issue: #141  
Labels: `priority:low`, `security`, `technical-debt`

Acceptance criteria:
- Define dependency triage ownership and cadence.
- Document decision categories and defer/acceptance policy.
- Link triage process from roadmap/checklist docs.

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

- 2026-02-15: Created ROADMAP_V5 after V4 completion.
- 2026-02-15: Started Phase 1 issue #139 on branch `feat/139-cnc-checklist-dod-reconciliation`.
- 2026-02-15: Reconciled C&C Phase 0 Definition-of-Done checklist items with explicit ADR/docs/CI workflow references.
- 2026-02-15: Ran local C&C gates for #139 (`npm run typecheck -w apps/cnc`, `npm run test:ci -w apps/cnc`) successfully.
- 2026-02-15: Merged #139 via PR #142 and verified post-merge `master` checks green (CodeQL; CI not triggered for docs-only change).
- 2026-02-15: Started Phase 2 issue #140 on branch `feat/140-cnc-coverage-ratchet-policy`.
- 2026-02-15: Added C&C coverage-ratchet policy doc and raised Jest global coverage thresholds to a non-regression baseline gate.
- 2026-02-15: Ran local C&C gates for #140 (`npm run typecheck -w apps/cnc`, `npm run test:ci -w apps/cnc`) successfully.
