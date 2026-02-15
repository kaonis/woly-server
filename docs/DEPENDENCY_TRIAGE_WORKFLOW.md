# Dependency Dashboard Triage Workflow

Date: 2026-02-15
Owner: Platform Team (rotating on-call maintainer)
Primary source: GitHub issue `#4` (Dependency Dashboard)

## 1. Purpose

Define a repeatable dependency triage process so update decisions are explicit, auditable, and tied to follow-up work.

## 2. Cadence and Ownership

1. Primary triage cadence: weekly.
2. Event-driven triage: immediately after new Renovate/Mend dependency PR bursts.
3. Owner: current platform on-call maintainer.
4. Backup owner: repository maintainer with merge rights.

## 3. Input Sources

- Issue `#4` Dependency Dashboard state.
- Open dependency update PRs.
- CI/security signals (`npm audit`, CodeQL, failing dependency-related CI).

## 4. Decision Categories

For each dependency PR/update, choose one category:

### A. Auto-merge safe

Use when all conditions are true:
- patch/minor change with no runtime contract impact.
- CI and tests pass without source changes.
- no security or licensing concerns detected.

Action:
- merge dependency PR after checks pass.

### B. Manual validation required

Use when any condition is true:
- major version update.
- runtime-critical package (`express`, `ws`, `zod`, `pg`, `better-sqlite3`, auth/security middleware).
- schema/typing behavior changes likely to affect protocol or API contracts.

Action:
- open/attach a scoped validation issue.
- run targeted test matrix before merge.

### C. Deferred with rationale

Use when update is blocked by compatibility risk, tooling limits, or upstream instability.

Action:
- document defer reason in issue `#4` comment.
- include re-evaluation date or trigger.
- create follow-up issue if work is required to unblock.

## 5. Required Triage Output

For each triage pass, post a short issue `#4` comment containing:

1. Date and owner.
2. Updates merged.
3. Updates requiring manual validation.
4. Deferred updates with rationale and follow-up links.

## 6. Operational Rules

1. Do not defer without rationale.
2. Do not merge major dependency changes without explicit validation notes.
3. Keep dependency triage outcomes reflected in the active roadmap phase when non-trivial work is required.

## 7. Major Upgrade Planning Reference

For active major dependency wave planning and current merge/defer decisions, see:
- `docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md`
