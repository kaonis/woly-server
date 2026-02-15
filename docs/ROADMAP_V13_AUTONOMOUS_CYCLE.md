# Woly-Server Roadmap V13 (Autonomous Cycle)

Date: 2026-02-15  
Base: `docs/ROADMAP_V12_5H_AUTONOMOUS_LOOP.md`

## 1. Current State Audit

Repository baseline at start of V13:

- Branch: `master` (local, ahead of origin)
- V12 completion status:
  - Completed and merged: `#216`, `#217`, `#218`, `#219`
  - Closed: yes (all four)

Recent capability improvements now in place:

- Host metadata fields (`notes`, `tags`) end-to-end.
- Optional post-WoL verification workflow in node-agent wake endpoint.
- Cross-service E2E smoke test command and docs.
- Root-level production deployment guide.

## 2. Missing / Incomplete Areas (Current)

1. Manual node-agent host CRUD operations do not guarantee lifecycle event emission for C&C sync in agent mode.
2. Cross-service smoke coverage does not yet verify manual CRUD propagation behavior (create/update/delete).
3. Cross-service smoke gate is available but not yet enforced in the standard repo-level CI/local validation flow.
4. Command outcome observability can be more actionable with per-command-type and terminal-state segmentation.

## 3. Roadmap Items (V13)

1. `#220` [Bug][Node Agent] Emit host lifecycle events for manual CRUD operations in agent mode.  
2. `#221` [Testing] Add cross-service propagation coverage for manual host CRUD lifecycle.  
3. `#222` [CI][DX] Add explicit cross-service smoke gate to local/CI validation workflow.  
4. `#223` [Observability][CNC] Expose command outcome metrics by command type and terminal state.

## 4. Execution Order

1. **P1** `#220` (functional correctness bug; prerequisite for robust propagation testing)  
2. **P2** `#221` (lock regression coverage after bug fix)  
3. **P3** `#222` (enforce gate in workflow/docs)  
4. **P4** `#223` (observability enhancement)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V13 is complete when all four issues (`#220`-`#223`) are merged and closed, with updated validation/docs where applicable.
