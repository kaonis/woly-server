# ADR 0002: Shared Protocol Package for Node/C&C Contract

- Status: Accepted
- Date: 2026-02-07

## Context

Protocol type declarations are duplicated between node and C&C services. Drift risk has already been observed.

## Decision

Use a shared package (`@kaonis/woly-protocol`) for protocol types plus runtime validation schemas. Enforce compatibility via contract tests in CI.

## Consequences

- Positive: Eliminates duplicated protocol declarations.
- Positive: Reduces integration regressions.
- Negative: Requires coordinated release and version bump discipline.
