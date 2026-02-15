# Woly-Server Roadmap V3

Date: 2026-02-15
Scope: Continue autonomous delivery after V2 Phase 5 completion (#47 + #51).

## 1. Status Audit

### Repository and branch status
- `master` synced at merge commit `742a801` (PR #132).
- Active execution branch: `feat/133-cnc-zero-warning-lint`.

### Open issue snapshot (`kaonis/woly-server`)
- #4 `Dependency Dashboard`
- #133 `[C&C] Eliminate lint warnings and enforce zero-warning gate`
- #134 `[C&C] Complete auth 401/403 integration coverage`
- #135 `[Protocol] Define external publish readiness workflow`

### CI snapshot
- Post-merge checks for `742a801` are green (CI + CodeQL).

## 2. Iterative Phases

### Phase 1: Node-agent command reliability hardening
Issue: #129  
Labels: `priority:medium`, `architecture`, `node-agent`

Acceptance criteria:
- Add idempotency guard for duplicate command delivery.
- Track command lifecycle transitions for diagnostics.
- Add timeout and bounded retry policies per command type.
- Keep command-result semantics safe under reconnect and retry conditions.

Status: `Completed` (2026-02-15, PR #130)

### Phase 2: Protocol/schema CI gates closure
Issue: #128  
Labels: `priority:low`, `protocol`, `testing`, `technical-debt`

Acceptance criteria:
- Add missing schema-validation CI gate for C&C.
- Add cross-repo contract tests for node-agent and C&C in CI.
- Publish/update compatibility upgrade guide.

Status: `Completed` (2026-02-15, PR #131)

### Phase 3: Security dependency remediation plan
Issue: #127  
Labels: `priority:medium`, `security`, `node-agent`

Acceptance criteria:
- Re-assess vulnerability state with current dependencies.
- Select and document remediation/acceptance strategy with owner and expiry.
- Implement mitigation and CI policy updates.

Status: `Completed` (2026-02-15, PR #132)

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
- 2026-02-15: Merged #129 via PR #130.
- 2026-02-15: Verified post-merge `master` checks green for #130 (CI + CodeQL).
- 2026-02-15: Started Phase 2 issue #128 on branch `feat/128-protocol-schema-ci-gates`.
- 2026-02-15: Merged #128 via PR #131.
- 2026-02-15: Verified post-merge `master` checks green for #131 (CI + CodeQL).
- 2026-02-15: Started Phase 3 issue #127 on branch `feat/127-node-agent-security-remediation`.
- 2026-02-15: Merged #127 via PR #132.
- 2026-02-15: Verified post-merge `master` checks green for #132 (CI + CodeQL).
- 2026-02-15: Closed lingering issue #129 manually after verifying PR #130 delivery.
