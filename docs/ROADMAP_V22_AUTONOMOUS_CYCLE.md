# Woly-Server Roadmap V22 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V21_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V22:

- Branch: `master` (local, ahead of origin)
- V21 completion status:
  - Completed and merged: `#244`, `#243`
  - Checkpointed with blocker documentation: `#150`
  - Dashboard checkpoint updated: `#4`
- Open operational queue:
  - `#245` rolling CI manual-only review cycle
  - `#150` ESLint 10 compatibility blocker tracking
  - `#4` dependency dashboard checkpoint thread

Recent capability improvements now in place:

- Rolling follow-up issue creation is now automated via helper command.
- ESLint10 checkpoint posting remains one-command for both tracking threads.
- CI cycle closeout comments are still manually assembled.

## 2. Missing / Incomplete Areas (Current)

1. Rolling CI closeout comment content is still manually assembled.
2. Next rolling manual-only CI review cycle (`#245`) is queued.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard (`#4`) should continue reflecting each checkpoint cycle.

## 3. Roadmap Items (V22)

1. `#246` [DX][CI] Automate rolling CI closeout comment generation.
2. `#245` [CI] Schedule weekly manual-only operations review (rolling follow-up after #243).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#246` (standardize/automate repetitive issue closeout comment workflow)
2. **P2** `#245` (close next rolling CI review cycle)
3. **P3** `#150` (dependency compatibility checkpoint and blocker reassessment)
4. **P4** `#4` (reflect latest checkpoint outcomes in dashboard thread)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue when applicable.

## 6. Exit Criteria

V22 is complete when all four items (`#246`, `#245`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Created issue `#246` to automate rolling CI closeout comment generation/posting.
- 2026-02-15: Completed `#246` by adding `npm run ci:closeout:comment` for standardized rolling CI closeout comment generation with optional direct issue posting.
- 2026-02-15: Added helper tests for closeout comment parser/template behavior and delegated comment posting.
- 2026-02-15: Validated closeout helper dry-run output with explicit cycle/roadmap/checkpoint arguments.
