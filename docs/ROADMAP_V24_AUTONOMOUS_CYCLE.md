# Woly-Server Roadmap V24 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V23_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V24:

- Branch: `master` (local, ahead of origin)
- V23 completion status:
  - Completed and merged: `#248`, `#247`
  - Checkpointed with blocker documentation: `#150`
  - Dashboard checkpoint updated: `#4`
- Open operational queue:
  - `#249` rolling CI manual-only review cycle
  - `#150` ESLint 10 compatibility blocker tracking
  - `#4` dependency dashboard checkpoint thread

Recent capability improvements now in place:

- CI cycle orchestration, follow-up creation, checkpoint posting, and closeout comments are script-driven.
- Remaining manual drift is mostly around summary edge cases and documentation updates.

## 2. Missing / Incomplete Areas (Current)

1. `ci:cycle:run` can report `Audit since checkpoint: unknown` for some output variants.
2. Next rolling manual-only CI review cycle (`#249`) is queued.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard (`#4`) should continue reflecting each checkpoint cycle.

## 3. Roadmap Items (V24)

1. `#250` [DX][CI] Harden cycle summary checkpoint parsing in `ci:cycle:run`.
2. `#249` [CI] Schedule weekly manual-only operations review (rolling follow-up after #247).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#250` (improve summary correctness for automated cycle output)
2. **P2** `#249` (close next rolling CI review cycle)
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

V24 is complete when all four items (`#250`, `#249`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Created issue `#250` to harden cycle summary checkpoint parsing fallback behavior.
- 2026-02-15: Completed `#250` by adding fallback checkpoint resolution from review log in `ci:cycle:run` summaries.
- 2026-02-15: Added parser test coverage for missing `--since` output line fallback behavior.
