# Command Outcome Metrics

This guide documents command outcome telemetry exposed by C&C and a fast triage workflow for terminal-state spikes.

## Endpoints

- `GET /api/health` includes runtime metrics in the JSON payload.
- `GET /api/metrics` exposes Prometheus text format metrics.

## Metric Glossary

Primary terminal outcome metric:

- `woly_cnc_command_outcomes_total{type,state}`
  - `type`: `wake`, `scan`, `update-host`, `delete-host` (or `unknown` only when attribution is unavailable).
  - `state`: `acknowledged`, `failed`, `timed_out`.
  - Value: cumulative process-local count for the `(type, state)` label pair.

Related command metrics:

- `woly_cnc_commands_by_type{type,state}`
  - Includes `dispatched` plus terminal states.
- `woly_cnc_command_timeout_rate`
  - Fraction of completed commands that ended in `timed_out`.
- `woly_cnc_command_avg_latency_ms`
  - Average command latency in milliseconds.
- `woly_cnc_command_last_latency_ms`
  - Last observed command latency in milliseconds.

## Triage Workflow

Use this sequence when failures or timeouts increase:

1. Confirm scope:
   - Compare `woly_cnc_command_outcomes_total` for `state=\"failed\"` and `state=\"timed_out\"`.
   - Identify which `type` label has the largest increase.
2. Check dispatch vs terminal behavior:
   - Compare `woly_cnc_commands_by_type{state=\"dispatched\"}` to terminal outcome counts for the same `type`.
   - A widening gap usually indicates in-flight backlog or delayed results.
3. Check timeout pressure:
   - Review `woly_cnc_command_timeout_rate` trend.
   - If timeout rate rises with stable dispatch volume, investigate node reachability and command timeout settings.
4. Correlate with control-plane health:
   - Check `GET /api/nodes` and `GET /api/nodes/:id/health` for offline/stale nodes.
   - Check recent command outcomes in admin APIs (`GET /api/admin/commands`).
5. Decide immediate action:
   - If isolated to one site/node: canary pause and targeted node-agent diagnostics.
   - If broad across command types: pause rollout and execute rollback checklist in `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`.

## Quick Checks

Minimal sanity checks after deploy:

1. `GET /api/metrics` returns `woly_cnc_command_outcomes_total`.
2. At least one tracked `type` label is present for each terminal `state`.
3. `state=\"unknown\"` remains absent or near-zero under normal operation.
