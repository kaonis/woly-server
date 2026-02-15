# Woly-Server Roadmap V1

Date: 2026-02-15
Scope: `kaonis/woly-server` primary delivery, with regular compatibility checks against `kaonis/woly`.

## 1. Status Audit

### Repository and branch status
- `woly-server` is on `master`, synced with `origin/master` on 2026-02-15.
- `woly` was fetched on 2026-02-15 for compatibility checks (local branch remains `feat/168-schedule-creation-form`).

### GitHub issues snapshot (`kaonis/woly-server`)
- Open issues reviewed on 2026-02-15.
- Existing relevant issues:
  - #86 `[Monorepo] Remove unused dependencies`
  - #93 `[Testing] Protocol coverage, CORS tests, raise thresholds, fix preflight version check`
  - #83 `[Node Agent] Restrict default CORS and rate-limit health endpoint`
  - #89 `[Node Agent] Add PUT/DELETE REST endpoints for standalone mode`
- New issue created for cross-repo compatibility:
  - #112 `[Compatibility] Add kaonis/woly mobile-client API compatibility smoke checks`

### CI snapshot
- `kaonis/woly-server`: latest `master` CI and CodeQL runs are green as of 2026-02-14 and 2026-02-15 (including Renovate PR CI runs).
- `kaonis/woly`: latest `master` CI run is green on 2026-02-15.

### Local gate health (`woly-server`)
- `npm run typecheck`: pass.
- `npm run test:ci`: pass after native module rebuild.
- Coverage baseline from `test:ci`:
  - `apps/cnc`: 64.8% statements.
  - `apps/node-agent`: 84.76% statements.
- Note: raw root commands `npx tsc --noEmit` and `npx jest --ci --coverage --passWithNoTests` are not the canonical monorepo gates in this repo. Workspace gates are `npm run typecheck` and `npm run test:ci`.

### Compatibility snapshot (`woly` <-> `woly-server`)
- `woly` currently depends on C&C auth/API behavior for:
  - `POST /api/auth/token`
  - `GET /api/hosts`
  - `GET /api/nodes`
- `woly-server` already has shared protocol contract coverage for node/C&C messaging, but mobile-app API compatibility coverage is incomplete (tracked in #112).

## 2. Iterative Phases

### Phase 1: Dependency and baseline hygiene
Issue: #86  
Labels: `priority:low`, `technical-debt`

Acceptance criteria:
- Remove unused dependencies listed in #86.
- Install/build/test continue to pass.
- No import/type regressions.

Status: `In Progress`

### Phase 2: Testing hardening and coverage ratchet
Issue: #93  
Labels: `priority:low`, `testing`

Acceptance criteria:
- Protocol coverage configuration added.
- Node-agent CORS origin logic tested.
- Coverage threshold raised to 60% in node-agent.
- Preflight scripts aligned with Node 24+ requirement.

Status: `Planned`

### Phase 3: Cross-repo compatibility guardrails
Issue: #112  
Labels: `priority:medium`, `testing`, `cnc`

Acceptance criteria:
- Add smoke tests for `/api/auth/token`, `/api/hosts`, `/api/nodes` from mobile app perspective.
- Validate auth and error envelope compatibility with `kaonis/woly` service layer expectations.
- Ensure CI fails on breaking API drift.

Status: `Planned`

### Phase 4: Node-agent security and API parity
Issues:
- #83 (`priority:low`, `security`, `node-agent`)
- #89 (`priority:medium`, `enhancement`, `node-agent`)

Acceptance criteria:
- Restrictive default CORS in production and health endpoint rate limiting (#83).
- Standalone REST `PUT /hosts/:name` and `DELETE /hosts/:name` with tests/docs (#89).

Status: `Planned`

## 3. Execution Loop Rules for V1

For each issue phase:
1. Create branch: `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
2. Implement smallest complete change meeting acceptance criteria.
3. Add/update tests.
4. Run local gate:
   - `npm run typecheck`
   - `npm run test:ci`
5. Self-review diff and risks.
6. Open PR with `Closes #<issue>`.
7. Merge only after green CI.
8. Re-check `master` CI.
9. Update this roadmap status and continue to next issue.

## 4. Progress Log

- 2026-02-15: Completed initial status audit and created ROADMAP_V1.
- 2026-02-15: Created issue #112 for explicit `woly` mobile compatibility smoke checks.
- 2026-02-15: Started Phase 1 implementation on issue #86 (`fix/86-dependency-cleanup`).
- Next: Open and merge PR for #86, then continue to #93.
