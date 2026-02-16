# Manual CI Operations (Temporary)

Date: 2026-02-15

This repository is currently in a temporary budget-control mode with manual-first
workflows plus one minimal automated gate.

## Current Policy

- Workflow triggers are manual-only (`workflow_dispatch`) except for one scoped gate:
  - `.github/workflows/cnc-mobile-contract-gate.yml` on `pull_request` for protocol/route-impact paths only.
- Automatic `push`, `schedule`, and broad unscoped PR/tag workflow runs are disabled.
- GitHub CodeQL default setup is disabled (`state: not-configured`) to prevent automatic dynamic runs.
- Each workflow job has `timeout-minutes: 8` to cap manual-run spend and prevent hangs.

## Required Local Gate Before PR

Run all commands from repo root and require exit code 0 for each:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

## Manual Workflow Dispatch

Use either GitHub UI (`Actions` tab) or GitHub CLI:

```bash
# Main CI workflow
gh workflow run ci.yml --ref master

# ESLint 10 compatibility watchdog
gh workflow run eslint10-compat-watchdog.yml --ref master

# Protocol publish workflow (safe validation mode)
gh workflow run publish-protocol.yml --ref master -f dry-run=true
```

Run watchdog check locally without dispatching workflow:

```bash
npm run deps:check-eslint10
```

Monitor manual runs:

```bash
gh run list --limit 20
gh run view <run-id> --log-failed
```

Run structured local audit for weekly review windows:

```bash
# Example: only runs created after previous review timestamp
npm run ci:audit:manual -- --since 2026-02-15T15:11:32Z --fail-on-unexpected

# JSON output for logs or automation
npm run ci:audit:manual -- --since 2026-02-15T15:11:32Z --json
```

Generate copy-ready markdown snippets for weekly checkpoint docs (dry-run only):

```bash
npm run ci:snippets:checkpoint -- \
  --issue 251 \
  --follow-up 252 \
  --checkpoint 2026-02-15T17:07:43Z \
  --roadmap-file docs/ROADMAP_V11.md
```

Run policy guard to verify workflow files still enforce manual-first policy:

```bash
npm run ci:policy:check
npm run ci:policy:check -- --json
```

## Rollback Criteria (Re-enable Automatic Runs)

Re-enable automatic CI only when all of the following are true:

1. GitHub Actions budget is stable for sustained PR + merge throughput.
2. Maintainers agree to restore mandatory remote PR checks.
3. No active incident requires temporary CI spend controls.

## Weekly Review Cadence

- Cadence: once per week (recommended every Monday).
- Owner: repository maintainer on weekly rotation.
- Decision log location: `docs/CI_MANUAL_REVIEW_LOG.md`.

Weekly checklist:

1. Confirm no unexpected automatic workflow runs since previous review:
   - `npm run ci:audit:manual -- --since <previous-review-iso> --fail-on-unexpected`
   - Expected exception: path-scoped `CNC Mobile Contract Gate` PR runs.
2. Verify manual-first policy still matches budget and throughput needs:
   - count merges since last review
   - count manually dispatched runs since last review
   - `npm run ci:policy:check`
3. Confirm local validation gate remains standard before merge:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:ci`
   - `npm run build`
4. Record decision in the review log:
   - `Continue manual-first policy` or `Start rollback`

## Objective Exit Criteria

Start rollback to automatic CI only when all criteria are met:

1. At least two consecutive weekly reviews indicate Actions spend is within planned budget.
2. Manual-only mode is causing measurable delivery friction (for example delayed validation or merge bottlenecks).
3. Maintainers explicitly approve re-enabling automatic `push` and `pull_request` triggers.

## Rollback Steps

1. Restore automatic triggers in workflow files:
   - `.github/workflows/ci.yml`
   - `.github/workflows/eslint10-compat-watchdog.yml`
   - `.github/workflows/publish-protocol.yml`
2. Re-enable CodeQL default setup from repository settings (`Security` -> `Code security and analysis`).
3. Run one manual validation cycle (`ci.yml`) after rollback to confirm baseline health.
4. Update roadmap/docs to record rollback date and rationale.
