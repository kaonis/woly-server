# Woly-Server Roadmap V10

Date: 2026-02-15
Scope: Full-review remediation cycle based on `docs/FULL_REVIEW_REPORT_2026-02-15.md`.

## 1. Source Inputs

Primary input report:
- `docs/FULL_REVIEW_REPORT_2026-02-15.md`

Prioritized findings imported:
- H1 reconnect scheduling after intentional disconnect
- H2 scan failure masking (false success)
- M1 idempotency scope collision risk
- M2 missing host-route rate limiting
- M3 host database readiness/error semantics
- M4 runtime consistency hardening for native-module tests
- L1 websocket URL parser deprecation
- L2 malformed FQN decode returning 500 instead of 400

## 2. Phases

### Phase 1: Roadmap bootstrap and execution prep

Acceptance criteria:
- Publish V10 roadmap with explicit finding-to-phase mapping.
- Define implementation order: High -> Medium -> Low.

Status: `Completed`

### Phase 2: High-priority reliability fixes

Acceptance criteria:
- Prevent reconnect scheduling after intentional `cncClient.disconnect()`.
- Propagate scan failure state instead of reporting success by default.
- Update/extend unit and integration tests for both behaviors.

Status: `Completed`

### Phase 3: Medium-priority runtime and API hardening

Acceptance criteria:
- Scope command idempotency keys by command type to avoid cross-command collision.
- Apply general API rate limiting to C&C `/hosts` route group.
- Add robust host database readiness guards for all operational methods.
- Harden local native-module test preflight/runtime consistency checks.

Status: `Completed`

### Phase 4: Low-priority correctness and maintenance fixes

Acceptance criteria:
- Replace deprecated `url.parse` usage in websocket auth query-token parsing.
- Validate malformed encoded FQN and return 400-class errors (not 500).
- Add/update tests for malformed FQN behavior.

Status: `Completed`

### Phase 5: Final validation and closeout review

Acceptance criteria:
- Run lint/typecheck/tests/build (or document blockers precisely).
- Save final full review output describing post-remediation state and residual risks.

Status: `Completed`

## 3. Execution Log

- 2026-02-15: Created V10 roadmap from `FULL_REVIEW_REPORT_2026-02-15.md`.
- 2026-02-15: Completed high-priority reliability fixes (`H1`, `H2`) with updated unit/integration coverage.
- 2026-02-15: Completed medium-priority hardening (`M1`, `M2`, `M3`, `M4`) and test/runtime script updates.
- 2026-02-15: Completed low-priority maintenance/correctness fixes (`L1`, `L2`) with validation tests.
- 2026-02-15: Final gates passed (`lint`, `typecheck`, `test:ci`, `build`).
- 2026-02-15: Saved final post-remediation review output to `docs/FULL_REVIEW_REPORT_2026-02-15_FINAL.md`.

## 4. Completion Criteria

V10 is complete when all phases above are marked `Completed` and final review output is saved in `docs/`.
