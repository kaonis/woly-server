# WoLy Server Monorepo - AI Coding Agent Instructions

## Project Overview

Monorepo for the WoLy distributed Wake-on-LAN system. Contains two backend services and a shared protocol package, managed with npm workspaces and Turborepo.

| Workspace           | Description                                                       | Port | Database                |
| ------------------- | ----------------------------------------------------------------- | ---- | ----------------------- |
| `apps/node-agent`   | Per-LAN WoL agent — ARP scanning, host discovery, magic packets   | 8082 | SQLite (better-sqlite3) |
| `apps/cnc`          | C&C aggregator — multi-node management, command routing, JWT auth | 8080 | PostgreSQL or SQLite    |
| `packages/protocol` | Shared types & Zod schemas (`@kaonis/woly-protocol`)              | —    | —                       |

**Stack:** Node.js 24, TypeScript 5.9 (strict), Express 5, Jest 30, Zod, Turborepo.

## Mandatory Workflow Gates

- Start work from a fresh worktree based on `origin/master` before any modifications or branch creation.
- Complete a final review pass for every change before merge (peer review preferred; self-review required at minimum).
- Address all review comments/threads with follow-up commits or explicit rationale, then re-review the updated diff.

## Workspace Layout

```
woly-server/
├── apps/
│   ├── node-agent/src/          # Express app, controllers, services, middleware
│   └── cnc/src/                 # Express app, controllers, services, websocket
├── packages/
│   └── protocol/src/index.ts    # All shared types + Zod schemas
├── turbo.json                   # Build ordering: protocol → apps
├── tsconfig.base.json           # Shared strict TS config
└── CLAUDE.md                    # Claude Code agent instructions
```

## Commands

```bash
# Always run from monorepo root
npm install                      # Install all workspaces
npm run build                    # Build all (protocol first via turbo)
npm run test                     # Test all
npm run test:ci                  # CI mode with coverage
npm run typecheck                # Type-check all
npm run lint                     # Lint all
npm run dev:node-agent           # Dev mode with hot reload
npm run dev:cnc                  # Dev mode with hot reload

# Per-workspace
npm run test -w apps/node-agent
npm run build -w packages/protocol
```

## Architecture: Dual Operating Modes (Node Agent)

### Standalone Mode (Default)

```
Mobile App (REST) → Node Agent → Local LAN (ARP/WoL)
```

### Agent Mode

```
C&C Backend (WebSocket) ↔ Node Agent → Local LAN (ARP/WoL)
```

Set `NODE_MODE=agent` in `apps/node-agent/.env` to connect to C&C. Required env vars: `CNC_URL`, `NODE_ID`, `NODE_LOCATION`, `NODE_AUTH_TOKEN`.

## Key Concepts

### Host Status: Dual-Field System

- **`status`** (awake/asleep) — Primary indicator, based on ARP response. Reliable.
- **`pingResponsive`** (1/0/null) — Secondary diagnostic, ICMP ping. Many devices block ping, so `0` does NOT mean asleep.

Always use `status` for determining if a device is awake.

### Protocol Package

`@kaonis/woly-protocol` defines the WebSocket contract:

- `NodeMessage` — discriminated union for node → C&C messages (register, heartbeat, host events, command results)
- `CncCommand` — discriminated union for C&C → node commands (wake, scan, update-host, delete-host, ping)
- Zod schemas for runtime validation: `outboundNodeMessageSchema`, `inboundCncCommandSchema`

Both apps consume it via workspace link (`"@kaonis/woly-protocol": "*"`). Protocol must build before apps (handled by turbo.json `dependsOn: ["^build"]`).

### Service Initialization (Node Agent)

Order matters in `apps/node-agent/src/app.ts`:

```
1. hostDb = new HostDatabase() → await hostDb.initialize()
2. hostsController.setHostDatabase(hostDb)
3. [Agent mode only] agentService.setHostDatabase(hostDb) → await agentService.start()
4. hostDb.startPeriodicSync()
```

AgentService must be connected before scanning starts so it can forward host events to C&C.

## Testing

**Node Agent:** 240+ tests, 50% coverage thresholds. Unit tests in `src/**/__tests__/`, integration tests with supertest.

**C&C:** 90+ tests. Same pattern.

Both apps use `tsconfig.test.json` (relaxes `noUnusedLocals`/`noUnusedParameters` for test files) via ts-jest transform config.

**Test preflight:** Both apps run `scripts/test-preflight.js` before Jest to verify runtime prerequisites.

```bash
# Rebuild better-sqlite3 if switching Node versions
npm rebuild better-sqlite3 --build-from-source
```

## API Patterns

### Node Agent API (port 8082)

```
GET  /health                     Health check
GET  /hosts                      All hosts + scan status
GET  /hosts/:name                Single host
POST /hosts                      Add host manually
POST /hosts/wakeup/:name         Wake-on-LAN
POST /hosts/scan                 Trigger network scan
GET  /hosts/mac-vendor/:mac      MAC vendor lookup
GET  /api-docs                   Swagger UI
```

### C&C API (port 8080)

```
GET    /health                   Health check
POST   /api/auth/token           Exchange operator token for JWT
GET    /api/nodes                List nodes
GET    /api/nodes/:id            Node details
GET    /api/nodes/:id/health     Node health
GET    /api/hosts                All hosts (JWT required)
GET    /api/hosts/:fqn           Single host
POST   /api/hosts/wakeup/:fqn    Wake-on-LAN via C&C
PUT    /api/hosts/:fqn           Update host
DELETE /api/hosts/:fqn           Delete host
DELETE /api/admin/nodes/:id      Deregister node (admin)
GET    /api/admin/stats          System stats (admin)
ws://  /ws/node                  WebSocket for node connections
```

## Conventions

- TypeScript strict mode everywhere (extends `tsconfig.base.json`)
- Express 5 — `req.params` values are `string | string[]`, cast with `as string`
- Unused params prefixed with `_` (e.g., `_req`, `_res`)
- Structured Winston logging with object context, not string interpolation
- Joi validation (node-agent), Zod validation (protocol/cnc)
- Standardized error responses via `middleware/errorHandler.ts`
- Rate limiting via `express-rate-limit`
- Docker: node-agent requires `--net host` for ARP scanning

## Configuration

Each app has `.env.example` with all available options. Key differences:

| Variable | Node Agent                         | C&C                                        |
| -------- | ---------------------------------- | ------------------------------------------ |
| Port     | `PORT=8082`                        | `PORT=8080`                                |
| Database | `DB_PATH=./db/woly.db` (SQLite)    | `DB_TYPE=sqlite\|postgres`, `DATABASE_URL` |
| Auth     | `NODE_AUTH_TOKEN` (for agent mode) | `NODE_AUTH_TOKENS`, `JWT_SECRET`           |
| Network  | `SCAN_INTERVAL`, `PING_TIMEOUT`    | `NODE_HEARTBEAT_INTERVAL`, `NODE_TIMEOUT`  |

## Docker

Build from monorepo root (Dockerfiles reference root package.json and protocol):

```bash
docker build -f apps/node-agent/Dockerfile -t woly-node-agent .
docker build -f apps/cnc/Dockerfile -t woly-cnc .
```

Node agent requires `--net host` for ARP scanning.
