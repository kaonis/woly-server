# WoLy Server Monorepo

## Overview

Distributed Wake-on-LAN management system. Two backend apps + one shared protocol package.

## Workspace layout

```
apps/node-agent/   — Per-LAN WoL agent (Express 5, SQLite, port 8082)
apps/cnc/          — C&C aggregator backend (Express 5, PostgreSQL+SQLite, port 8080)
packages/protocol/ — Shared types & Zod schemas (@kaonis/woly-protocol)
```

## Commands

```bash
npm install                  # Install all workspaces (run from root)
npm run build                # Build all (protocol first, then apps)
npm run test                 # Test all
npm run test:ci              # CI mode tests
npm run typecheck            # Type-check all
npm run lint                 # Lint all
npm run dev:node-agent       # Start node-agent in dev mode
npm run dev:cnc              # Start C&C backend in dev mode
```

## Per-app commands

```bash
npm run test -w apps/node-agent
npm run test -w apps/cnc
npm run build -w packages/protocol
```

## Key conventions

- TypeScript strict mode everywhere
- Shared types live in `packages/protocol/src/index.ts`
- Apps consume protocol via workspace link (`@kaonis/woly-protocol`)
- Both apps use Express 5 and Jest 30. Node-agent uses Joi for HTTP validation; C&C and protocol use Zod.
- Each app has its own `.env` (not committed) — see `.env.example` in each app
- Turborepo handles build ordering (protocol must build before apps)
