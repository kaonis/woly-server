# C&C Runbook: Authentication and Protocol Failure Spikes

Use when invalid payload or auth-related failures increase.

## Signals

- `protocol.invalidPayloadRatePerMinute` spike.
- Frequent registration failures from nodes.
- Increased auth rejection logs during WS upgrade/registration.

## Triage

1. Inspect `protocol.invalidPayloadByKey` for dominant failing message types.
2. Confirm node and C&C protocol versions are compatible.
3. Validate auth secrets, issuer, audience, and token TTL config.

## Mitigation

1. Restore compatible protocol pair (node-agent/C&C) if mismatch exists.
2. Rotate/restore auth secrets if drift or compromise is suspected.
3. Pause rollout and hold at canary cohort while investigating.

## Verification

- Invalid payload rate normalizes.
- Node registration succeeds consistently.
- Command pipeline resumes normal success rate.
