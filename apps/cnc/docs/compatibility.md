# Compatibility Matrix (C&C <-> Node)

Date: 2026-07-04

| C&C Version | Node Version | Protocol Version             | WS Auth Mode | Notes                                                                         |
| ----------- | ------------ | ---------------------------- | ------------ | ----------------------------------------------------------------------------- |
| 1.0.0       | 0.0.1        | 1.6.0 (current)              | query token  | Current baseline for new deployments; negotiated at registration              |
| 1.0.0       | 0.0.1        | 1.5.0 - 1.0.0 (transitional) | query token  | Backward-compatible transitional support while older nodes are still deployed |

The canonical protocol version list and migration notes live in
[`docs/PROTOCOL_COMPATIBILITY.md`](../../../docs/PROTOCOL_COMPATIBILITY.md).

## Rules

1. Update this matrix on every release that affects protocol or auth.
2. Announce deprecation for legacy auth at least one release in advance.
3. Require explicit rollback notes for any non-backward-compatible change.
