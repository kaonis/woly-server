# Compatibility Matrix (C&C <-> Node)

Date: 2026-02-07

| C&C Version | Node Version | Protocol Version | WS Auth Mode | Notes |
|---|---|---|---|---|
| 1.0.0 | 0.0.1 | v1 (legacy) | query token | Current baseline; migrate to session token + header auth |

## Rules

1. Update this matrix on every release that affects protocol or auth.
2. Announce deprecation for legacy auth at least one release in advance.
3. Require explicit rollback notes for any non-backward-compatible change.
