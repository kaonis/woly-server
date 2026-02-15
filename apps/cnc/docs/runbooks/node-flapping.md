# C&C Runbook: Node Flapping

Use when nodes repeatedly transition online/offline in short intervals.

## Signals

- `nodes.connected` oscillates rapidly.
- Hosts for affected nodes frequently flip to unreachable.
- Increased reconnect/auth noise in node-agent telemetry.

## Triage

1. Identify affected node IDs and locations.
2. Compare C&C and node-agent health snapshots.
3. Check token/auth failures and protocol mismatches.

## Mitigation

1. Verify network path and TLS termination between nodes and C&C.
2. Validate token/session configuration parity.
3. Roll back recent incompatible node or C&C deploy if flapping started after rollout.

## Verification

- Node remains connected for at least one heartbeat timeout window.
- Host state transitions stabilize.
