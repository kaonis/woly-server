# ADR 0003: Durable Command Lifecycle Persistence

- Status: Accepted
- Date: 2026-02-07

## Context

In-memory command tracking loses pending and historical state on restart, reducing reliability and auditability.

## Decision

Persist command lifecycle in storage with explicit states (`queued`, `sent`, `acknowledged`, `failed`, `timed_out`) and restart reconciliation.

## Consequences

- Positive: Command history survives process restarts.
- Positive: Supports deterministic retry and timeout behavior.
- Negative: Adds schema migration and state-transition complexity.
