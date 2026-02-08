# WoLy C&C Architecture Plan

Date: 2026-02-07  
Scope: `woly-cnc-backend` and cross-system coordination with `woly-backend`

## Goals

1. Close critical security gaps (API auth, WebSocket auth, message validation).
2. Stabilize command delivery and recovery (durable command lifecycle).
3. Eliminate protocol drift between C&C and node agent.
4. Improve operability (metrics, logs, release controls).

## Current Risks

1. REST/admin routes are unauthenticated.
2. Node auth token is passed in URL query for WebSocket.
3. WebSocket payloads are trusted via TypeScript assertions only.
4. Node identity is payload-driven instead of connection-bound.
5. Commands are tracked only in memory; restarts lose pending state.
6. Protocol definitions have already drifted between repos.

## Delivery Model

1. Deliver in 6 phases with merge-safe increments.
2. Keep each phase releasable with feature flags where needed.
3. Use contract tests to lock protocol changes before rollout.

## Progress Snapshot (2026-02-07)

1. Phase 1 completed (API auth + RBAC).
2. Phase 2 completed (WS auth hardening with header/subprotocol support + session tokens).
3. Phase 3 in progress (runtime validation + connection-bound identity + telemetry).
4. Shared protocol adoption work has started early (Phase 5 slice) in parallel with `woly-backend` Phase 3 to reduce protocol drift risk.

## Phase 0 - Baseline and Safety Rails

Work:
1. Add architecture decision records (`/docs/adr`) for auth, protocol package, command durability.
2. Add a temporary compatibility matrix doc for current node-agent and C&C versions.
3. Add CI checks for lint, tests, typecheck, and schema validation tests.

Acceptance:
1. ADRs merged and referenced in README.
2. CI gate blocks protocol-breaking changes without updated tests.

## Phase 1 - C&C API Authentication and Authorization

Work:
1. Implement JWT auth middleware for `/api/hosts/*` and `/api/admin/*`.
2. Define roles (`operator`, `admin`) and route-level authorization.
3. Add token issuer, audience, and expiration validation.
4. Add integration tests for allowed/denied scenarios.

Acceptance:
1. Protected routes reject unauthenticated requests with 401.
2. Role violations return 403 with deterministic error format.
3. Existing health endpoints remain publicly accessible.

## Phase 2 - WebSocket Authentication Hardening

Work:
1. Replace query-token auth with header/subprotocol bearer token.
2. Require TLS-only deployment path in production.
3. Add replay-resistant short-lived node session tokens (issued by C&C).
4. Introduce token rotation runbook.

Acceptance:
1. Query tokens disabled in production mode.
2. Expired/invalid tokens are rejected before connection upgrade.
3. Node reconnect path works with refreshed token.

## Phase 3 - Runtime Schema Validation and Connection-Bound Identity

Work:
1. Validate every inbound node message with runtime schemas (Zod/JSON Schema).
2. Persist and bind node identity to connection at registration.
3. Ignore payload `nodeId` for heartbeat/host events; use bound connection node id.
4. Add rejection telemetry for invalid payloads.

Acceptance:
1. Malformed messages are rejected and logged with reason.
2. Heartbeat spoofing by payload node id is impossible.
3. NodeManager tests cover schema failures and identity hijack attempts.

## Phase 4 - Durable Command Lifecycle

Work:
1. Add `commands` table with states: `queued`, `sent`, `acknowledged`, `failed`, `timed_out`.
2. Persist command on enqueue and state transitions.
3. On restart, reconcile in-flight commands and mark stale as timed out.
4. Add idempotency key handling for retries.

Acceptance:
1. Restart does not lose command audit history.
2. Timeout and retry behavior is deterministic and tested.
3. API can query recent command outcomes.

## Phase 5 - Shared Protocol Package and Contract Tests

Work:
1. Create shared package (e.g. `@kaonis/woly-protocol`) for types + runtime schemas.
2. Consume shared package from both repos.
3. Add contract tests that run both encoder/decoder expectations in CI.
4. Add protocol versioning and compatibility policy.

Acceptance:
1. No duplicated protocol type declarations remain.
2. CI fails on incompatible changes without version bump.
3. Upgrade guide exists for backward-compatible rollout.

## Phase 6 - Observability and Operations

Work:
1. Add metrics: connected nodes, command latency, timeout rate, invalid message rate.
2. Add structured correlation IDs from API call -> command -> node result.
3. Create dashboards and alert thresholds.
4. Add incident runbooks for node flapping, command backlog, auth failures.

Acceptance:
1. SLO dashboards are live and actionable.
2. On-call can trace a failed command end-to-end.

## Execution Sequence (PR Plan)

1. PR-A: ADRs + CI guardrails (Phase 0).
2. PR-B: API auth + RBAC + tests (Phase 1).
3. PR-C: WS auth upgrade + fallback window + tests (Phase 2).
4. PR-D: message schema validation + identity binding (Phase 3).
5. PR-E: command persistence schema + router integration (Phase 4).
6. PR-F: shared protocol package adoption in C&C.
7. PR-G: shared protocol package adoption in backend.
8. PR-H: observability, alerts, runbooks (Phase 6).

Current sequencing note:
1. PR-F and PR-G are being executed as a coordinated pair.
2. C&C keeps backward-compatible protocol-version handling during transition and will enforce stricter CI contract gates after both repos converge.

## Dependencies

1. `woly-backend` must be updated for new WS auth and shared protocol package.
2. Mobile app and admin clients need JWT integration for protected C&C routes.

## Estimated Effort

1. Phase 0-1: 3-5 days.
2. Phase 2-3: 4-6 days.
3. Phase 4-5: 5-8 days.
4. Phase 6: 2-3 days.

Total: ~3-5 weeks, depending on parallelization.
