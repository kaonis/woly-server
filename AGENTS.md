# AGENTS

## CNC Sync Guardrails

For CNC mode features, contributors must follow the policy in `docs/CNC_SYNC_POLICY.md`.

Required before merge:
- 3-part delivery chain is explicit:
  1. protocol contract
  2. backend endpoint/command
  3. frontend integration
- Linked issues exist in both repos:
  - `kaonis/woly-server`
  - `kaonis/woly`
- Contract gates are validated locally and in CI:
  - mobile compatibility smoke checks
  - protocol consumer typecheck fixture

Do not de-scope standalone probe fallback until CNC parity work is complete and verified.
