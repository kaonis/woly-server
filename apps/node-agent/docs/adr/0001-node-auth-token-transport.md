# ADR 0001: Node WebSocket Auth Token Transport

- Status: Accepted
- Date: 2026-02-07

## Context

The node currently authenticates using a token in the WebSocket query string. Query-string tokens are easier to leak through logs, metrics, and intermediary tooling.

## Decision

Use short-lived session tokens sent via WebSocket header or subprotocol metadata. Disable query-string token auth in production after a transition window.

## Consequences

- Positive: Reduces token leakage risk and supports rotation.
- Positive: Aligns node behavior with C&C auth hardening.
- Negative: Requires reconnect flow updates and compatibility handling during migration.
