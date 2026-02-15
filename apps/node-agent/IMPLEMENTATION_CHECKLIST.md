# WoLy Node Backend Implementation Checklist

Date: 2026-02-07
Owner: Platform Team

## Progress Update (2026-02-07)

- [x] Phase 1 implementation completed on branch `feat/phase1-node-auth-lifecycle` (PR #66).
- [x] Phase 2 implementation completed on branch `feat/phase2-runtime-validation-v2` (stacked on Phase 1 branch).
- [x] Ran `npm audit` + `npm audit fix` on branch `feat/phase2-runtime-validation-v2`; safe lockfile updates applied.
- [~] Phase 3 implementation started on branch `feat/phase3-shared-protocol-adoption`.

## Dependency Security Follow-up (2026-02-15)

- [x] Re-assess dependency risk with fresh `npm audit --json`.
- [x] Apply non-breaking lockfile remediation (`npm audit fix --package-lock-only`).
- [x] Confirm current audit state has no high/critical findings.
- [x] Document remediation strategy, ownership, and exception process in `docs/security/dependency-remediation-plan.md`.
- [x] Add CI security gate (`npm run security:audit`) to fail on high/critical vulnerabilities.

## Phase 0 - Baseline and Safety Rails

- [x] Create and approve ADRs for token transport, shared protocol package, and command reliability.
- [x] Maintain `docs/compatibility.md` with every release.
- [x] Enforce CI gates for lint, tests, build, and typecheck.
- [x] Add contract-test placeholder in CI for shared protocol adoption.

Definition of done:

- [x] All docs merged and linked from README.
- [x] CI blocks PRs when lint/test/build/typecheck fail.

## Phase 1 - Node Session Auth and Reconnect

- [x] Implement short-lived session token acquire/refresh flow.
- [x] Move WS auth to header or subprotocol.
- [x] Disable query-token auth in production mode.
- [x] Add reconnect logic with token refresh.
- [x] Add tests for expired, revoked, and unavailable auth scenarios.

Definition of done:

- [x] Token rotation works without manual intervention.
- [x] Query-token usage blocked in production.

## Phase 2 - Runtime Schema Validation

- [x] Validate all inbound commands before dispatch.
- [x] Validate outbound telemetry/events before send.
- [x] Add strict unknown-command handling.
- [x] Add structured error logging with correlation IDs.

Definition of done:

- [x] Invalid payload paths have deterministic test coverage.

## Phase 3 - Shared Protocol Package

- [x] Replace local protocol types with `@kaonis/woly-protocol`.
- [x] Remove duplicate protocol declarations.
- [x] Add protocol version negotiation at connect.
- [x] Add cross-repo contract tests.
- [x] Add CI workflow to enforce protocol compatibility checks.
- [x] Define external publish readiness + rollback workflow for `@kaonis/woly-protocol` in `docs/PROTOCOL_PUBLISH_WORKFLOW.md`.
- [~] Publish `@kaonis/woly-protocol` when an external consumer release requires it (follow `docs/PROTOCOL_PUBLISH_WORKFLOW.md`).

Definition of done:

- [x] Protocol compatibility is enforced in CI.

## Phase 4 - Command Execution Reliability

- [x] Add idempotency guard for duplicate command delivery.
- [x] Track local command lifecycle for diagnostics.
- [x] Add timeout and bounded retry policies.
- [x] Ensure acknowledgment retry semantics are safe.

Definition of done:

- [x] Duplicate deliveries do not cause duplicate side effects.

## Phase 5 - Host Data and Backpressure

- [x] Add event sampling/debounce strategy.
- [x] Add payload size caps/chunking strategy.
- [x] Define queue-and-flush policy during C&C outage.
- [x] Add stale-host data detection.

Definition of done:

- [x] Node remains stable under event spikes and reconnect storms.

## Phase 6 - Observability and Rollout

- [x] Emit reconnect/auth/schema/latency metrics.
- [x] Add startup diagnostics with build and protocol version.
- [x] Publish incident runbooks.
- [x] Execute canary to staged rollout policy.

Definition of done:

- [x] On-call can isolate auth, protocol, command, or network failures quickly.
