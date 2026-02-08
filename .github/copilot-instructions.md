# WoLy C&C Backend - AI Coding Agent Instructions

## Project Overview
Command & Control backend for distributed Wake-on-LAN system. Aggregates hosts from multiple LAN-based node agents via WebSocket, routes commands, and provides unified REST API for mobile app. **Supports both PostgreSQL (production) and SQLite (development/VS Code tunnel)** via abstraction layer.

**Recent Major Changes:**
- Authentication: JWT-based API auth with RBAC (operator/admin roles) - see `docs/adr/0001-api-auth-and-rbac.md`
- Protocol: Adopting shared `@kaonis/woly-protocol` package - see `docs/adr/0002-shared-protocol-package.md`
- Commands: Durable command lifecycle with persistence - see `docs/adr/0003-durable-command-lifecycle.md` and `migrations/001_add_commands_table.sql`

## Architecture: Hub-and-Spoke with Dual Database Support

```
Mobile App (REST) → C&C Backend → WebSocket → Multiple Node Agents → LANs
                         ↓
                   PostgreSQL/SQLite
```

**Core Services:**
- `NodeManager` - WebSocket lifecycle, connection tracking, heartbeat monitoring
- `HostAggregator` - Processes host events from nodes, maintains `aggregated_hosts` table with FQN (name@location)
- `CommandRouter` - Routes wake/scan commands to appropriate node via WebSocket, persists commands
- Database abstraction (`src/database/connection.ts`) - Factory pattern dynamically chooses PostgreSQL or SQLite
- **Authentication** - JWT middleware protects `/api/hosts/*` and `/api/admin/*` with role-based access (see ADR-0001)

## Critical Database Pattern: Cross-DB Compatibility

### The Abstraction Layer (Why It Exists)

**Problem:** VS Code tunnel environments can't run Docker, but production needs PostgreSQL. Solution: database abstraction with factory pattern.

**Architecture:**
```typescript
// src/database/connection.ts
interface IDatabase {
  query<T>(sql: string, params: any[]): Promise<T[]>;
  getClient(): Promise<DatabaseClient>;
  close(): Promise<void>;
}

function createDatabase(): IDatabase {
  return config.dbType === 'sqlite'
    ? new SqliteDatabase()
    : new PostgresDatabase();
}

export const db = createDatabase();  // Singleton instance
```

**Key Design Decisions:**
1. **Unified Interface** - Both databases implement `IDatabase`, so service code is identical
2. **Query Translation** - SQLite driver translates PostgreSQL `$1` placeholders to `?` automatically
3. **Connection Pooling** - PostgreSQL uses `pg.Pool` internally, SQLite reuses single connection
4. **RETURNING Workaround** - SQLite doesn't support RETURNING, abstraction fetches inserted rows

### Usage Pattern (ALWAYS Follow This)

**Always use `db.query()`, never direct pool access** - the abstraction layer handles both databases:

```typescript
// ✅ CORRECT - Works with both PostgreSQL and SQLite
import db from '../database/connection';
const result = await db.query('SELECT * FROM nodes WHERE id = $1', [nodeId]);

// ❌ WRONG - PostgreSQL-specific, breaks SQLite
import { Pool } from 'pg';
const pool = new Pool({...});
await pool.query(...);
```

**For Transactions:**
```typescript
// Use getClient() for multi-query transactions
const client = await db.getClient();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO nodes ...');
  await client.query('INSERT INTO aggregated_hosts ...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();  // CRITICAL: Always release
}
```

### Cross-Database SQL Syntax

**Check `config.dbType` for database-specific queries:**
```typescript
private isSqlite = config.dbType === 'sqlite';

// Timestamps
const timestamp = this.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';

// Date arithmetic (intervals)
const cutoff = this.isSqlite
  ? "datetime('now', '-30 seconds')"
  : "NOW() - INTERVAL '30 seconds'";

// Aggregates with filter
const query = this.isSqlite
  ? 'SUM(CASE WHEN status = "awake" THEN 1 ELSE 0 END) as awake'
  : 'COUNT(*) FILTER (WHERE status = "awake") as awake';

// Auto-increment primary keys
const idColumn = this.isSqlite
  ? 'id INTEGER PRIMARY KEY AUTOINCREMENT'
  : 'id SERIAL PRIMARY KEY';
```

