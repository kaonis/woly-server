# Woly-Server Roadmap V20 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V19_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V20:

- Branch: `master` (local, ahead of origin)
- V19 completion status:
  - Completed and merged: `#240`
  - Checkpointed with blocker documentation: `#150`
  - Dashboard checkpoint updated: `#4`
- Open operational queue:
  - `#241` rolling CI manual-only review cycle
  - `#150` ESLint 10 compatibility blocker tracking
  - `#4` dependency dashboard checkpoint thread

Recent capability improvements now in place:

- CI policy review cycles have a dedicated latest-checkpoint helper command.
- ESLint10 dashboard checkpoint generation is standardized through a helper command.
- Dependency blocker status is logged in roadmap and upgrade plan docs each cycle.

## 2. Missing / Incomplete Areas (Current)

1. ESLint10 checkpoint posting is still manual and error-prone in issue threads.
2. Next rolling manual-only CI review cycle (`#241`) is queued.
3. ESLint 10 adoption (`#150`) remains blocked pending upstream peer compatibility.
4. Dependency dashboard (`#4`) should continue reflecting each checkpoint cycle.

## 3. Roadmap Items (V20)

1. `#242` [DX][Dependencies] Automate ESLint10 checkpoint posting to issue threads.
2. `#241` [CI] Schedule weekly manual-only operations review (rolling follow-up after #240).
3. `#150` [Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility.
4. `#4` Dependency Dashboard checkpoint update.

## 4. Execution Order

1. **P1** `#242` (eliminate manual issue-comment posting drift)
2. **P2** `#241` (close next rolling CI review cycle)
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

V20 is complete when all four items (`#242`, `#241`, `#150`, `#4`) are resolved (merged or explicitly updated/closed with documented blocker state) and docs/checkpoints are updated.

## 7. Progress Updates

- 2026-02-15: Created issue `#242` to automate posting ESLint10 checkpoint comments to tracking threads.
- 2026-02-15: Completed `#242` by adding `npm run deps:checkpoint:eslint10:post` with `--dry-run` and repeatable `--issue` targeting.
- 2026-02-15: Added focused helper tests for checkpoint post argument parsing, issue resolution, and comment fan-out execution.
- 2026-02-15: Posted ESLint10 checkpoint updates to both `#150` and `#4` via the new post helper command.
