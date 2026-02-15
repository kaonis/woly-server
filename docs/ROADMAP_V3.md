# Woly-Server Roadmap V3

Date: 2026-02-15
Scope: Continue autonomous delivery after V2 Phase 5 completion (#47 + #51).

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `71f7e03` (PR #126).
- Active execution branch: `feat/129-node-agent-command-reliability`.

### Open issue snapshot (`kaonis/woly-server`)
- #129 `[Node Agent] Phase 4: Command reliability hardening`
- #128 `[CI/Protocol] Close remaining protocol compatibility and schema gates`
- #127 `[Security] Node-agent dependency vulnerability remediation plan`
- #4 `Dependency Dashboard`

### CI snapshot
- Post-merge checks for `71f7e03` are green (CI + CodeQL).

## 2. Iterative Phases

### Phase 1: Node-agent command reliability hardening
Issue: #129  
Labels: `priority:medium`, `architecture`, `node-agent`

Acceptance criteria:
- Add idempotency guard for duplicate command delivery.
- Track command lifecycle transitions for diagnostics.
- Add timeout and bounded retry policies per command type.
- Keep command-result semantics safe under reconnect and retry conditions.

Status: `In Progress` (2026-02-15)

### Phase 2: Protocol/schema CI gates closure
Issue: #128  
Labels: `priority:low`, `protocol`, `testing`, `technical-debt`

Acceptance criteria:
- Add missing schema-validation CI gate for C&C.
- Add cross-repo contract tests for node-agent and C&C in CI.
- Publish/update compatibility upgrade guide.

Status: `Pending`

### Phase 3: Security dependency remediation plan
Issue: #127  
Labels: `priority:medium`, `security`, `node-agent`

Acceptance criteria:
- Re-assess vulnerability state with current dependencies.
- Select and document remediation/acceptance strategy with owner and expiry.
- Implement mitigation and CI policy updates.

Status: `Pending`

## 3. Execution Loop Rules

For each phase:
1. Create branch `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
2. Implement the smallest complete change meeting acceptance criteria.
3. Add/update tests.
4. Run local gate:
   - `npm run typecheck`
   - `npm run test:ci`
5. Open PR (`Closes #<issue>`) and merge after green CI.
6. Verify post-merge `master` CI.
7. Update roadmap progress and continue.

## 4. Progress Log

- 2026-02-15: Created ROADMAP_V3 after V2 Phase 5 completion.
- 2026-02-15: Started Phase 1 issue #129 on branch `feat/129-node-agent-command-reliability`.
