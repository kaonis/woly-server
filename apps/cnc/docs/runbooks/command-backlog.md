# C&C Runbook: Command Backlog and Timeouts

Use when command latency or timeout rate rises above baseline.

## Signals

- Elevated `commands.timeoutRate`.
- Increasing `commands.active` without matching acknowledgements.
- `commands.avgLatencyMs` sustained above expected threshold.

## Triage

1. Check `/api/admin/stats` observability snapshot.
2. Identify impacted command types from `commands.byType`.
3. Correlate affected commands via `correlationId` and API logs.

## Mitigation

1. Verify target nodes are connected and healthy.
2. Reduce command load temporarily (throttle non-critical operations).
3. Validate command timeout/retry config and recent deploy changes.
4. Roll back if regression introduced by latest release.

## Verification

- Timeout rate returns below alert threshold.
- Command latency trend returns to baseline.
- Backlog (`commands.active`) drains.
