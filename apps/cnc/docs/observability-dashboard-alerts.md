# C&C Observability Dashboard and Alerts

This document defines the baseline Phase 6 dashboard and alert thresholds for the WoLy C&C backend.

## Metrics Sources

- `GET /health` -> `metrics`
- `GET /api/admin/stats` -> `observability`

Core metrics:
- connected node count (`nodes.connected`, `nodes.peakConnected`)
- command latency (`commands.avgLatencyMs`, `commands.byType.*.avgLatencyMs`)
- timeout rate (`commands.timeoutRate`)
- invalid payload rate (`protocol.invalidPayloadRatePerMinute`)

## Dashboard Panels

1. Node Connectivity
- Current connected nodes
- Peak connected nodes since process start

2. Command Reliability
- Dispatched / acknowledged / failed / timed out counts
- Timeout rate trend

3. Command Latency
- Global average latency
- Per-command-type average latency (wake/scan/update-host/delete-host)

4. Protocol Health
- Invalid payload total
- Invalid payload rate per minute
- Top failing protocol keys (`inbound:<type>`, `outbound:<type>`)

5. Correlation Traceability
- Recent resolved correlations (`commandId` <-> `correlationId`)
- Active correlated command count

## Initial Alert Thresholds

- `commands.timeoutRate > 0.10` for 5 minutes
- `protocol.invalidPayloadRatePerMinute > 3` for 5 minutes
- `nodes.connected` drops below expected baseline for 10 minutes
- `commands.avgLatencyMs` above SLO baseline for 10 minutes

## Response Workflow

1. Confirm signal in `/api/admin/stats` and `/health`.
2. Determine failure domain:
- auth/protocol: invalid payload spikes
- network/node stability: node count drop or flapping
- command pipeline: latency or timeout rate increase
3. Follow runbook:
- `docs/runbooks/node-flapping.md`
- `docs/runbooks/command-backlog.md`
- `docs/runbooks/auth-failures.md`
