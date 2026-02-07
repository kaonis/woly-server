# ADR 0003: Command Reliability and Idempotency Model

- Status: Accepted
- Date: 2026-02-07

## Context

Network instability and reconnects can cause duplicate command delivery attempts. Without idempotency and deterministic retry semantics, side effects can be executed multiple times.

## Decision

Introduce idempotency keys, bounded retries, and deterministic timeout behavior in the node command execution path. Log lifecycle transitions with correlation IDs.

## Consequences

- Positive: Safer command processing under retries and reconnect storms.
- Positive: Better diagnostic traceability.
- Negative: Requires additional command metadata and behavior contract alignment with C&C.
