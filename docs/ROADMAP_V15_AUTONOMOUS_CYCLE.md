# Woly-Server Roadmap V15 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V14_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V15:

- Branch: `master` (local, ahead of origin)
- V14 completion status:
  - Completed and merged: `#224`, `#227`, `#225`, `#226`
  - Closed: yes (all four)

Recent capability improvements now in place:

- Cross-service smoke teardown no longer emits Jest open-handle warning.
- Late command-result metrics now attribute command type via persisted command lookup when in-memory context is missing.
- `/api/metrics` route tests cover terminal command outcome series for tracked command types.
- Command outcome observability guide published and linked from deployment entry points.

## 2. Missing / Incomplete Areas (Current)

1. Weekly manual-only CI operations review issue (`#210`) is still open.
2. `/api/health` route-level contract coverage does not yet enforce command outcome shape/labels.
3. Unknown-attribution command outcomes are available only via generic labeled series, not via explicit alert-oriented counters.
4. ESLint 10 adoption remains an open dependency checkpoint (`#150`) and needs a fresh compatibility decision update.

## 3. Roadmap Items (V15)

1. `#210` [CI] Schedule weekly manual-only operations review (rolling follow-up cycle).
2. `#228` [Testing][CNC] Add `/api/health` runtime metrics contract coverage for command outcomes.
3. `#229` [Observability][CNC] Expose explicit unknown-attribution command outcome counters.
4. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.

## 4. Execution Order

1. **P1** `#210` (close manual-only review loop and update policy evidence)
2. **P2** `#228` (route-level contract coverage for health snapshot)
3. **P3** `#229` (alert-oriented observability enhancement)
4. **P4** `#150` (dependency compatibility checkpoint and disposition)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V15 is complete when all four issues (`#210`, `#228`, `#229`, `#150`) are resolved (merged or explicitly updated/closed with documented blocker state) and related docs/tests are updated.

## 7. Progress Updates

- 2026-02-15: Started V15 cycle and created follow-up implementation issues `#228` and `#229`.
- 2026-02-15: Completed scoped manual-only workflow audit for `#210`:
  - `npm run ci:audit:manual -- --since 2026-02-15T17:07:43Z --fail-on-unexpected` (PASS; 2 runs, all `workflow_dispatch`).
- 2026-02-15: Added CI review log entry for this window and created next rolling review issue `#230`.
