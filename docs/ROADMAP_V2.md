# Woly-Server Roadmap V2

Date: 2026-02-15
Scope: Continue autonomous delivery on `kaonis/woly-server` after V1 completion.

## 1. Status Audit

### Repository and branch status
- `woly-server` synced with `origin/master` at merge commit `a172968` (PR #119).
- Active execution branch for next phase: `feat/46-host-data-quality-backpressure`.

### GitHub issues snapshot (`kaonis/woly-server`)
- Open issues reviewed on 2026-02-15.
- Existing relevant open issues:
  - #46 `[Node Agent] Phase 5: Host data quality and backpressure`
  - #63 `[Node Agent] Clean up lint debt (type safety and hygiene)`
  - #55 `[Security] Add WebSocket message rate limiting`
  - #56 `[Security] Add WebSocket connection limits per IP`
  - #57 `[Security] Tighten CORS configuration on Node Agent for production`
  - #47 `[Node Agent] Phase 6: Observability and rollout`
  - #51 `[C&C] Phase 6: Observability and operations`

### CI snapshot
- V1 completion PRs merged on 2026-02-15: #118 and #119.
- Post-merge checks for PR #118 are green (CI + CodeQL).
- Post-merge checks for PR #119 are currently in progress on `master` as of this audit timestamp.

### Local gate health (`woly-server`)
- `npm run typecheck`: pass.
- `npm run test:ci`: pass.
- Coverage baseline from latest local run:
  - `apps/cnc`: 64.82% statements.
  - `apps/node-agent`: 85.40% statements.

## 2. Iterative Phases

### Phase 1: Node-agent host data quality and backpressure
Issue: #46  
Labels: `priority:medium`, `architecture`, `node-agent`

Acceptance criteria:
- Add event sampling/debounce strategy to prevent event storms.
- Add payload size caps/chunking strategy for C&C transport safety.
- Define and enforce queue-and-flush policy during C&C outage.
- Add stale-host data detection.
- Add/adjust tests with passing local gates.

Status: `In Review` (2026-02-15)

### Phase 2: Node-agent lint/type debt cleanup
Issue: #63  
Labels: `priority:low`, `technical-debt`, `node-agent`

Acceptance criteria:
- Remove unused imports/variables.
- Replace `any` at command boundaries with typed payload handling or narrowed `unknown`.
- Keep lint noise near zero with documented exceptions only if necessary.

Status: `Planned`

### Phase 3: C&C WebSocket abuse controls
Issues:
- #55 (`priority:low`, `security`, `cnc`)
- #56 (`priority:low`, `security`, `cnc`)

Acceptance criteria:
- Add per-connection message rate limiting.
- Add per-IP connection limits.
- Validate behavior under normal traffic and abusive traffic tests.

Status: `Planned`

### Phase 4: Node-agent production CORS tightening
Issue: #57  
Labels: `priority:low`, `security`, `node-agent`

Acceptance criteria:
- Reconcile #57 with already delivered #83 behavior.
- Implement remaining hardening deltas only (or close as superseded if fully covered).
- Preserve legitimate mobile/web production use cases.

Status: `Planned`

### Phase 5: Observability and rollout ops
Issues:
- #47 (`priority:low`, `node-agent`, `observability`)
- #51 (`priority:low`, `cnc`, `observability`)

Acceptance criteria:
- Expose actionable metrics for auth/reconnect/schema/latency and command lifecycle.
- Add startup diagnostics and incident runbook scaffolding.
- Define staged rollout/canary and rollback procedure.

Status: `Planned`

## 3. Execution Loop Rules for V2

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
9. Update roadmap status and continue.

## 4. Progress Log

- 2026-02-15: Created ROADMAP_V2 after V1 phase set reached completion via PR #119.
- 2026-02-15: Started Phase 1 implementation branch for issue #46 (`feat/46-host-data-quality-backpressure`).
- 2026-02-15: Completed #46 implementation with local gate green (`npx tsc --noEmit`, `npx jest --ci --coverage --passWithNoTests` in `apps/node-agent`).
- Next: Open PR for #46, merge after CI, then start #63.