**Common Gotchas:**
- SQLite uses `"` for string literals in SQL, PostgreSQL uses `'` (both work, but be consistent)
- SQLite has no native BOOLEAN type - use INTEGER (0/1) and cast in application layer
- SQLite `AUTOINCREMENT` keyword vs PostgreSQL `SERIAL` type
- SQLite doesn't support `RETURNING *` in UPDATE statements - do SELECT after update

See `src/models/Node.ts:45-85` and `src/services/hostAggregator.ts:30-50` for complete examples.

### Why Not Use Pool Directly?

**Short answer:** The abstraction DOES use pooling, just hidden from service layer.

**Long answer:**
- PostgreSQL: `db.query()` → `PostgresDatabase.query()` → `this.pool.query()` (uses pg.Pool internally)
- SQLite: `db.query()` → `SqliteDatabase.query()` → `this.db.prepare().all()` (single connection, but thread-safe)

**Benefits of abstraction:**
1. Services don't need to know which database is active
2. Switching databases is a config change, no code changes
3. Query parameter translation happens automatically ($1 → ?)
4. Connection lifecycle managed centrally
5. Easy to add new database support (just implement IDatabase)

## WebSocket Protocol: Bidirectional Node Communication

**Node → C&C Messages** (`NodeMessage` union type in `src/types.ts`):
```typescript
{ type: 'register', data: { nodeId, name, location, authToken, metadata } }
{ type: 'heartbeat', data: { nodeId, timestamp } }
{ type: 'host-discovered', data: { nodeId, ...host } }
{ type: 'host-updated', data: { nodeId, ...host } }
{ type: 'command-result', data: { nodeId, commandId, success, ... } }
```

**C&C → Node Commands** (`CncCommand` union type):
```typescript
{ type: 'wake', commandId, data: { hostName, mac } }
{ type: 'scan', commandId, data: { immediate } }
```

**Connection Flow:**
1. Node connects to `ws://host:8080/ws/node?token=<auth-token>`
2. Auth token validated against `NODE_AUTH_TOKENS` in config
3. WebSocket stored in `NodeManager.connections` Map
4. Registration message creates/updates node in database
5. Heartbeat every 30s keeps status='online', timeout after 90s marks offline

See `src/services/nodeManager.ts:38-76` for handleConnection implementation.

### Heartbeat Mechanism: Keeping Nodes Alive

**Why heartbeats?** Detect node disconnections before they cause command failures. Network issues, node crashes, or container restarts can leave stale WebSocket connections.

**Configuration:**
```env
NODE_HEARTBEAT_INTERVAL=30000  # Node sends heartbeat every 30s
NODE_TIMEOUT=90000              # C&C marks offline after 90s (3 missed beats)
```

**Validation:** Config loader enforces `NODE_TIMEOUT >= 2 * NODE_HEARTBEAT_INTERVAL` to prevent premature timeouts.

**Flow:**
```typescript
// Node agent (woly-backend in agent mode)
setInterval(() => {
  ws.send(JSON.stringify({
    type: 'heartbeat',
    data: { nodeId: 'my-node', timestamp: Date.now() }
  }));
}, NODE_HEARTBEAT_INTERVAL);

// C&C backend (NodeManager)
private checkHeartbeats(): void {
  const now = Date.now();
  for (const [nodeId, lastHeartbeat] of this.lastHeartbeat.entries()) {
    if (now - lastHeartbeat > config.nodeTimeout) {
      this.handleNodeTimeout(nodeId);  // Marks node offline in DB
    }
  }
}

// Runs every 30s via setInterval in NodeManager constructor
```

**State Transitions:**
- **online** - Active WebSocket + recent heartbeat (< 90s ago)
- **offline** - Missed 3+ heartbeats OR WebSocket closed
- **Status propagation** - Offline nodes trigger `HostAggregator.markNodeHostsUnreachable()` to set all their hosts to 'asleep'

