# Woly-Server Roadmap V2

Date: 2026-02-15
Scope: Continue autonomous delivery on `kaonis/woly-server` after V1 completion.

## 1. Status Audit

### Repository and branch status
- `woly-server` synced with `origin/master` at merge commit `37d49bf` (PR #125).
- Active execution branch for next phase: `feat/51-cnc-observability-rollout`.

### GitHub issues snapshot (`kaonis/woly-server`)
- Open issues reviewed on 2026-02-15.
- Existing relevant open issues:
  - #51 `[C&C] Phase 6: Observability and operations`

### CI snapshot
- Recent merged PRs on 2026-02-15: #118, #119, #120, #121, #122, #123, #124, #125.
- Post-merge checks on `master` for #125 are green (CI + CodeQL).

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

Status: `Completed` (2026-02-15, PR #120)

### Phase 2: Node-agent lint/type debt cleanup
Issue: #63  
Labels: `priority:low`, `technical-debt`, `node-agent`

Acceptance criteria:
- Remove unused imports/variables.
- Replace `any` at command boundaries with typed payload handling or narrowed `unknown`.
- Keep lint noise near zero with documented exceptions only if necessary.

Status: `Completed` (2026-02-15, PR #121)

### Phase 3: C&C WebSocket abuse controls
Issues:
- #55 (`priority:low`, `security`, `cnc`)
- #56 (`priority:low`, `security`, `cnc`)

Acceptance criteria:
- Add per-connection message rate limiting.
- Add per-IP connection limits.
- Validate behavior under normal traffic and abusive traffic tests.

Status: `Completed` (2026-02-15, PRs #122 and #123)

### Phase 4: Node-agent production CORS tightening
Issue: #57  
Labels: `priority:low`, `security`, `node-agent`

Acceptance criteria:
- Reconcile #57 with already delivered #83 behavior.
- Implement remaining hardening deltas only (or close as superseded if fully covered).
- Preserve legitimate mobile/web production use cases.

Status: `Completed` (2026-02-15, PR #124)

### Phase 5: Observability and rollout ops
Issues:
- #47 (`priority:low`, `node-agent`, `observability`)
- #51 (`priority:low`, `cnc`, `observability`)

Acceptance criteria:
- Expose actionable metrics for auth/reconnect/schema/latency and command lifecycle.
- Add startup diagnostics and incident runbook scaffolding.
- Define staged rollout/canary and rollback procedure.

Status: `Completed` (2026-02-15, PRs #125 and #126)

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
- 2026-02-15: Merged #46 via PR #120; verified post-merge `master` checks green.
- 2026-02-15: Started Phase 2 branch for #63 (`feat/63-node-agent-lint-type-hygiene`) and added zero-warning lint gate enforcement in `apps/node-agent`.
- 2026-02-15: Merged #63 via PR #121; verified post-merge `master` checks green.
- 2026-02-15: Started Phase 3 issue #55 on branch `feat/55-websocket-message-rate-limit`.
- 2026-02-15: Merged #55 via PR #122; verified post-merge `master` checks green.
- 2026-02-15: Started follow-up Phase 3 issue #56 on branch `feat/56-websocket-connection-limit-per-ip`.
- 2026-02-15: Merged #56 via PR #123.
- 2026-02-15: Verified post-merge `master` checks green for #123.
- 2026-02-15: Started Phase 4 issue #57 on branch `feat/57-node-agent-cors-tightening`.
- 2026-02-15: Merged #57 via PR #124; verified post-merge `master` checks green.
- 2026-02-15: Started Phase 5 issue #47 on branch `feat/47-node-agent-observability-rollout`.
- 2026-02-15: Implemented #47 observability + rollout docs on `feat/47-node-agent-observability-rollout` with local gate green (`npx tsc --noEmit`, `npx jest --ci --coverage --passWithNoTests` in `apps/node-agent`).
- 2026-02-15: Merged #47 via PR #125; verified post-merge `master` checks green.
- 2026-02-15: Started #51 implementation branch `feat/51-cnc-observability-rollout`.
- 2026-02-15: Implemented #51 observability/correlation/runbooks changes with local gate green (`npx tsc --noEmit`, `npx jest --ci --coverage --passWithNoTests`, `npm run lint` in `apps/cnc`).
- 2026-02-15: Merged #51 via PR #126; verified post-merge `master` checks green.
- 2026-02-15: Rolled forward to ROADMAP_V3 and started #129.
