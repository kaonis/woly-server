# Woly-Server Production Deployment Guide

This guide is the production baseline for deploying:

- `apps/cnc` (C&C backend)
- `apps/node-agent` (one or more node agents, per LAN/site)

It consolidates deployment topology, secure defaults, secrets strategy, TLS/proxy expectations, backup/restore, and rollout/rollback operations.

## 1. Recommended Topology

Use a hub-and-spoke model:

- Internet-facing/API tier:
  - Reverse proxy with TLS termination (Nginx, Traefik, or managed LB).
  - `cnc` service behind proxy.
  - PostgreSQL for C&C state (nodes, hosts, command history).
- LAN tier (per site):
  - `node-agent` running close to target devices.
  - Prefer host networking for ARP/WoL behavior in containerized setups.
  - Outbound connection from node agent to C&C WebSocket endpoint.

High-level flow:

1. Mobile app calls C&C REST API.
2. C&C routes commands to the target node agent over WebSocket.
3. Node agent performs LAN actions (scan/WoL) and reports results back.

## 2. Baseline Docker Compose Deployment

Use the existing compose files as baseline templates:

- `apps/cnc/docker-compose.yml`
- `apps/node-agent/docker-compose.yml`

Recommended production pattern:

1. Deploy C&C and PostgreSQL in a protected network segment.
2. Deploy each node agent in its own LAN/site environment.
3. Expose C&C only through TLS reverse proxy.
4. Keep node agents non-public whenever possible (private network/VPN).

## 3. Secrets and Environment Strategy

Do not commit production secrets to git. Inject through secret manager, orchestrator secrets, or encrypted env files.

Minimum required secrets/config:

- C&C:
  - `NODE_AUTH_TOKENS`
  - `OPERATOR_TOKENS`
  - `ADMIN_TOKENS` (if admin JWT issuance is enabled)
  - `JWT_SECRET`
  - `WS_SESSION_TOKEN_SECRETS`
  - `DATABASE_URL` (PostgreSQL in production)
- Node agent:
  - `NODE_MODE=agent`
  - `CNC_URL` (prefer `wss://...` in production)
  - `NODE_ID`
  - `NODE_LOCATION`
  - `NODE_AUTH_TOKEN`
  - optional tunnel mode:
    - `TUNNEL_MODE=cloudflare`
    - `CLOUDFLARE_TUNNEL_URL=https://...`
    - `CLOUDFLARE_TUNNEL_TOKEN=...`
  - optional hardening: `NODE_API_KEY`

Rotation guidance:

1. Rotate JWT and WS session-token secrets using overlap windows (old+new) before removing old.
2. Rotate node/operator/admin bootstrap tokens on a defined cadence.
3. Validate reconnect/auth behavior after each rotation.

Related runbook:

- `apps/cnc/docs/runbooks/ws-session-token-rotation.md`

### 3.1 Cloudflare Tunnel Mode (Zero Port-Forwarding)

Use this for remote node-agent access without router port-forwarding:

1. Deploy `cloudflared` near the node-agent.
2. Route the tunnel hostname to node-agent (`http://localhost:8082`).
3. Set:
   - `TUNNEL_MODE=cloudflare`
   - `CLOUDFLARE_TUNNEL_URL=https://<tunnel-hostname>`
   - `CLOUDFLARE_TUNNEL_TOKEN=<token>`
4. Keep `NODE_AUTH_TOKEN` synchronized with C&C `NODE_AUTH_TOKENS`.
5. Validate in C&C:
   - node registration includes `publicUrl`
   - command routing succeeds via tunnel endpoint
   - if tunnel is unavailable, command routing falls back to direct WebSocket transport.

## 4. Production Security Defaults

Apply these defaults before go-live:

1. TLS and proxy:
   - Terminate TLS at trusted proxy/load balancer.
   - Enforce HTTPS externally.
   - Set `WS_REQUIRE_TLS=true` in C&C production environments.
2. Authentication and auth transport:
   - Keep `WS_ALLOW_QUERY_TOKEN_AUTH=false` in production.
   - Use strong, unique token material.
   - Restrict token distribution by role/use.
3. Network exposure:
   - C&C reachable only via required ports (typically 443 from proxy, DB internal only).
   - Node agent inbound access restricted to trusted management paths.
4. Browser/API policy:
   - Set explicit `CORS_ORIGINS` (no wildcard in production).
5. Logging and observability:
   - Use centralized log collection.
   - Avoid logging secrets/tokens.
   - Monitor health and command timeout/error rates.
   - Use `docs/COMMAND_OUTCOME_METRICS.md` for terminal-state triage workflow.
6. Runtime hardening:
   - Run as non-root where possible.
   - Keep dependencies updated and pinned to reviewed versions.

## 5. Backup and Restore Basics

### C&C PostgreSQL

Backup:

```bash
pg_dump --format=custom --file woly-cnc-$(date +%F-%H%M).dump "$DATABASE_URL"
```

Restore:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" woly-cnc-YYYY-MM-DD-HHMM.dump
```

### Node-Agent SQLite

Backup:

```bash
cp /path/to/node-agent/db/woly.db /path/to/backups/woly-node-$(date +%F-%H%M).db
```

Restore:

```bash
cp /path/to/backups/woly-node-YYYY-MM-DD-HHMM.db /path/to/node-agent/db/woly.db
```

Operational notes:

1. Test restore procedures in staging on a schedule.
2. Version backups with timestamp and environment labels.
3. Keep retention policy explicit (for example 7/30/90 day tiers).

## 6. Rollout Checklist

Use this sequence for production deploys:

1. Pre-deploy:
   - Confirm secrets are present and rotated as needed.
   - Run local gate: `npm run validate:standard`
   - Run smoke gate: `npm run test:e2e:smoke`
   - Confirm DB migration plan and backup created.
2. Deploy C&C:
   - Apply migrations.
   - Deploy C&C with rolling strategy.
   - Validate `/health` and `/api/health`.
3. Deploy node agents (staged/canary):
   - Canary subset first.
   - Verify WebSocket registration and heartbeat stability.
   - Verify host propagation and wake command routing.
4. Full rollout:
   - Expand to remaining nodes/sites.
   - Monitor errors, timeouts, and reconnection rates.

## 7. Rollback Checklist

Rollback immediately if any of the following occurs:

- Persistent auth failures (node reconnect loops, widespread 401/403).
- Command routing failures/timeouts above acceptable threshold.
- Data integrity regressions after migration/deploy.

Rollback steps:

1. Freeze further rollout.
2. Re-deploy last known-good C&C and/or node-agent artifacts.
3. Restore DB from backup only if required for data consistency.
4. Verify node reconnection, host sync, and wake routing path.
5. Document incident timeline, root cause, and corrective actions.

## 8. Post-Deploy Verification

Run these checks after each production rollout:

1. C&C health:
   - `GET /health`
   - `GET /api/health`
2. Node health:
   - `GET /api/nodes`
   - `GET /api/nodes/:id/health`
3. Host aggregation:
   - `GET /api/hosts`
4. Command path:
   - Trigger controlled wake command to test host.
5. Repo smoke suite:
   - `npm run test:e2e:smoke`
6. Command outcome observability:
   - `GET /api/metrics` includes `woly_cnc_command_outcomes_total`
   - Review per-type terminal states using `docs/COMMAND_OUTCOME_METRICS.md`

If any check fails, pause rollout and execute rollback checklist.
