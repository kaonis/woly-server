# Woly-Server Roadmap V17 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V16_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V17:

- Branch: `master` (local, ahead of origin)
- V16 completion status:
  - Completed and merged: `#231`, `#232`, `#230`
  - Checkpointed with blocker documentation: `#150`

Recent capability improvements now in place:

- Watchman recrawl warning noise removed from standard Jest non-watch scripts.
- Dotenv informational tip banners suppressed in test mode for C&C and node-agent config loading.
- Manual-only CI review cycle and dependency checkpoint notes refreshed again.

## 2. Missing / Incomplete Areas (Current)

1. Rolling manual-only CI review follow-up issue (`#233`) is queued.
2. Manual CI audit still requires hand-entering `--since` timestamps.
3. Manual CI review log entries are still assembled by hand.
4. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.

## 3. Roadmap Items (V17)

1. `#234` [DX][CI] Add helper command to run manual CI audit since latest review checkpoint.
2. `#235` [DX][CI] Add template generator for manual CI review log entries.
3. `#233` [CI] Schedule weekly manual-only operations review (rolling follow-up after #230).
4. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.

## 4. Execution Order

1. **P1** `#234` (remove timestamp copy/paste errors from CI audit process)
2. **P2** `#235` (standardize review log entry shape)
3. **P3** `#233` (close rolling policy review cycle with updated evidence)
4. **P4** `#150` (dependency compatibility checkpoint and blocker reassessment)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V17 is complete when all four issues (`#234`, `#235`, `#233`, `#150`) are resolved (merged or explicitly updated/closed with documented blocker state) and related docs/scripts are updated.
