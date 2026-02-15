# Woly-Server Roadmap V18 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V17_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V18:

- Branch: `master` (local, ahead of origin)
- V17 completion status:
  - Completed and merged: `#234`, `#235`, `#233`
  - Checkpointed with blocker documentation: `#150`

Recent capability improvements now in place:

- CI audit helper command (`ci:audit:latest`) and review-template helper (`ci:review:template`) are available and documented.
- Manual-only review cycles now use standardized helper tooling and log structure.
- Dependency checkpoint notes continue to track ESLint 10 blocker state.

## 2. Missing / Incomplete Areas (Current)

1. Rolling manual-only CI review follow-up issue (`#236`) is queued.
2. CI helper scripts (`manual-ci-run-audit-latest.cjs`, `manual-ci-review-template.cjs`) lack automated regression tests.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard follow-through (`#4`) should continue to reflect checkpoint outcomes.

## 3. Roadmap Items (V18)

1. `#237` [Testing][CI] Add regression tests for manual CI helper scripts.
2. `#236` [CI] Schedule weekly manual-only operations review (rolling follow-up after #233).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#237` (protect new CI helper workflows with tests)
2. **P2** `#236` (close next rolling CI review cycle)
3. **P3** `#150` (dependency compatibility checkpoint and blocker reassessment)
4. **P4** `#4` (reflect latest checkpoint outcomes in dashboard tracking)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V18 is complete when all four issues (`#237`, `#236`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Completed `#237` by adding regression tests and a dedicated helper test command (`npm run test:ci:helpers`).
- 2026-02-15: Completed scoped rolling policy audit for `#236`:
  - `npm run ci:audit:latest -- --fail-on-unexpected` (PASS; 0 runs; checkpoint `2026-02-15T21:31:02Z`).
- 2026-02-15: Added CI review log entry for this cycle and created follow-up review issue `#238`.
- 2026-02-15: Dependency checkpoint status unchanged for `#150` (blocked pending upstream ESLint 10 peer support in `@typescript-eslint`).
- 2026-02-15: Updated dependency dashboard issue `#4` with latest blocker/audit checkpoint summary.
- 2026-02-15: Refreshed `#150` watchdog checkpoint (`npm run deps:check-eslint10` at `2026-02-15T21:49:51Z`), still blocked with unchanged peer range.
