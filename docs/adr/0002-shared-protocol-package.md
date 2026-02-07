# ADR 0002: Shared Protocol Package Adoption

- Status: Accepted
- Date: 2026-02-07

## Context

Node and C&C currently maintain duplicated protocol declarations. This has already created drift risk and weakens confidence in interoperability.

## Decision

Adopt a shared package (`@woly/protocol`) for protocol types and runtime schemas. Remove duplicate local protocol declarations after migration.

## Consequences

- Positive: Single source of truth for protocol contracts.
- Positive: Enables enforceable contract tests in CI.
- Negative: Requires coordinated versioning and release sequencing across repos.
