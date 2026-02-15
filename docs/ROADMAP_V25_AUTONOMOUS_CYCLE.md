# Woly-Server Roadmap V25 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V24_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V25:

- Branch: `master` (local, ahead of origin)
- V24 completion status:
  - Completed and merged: `#250`, `#249`
  - Checkpointed with blocker documentation: `#150`
  - Dashboard checkpoint updated: `#4`
- Open operational queue:
  - `#251` rolling CI manual-only review cycle
  - `#150` ESLint 10 compatibility blocker tracking
  - `#4` dependency dashboard checkpoint thread

Recent capability improvements now in place:

- Cycle orchestration now resolves audit checkpoint fallbacks correctly.
- End-to-end cycle actions are command-driven for audit/follow-up/checkpoint/closeout comment.
- Documentation updates still require manual composition of repeated markdown snippets.

## 2. Missing / Incomplete Areas (Current)

1. Repetitive docs/checkpoint markdown blocks are still manually assembled.
2. Next rolling manual-only CI review cycle (`#251`) is queued.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard (`#4`) should continue reflecting each checkpoint cycle.

## 3. Roadmap Items (V25)

1. `#252` [DX][Docs] Generate rolling-cycle checkpoint markdown snippets.
2. `#251` [CI] Schedule weekly manual-only operations review (rolling follow-up after #249).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#252` (reduce manual docs drift and repeated text entry)
2. **P2** `#251` (close next rolling CI review cycle)
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

V25 is complete when all four items (`#252`, `#251`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Created issue `#252` to generate copy-ready markdown snippets for cycle docs/checkpoints.
