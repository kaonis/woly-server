# C&C Coverage Ratchet Policy

Date: 2026-02-15
Owner: Platform Team
Scope: `apps/cnc`

## 1. Purpose

This policy prevents test coverage regression while raising thresholds in staged increments toward long-term targets.

## 2. Current Baseline Gate

As of 2026-02-15, Jest global coverage thresholds are enforced in `apps/cnc/jest.config.js`:

- statements: `68`
- lines: `68`
- functions: `72`
- branches: `58`

These values match current delivered coverage and are a non-regression floor.

## 3. Ratchet Plan

Threshold increases are staged and must be raised only in PRs that add/expand tests.

| Phase | Statements | Lines | Functions | Branches | Trigger |
|---|---:|---:|---:|---:|---|
| Baseline (current) | 68 | 68 | 72 | 58 | Established in #140 |
| Stage A | 72 | 72 | 74 | 60 | After command/router and runtime error-path additions |
| Stage B | 76 | 76 | 78 | 64 | After service/model branch coverage expansions |
| Target | 80 | 80 | 80 | 70 | Stable sustained coverage and no active coverage debt |

## 4. Enforcement Rules

1. `npm run test:ci -w apps/cnc` must fail if coverage drops below the configured baseline gate.
2. Thresholds may only move upward in normal operation.
3. Any temporary threshold reduction requires a time-bound follow-up issue and explicit approval in PR notes.
4. Coverage summaries should be captured in PR validation notes when thresholds are changed.

## 5. Update Procedure

1. Add tests for targeted low-coverage areas.
2. Run `npm run test:ci -w apps/cnc` and capture resulting global coverage.
3. Raise `coverageThreshold.global` in `apps/cnc/jest.config.js` to the new floor.
4. Update this document to reflect the new phase and rationale.
