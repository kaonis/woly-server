# Node-Agent Rollout Policy: Canary -> Staged -> Full

This playbook defines the Phase 6 rollout and rollback process for node-agent releases.

## Preconditions

- PR merged to `master` with green CI and CodeQL.
- Compatibility entry updated for node-agent + C&C protocol versions.
- On-call owner assigned for rollout window.

## Phase A: Canary (5-10% nodes)

1. Deploy to a small, representative set (different locations/network profiles).
2. Observe for at least 30 minutes:
   - Node connectivity stability.
   - `GET /health` telemetry trend:
     - reconnect/auth counters should stay low and stable.
     - protocol validation counters should not spike.
     - command latency should stay within expected SLO.
3. Abort canary on severe auth/protocol regressions.

## Phase B: Staged Expansion (25% -> 50%)

1. Increase rollout in one or two steps.
2. Re-check health telemetry and C&C command success rates after each step.
3. Hold progression if failure rate rises or nodes flap offline.

## Phase C: Full Rollout (100%)

1. Complete deployment to all nodes.
2. Continue heightened monitoring for one full business cycle.
3. Close rollout when error rates remain within normal baseline.

## Rollback Criteria

Rollback immediately if any occur:

- Sustained reconnect/auth failures across multiple nodes.
- Unsupported protocol rejections during registration.
- Command-result failure rates materially above baseline.
- Incident commander requests rollback due to customer impact.

## Rollback Procedure

1. Redeploy previous compatible node-agent build.
2. Confirm node reconnect and registration recovery.
3. Validate telemetry counters stabilize.
4. Pause further rollout until root cause is documented and fixed.

## Post-Rollout Notes

Record:
- rollout start/end timestamps,
- canary cohort,
- observed telemetry deltas,
- any rollback events,
- follow-up issues for anomalies.