**Edge Cases:**
1. **Node reconnects with same ID** - Updates existing node record, reuses WebSocket in connections Map
2. **Duplicate heartbeat messages** - Idempotent - just updates lastHeartbeat timestamp
3. **Heartbeat arrives after timeout** - Marks node back online if WebSocket still connected
4. **WebSocket close event** - Immediately marks offline, doesn't wait for timeout

See `src/services/nodeManager.ts:130-165` for full timeout handling logic.

## Host Aggregation: Fully Qualified Names

Hosts from different nodes may have same hostname - use FQN pattern:
```typescript
// Format: hostname@location-sanitized
buildFQN('RASPBERRYPI', 'Home Office') → 'RASPBERRYPI@Home-Office'
```

**Deduplication:** `aggregated_hosts` table has `UNIQUE(node_id, name)` - same hostname can exist per node. Mobile app uses FQN for wake commands to route to correct node.

**Status Propagation:**
- Node offline → `HostAggregator.markNodeHostsUnreachable()` sets all its hosts to 'asleep'
- Node deregistered → `removeNodeHosts()` deletes all hosts
- Listen to `NodeManager` events for lifecycle hooks

## Development Workflow

**Build & Run:**
```bash
npm run build          # Compile TypeScript → dist/
npm start              # Production mode (requires build first)
npm run dev            # Development with hot reload (recommended)
npm run start-ts       # Direct ts-node execution (no build)
```

**Database Setup:**
```bash
# SQLite (no external deps)
DB_TYPE=sqlite npm run init-db

# PostgreSQL (requires running instance)
DB_TYPE=postgres npm run init-db
```

**Common Gotcha:** `npm start` fails with "Cannot find module dist/server.js" → Run `npm run build` first. Use `npm run dev` for development (skips build step).

## Service Layer Architecture

**Dependency Injection Pattern** (`src/server.ts:26-31`):
```typescript
constructor() {
  this.hostAggregator = new HostAggregator();
  this.nodeManager = new NodeManager(this.hostAggregator);
  this.commandRouter = new CommandRouter(this.nodeManager, this.hostAggregator);
}
```

Services are **singletons** - one instance per server lifetime. `NodeManager` emits events that `HostAggregator` listens to for host lifecycle management.

**Key Methods:**
- `NodeManager.handleConnection(ws, authToken)` - WebSocket setup, message routing
- `NodeManager.sendCommand(nodeId, command)` - Send CncCommand to specific node
- `HostAggregator.onHostDiscovered(event)` - Insert/update host in aggregated_hosts
- `CommandRouter.routeWakeCommand(fqn)` - Parse FQN, find node, send wake command

## Configuration & Environment

Environment variables (`.env`):
```env
DB_TYPE=sqlite                        # postgres or sqlite
DATABASE_URL=./db/woly-cnc.db        # Path (SQLite) or URL (PostgreSQL)
NODE_AUTH_TOKENS=token1,token2       # Comma-separated, no spaces
NODE_HEARTBEAT_INTERVAL=30000        # 30s
NODE_TIMEOUT=90000                   # 90s (3 missed beats)
```

**Config loaded via** `src/config/index.ts` with validation - throws on missing required vars. Access via `import config from './config'`.

## Logging Convention

Winston logger (`src/utils/logger.ts`) with structured logging:
```typescript
logger.info('Node registered', { nodeId, location });
logger.error('Failed to process event', { error: error.message });
```

Use object format for context, not string interpolation. Log levels: `error`, `warn`, `info`, `http`, `debug`.

## Authentication & Authorization (JWT with RBAC)

**Implementation Status:** Planning phase (ADR-0001 accepted)

**Protected Endpoints:**
- `/api/hosts/*` - Host management (wake, scan, update)
- `/api/admin/*` - Administrative operations
- `/health`, `/api-docs` - Public (no auth)

**Roles:**
- **operator** - Can view hosts, trigger wake/scan
- **admin** - Full access including node management, user administration

