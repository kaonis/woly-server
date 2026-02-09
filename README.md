# WoLy Server

Distributed Wake-on-LAN management system. A monorepo containing two backend services and a shared protocol package that together enable waking up devices across multiple LANs from a single mobile app.

## Architecture

```
┌──────────┐       REST/JWT        ┌───────────┐      WebSocket       ┌──────────────┐
│ Mobile   │ ────────────────────▶ │    C&C    │ ◀──────────────────▶ │  Node Agent  │
│ App      │                       │  Backend  │                      │  (per LAN)   │
│ (Expo)   │                       │  :8080    │                      │  :8082       │
└──────────┘                       └───────────┘                      └──────┬───────┘
                                         │                                   │
                                    PostgreSQL                           ARP / WoL
                                     or SQLite                         Magic Packets
                                                                             │
                                                                       ┌─────▼─────┐
                                                                       │ Local LAN │
                                                                       │  Devices  │
                                                                       └───────────┘
```

**Node Agent** discovers hosts on its local network via ARP scanning and can wake them with Wake-on-LAN magic packets. It operates standalone or connects to the C&C backend as an agent.

**C&C Backend** aggregates multiple node agents, providing a unified API for the mobile app to manage hosts across all locations.

**Protocol Package** defines the shared TypeScript types and Zod validation schemas used for WebSocket communication between the two services.

## Workspace Layout

```
woly-server/
├── apps/
│   ├── node-agent/          Per-LAN WoL agent (Express 5, SQLite, :8082)
│   └── cnc/                 C&C aggregator (Express 5, PostgreSQL/SQLite, :8080)
├── packages/
│   └── protocol/            Shared types & Zod schemas (@kaonis/woly-protocol)
├── turbo.json               Turborepo task orchestration
├── tsconfig.base.json       Shared TypeScript config
└── CLAUDE.md                AI agent instructions
```

## Prerequisites

- **Node.js 24+** (see `.nvmrc`)
- **npm 10+**
- PostgreSQL 16+ (optional, cnc supports SQLite for dev)

```bash
nvm use
```

## Getting Started

```bash
# Install all workspaces
npm install

# Copy environment files
cp apps/node-agent/.env.example apps/node-agent/.env
cp apps/cnc/.env.example apps/cnc/.env

# Build everything (protocol first, then apps)
npm run build

# Run tests
npm run test
```

### Development

```bash
# Start node agent with hot reload
npm run dev:node-agent

# Start C&C backend with hot reload
npm run dev:cnc

# Run a single workspace command
npm run test -w apps/node-agent
npm run build -w packages/protocol
```

## Commands

| Command | Description |
|---|---|
| `npm run build` | Build all workspaces (protocol → apps) |
| `npm run test` | Run all tests |
| `npm run test:ci` | CI mode with coverage |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run dev:node-agent` | Start node agent in dev mode |
| `npm run dev:cnc` | Start C&C backend in dev mode |
| `npm run format` | Format all files with Prettier |

## Node Agent

The node agent is deployed on each LAN where you want to discover and wake devices. Key features:

- **ARP network discovery** with DNS/NetBIOS hostname resolution
- **Wake-on-LAN** magic packet sending
- **Dual status tracking** — ARP-based `status` (reliable) + ICMP `pingResponsive` (diagnostic)
- **MAC vendor lookup** with LRU caching
- **Standalone or agent mode** — works independently or connects to C&C
- **Swagger API docs** at `/api-docs`

Runs on port 8082 by default. See [apps/node-agent/README.md](apps/node-agent/README.md) for full API reference and configuration.

## C&C Backend

The command-and-control backend aggregates multiple node agents into a single API surface. Key features:

- **Node management** — registration, health monitoring, heartbeat tracking
- **Host aggregation** — unified view across all locations
- **Command routing** — WoL, scan, update, and delete commands forwarded to the right node
- **WebSocket protocol** — real-time bidirectional messaging with nodes
- **JWT authentication** — role-based access (operator, admin)
- **Dual database** — PostgreSQL for production, SQLite for development

Runs on port 8080 by default. See [apps/cnc/README.md](apps/cnc/README.md) for full API reference and configuration.

## Protocol Package

`@kaonis/woly-protocol` defines the contract between node agents and the C&C backend:

- **TypeScript types** — `NodeMessage`, `CncCommand`, `HostPayload`, `NodeRegistration`
- **Zod schemas** — `outboundNodeMessageSchema`, `inboundCncCommandSchema` for runtime validation
- **Protocol versioning** — `PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`

Both apps consume it via npm workspace link. It's also published to npm for the mobile app. See [packages/protocol/README.md](packages/protocol/README.md).

## Docker

Each app has its own Dockerfile optimized for the monorepo structure. Build from the repo root:

```bash
# Node agent
docker build -f apps/node-agent/Dockerfile -t woly-node-agent .

# C&C backend
docker build -f apps/cnc/Dockerfile -t woly-cnc .
```

**Important:** The node agent requires `--net host` for ARP scanning to work:

```bash
docker run -d --net host \
  -v $(pwd)/db:/app/apps/node-agent/db \
  -e NODE_ENV=production \
  woly-node-agent
```

## CI

GitHub Actions runs on every push and PR to `master`:

1. Install dependencies (`npm ci`)
2. Build, lint, typecheck, and test all workspaces via Turborepo
3. Upload coverage reports as artifacts

See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9 |
| Framework | Express 5 |
| Databases | SQLite (better-sqlite3), PostgreSQL |
| Testing | Jest 30, Supertest |
| Validation | Zod, Joi |
| Build | Turborepo, tsc |
| CI | GitHub Actions |

## Related

- [WoLy Mobile App](https://github.com/kaonis/woly) — React Native / Expo client

## License

Apache License 2.0 (see `LICENSE`).
