# Test Coverage Investigation (2026-02-18)

## Scope

Monorepo coverage and test-chain reliability audit for:

- `packages/protocol`
- `apps/cnc`
- `apps/node-agent`

## Reproduction commands

```bash
npm ci
npm run test:ci --workspace=@kaonis/woly-protocol -- --coverageReporters=json-summary --coverageReporters=text
npm run test:ci --workspace=@woly-server/cnc -- --coverageReporters=json-summary --coverageReporters=text
npm run test:ci --workspace=@woly-server/node-agent -- --coverageReporters=json-summary --coverageReporters=text
```

Note: app suite runs initially failed in a fresh clone until `npm run build -w packages/protocol` was executed.

## Coverage baseline

| Workspace           | Statements | Branches | Functions |   Lines |
| ------------------- | ---------: | -------: | --------: | ------: |
| `packages/protocol` |    100.00% |  100.00% |   100.00% | 100.00% |
| `apps/cnc`          |     83.88% |   73.76% |    86.96% |  84.12% |
| `apps/node-agent`   |     86.52% |   75.00% |    89.60% |  86.50% |

## Key findings

1. **Test-chain reliability gap**
   - Fresh-clone app tests require built protocol artifacts but do not ensure they exist.
   - Symptom: `TS2307 Cannot find module '@kaonis/woly-protocol'` in CNC and node-agent suites.
2. **CNC branch hot spots**
   - Zero-coverage bootstrap/controller files (`src/init-db.ts`, `src/server.ts`, `src/controllers/capabilities.ts`).
   - Low branch coverage in schedule and websocket paths.
3. **Node-agent branch hot spots**
   - Reliability/transport modules (`src/services/agentService.ts`, `src/services/cncClient.ts`) have the largest branch gaps.

## Issue tracking

- #317: [Testing] Make CNC and node-agent test suites self-contained re: protocol build artifacts
- #318: [Coverage][CNC] Raise branch coverage in bootstrap/schedule/websocket hotspots
- #319: [Coverage][Node Agent] Raise branch coverage in command lifecycle and CNC client flows

## Mitigation and implementation plan

### Phase 1: Unblock and stabilize test chain (Issue #317)

- Add protocol-build guard to app preflight scripts.
- Keep preflight incremental by rebuilding protocol only when artifacts are missing or stale.
- Verify both app suites pass from clean clone with only `npm ci`.

### Phase 2: CNC coverage uplift (Issue #318)

- Add tests for zero-coverage bootstrap/capabilities paths.
- Add branch-focused tests for schedule model/controller and websocket upgrade/error paths.
- Target CNC branches: 73.76% -> >=78%.

### Phase 3: Node-agent coverage uplift (Issue #319)

- Add branch-focused tests for `agentService` reliability paths and `cncClient` reconnect/auth transitions.
- Add small utility branch tests only where meaningful.
- Target node-agent branches: 75.00% -> >=80%.

## PR sequence

1. PR-A: implement Issue #317 (test-chain reliability fix).
2. PR-B: implement first CNC uplift slice (schedule + capabilities focus).
3. PR-C: implement node-agent reliability/transport branch uplift.

Each PR should complete the required review pass:

```bash
git diff --stat origin/master...HEAD
git diff origin/master...HEAD
gh pr view --comments
```
