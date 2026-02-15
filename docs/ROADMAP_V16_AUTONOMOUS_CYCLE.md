# Woly-Server Roadmap V16 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V15_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V16:

- Branch: `master` (local, ahead of origin)
- V15 completion status:
  - Completed and merged: `#210`, `#228`, `#229`
  - Checkpointed with blocker documentation: `#150`

Recent capability improvements now in place:

- `/api/health` and `/api/metrics` now have stronger command outcome contract coverage.
- Unknown-attribution terminal outcomes are surfaced explicitly in runtime snapshot and Prometheus output.
- Manual-only CI review log and dependency checkpoint notes were refreshed in this cycle.

## 2. Missing / Incomplete Areas (Current)

1. Next rolling manual-only CI review cycle issue (`#230`) is queued.
2. Jest output still includes recurring Watchman recrawl warnings.
3. Test logs still include repetitive dotenv tip banners.
4. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.

## 3. Roadmap Items (V16)

1. `#231` [DX][Testing] Disable Watchman usage in Jest scripts to remove recrawl noise.
2. `#232` [DX][Testing] Quiet dotenv tip logs during automated test runs.
3. `#230` [CI] Schedule weekly manual-only operations review (next rolling cycle).
4. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.

## 4. Execution Order

1. **P1** `#231` (reduce log noise and improve signal in test gates)
2. **P2** `#232` (further improve test-log readability)
3. **P3** `#230` (close rolling CI policy review cycle)
4. **P4** `#150` (dependency checkpoint and blocker reassessment)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V16 is complete when all four issues (`#231`, `#232`, `#230`, `#150`) are resolved (merged or explicitly updated/closed with documented blocker state) and related docs/scripts are updated.

## 7. Progress Updates

- 2026-02-15: Completed `#231` by disabling Watchman integration for non-watch Jest scripts across workspaces.
- 2026-02-15: Completed `#232` by enabling quiet dotenv loading in test mode for C&C and node-agent config modules.
- 2026-02-15: Completed scoped manual-only policy audit for `#230`:
  - `npm run ci:audit:manual -- --since 2026-02-15T21:31:02Z --fail-on-unexpected` (PASS; 0 runs).
- 2026-02-15: Added CI review log entry for this cycle and created follow-up review issue `#233`.
- 2026-02-15: Dependency checkpoint status remains unchanged for `#150` (blocked pending `@typescript-eslint` peer support for ESLint 10).
