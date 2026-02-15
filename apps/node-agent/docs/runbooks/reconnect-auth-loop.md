# Node-Agent Runbook: Reconnect and Auth Failure Loops

Use this runbook when a node repeatedly disconnects from C&C or cannot re-authenticate.

## Symptoms

- Frequent reconnect attempts in node-agent logs.
- Health endpoint telemetry shows rising:
  - `telemetry.reconnect.scheduled`
  - `telemetry.reconnect.failed`
  - `telemetry.auth.expired` / `telemetry.auth.revoked` / `telemetry.auth.unavailable`
- C&C marks node offline shortly after heartbeat timeout.

## Initial Triage

1. Query `GET /health` on the affected node.
2. Confirm current mode/auth path in `agent` payload (`authMode` is `static-token` or `session-token`).
3. Compare telemetry deltas over 5 minutes:
   - High `auth.expired`: token lifetime/clock skew issue.
   - High `auth.revoked`: credential invalidation or secret mismatch.
   - High `auth.unavailable`: session token service outage/network path issue.
   - High `reconnect.failed`: retry budget exhausted.

## Checks

1. Verify node env values:
   - `NODE_AUTH_TOKEN`
   - `NODE_SESSION_TOKEN_URL` (if used)
   - `CNC_URL`
2. Validate transport and endpoint reachability from the node host:
   - DNS resolve C&C host.
   - TLS/WSS reachability in production.
3. If `authMode=session-token`:
   - Validate token endpoint availability and status codes.
   - Verify shared signing secret/issuer/audience parity with C&C.
4. Check host clock synchronization (NTP drift can invalidate short-lived tokens).

## Remediation

1. Expired token loops:
   - Renew bootstrap token and restart node-agent.
   - Reduce clock drift and confirm token TTL + refresh buffer are sane.
2. Revoked token loops:
   - Replace revoked credentials.
   - Verify node identity (`NODE_ID`) is expected and authorized.
3. Session token service unavailable:
   - Restore token mint endpoint.
   - Temporarily switch to static token mode only if approved by incident lead.
4. Reconnect exhaustion:
   - Increase `MAX_RECONNECT_ATTEMPTS` only as a temporary mitigation.
   - Fix root cause before widening retry budget.

## Verification

1. `GET /health` shows stable `agent.connected=true`.
2. Telemetry deltas flatten:
   - `reconnect.failed` no longer increments.
   - auth counters stop increasing.
3. C&C node status remains online across at least one heartbeat window.

## Escalation

Escalate to platform/backend on-call if:
- 3+ nodes show the same auth failure pattern.
- Session token endpoint is degraded > 10 minutes.
- Production rollback is required.
