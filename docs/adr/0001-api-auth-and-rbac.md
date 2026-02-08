# ADR 0001: API Authentication and RBAC for C&C

- Status: Accepted
- Date: 2026-02-07

## Context

Administrative and host-management endpoints are currently exposed without authentication. This is a critical security gap.

## Decision

Protect `/api/hosts/*` and `/api/admin/*` with JWT authentication and role-based authorization (`operator`, `admin`). Keep health endpoints public.

## Consequences

- Positive: Prevents unauthorized command/control actions.
- Positive: Supports least-privilege access boundaries.
- Negative: Requires token management and client updates.
