# ESLint Warning Ratchet Plan

This document tracks the warning-ratchet rollout to reach strict lint mode (`--max-warnings=0`) across the monorepo without disrupting delivery.

## Baseline

- `apps/node-agent` lint command already enforces strict mode: `eslint src --max-warnings=0`.
- `apps/cnc` lint command already enforces strict mode: `eslint src --max-warnings=0`.
- Root lint orchestration (`npm run lint`) currently depends on workspace lint scripts.
- Remaining gap to true repo-wide strict mode:
  - `packages/protocol` has no lint target yet.
  - Root scripts/config files are not part of an explicit strict lint gate.

## Policy

1. No net-new ESLint warnings in any workspace with an active lint target.
2. Any new lint scope (for example `packages/protocol` or root scripts) must start with a warning baseline and move toward strict mode.
3. Once a scope reaches zero warnings, enforce `--max-warnings=0` for that scope and do not relax it.

## Milestones

1. Add ESLint target for `packages/protocol` and measure baseline warnings.
2. Add lint coverage for root scripts/config files where practical.
3. Remove warning-only rules or unresolved warning debt in newly-covered scopes.
4. Flip newly-covered scopes to strict mode (`--max-warnings=0`).
5. Keep strict mode as a permanent default for all linted scopes.

## Ownership

- Platform maintainers own ratchet progress and enforcement updates.
- PRs that modify lint settings must include rationale and impact summary in validation notes.
