# ESLint Warning Ratchet Plan

This document tracks the warning-ratchet rollout to reach strict lint mode (`--max-warnings=0`) across the monorepo without disrupting delivery.

## Baseline

- `apps/node-agent` lint command already enforces strict mode: `eslint src --max-warnings=0`.
- `apps/cnc` lint command already enforces strict mode: `eslint src --max-warnings=0`.
- `packages/protocol` lint command now enforces strict mode: `eslint src --max-warnings=0`.
- Root lint orchestration (`npm run lint`) currently depends on workspace lint scripts.
- Current out-of-scope area for this ratchet:
  - Root scripts/config files are not yet in an explicit strict lint gate.
  - They remain tracked as follow-up technical-debt work, separate from workspace source strictness.

## Targeted Scopes

This ratchet applies to workspace source scopes that participate in Turbo lint:

- `apps/node-agent/src`
- `apps/cnc/src`
- `packages/protocol/src`

## Policy

1. No net-new ESLint warnings in any workspace with an active lint target.
2. Any new lint scope (for example `packages/protocol` or root scripts) must start with a warning baseline and move toward strict mode.
3. Once a scope reaches zero warnings, enforce `--max-warnings=0` for that scope and do not relax it.

## Milestones

1. Done: add ESLint target for `packages/protocol` and enforce strict mode.
2. In progress (separate follow-up): add lint coverage for root scripts/config files where practical.
3. Done: remove warning debt in currently targeted workspace source scopes.
4. Done: enforce `--max-warnings=0` for all targeted workspace source scopes.
5. Done (for targeted scopes): keep strict mode as permanent default across all targeted workspace lint scopes.

## Ownership

- Platform maintainers own ratchet progress and enforcement updates.
- PRs that modify lint settings must include rationale and impact summary in validation notes.
