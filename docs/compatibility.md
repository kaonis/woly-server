# Compatibility Matrix (Node <-> C&C)

Date: 2026-02-07

| Node Version | C&C Version | Protocol Version | WS Auth Mode | Notes                                                    |
| ------------ | ----------- | ---------------- | ------------ | -------------------------------------------------------- |
| 0.0.1        | 1.0.0       | v1 (legacy)      | query token  | Current baseline; migrate to session token + header auth |

## Rules

1. Update this table on every release that changes auth or protocol behavior.
2. Keep at least one backward-compatible release window during auth/protocol transitions.
3. Document deprecation date before disabling legacy modes.
