# WoLy C&C Backend Implementation Checklist

Date: 2026-02-07
Owner: Platform Team

## Progress Update (2026-02-07)

- [x] Phase 1 implemented (JWT auth + RBAC).
- [x] Phase 2 implemented baseline (WebSocket auth hardening).
- [x] Shared protocol adoption started on branch `feat/phase3-shared-protocol-adoption` to align with `woly-backend` Phase 3 rollout.
- [x] Auth-path integration coverage now explicitly includes missing token, malformed token, invalid signature, expired token, and role-mismatch scenarios.

## Checklist Reconciliation (2026-02-15)

- [x] Phase 0 Definition-of-Done references audited for ADR/doc/CI discoverability.
- [x] Coverage ratchet baseline policy documented and enforced (`apps/cnc/docs/coverage-ratchet-policy.md`, `apps/cnc/jest.config.js`).

## Phase 0 - Baseline and Safety Rails

- [x] Create and approve ADRs for API auth, shared protocol package, and durable command lifecycle.
- [x] Maintain `docs/compatibility.md` with every release.
- [x] Enforce CI gates for lint, tests, build, and typecheck.
- [x] Add schema-validation test gate in CI.

Definition of done:
- [x] ADRs and compatibility docs merged and discoverable (`apps/cnc/docs/adr/`, `docs/compatibility.md`, `docs/PROTOCOL_COMPATIBILITY.md`, `docs/PROTOCOL_PUBLISH_WORKFLOW.md`).
- [x] CI consistently blocks regressions (`.github/workflows/ci.yml` validate + protocol compatibility jobs, including schema gate).

## Phase 1 - API Authentication and Authorization

- [x] Add JWT auth middleware for `/api/hosts/*` and `/api/admin/*`.
- [x] Add role-based authorization (`operator`, `admin`).
- [x] Enforce issuer/audience/expiry checks.
- [x] Add integration tests for 401 and 403 paths.

Definition of done:
- [x] Protected routes reject unauthorized requests.

## Phase 2 - WebSocket Auth Hardening

- [x] Replace query-token auth with header/subprotocol auth.
- [x] Enforce TLS-only production path.
- [x] Implement short-lived session tokens.
- [x] Publish token rotation runbook.

Definition of done:
- [x] Invalid tokens are rejected before upgrade.

## Phase 3 - Runtime Validation and Identity Binding

- [x] Validate every inbound WS message with runtime schemas.
- [x] Bind node identity to authenticated connection.
- [x] Ignore payload `nodeId` for heartbeat and events.
- [x] Emit telemetry for rejected payloads.

Definition of done:
- [x] Spoofed heartbeat/event identity is no longer possible.

## Phase 4 - Durable Command Lifecycle

- [x] Add persistent `commands` table and state machine.
- [x] Persist all state transitions.
- [x] Reconcile in-flight commands on restart.
- [x] Add timeout and idempotency behavior.

Definition of done:
- [x] Command history and outcomes survive restarts.

## Phase 5 - Shared Protocol Package

- [x] Replace duplicated protocol declarations with `@kaonis/woly-protocol`.
- [x] Add shared-schema contract tests in C&C test suite.
- [x] Enforce protocol version compatibility checks during registration.
- [x] Add cross-repo contract tests across node and C&C in CI.
- [x] Publish compatibility upgrade guide.

Definition of done:
- [x] Incompatible protocol changes fail CI unless versioned correctly.

## Phase 6 - Observability and Operations

- [x] Emit node count, command latency, timeout rate, and invalid payload rate metrics.
- [x] Propagate correlation IDs from API call to node response.
- [x] Add dashboards and alerts.
- [x] Publish incident runbooks.

Definition of done:
- [x] Incident response can trace failures end-to-end quickly.
