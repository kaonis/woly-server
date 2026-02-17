# Compatibility Matrix (C&C <-> Node)

Date: 2026-02-17

| C&C Version | Node Version | Protocol Version | WS Auth Mode | Notes |
|---|---|---|---|---|
| 1.0.0 | 0.0.1 | 1.1.1 (current) | query token | Current baseline for new deployments; negotiated at registration |
| 1.0.0 | 0.0.1 | 1.0.0 (legacy) | query token | Transitional compatibility while older nodes are still deployed |

## Rules

1. Update this matrix on every release that affects protocol or auth.
2. Announce deprecation for legacy auth at least one release in advance.
3. Require explicit rollback notes for any non-backward-compatible change.
