# WoLy C&C Backend

Command & Control backend for distributed WoLy Wake-on-LAN management system. Aggregates data from multiple LAN-based node agents, enabling multi-site host management from a single mobile app.

## Architecture

```
Mobile App → C&C Backend → Multiple Node Agents → LANs
```

The C&C backend provides:
- **Node Management**: Registration, health monitoring, heartbeat tracking
- **Host Aggregation**: Unified view of hosts across all locations
- **Command Routing**: Routes WoL commands to appropriate nodes
- **WebSocket Communication**: Real-time bidirectional messaging with nodes
- **Dual Database Support**: PostgreSQL for production, SQLite for development/VS Code tunnel

## Quick Start

## Contribution Workflow

Use branch + PR flow for all changes. See `DEVELOPMENT_WORKFLOW.md`.

### Prerequisites

- Node.js 20+
- npm 10+
- **PostgreSQL 16+** (optional - SQLite supported)

Use the baseline runtime for consistency:

```bash
nvm use
```

### Installation

```bash
# Install dependencies
npm install --legacy-peer-deps

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings
# Set DB_TYPE, DATABASE_URL, NODE_AUTH_TOKENS, and JWT settings
```

### Database Setup

**Option 1: SQLite (Recommended for Development/VS Code Tunnel)**

```bash
# Configure .env for SQLite
DB_TYPE=sqlite
DATABASE_URL=./db/woly-cnc.db

# Initialize database
npm run init-db

# Start development server
npm run dev
```

**Option 2: Docker Compose (PostgreSQL)**

```bash
# Start PostgreSQL and C&C backend
docker-compose up -d

# Check logs
docker-compose logs -f cnc-backend
```

**Option 3: Manual PostgreSQL Setup**

```bash
# Create PostgreSQL database
createdb woly_cnc

# Configure .env for PostgreSQL
DB_TYPE=postgres
DATABASE_URL=postgresql://woly:password@localhost:5432/woly_cnc

# Run schema
npm run init-db

# Start development server
npm run dev
```

### Upgrading Existing Databases

If you already have a running database and need to upgrade the schema, use the migration scripts:

```bash
# For PostgreSQL
psql -U woly -d woly < migrations/001_add_commands_table.sql

# For SQLite
sqlite3 db/woly-cnc.db < migrations/001_add_commands_table.sqlite.sql
```

See `migrations/README.md` for detailed migration instructions and best practices.

### Development

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start

# Run tests
npm test

# Test with coverage
npm run test:coverage
```

### Test Runtime Notes

- Test commands run a preflight check before Jest.
- If `better-sqlite3` fails to load after changing Node versions, run:

```bash
npm rebuild better-sqlite3 --build-from-source
```

- Node.js v20+ is supported. `.nvmrc` provides a baseline local version.

## API Endpoints

### Public API (for Mobile App)

```
GET    /api/nodes              # List all nodes
GET    /api/nodes/:id          # Get node details
GET    /api/nodes/:id/health   # Check node health
POST   /api/auth/token         # Exchange operator token for JWT (mobile sign-in)
GET    /health                 # Server health check
```

### Protected Host API

Requires `Authorization: Bearer <jwt>` with role `operator` or `admin`.

```
GET    /api/hosts
GET    /api/hosts/:fqn
POST   /api/hosts/wakeup/:fqn
PUT    /api/hosts/:fqn
DELETE /api/hosts/:fqn
```

### Admin API

Requires `Authorization: Bearer <jwt>` with role `admin`.

```
DELETE /api/admin/nodes/:id   # Deregister node
GET    /api/admin/stats        # System statistics
```

### WebSocket Endpoint

```
ws://localhost:8080/ws/node
```

Nodes connect via WebSocket for:
- Registration
- Heartbeat messages
- Host event streaming
- Command reception

Authentication priority:
1. `Authorization: Bearer <token>` header
2. `Sec-WebSocket-Protocol` bearer token (`bearer,<token>` or `bearer.<token>`)
3. Query token (`?token=...`) only when `WS_ALLOW_QUERY_TOKEN_AUTH=true`

## Configuration

Environment variables (`.env`):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `8080` |
| `NODE_ENV` | Environment | `development` |
| `DB_TYPE` | Database type: `postgres` or `sqlite` | `postgres` |
| `DATABASE_URL` | Database connection (PostgreSQL URL or SQLite path) | Required |
| `NODE_AUTH_TOKENS` | Comma-separated auth tokens | Required |
| `OPERATOR_TOKENS` | Comma-separated operator tokens for `/api/auth/token` | Defaults to `NODE_AUTH_TOKENS` |
| `ADMIN_TOKENS` | Comma-separated admin tokens (optional) | `''` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_ISSUER` | Expected JWT issuer claim (`iss`) | `woly-cnc` |
| `JWT_AUDIENCE` | Expected JWT audience claim (`aud`) | `woly-api` |
| `JWT_TTL_SECONDS` | Issued JWT lifetime (seconds) | `3600` |
| `WS_REQUIRE_TLS` | Require TLS for node WebSocket upgrades | `true` in production, else `false` |
| `WS_ALLOW_QUERY_TOKEN_AUTH` | Allow legacy query token auth (`?token=`) | `false` in production, else `true` |
| `NODE_HEARTBEAT_INTERVAL` | Expected heartbeat interval (ms) | `30000` |
| `NODE_TIMEOUT` | Node offline threshold (ms) | `90000` |
| `LOG_LEVEL` | Logging level | `info` |