**Token Flow:**
```typescript
// 1. Client obtains JWT from auth endpoint
POST /api/auth/login
{ "username": "admin", "password": "..." }
→ { "token": "eyJhbGc...", "role": "admin" }

// 2. Include token in requests
GET /api/hosts
Authorization: Bearer eyJhbGc...

// 3. Middleware validates and attaches user to request
req.user = { id, username, role }
```

**Middleware Pattern:**
```typescript
import { requireAuth, requireRole } from './middleware/auth';

// Require any authenticated user
router.get('/api/hosts', requireAuth, hostsController.list);

// Require specific role
router.delete('/api/admin/nodes/:id', requireAuth, requireRole('admin'), nodeController.delete);
```

**Key Files:**
- `src/middleware/auth.ts` - JWT validation, role checking
- `src/controllers/auth.ts` - Login, token generation
- `docs/adr/0001-api-auth-and-rbac.md` - Architecture decision record
- `docs/runbooks/ws-session-token-rotation.md` - WebSocket auth patterns

## Command Lifecycle & Persistence

**Implementation Status:** Planning phase (ADR-0003 accepted)

**Durable Commands:** Commands persisted to database for reliability and audit trail

**Command States:**
- `pending` - Created, not yet sent to node
- `sent` - Delivered to node via WebSocket
- `completed` - Node confirmed execution
- `failed` - Node reported error or timeout

**Database Schema:**
```sql
CREATE TABLE commands (
  id SERIAL PRIMARY KEY,
  command_id UUID UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,  -- 'wake', 'scan', etc.
  node_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB
);
```

**Migration Files:**
- `migrations/001_add_commands_table.sql` - PostgreSQL version
- `migrations/001_add_commands_table.sqlite.sql` - SQLite version

**Usage Pattern:**
```typescript
// CommandRouter persists before sending
const commandId = uuidv4();
await db.query(
  'INSERT INTO commands (command_id, type, node_id, payload, status) VALUES ($1, $2, $3, $4, $5)',
  [commandId, 'wake', nodeId, JSON.stringify(data), 'pending']
);

// Send to node
await nodeManager.sendCommand(nodeId, { commandId, type: 'wake', data });

// Update on result
await db.query(
  'UPDATE commands SET status = $1, completed_at = NOW(), result = $2 WHERE command_id = $3',
  ['completed', JSON.stringify(result), commandId]
);
```

**Benefits:**
- Audit trail for compliance
- Retry failed commands
- Query command history
- Idempotency via command_id

See `docs/adr/0003-durable-command-lifecycle.md` for full design rationale.

## Type System: Shared Protocol Types

**Shared Protocol Package (@kaonis/woly-protocol):**

Protocol types are being migrated to shared npm package for consistency:
- Published by `woly-backend` repo at `packages/protocol/`
- Consumed via `npm install @kaonis/woly-protocol@latest`
- Exports runtime validation schemas (Zod) + TypeScript types
- Version synchronization required across repos (see `ADR-0002`)

**Local Types** (`src/types.ts`) - maintained until migration complete:
- Mobile app and node agents use compatible definitions
- Union types for messages enable exhaustive switch-case handling:

```typescript
switch (message.type) {
  case 'register': return await this.handleRegistration(ws, message.data);
  case 'heartbeat': return await this.handleHeartbeat(message.data.nodeId);
  // TypeScript ensures all cases covered
}
```

**Host vs AggregatedHost:**
- `Host` - Basic host data from node agents
- `AggregatedHost` - Extended with `nodeId`, `location`, `fullyQualifiedName` for C&C storage

## Testing Strategy

### Current State
Jest configured (`jest.config.js`) with basic setup. Example test exists in `src/models/__tests__/Node.test.ts` demonstrating database mocking pattern. Limited coverage currently - expand incrementally for new features.

### Test Types & Approach

**Unit Tests** (`src/**/__tests__/*.test.ts`):
- Services: Mock dependencies (database, WebSocket connections)
- Models: Use SQLite in-memory database for speed (`:memory:` URL)
- Utils: Pure function testing, no mocks needed

