# WoLy Node Backend Implementation Checklist

Date: 2026-02-07
Owner: Platform Team

## Progress Update (2026-02-07)

- [x] Phase 1 implementation completed on branch `feat/phase1-node-auth-lifecycle` (PR #66).
- [x] Phase 2 implementation completed on branch `feat/phase2-runtime-validation-v2` (stacked on Phase 1 branch).
- [x] Ran `npm audit` + `npm audit fix` on branch `feat/phase2-runtime-validation-v2`; safe lockfile updates applied.
- [~] Phase 3 implementation started on branch `feat/phase3-shared-protocol-adoption`.

## Dependency Security Follow-up (2026-02-07)

- [x] Apply non-breaking dependency remediations via `npm audit fix`.
- [ ] Resolve remaining high vulnerabilities tied to `local-devices` -> `get-ip-range` -> `ip` (no upstream fix currently available).
- [ ] Resolve remaining high vulnerabilities tied to `sqlite3` transitive `node-gyp`/`tar` chain (current npm-proposed fix requires `npm audit fix --force` and a semver-major package change).
- [ ] Decide remediation strategy:
- [ ] Option A: replace/remove `local-devices` usage and migrate from `sqlite3` to a maintained storage path.
- [ ] Option B: accept residual risk temporarily with documented compensating controls and tracked owner/date.
- [ ] Add a CI/security gate decision for audit behavior (fail on high vs. allowlisted exceptions with expiry).

## Phase 0 - Baseline and Safety Rails

- [x] Create and approve ADRs for token transport, shared protocol package, and command reliability.
- [x] Maintain `docs/compatibility.md` with every release.
- [x] Enforce CI gates for lint, tests, build, and typecheck.
- [ ] Add contract-test placeholder in CI for shared protocol adoption.

Definition of done:

- [ ] All docs merged and linked from README.
- [ ] CI blocks PRs when lint/test/build/typecheck fail.

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

- [x] Replace local protocol types with `@woly/protocol`.
- [x] Remove duplicate protocol declarations.
- [x] Add protocol version negotiation at connect.
- [ ] Add cross-repo contract tests.

Definition of done:

- [ ] Protocol compatibility is enforced in CI.

## Phase 4 - Command Execution Reliability

- [ ] Add idempotency guard for duplicate command delivery.
- [ ] Track local command lifecycle for diagnostics.
- [ ] Add timeout and bounded retry policies.
- [ ] Ensure acknowledgment retry semantics are safe.

Definition of done:

- [ ] Duplicate deliveries do not cause duplicate side effects.

## Phase 5 - Host Data and Backpressure

- [ ] Add event sampling/debounce strategy.
- [ ] Add payload size caps/chunking strategy.
- [ ] Define queue-and-flush policy during C&C outage.
- [ ] Add stale-host data detection.

Definition of done:

- [ ] Node remains stable under event spikes and reconnect storms.

## Phase 6 - Observability and Rollout

- [ ] Emit reconnect/auth/schema/latency metrics.
- [ ] Add startup diagnostics with build and protocol version.
- [ ] Publish incident runbooks.
- [ ] Execute canary to staged rollout policy.

Definition of done:

- [ ] On-call can isolate auth, protocol, command, or network failures quickly.
