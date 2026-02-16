# Woly-Server Roadmap V14 (Autonomous Cycle)

Date: 2026-02-15
Base: `docs/ROADMAP_V13_AUTONOMOUS_CYCLE.md`

## 1. Current State Audit

Repository baseline at start of V14:

- Branch: `master` (local, ahead of origin)
- V13 completion status:
  - Completed and merged: `#220`, `#221`, `#222`, `#223`
  - Closed: yes (all four)

Recent capability improvements now in place:

- Manual node-agent host CRUD lifecycle events now propagate in agent mode.
- Cross-service smoke suite validates manual CRUD propagation.
- Standard local/CI validation gate now includes cross-service smoke.
- Command outcome observability now includes command-type + terminal-state metrics.

## 2. Missing / Incomplete Areas (Current)

1. Cross-service smoke run still emits a Jest open-handle warning after success.
2. Endpoint-level `/metrics` regression coverage for the new command outcome series is limited.
3. Late command results can still be attributed to `unknown` type when only durable state has context.
4. Ops docs do not yet explain command outcome metrics and triage usage.

## 3. Roadmap Items (V14)

1. `#224` [Testing][CNC] Eliminate Jest open-handle warning in cross-service smoke suite.
2. `#227` [Observability][CNC] Attribute late command results to persisted command type.
3. `#225` [Testing][Observability][CNC] Add `/metrics` coverage for command outcome series.
4. `#226` [Docs][Observability] Document command outcome metrics and triage usage.

## 4. Execution Order

1. **P1** `#224` (stabilize gate output quality for smoke path)
2. **P2** `#227` (improve metric attribution correctness)
3. **P3** `#225` (lock endpoint-level regression coverage)
4. **P4** `#226` (publish operations guidance for new telemetry)

## 5. Per-Issue Workflow

For each issue:

1. Implement in a dedicated `codex/` branch.
2. Run focused tests and relevant typecheck/lint gates.
3. Self-review diff and behavior/risk changes.
4. Merge to `master` locally with explicit merge commit.
5. Update and close corresponding GitHub issue.

## 6. Exit Criteria

V14 is complete when all four issues (`#224`, `#227`, `#225`, `#226`) are merged and closed, with tests/docs updated where applicable.
