# Woly-Server CNC Sync Rules

These rules define how CNC features are shipped without frontend/backend drift.

## Worktree-First Workflow (Required)

Before any file modifications or branch work, create a new worktree from `origin/master`.

Required baseline flow:

```bash
git fetch origin
git worktree add ../woly-server-<topic> -b codex/<issue>-<topic> origin/master
cd ../woly-server-<topic>
```

Rules:

- Do not start implementation directly in the primary checkout.
- Do not create implementation branches from stale local refs.
- Perform all edits, commits, and PR prep from the new worktree.
- Use `codex/` branch prefixes for Codex-authored branches; non-Codex contributors should use the repo's standard branch prefixes.
- After merge/completion, remove the temporary worktree to avoid stale local clones:
  - `git worktree remove ../woly-server-<topic>`

## Review Pass (Required)

Every change (code, docs, config, workflows) must complete a review pass before merge.

Required flow:

1. Run a final review pass after implementation (peer review preferred; self-review is required at minimum).
2. Review the full diff and validate scope, regressions, and policy checklist coverage.
3. Address all review comments/threads with follow-up commits, or explicitly respond with rationale when no code change is made.
4. Repeat review after follow-up commits until there are no unresolved review threads/comments.

## Required Delivery Chain

For every CNC feature, always deliver in this order:

1. Protocol contract (`packages/protocol` types/schemas)
2. Backend endpoint/command implementation (`apps/cnc`)
3. Frontend integration (`kaonis/woly`)

## Linked-Issue Policy

Each CNC feature PR must link all three issue tracks:

- Protocol issue: `kaonis/woly-server#...`
- Backend issue: `kaonis/woly-server#...`
- Frontend issue: `kaonis/woly#...`

## Ordering Constraints

- Capability negotiation is first-class and must land first: `kaonis/woly-server#254`.
- Standalone probing de-scope (`kaonis/woly#307`) is blocked until CNC parity is complete.

## Merge Gates

A CNC feature is not mergeable unless:

- PR checklist confirms protocol -> backend -> frontend chain.
- Contract compatibility tests are green (`kaonis/woly-server#256`).
- App protocol export typecheck gate is green (`kaonis/woly#308` + `kaonis/woly-server#257`).

## Budget Mode CI

- GitHub Actions: keep only low-cost policy checks on pull requests.
- Heavy gates run locally before merge:
  - `npm ci`
  - `npm run build -w packages/protocol`
  - `npm run test -w packages/protocol -- contract.cross-repo`
  - `npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts`
  - `npm run validate:standard`

## Source of Truth

- Policy doc: `docs/CNC_SYNC_POLICY.md`
- Combined roadmap: `docs/ROADMAP_CNC_SYNC_V1.md`
