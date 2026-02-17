# Compatibility Matrix (Node <-> C&C)

Date: 2026-02-17

| Node Version | C&C Version | Protocol Version | WS Auth Mode | Notes                                                    |
| ------------ | ----------- | ---------------- | ------------ | -------------------------------------------------------- |
| 0.0.1        | 1.0.0       | 1.1.1 (current)  | query token  | Current baseline for new deployments; negotiated at registration |
| 0.0.1        | 1.0.0       | 1.0.0 (legacy)   | query token  | Transitional compatibility while older C&C/node versions coexist |

## Rules

1. Update this table on every release that changes auth or protocol behavior.
2. Keep at least one backward-compatible release window during auth/protocol transitions.
3. Document deprecation date before disabling legacy modes.
