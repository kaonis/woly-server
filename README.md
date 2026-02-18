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

## Contribution Workflow (Worktree-First)

Before editing files or creating an implementation branch, start from a fresh worktree based on `origin/master`:

```bash
git fetch origin
git worktree add ../woly-server-<topic> -b codex/<issue>-<topic> origin/master
cd ../woly-server-<topic>
```

Use that worktree for all edits, commits, and PR preparation. This keeps feature work isolated and ensures branch bases are current.
For Codex-created branches, keep the `codex/` prefix; for manually created contributor branches, use your normal branch prefix.

Before merge, run a required review pass for every change (peer review preferred; self-review required at minimum):

```bash
git diff --stat origin/master...HEAD
git diff origin/master...HEAD
gh pr view --comments
```

Address every review comment/thread with follow-up commits or an explicit rationale, then re-run the review pass on the updated diff.

After merge, clean up the temporary worktree:

```bash
git worktree remove ../woly-server-<topic>
```

## Commands

| Command                          | Description                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run build`                  | Build all workspaces (protocol → apps)                                             |
| `npm run test`                   | Run all tests                                                                      |
| `npm run test:ci`                | CI mode with coverage                                                              |
| `npm run test:e2e:smoke`         | Run cross-service C&C <-> node-agent E2E smoke suite                               |
| `npm run validate:standard`      | Run standard repo validation gate (`lint`, `typecheck`, `test:ci`, `build`, smoke) |
| `npm run typecheck`              | Type-check all workspaces                                                          |
| `npm run lint`                   | Lint all workspaces                                                                |
| `npm run dev:node-agent`         | Start node agent in dev mode                                                       |
| `npm run dev:cnc`                | Start C&C backend in dev mode                                                      |
| `npm run format`                 | Format all files with Prettier                                                     |
| `npm run protocol:build`         | Build the protocol package                                                         |
| `npm run protocol:publish`       | Build and publish protocol to npm (latest tag)                                     |
| `npm run protocol:publish:next`  | Build and publish protocol to npm (next tag)                                       |
| `npm run protocol:version:patch` | Bump protocol version (patch)                                                      |
| `npm run protocol:version:minor` | Bump protocol version (minor)                                                      |
| `npm run protocol:version:major` | Bump protocol version (major)                                                      |

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

Upgrade sequencing and compatibility requirements are documented in:

- [docs/compatibility.md](docs/compatibility.md)
- [docs/PROTOCOL_COMPATIBILITY.md](docs/PROTOCOL_COMPATIBILITY.md)

## CNC Sync Policy (Budget Mode)

This repo and the mobile app (`kaonis/woly`) follow a shared CNC sync process:

1. Protocol contract
2. Backend endpoint/command
3. Frontend integration

Policy docs:

- [docs/CNC_SYNC_POLICY.md](docs/CNC_SYNC_POLICY.md)
- [docs/ROADMAP_CNC_SYNC_V1.md](docs/ROADMAP_CNC_SYNC_V1.md)
- [woly/docs/CNC_SYNC_POLICY.md](https://github.com/kaonis/woly/blob/master/docs/CNC_SYNC_POLICY.md)

Each CNC feature PR must link protocol/backend/frontend issues and include local validation evidence.

### Publishing the Protocol Package

To publish `@kaonis/woly-protocol` to npm (for the mobile app):

```bash
# 1. Bump version
npm run protocol:version:patch   # or :minor, :major

# 2. Publish to npm
npm run protocol:publish         # or protocol:publish:next for pre-release
```

See [packages/protocol/README.md](packages/protocol/README.md) for more details.

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

For full production rollout guidance (topology, secrets, TLS, backup/restore, and rollback):

- [docs/PRODUCTION_DEPLOYMENT_GUIDE.md](docs/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [docs/COMMAND_OUTCOME_METRICS.md](docs/COMMAND_OUTCOME_METRICS.md)

## CI

GitHub Actions is budget-scoped:

- Heavy validation workflow (`.github/workflows/ci.yml`) runs manual-only.
- Lightweight policy workflow (`.github/workflows/cnc-sync-policy.yml`) runs automatically on PR updates.

Current validation flow:

1. Lightweight PR policy gate (`.github/workflows/cnc-sync-policy.yml`) for linked issues + checklist compliance
2. Protocol compatibility gate (schema tests, cross-repo contracts, app protocol contracts, C&C schema gate)
3. Standard validation gate via `npm run validate:standard` (`lint`, `typecheck`, `test:ci`, `build`, cross-service smoke)
4. Upload coverage reports as artifacts when `ci.yml` is manually dispatched

Required local gate before PR merge:

- `npm ci`
- `npm run build -w packages/protocol`
- `npm run test -w packages/protocol -- contract.cross-repo`
- `npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts`
- `npm run validate:standard`

Manual operations and rollback criteria are documented in:

- [docs/CI_MANUAL_OPERATIONS.md](docs/CI_MANUAL_OPERATIONS.md)
- [docs/CI_MANUAL_REVIEW_LOG.md](docs/CI_MANUAL_REVIEW_LOG.md)
- [docs/CROSS_SERVICE_E2E_SMOKE.md](docs/CROSS_SERVICE_E2E_SMOKE.md)
- [docs/ESLINT_WARNING_RATCHET.md](docs/ESLINT_WARNING_RATCHET.md)

Main workflow definition:

- [.github/workflows/ci.yml](.github/workflows/ci.yml)

Dependency update review cadence and decision rules are documented in:

- [docs/DEPENDENCY_TRIAGE_WORKFLOW.md](docs/DEPENDENCY_TRIAGE_WORKFLOW.md)
- [docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md](docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md)

**Note:** Branch protection requirements should match the current CI mode (manual-only vs automatic).

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Runtime    | Node.js 24, TypeScript 5.9          |
| Framework  | Express 5                           |
| Databases  | SQLite (better-sqlite3), PostgreSQL |
| Testing    | Jest 30, Supertest                  |
| Validation | Zod, Joi                            |
| Build      | Turborepo, tsc                      |
| CI         | GitHub Actions                      |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

For improvement ideas and feature requests, see [IMPROVEMENTS.md](IMPROVEMENTS.md).

## Related

- [WoLy Mobile App](https://github.com/kaonis/woly) — React Native / Expo client

## License

Apache License 2.0 (see `LICENSE`).
