# Woly-Server Roadmap V21 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V20_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V21:

- Branch: `master` (local, ahead of origin)
- V20 completion status:
  - Completed and merged: `#242`, `#241`
  - Checkpointed with blocker documentation: `#150`
  - Dashboard checkpoint updated: `#4`
- Open operational queue:
  - `#243` rolling CI manual-only review cycle
  - `#150` ESLint 10 compatibility blocker tracking
  - `#4` dependency dashboard checkpoint thread

Recent capability improvements now in place:

- ESLint10 checkpoint posting can be executed directly against issue threads.
- CI review cycles continue with standardized policy log/checkpoint docs.
- Rolling follow-up issue creation remains manual and repetitive.

## 2. Missing / Incomplete Areas (Current)

1. Rolling CI follow-up issue creation is still manual and repetitive.
2. Next rolling manual-only CI review cycle (`#243`) is queued.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard (`#4`) should continue reflecting each checkpoint cycle.

## 3. Roadmap Items (V21)

1. `#244` [DX][CI] Automate rolling manual-review follow-up issue creation.
2. `#243` [CI] Schedule weekly manual-only operations review (rolling follow-up after #241).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#244` (remove manual churn and quoting drift in follow-up issue creation)
2. **P2** `#243` (close next rolling CI review cycle)
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

V21 is complete when all four items (`#244`, `#243`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Created issue `#244` to automate rolling CI follow-up issue creation with a standard template.
- 2026-02-15: Completed `#244` by adding `npm run ci:followup:create` for templated rolling CI follow-up issue creation.
- 2026-02-15: Added helper tests for follow-up issue parser, title/body rendering, label handling, and delegated issue creation calls.
- 2026-02-15: Validated helper behavior with dry-run:
  - `npm run ci:followup:create -- --after 243 --dry-run`.