## WebSocket Protocol

### Node → C&C Messages

```typescript
// Registration
{ type: 'register', data: { nodeId, name, location, authToken, metadata } }

// Heartbeat
{ type: 'heartbeat', data: { nodeId, timestamp } }

// Host events (Phase 3)
{ type: 'host-discovered', data: { nodeId, ...host } }
{ type: 'host-updated', data: { nodeId, ...host } }
{ type: 'host-removed', data: { nodeId, name } }
{ type: 'scan-complete', data: { nodeId, hostCount } }
```

### C&C → Node Commands (Phase 4)

```typescript
// Wake-up command
{ type: 'wake', commandId, data: { hostName, mac } }

// Scan command
{ type: 'scan', commandId, data: { immediate } }

// Host management
{ type: 'update-host', commandId, data: { ...host } }
{ type: 'delete-host', commandId, data: { name } }
```

## Project Structure

```
src/
├── server.ts               # Main Express server
├── types.ts                # TypeScript type definitions
├── config/
│   └── index.ts           # Configuration management
├── database/
│   ├── connection.ts      # PostgreSQL connection
│   └── schema.sql         # Database schema
├── models/
│   └── Node.ts            # Node data model
├── services/
│   └── nodeManager.ts     # Node lifecycle management
├── controllers/
│   ├── nodes.ts           # Node API endpoints
│   └── admin.ts           # Admin API endpoints
├── routes/
│   └── index.ts           # Route configuration
├── websocket/
│   └── server.ts          # WebSocket server
├── middleware/
│   └── errorHandler.ts    # Error handling
└── utils/
    └── logger.ts          # Winston logger
```

## Testing Node Connection

```bash
# Start C&C backend
npm run dev

# In another terminal, test registration with curl
curl -X POST http://localhost:8080/api/nodes/register \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "test-node",
    "name": "Test Node",
    "location": "Development",
    "authToken": "dev-token-home",
    "metadata": {
      "version": "1.0.0",
      "platform": "linux",
      "networkInfo": {
        "subnet": "192.168.1.0/24",
        "gateway": "192.168.1.1"
      }
    }
  }'

# Check nodes
curl http://localhost:8080/api/nodes

# Check health
curl http://localhost:8080/api/nodes/test-node/health
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

## Phase 1 Deliverables ✅

- [x] Project setup with TypeScript + Express
- [x] PostgreSQL database with schema
- [x] Node registration endpoint
- [x] Node authentication via tokens
- [x] WebSocket server for node connections
- [x] Heartbeat mechanism
- [x] Node status tracking (online/offline)
- [x] Admin API endpoints
- [x] Health check endpoints
- [x] Docker Compose setup
- [x] Logging infrastructure

## Next Steps (Phase 2)

- [ ] Modify woly-backend to add agent mode
- [ ] Implement C&C client in node agent
- [ ] Bidirectional command execution
- [ ] Test with 2 nodes connected

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Or for manual setup
pg_isready

# Verify DATABASE_URL in .env
```

### Node Won't Connect

1. Check auth token matches `NODE_AUTH_TOKENS` in C&C `.env`
2. Verify node token is provided via `Authorization` header or `Sec-WebSocket-Protocol`
3. If using legacy query tokens, ensure `WS_ALLOW_QUERY_TOKEN_AUTH=true`
3. Check C&C backend logs for connection attempts
4. Ensure no firewall blocking port 8080

### Node Marked Offline

- Node must send heartbeat every 30s
- Node marked offline after 90s of missed heartbeats
- Check node agent logs for connection issues
- Verify network connectivity between node and C&C

## Documentation

- [Architecture Specification](../woly/docs/DISTRIBUTED_ARCHITECTURE_SPEC.md)
- [Implementation Roadmap](../woly/docs/DISTRIBUTED_IMPLEMENTATION_ROADMAP.md)

## License

MIT