**Integration Tests** (Future):
- WebSocket handshake flow: Real WebSocket connections with test tokens
- Command routing: Full flow from REST API → WebSocket → command delivery
- Database transactions: Multi-query operations with rollback testing

**End-to-End Tests** (Future):
- Requires running C&C backend + node agent + database
- Test scenarios: Node registration → host discovery → wake command
- Use Docker Compose for isolated test environment

### Testing Patterns

**Database Mocking (Unit Tests):**
```typescript
// Mock db abstraction for isolated testing
jest.mock('../database/connection', () => ({
  query: jest.fn(),
  getClient: jest.fn()
}));

// Or use SQLite in-memory for real database behavior
const testDb = new SqliteDatabase(':memory:');
```

**WebSocket Mocking (NodeManager Tests):**
```typescript
import WebSocket from 'ws';

// Mock WebSocket instance
const mockWs = {
  send: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN
} as unknown as WebSocket;

// Test connection handling
nodeManager.handleConnection(mockWs, 'test-token');
expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
```

**Event Emitter Testing (Service Communication):**
```typescript
// NodeManager emits events, HostAggregator listens
const nodeManager = new NodeManager(mockAggregator);
const eventSpy = jest.fn();
nodeManager.on('node-offline', eventSpy);

nodeManager.handleNodeTimeout('test-node');
expect(eventSpy).toHaveBeenCalledWith({ nodeId: 'test-node' });
```

### Running Tests

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode for development
npm test -- Node.test.ts   # Run specific test file
npm test -- --coverage     # Generate coverage report
```

### Test Database Setup

**SQLite In-Memory** (fast, isolated):
```typescript
beforeEach(async () => {
  testDb = new SqliteDatabase(':memory:');
  await testDb.query(fs.readFileSync('src/database/schema.sqlite.sql', 'utf8'), []);
});
```

**PostgreSQL Test Container** (realistic, slower):
```typescript
// Use testcontainers for Docker-based PostgreSQL
import { PostgreSqlContainer } from '@testcontainers/postgresql';

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  testDb = new PostgresDatabase(container.getConnectionString());
});
```

### Coverage Goals (Incremental)

**Priority 1 (Critical Path):**
- `NodeManager.handleConnection()` - WebSocket setup, auth validation
- `HostAggregator.onHostDiscovered()` - Host insertion/update logic
- `CommandRouter.routeWakeCommand()` - FQN parsing, node lookup

**Priority 2 (Edge Cases):**
- Heartbeat timeout handling
- Duplicate node registration
- Cross-database SQL syntax variations

**Priority 3 (Error Handling):**
- WebSocket connection failures
- Database query errors
- Invalid message formats

### Testing Gotchas

1. **Async cleanup** - Always close database connections and WebSockets in `afterEach`/`afterAll`
2. **Mock timers** - Use `jest.useFakeTimers()` for heartbeat interval testing
3. **Database state** - Reset or use fresh in-memory DB for each test to avoid coupling
4. **WebSocket readyState** - Mock must include `readyState` property for connection checks
5. **Event emitter leaks** - Remove listeners in test cleanup to prevent warnings

## Common Pitfalls

1. **Forgot `npm run build`** - `npm start` requires compiled code in `dist/`
2. **Direct pool access** - Always use `db.query()` for cross-DB compatibility
3. **Missing client.release()** - If using `db.getClient()` for transactions, always release in finally block
4. **PostgreSQL syntax in SQLite** - Check `config.dbType` before using `NOW()`, `FILTER`, `INTERVAL`
5. **Auth token format** - Use comma-separated string, no spaces: `token1,token2,token3`
6. **Heartbeat math** - Timeout must be ≥2x heartbeat interval (enforced in config validation)

## Key Files Reference

- `src/server.ts` - Express app, service initialization, WebSocket setup
- `src/types.ts` - Shared protocol types (Node, Host, messages)
- `src/services/nodeManager.ts` - WebSocket lifecycle, connection Map
- `src/services/hostAggregator.ts` - Host event processing, FQN generation
- `src/database/connection.ts` - Database factory (PostgreSQL/SQLite)
- `src/database/schema.sql` - PostgreSQL schema
- `src/database/schema.sqlite.sql` - SQLite schema (adapted syntax)
- `src/models/Node.ts` - Node CRUD with cross-DB SQL
- `migrations/` - Database schema migrations
- `docs/adr/` - Architecture Decision Records (auth, protocol, commands)
- `docs/runbooks/` - Operational guides

## Docker Deployment

### Production Setup (PostgreSQL)

**docker-compose.yml** configures C&C backend + PostgreSQL:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres-data:/var/lib/postgresql/data

  woly-cnc:
    build: .
    depends_on:
      - postgres
    environment:
      - DB_TYPE=postgres
      - DATABASE_URL=postgresql://user:pass@postgres:5432/woly
```

