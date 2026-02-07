# WoLy Node Backend Architecture Plan

Date: 2026-02-07  
Scope: `woly-backend` (node/agent) with coordination points for `woly-cnc-backend`

## Goals

1. Align node-agent security posture with C&C hardening.
2. Make node <-> C&C protocol robust, validated, and versioned.
3. Improve execution reliability for commands and host reporting.
4. Increase operational visibility and upgrade safety.

## Current Risks

1. C&C and node protocol definitions are duplicated and already drifting.
2. Message payload handling relies on compile-time types instead of runtime validation.
3. Node reconnect/auth flow is not designed for short-lived rotated session tokens.
4. Command handler behavior can diverge from C&C expectations without contract tests.
5. Telemetry is not sufficient for fast diagnosis of auth/protocol failures.

## Delivery Model

1. Deliver in phases that can be merged independently.
2. Keep backward compatibility behind explicit feature flags during rollout.
3. Ship protocol and auth changes with dual-stack windows, then remove legacy paths.

## Phase 0 - Baseline and Compatibility Matrix

Work:

1. Add `/docs/compatibility.md` mapping node versions to C&C protocol/auth capabilities.
2. Add ADRs in `/docs/adr` for node auth token handling and protocol package adoption.
3. Extend CI to include unit tests, integration tests, and protocol contract checks.

Acceptance:

1. Compatibility expectations are documented per release.
2. CI blocks protocol-affecting changes without tests and version updates.

## Phase 1 - Node Session Auth and Connection Lifecycle

Work:

1. Implement support for short-lived node session token acquisition/refresh.
2. Switch WS auth from query token usage to secure header/subprotocol usage.
3. Add reconnect logic that refreshes token before reconnect.
4. Add explicit behavior for expired token, revoked token, and auth server unavailable.

Acceptance:

1. Node can reconnect without manual intervention across token rotations.
2. Query-token path is disabled in production mode.
3. Integration tests cover auth failure and recovery paths.

## Phase 2 - Runtime Validation for Inbound/Outbound Messages

Work:

1. Validate all outbound node messages against runtime schemas.
2. Validate all inbound command payloads before dispatching to handlers.
3. Add strict handling for unknown command types and malformed payloads.
4. Emit structured validation errors with correlation IDs.

Acceptance:

1. Invalid messages are rejected deterministically and logged with cause.
2. Unknown commands cannot crash dispatcher loop.
3. Unit tests cover schema failure cases for each command family.

## Phase 3 - Shared Protocol Package Adoption

Work:

1. Replace local protocol type duplicates with `@kaonis/protocol`.
2. Remove local fallback type declarations once adoption is complete.
3. Add contract tests that assert encode/decode compatibility with C&C.
4. Introduce explicit protocol version negotiation at connection start.
5. Publish `@kaonis/protocol` to shared registry and migrate both repos from local `file:` dependency to pinned semver dependency.

Acceptance:

1. Protocol declarations are sourced from one shared package only.
2. CI fails on incompatible protocol changes without required version policy steps.
3. Node can reject unsupported protocol versions with clear diagnostics.

## Phase 4 - Command Execution Reliability

Work:

1. Add idempotency guards for command re-delivery after reconnect/retry.
2. Track command execution state transitions locally for diagnostics.
3. Add timeout handling and bounded retry policy per command type.
4. Ensure command result acknowledgements are retried safely when network is unstable.

Acceptance:

1. Duplicate command delivery does not execute side effects twice.
2. Timeouts and retries follow deterministic policy with test coverage.
3. Command outcomes are auditable in logs with correlation IDs.

## Phase 5 - Host Data Quality and Backpressure

Work:

1. Define sampling and debouncing strategy for host/process/event updates.
2. Add payload size caps and chunking strategy where needed.
3. Add backpressure handling for C&C-unavailable periods (queue and flush policy).
4. Validate host metadata freshness and stale data handling.

Acceptance:

1. Event storms do not overwhelm process memory or WS channel.
2. Stale host records are flagged consistently.
3. Host reporting remains stable under packet loss/reconnect scenarios.

## Phase 6 - Observability, Runbooks, and Release Strategy

Work:

1. Add metrics: reconnect count, auth failures, invalid payload rate, command latency.
2. Add startup diagnostics banner (build/version/protocol version/auth mode).
3. Write runbooks for token rotation issues, repeated reconnect loops, and schema failures.
4. Define staged rollout plan (canary nodes -> batch rollout -> full rollout).

Acceptance:

1. On-call can identify failure domain (auth, protocol, command, network) quickly.
2. Rollout playbook supports safe rollback to previous compatible version.

## Execution Sequence (PR Plan)

1. PR-1: ADRs + compatibility matrix + CI guardrails (Phase 0).
2. PR-2: node session auth and reconnect refresh logic (Phase 1).
3. PR-3: runtime schema validation in dispatcher/reporting (Phase 2).
4. PR-4: shared protocol package migration + contract tests (Phase 3).
5. PR-5: command idempotency/retry hardening (Phase 4).
6. PR-6: host update backpressure and data quality controls (Phase 5).
7. PR-7: metrics, runbooks, and staged rollout controls (Phase 6).

## Cross-Repo Coordination Points

1. Phase 1 depends on C&C Phase 2 token/session implementation details.
2. Phase 3 must be coordinated with C&C Phase 5 in the same release window.
3. Phase 4 state semantics must match C&C durable command lifecycle definitions.
4. Compatibility matrix updates are required in both repos before each release.

## Estimated Effort

1. Phase 0-1: 3-4 days.
2. Phase 2-3: 4-6 days.
3. Phase 4-5: 4-6 days.
4. Phase 6: 2-3 days.

Total: ~3-4 weeks, assuming parallel work with C&C team.
