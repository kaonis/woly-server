# Node-Agent Runbook: Protocol Validation and Schema Failures

Use this runbook when command delivery succeeds at transport level but payloads are rejected by schema validation.

## Symptoms

- Node logs contain `Protocol validation failed`.
- `GET /health` telemetry shows rising:
  - `telemetry.protocol.inboundValidationFailures`
  - `telemetry.protocol.outboundValidationFailures`
  - `telemetry.protocol.unsupported`
  - `telemetry.protocol.errors`
- Commands remain queued/retried on C&C with missing successful results.

## Initial Triage

1. Capture a health snapshot from the affected node.
2. Identify failure domain:
   - Inbound failures: C&C -> node command contract mismatch.
   - Outbound failures: node -> C&C event/result contract mismatch.
   - Unsupported protocol: version negotiation mismatch on registration.
3. Correlate with deployed versions (`build.version` and `build.protocolVersion`).

## Checks

1. Confirm both services share compatible `@kaonis/woly-protocol` version.
2. Review latest deploy/merge window for protocol-impacting changes.
3. For unsupported protocol failures:
   - Compare node reported `protocolVersion` against C&C supported set.
4. For schema validation failures:
   - Inspect redacted `rawData` and `validationIssues` from logs.
   - Identify missing/renamed/typed fields.

## Remediation

1. Compatibility mismatch:
   - Roll node-agent and C&C to last known compatible pair from compatibility docs.
2. Outbound schema regressions:
   - Hotfix node payload generation and redeploy canary first.
3. Inbound schema regressions:
   - Hotfix C&C command emission or route around problematic command type.
4. Unsupported protocol:
   - Stop rollout of incompatible version.
   - Redeploy previous compatible artifact.

## Verification

1. `telemetry.protocol.*` counters stop increasing rapidly after fix.
2. New commands complete with expected `command-result` events.
3. Canary nodes remain stable for at least 30 minutes before widening rollout.

## Escalation

Escalate to release owner if contract mismatch spans both repos or requires coordinated rollback.