**Dockerfile** uses multi-stage build:
```dockerfile
# Stage 1: Build TypeScript
FROM node:20-alpine AS builder
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

### Environment Configuration

**Production (.env for Docker):**
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://woly:password@postgres:5432/woly
NODE_AUTH_TOKENS=prod-token-1,prod-token-2,prod-token-3
NODE_HEARTBEAT_INTERVAL=30000
NODE_TIMEOUT=90000
PORT=8080
```

**Development (local, no Docker):**
```env
DB_TYPE=sqlite
DATABASE_URL=./db/woly-cnc.db
NODE_AUTH_TOKENS=dev-token-home,dev-token-office
NODE_HEARTBEAT_INTERVAL=30000
NODE_TIMEOUT=90000
PORT=8080
```

### Docker Commands

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f woly-cnc

# Initialize database (first run only)
docker-compose exec woly-cnc npm run init-db

# Restart after code changes
docker-compose up -d --build

# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v
```

### Database Migrations (Future)

Currently using schema files for initialization. For production, consider:
- **Flyway** or **Liquibase** for versioned migrations
- **TypeORM migrations** if adopting ORM layer
- **Manual SQL scripts** with version tracking in `migrations/` directory

Keep `schema.sql` and `schema.sqlite.sql` in sync when schema changes.

### Health Checks & Monitoring

Add to `docker-compose.yml` for production readiness:
```yaml
woly-cnc:
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8080/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

Implement health endpoint in `src/server.ts`:
```typescript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1', []);
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});
```

### Deployment Checklist

1. ✅ Set strong `NODE_AUTH_TOKENS` (avoid `dev-token-*` in production)
2. ✅ Use PostgreSQL for production (SQLite for dev/testing only)
3. ✅ Configure `DATABASE_URL` with production credentials
4. ✅ Run `npm run init-db` on first deployment
5. ✅ Enable health checks for container orchestration
6. ✅ Set up log aggregation (Winston JSON format compatible with ELK/Datadog)
7. ✅ Configure reverse proxy (nginx/Traefik) for WebSocket support
8. ✅ Enable HTTPS termination at proxy level (WSS required for secure WebSocket)

### Scaling Considerations

**Current Architecture (Single Instance):**
- WebSocket connections stored in-memory (NodeManager.connections Map)
- Not horizontally scalable without sticky sessions or shared state

**Future Multi-Instance Support:**
- Use Redis for shared WebSocket connection registry
- Implement message broker (Redis Pub/Sub or RabbitMQ) for inter-server communication
- Add load balancer with sticky sessions for WebSocket affinity

See `docs/IMPROVEMENTS.md` (if exists) for detailed scaling roadmap.

## Integration with Mobile App & Node Agents

**Mobile App** (`woly` repo) - REST client only, no WebSocket. Connects to `http://localhost:8080/api/hosts` for aggregated view.

**Node Agents** (`woly-backend` repo) - Agent mode connects WebSocket to C&C, streams host discovery events, receives commands. See `NODE_MODE=agent` configuration.

**Command Flow Example:**
1. Mobile app: `POST /api/hosts/wakeup/:fqn`
2. CommandRouter parses FQN → finds nodeId from aggregated_hosts
3. NodeManager sends wake command via WebSocket
4. Node agent executes WoL, sends command-result back
5. C&C logs result, mobile app polls for status change
