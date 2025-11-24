# WoLy Backend - AI Coding Agent Instructions

## Project Overview

Node.js backend for Wake-on-LAN application with automatic network discovery. **Dual-mode architecture**: operates standalone OR as agent connecting to C&C backend via WebSocket. Built with Express, TypeScript, SQLite, and comprehensive test coverage (195 tests, 90%+).

## Architecture: Dual Operating Modes

### Standalone Mode (Default)

```
Mobile App (REST) → woly-backend → Local Network (ARP/WoL)
                         ↓
                    SQLite (hosts)
```

### Agent Mode (Distributed Architecture)

```
C&C Backend (WebSocket) ↔ woly-backend → Local Network (ARP/WoL)
                               ↓
                          SQLite (hosts)
```

**Mode Selection:** Set `NODE_MODE=agent` in `.env` to connect to C&C backend. See `config/agent.ts` for required fields (CNC_URL, NODE_ID, NODE_LOCATION, NODE_AUTH_TOKEN).

**Critical Pattern:** `agentService` orchestrates agent mode - connects to C&C via `cncClient`, forwards host discovery events, and processes commands from C&C. In standalone mode, these services are never initialized.

## Host Status: Dual-Field System

**CRITICAL DISTINCTION - Two separate status indicators:**

### `status` (awake/asleep) - PRIMARY INDICATOR

- **Source:** ARP network discovery
- **Meaning:** If device responds to ARP, it's on the network and awake
- **Reliability:** Definitive - ARP response = device is active
- **Usage:** Use this field for determining if device is awake

### `pingResponsive` (1/0/null) - SECONDARY DIAGNOSTIC

- **Source:** ICMP ping test (always performed, separate from status determination)
- **Values:** 1 (responds), 0 (no response), null (not tested)
- **Meaning:** Network reachability diagnostic only
- **WARNING:** Many devices block ping due to firewalls, so `pingResponsive: 0` does NOT mean device is asleep
- **Config:** `USE_PING_VALIDATION=true` uses ping to validate awake status, but defaults to false (ARP is sufficient)

**Key Implementation:** See `services/networkDiscovery.ts:140-188` for dual-tracking logic and `types.ts` for type definitions.

## Service Layer Architecture

### Core Services (Singleton Pattern)

**HostDatabase** (`services/hostDatabase.ts`)

- SQLite operations with EventEmitter pattern
- Emits: `host-discovered`, `host-updated`, `scan-complete`
- **Periodic scanning:** `startPeriodicSync()` runs ARP scan at configurable interval (default: 5 min)
- **Connection retry:** Exponential backoff (3 attempts, 1s delay) - see `connectWithRetry()` line 33-56
- **Critical:** Database instance passed to controllers AND agent service in `app.ts:69,79`

**NetworkDiscovery** (`services/networkDiscovery.ts`)

- Cross-platform ARP scanning via `local-devices` package
- **Hostname resolution:** DNS reverse lookup → NetBIOS (Windows) → nmblookup (Linux) → auto-generated fallback
- **Ping validation:** Optional ICMP testing (config: `USE_PING_VALIDATION`)
- **Rate limiting:** MAC vendor API calls throttled to 1 req/sec (config: `MAC_VENDOR_RATE_LIMIT`)

**AgentService** (`services/agentService.ts`) - Agent Mode Only

- Orchestrates agent mode operations
- Connects `HostDatabase` events to `CncClient` WebSocket
- Command handlers: wake, scan, update-host, delete-host
- **Setup:** `setHostDatabase()` must be called before `start()` - see `app.ts:79-81`

**CncClient** (`services/cncClient.ts`) - Agent Mode Only

- WebSocket connection to C&C backend
- Automatic reconnection with exponential backoff (config: `RECONNECT_INTERVAL`, `MAX_RECONNECT_ATTEMPTS`)
- Heartbeat mechanism (default: 30s interval)
- Message protocol: `NodeMessage` (node→C&C) and `CncCommand` (C&C→node) - see `types.ts:65-113`

### Dependency Flow (Critical Initialization Order)

```typescript
// app.ts initialization sequence
1. hostDb = new HostDatabase()
2. await hostDb.initialize()  // Creates tables, seeds data
3. hostsController.setHostDatabase(hostDb)  // Pass to controller

// AGENT MODE ONLY:
4. agentService.setHostDatabase(hostDb)  // Connect events
5. await agentService.start()  // Connects to C&C via cncClient

// BOTH MODES:
6. hostDb.startPeriodicSync()  // Background scanning
```

**Why this order matters:** AgentService listens to HostDatabase events, so must be connected before scanning starts. Controllers need database instance for queries.

## Network Discovery Algorithm Details

### ARP Scanning Process (`networkDiscovery.ts`)

**Step 1: Device Discovery** (line 140-160)

```typescript
// Uses local-devices package for cross-platform ARP scanning
const devices = await localDevices();
// Returns: [{ ip, mac, hostname }]
```

**Step 2: Hostname Resolution** (line 85-120) - **Fallback Chain:**

1. **DNS Reverse Lookup** (fastest, works if device has DNS entry)

   ```typescript
   const hostnames = await dns.reverse(ip);
   return hostnames[0].split('.')[0]; // Strip domain
   ```

2. **NetBIOS Query** (Windows: `nbtstat -A`, Linux: `nmblookup -A`)

   - Timeout: 2s per query
   - Parses output for `<00> UNIQUE` (workstation name)
   - Fallback for devices without DNS entries

3. **Auto-generated Hostname** (last resort)
   ```typescript
   return `device-${ip.replace(/\./g, '-')}`; // device-192-168-1-100
   ```

**Step 3: Status Determination** (line 160-188)

```typescript
// Primary: ARP response = awake
host.status = 'awake'; // Device is on network

// Secondary: Optional ping validation
if (config.network.usePingValidation) {
  const pingResult = await ping.promise.probe(ip, {
    timeout: config.network.pingTimeout / 1000,
  });
  host.status = pingResult.alive ? 'awake' : 'asleep';
}

// Always test ping for diagnostic field (separate from status)
const pingTest = await ping.promise.probe(ip);
host.pingResponsive = pingTest.alive ? 1 : 0;
```

**Why separate fields?**

- ARP response is definitive proof device is active
- Ping may fail due to firewall rules (false negative)
- `pingResponsive` provides additional diagnostic info without overriding ARP status

**Step 4: MAC Vendor Lookup** (line 120-140)

```typescript
// Rate-limited API calls (1 req/sec)
const vendor = await fetchMacVendor(mac);
// Cached for 24h (MAC_VENDOR_TTL)
```

**Performance Optimizations:**

- ARP scan: ~2-5s for typical home network (50-100 devices)
- Hostname resolution: Parallel execution with 2s timeout
- MAC vendor: LRU cache prevents repeated API calls
- Deferred sync: Initial scan delayed 5s for faster API availability

### Periodic Scanning (`hostDatabase.ts:200-250`)

```typescript
startPeriodicSync(interval: number, immediate: boolean) {
  if (immediate) {
    this.performNetworkScan(); // Run now
  }

  this.syncInterval = setInterval(() => {
    this.performNetworkScan();
  }, interval); // Default: 5 minutes
}
```

**Scan Lifecycle:**

1. Set `scanInProgress = true`
2. Run ARP discovery
3. Update database (insert new, update existing, mark missing as 'asleep')
4. Emit events: `host-discovered`, `host-updated`, `scan-complete`
5. Set `scanInProgress = false`, update `lastScanTime`

**Database Update Strategy:**

- **New hosts:** INSERT with `discovered = 1`
- **Existing hosts:** UPDATE status, lastSeen timestamp
- **Missing hosts:** Status unchanged (may be temporarily offline)
- Manual cleanup required for permanently removed devices

## Development Workflow

### Build & Run Commands

```bash
npm start              # Development: ts-node direct execution (no build)
npm run dev            # Development with auto-reload (nodemon + ts-node)
npm run build          # Compile TypeScript → dist/
npm run prod           # Production: build + node execution

# Testing
npm test               # All tests (unit + integration)
npm run test:unit      # Unit tests only (*.unit.test.ts)
npm run test:integration  # Integration tests only (*.integration.test.ts)
npm run test:coverage  # Coverage report (enforces thresholds)
npm run test:watch     # Watch mode for development
npm run test:ci        # CI mode (coverage to Codecov)
```

**Common Gotcha:** Unlike C&C backend, `npm start` uses `ts-node` directly (no build required). Use `npm run prod` for compiled production build.

### Testing Strategy (195 Tests, 90% Coverage)

**Coverage Thresholds (Enforced in CI):**

- Statements: 80%
- Lines: 80%
- Branches: 70%
- Functions: 85%

**Test Organization:**

- **Unit tests:** `__tests__/` directories alongside source files
  - Services: `services/__tests__/*.unit.test.ts`
  - Controllers: `controllers/__tests__/*.unit.test.ts`
  - Middleware: `middleware/__tests__/*.unit.test.ts`
- **Integration tests:** `__tests__/` at project root
  - Full API testing with supertest
  - Example: `__tests__/api.integration.test.ts`

**Key Testing Patterns:**

**Database Mocking (Unit Tests):**

```typescript
// Mock SQLite database
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn().mockImplementation((path, callback) => {
      callback(null); // Simulate successful connection
      return mockDb;
    }),
  }),
}));

// Mock database methods
const mockDb = {
  run: jest.fn((sql, params, callback) => callback(null)),
  get: jest.fn((sql, params, callback) => callback(null, mockHost)),
  all: jest.fn((sql, params, callback) => callback(null, [mockHost])),
  close: jest.fn((callback) => callback(null)),
};
```

**WebSocket Mocking (Agent Mode Tests):**

```typescript
import WebSocket from 'ws';
import { cncClient } from '../services/cncClient';

// Mock WebSocket connection
jest.mock('ws');
const mockWs = {
  send: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN,
};

// Test message sending
test('should forward host discovery to C&C', () => {
  cncClient.send({ type: 'host-discovered', data: mockHost });
  expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('host-discovered'));
});
```

**EventEmitter Testing (Service Communication):**

```typescript
// HostDatabase emits events, AgentService listens
const hostDb = new HostDatabase(':memory:');
const eventSpy = jest.fn();
hostDb.on('host-discovered', eventSpy);

await hostDb.performNetworkScan();
expect(eventSpy).toHaveBeenCalledWith(
  expect.objectContaining({ name: 'TEST-HOST', status: 'awake' })
);
```

**Integration Tests with Supertest:**

```typescript
import request from 'supertest';
import app from '../app';

// Test full request/response cycle
test('GET /hosts returns host list', async () => {
  const response = await request(app).get('/hosts').expect(200).expect('Content-Type', /json/);

  expect(response.body).toHaveProperty('hosts');
  expect(response.body).toHaveProperty('scanInProgress');
});

// Test error handling
test('POST /hosts/wakeup/:name with invalid name returns 404', async () => {
  await request(app)
    .post('/hosts/wakeup/NONEXISTENT')
    .expect(404)
    .expect((res) => {
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
});

// Test rate limiting
test('POST /hosts/scan respects rate limit', async () => {
  // First 5 requests succeed
  for (let i = 0; i < 5; i++) {
    await request(app).post('/hosts/scan').expect(200);
  }
  // 6th request fails with 429
  await request(app).post('/hosts/scan').expect(429);
});
```

**Network Discovery Mocking:**

```typescript
import * as networkDiscovery from '../services/networkDiscovery';

jest.mock('../services/networkDiscovery', () => ({
  discoverHosts: jest
    .fn()
    .mockResolvedValue([{ ip: '192.168.1.100', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'TEST-HOST' }]),
  pingHost: jest.fn().mockResolvedValue(true),
}));
```

**When adding features:**

1. Add unit tests for business logic (controllers, services, utils)
2. Add integration tests for new API endpoints
3. Mock external dependencies (network, database, WebSocket)
4. Test error paths and edge cases
5. Run `npm run test:coverage` to verify thresholds
6. CI fails if coverage drops below 80%

**Test File Naming Convention:**

- Unit tests: `*.unit.test.ts` - Fast, isolated, no external dependencies
- Integration tests: `*.integration.test.ts` - Full stack, real database (SQLite in-memory)

See `jest.config.js` for configuration and `jest.setup.ts` for global test setup.

## Configuration Management

**Environment Variables** (`.env`):

```env
# Server
PORT=8082
HOST=0.0.0.0
NODE_ENV=development

# Database
DB_PATH=./db/woly.db

# Network Discovery
SCAN_INTERVAL=300000          # 5 minutes
SCAN_DELAY=5000               # 5 seconds initial delay
PING_TIMEOUT=2000             # 2 seconds
USE_PING_VALIDATION=false     # Optional ping validation (ARP is sufficient)

# Caching
MAC_VENDOR_TTL=86400000       # 24 hours
MAC_VENDOR_RATE_LIMIT=1000    # 1 second between API calls

# CORS
CORS_ORIGINS=http://localhost:19000,http://192.168.1.228:8082

# Logging
LOG_LEVEL=info                # error, warn, info, http, debug

# AGENT MODE ONLY (set NODE_MODE=agent to enable)
NODE_MODE=standalone          # standalone or agent
CNC_URL=ws://localhost:8080   # C&C backend WebSocket URL
NODE_ID=node-1                # Unique node identifier
NODE_LOCATION=Home Office     # Human-readable location
NODE_AUTH_TOKEN=secret-token  # Authentication token
HEARTBEAT_INTERVAL=30000      # 30 seconds
RECONNECT_INTERVAL=5000       # 5 seconds
MAX_RECONNECT_ATTEMPTS=0      # 0 = infinite
```

**Config loaded via** `config/index.ts` and `config/agent.ts` with dotenv. Access via `import { config } from './config'` or `import { agentConfig } from './config/agent'`.

**Validation:** `validateAgentConfig()` throws error if agent mode enabled without required fields.

## API Patterns & Conventions

### Rate Limiting (express-rate-limit)

- **General API:** 100 requests per 15 minutes per IP
- **Network scans:** 5 requests per minute per IP (resource-intensive)
- **Wake requests:** 20 requests per minute per IP
- Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`

See `middleware/rateLimiter.ts` for configuration.

### Input Validation (Joi)

All endpoints validate input via `middleware/validateRequest.ts` using schemas from `validators/hostValidator.ts`:

- MAC format: `XX:XX:XX:XX:XX:XX` or `XX-XX-XX-XX-XX-XX`
- IP format: Valid IPv4/IPv6
- Hostname: 1-255 characters

### Error Handling (Standardized Format)

Global error handler in `middleware/errorHandler.ts` returns consistent structure:

```typescript
{
  error: {
    code: "VALIDATION_ERROR",
    message: "MAC address must be in format XX:XX:XX:XX:XX:XX",
    statusCode: 400,
    timestamp: "2025-11-19T09:35:06.541Z",
    path: "/hosts/mac-vendor/INVALID"
  }
}
```

**Common codes:** `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500)

### API Documentation (Swagger/OpenAPI)

Interactive docs at `/api-docs` endpoint. Configuration in `swagger.ts` using `swagger-jsdoc` and `swagger-ui-express`.

## Type System & Protocol

**Central Types** (`types.ts`):

- `Host` - Basic host data (used in both standalone and agent modes)
- `HostsResponse`, `ScanResponse`, `WakeUpResponse` - API responses
- **Agent Protocol Types:**
  - `NodeMessage` - Union type for node→C&C messages (register, heartbeat, host-discovered, etc.)
  - `CncCommand` - Union type for C&C→node commands (wake, scan, update-host, etc.)
  - `NodeRegistration` - Registration payload with metadata

**Union types enable exhaustive TypeScript checking:**

```typescript
switch (message.type) {
  case 'register':
    return await handleRegistration(message.data);
  case 'heartbeat':
    return await handleHeartbeat(message.data);
  // TypeScript ensures all cases covered
}
```

### WebSocket Message Handling Patterns

**Node → C&C Message Flow** (`agentService.ts`):

```typescript
// Host discovery forwarding
private sendHostDiscovered(host: Host): void {
  const message: NodeMessage = {
    type: 'host-discovered',
    data: { nodeId: agentConfig.nodeId, ...host }
  };
  cncClient.send(message);
}

// Registration with metadata
private async sendRegistration(): Promise<void> {
  const registration: NodeRegistration = {
    nodeId: agentConfig.nodeId,
    name: os.hostname(),
    location: agentConfig.location,
    authToken: agentConfig.authToken,
    metadata: {
      version: '1.0.0',
      platform: os.platform(),
      networkInfo: { subnet: '192.168.1.0/24', gateway: '192.168.1.1' }
    }
  };
  cncClient.send({ type: 'register', data: registration });
}
```

**C&C → Node Command Handling** (`agentService.ts:120-240`):

```typescript
// Wake command with result reporting
private async handleWakeCommand(command: CncCommand): Promise<void> {
  const { commandId, data } = command;
  try {
    const result = await this.hostDb.wakeHost(data.hostName);
    this.sendCommandResult(commandId, true, 'Wake packet sent');
  } catch (error) {
    this.sendCommandResult(commandId, false, error.message);
  }
}

// Scan command with immediate flag
private async handleScanCommand(command: CncCommand): Promise<void> {
  const { commandId, data } = command;
  if (data.immediate) {
    await this.hostDb.performNetworkScan();
  } else {
    this.hostDb.startPeriodicSync(config.network.scanInterval, true);
  }
  this.sendCommandResult(commandId, true, 'Scan initiated');
}
```

**Connection Lifecycle** (`cncClient.ts:100-150`):

```typescript
// Heartbeat keeps connection alive
private startHeartbeat(): void {
  this.heartbeatTimer = setInterval(() => {
    this.send({
      type: 'heartbeat',
      data: { nodeId: agentConfig.nodeId, timestamp: new Date() }
    });
  }, agentConfig.heartbeatInterval);
}

// Automatic reconnection with backoff
private scheduleReconnect(): void {
  if (this.reconnectAttempts >= agentConfig.maxReconnectAttempts &&
      agentConfig.maxReconnectAttempts !== 0) {
    this.emit('reconnect-failed');
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
  this.reconnectTimer = setTimeout(() => this.connect(), delay);
  this.reconnectAttempts++;
}
```

## Logging Convention

Winston logger (`utils/logger.ts`) with structured logging:

```typescript
logger.info('Network scan completed', { hostsFound: 5, duration: 1234 });
logger.error('Failed to connect to C&C', { error: error.message, nodeId });
```

**Log Levels:** `error` → `logs/error.log`, all levels → `logs/combined.log`, console (colored in dev)

**Use object format for context,** not string interpolation - enables structured log parsing.

## Security Features

### Helmet.js Security Headers

- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

### CORS Configuration (`app.ts:19-57`)

Dynamic origin validation:

- Whitelist from `CORS_ORIGINS` env var
- Auto-allow ngrok URLs: `https://*.ngrok-free.app`
- Auto-allow Netlify URLs: `https://*.netlify.app`
- Auto-allow custom domains: `helios.kaonis.com`

**Pattern:** Use callback-based CORS to log accepted/rejected origins for debugging.

## Docker Deployment

**CRITICAL:** Host networking mode required for ARP scanning to work.

```bash
docker run -d \
  --name woly-backend \
  --net host \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/logs:/app/logs \
  -e NODE_ENV=production \
  woly-backend:latest
```

**Why `--net host`:** ARP scanning requires low-level network access. Bridge networking breaks discovery.

Multi-stage Dockerfile optimizes image size (see Dockerfile for implementation).

## Common Pitfalls & Debugging

### Configuration Issues

1. **Agent mode without config** - Set all 4 required env vars or get validation error:

   ```bash
   # Required for agent mode
   NODE_MODE=agent
   CNC_URL=ws://localhost:8080
   NODE_ID=node-1
   NODE_LOCATION=Home Office
   NODE_AUTH_TOKEN=secret-token
   ```

   **Error:** `Agent mode enabled but missing required configuration: CNC_URL, NODE_ID`
   **Fix:** Check `.env` file exists and all variables set

2. **CORS errors from mobile app** - Origin not in whitelist
   ```typescript
   // app.ts - Check logs for rejected origins
   logger.error(`CORS: Rejected origin: ${origin}`);
   ```
   **Fix:** Add origin to `CORS_ORIGINS` in `.env` or use dynamic patterns (ngrok, Netlify)

### Service Initialization Errors

3. **Database not initialized** - Always `await hostDb.initialize()` before starting services

   ```typescript
   // ❌ WRONG - services won't have database instance
   const hostDb = new HostDatabase();
   hostsController.setHostDatabase(hostDb);
   await hostDb.initialize();

   // ✅ CORRECT - initialize before passing to services
   const hostDb = new HostDatabase();
   await hostDb.initialize();
   hostsController.setHostDatabase(hostDb);
   ```

4. **AgentService timing** - Must call `setHostDatabase()` before `start()` to connect events
   ```typescript
   // Event listeners registered in setHostDatabase()
   agentService.setHostDatabase(hostDb); // Connect events first
   await agentService.start(); // Then start (triggers initial scan)
   ```
   **Symptom:** Host discoveries not forwarded to C&C
   **Debug:** Check `agentService.ts:25-38` event listener setup

### Network & Docker Issues

5. **Docker networking** - Must use `--net host` for ARP scanning to work

   ```bash
   # ❌ WRONG - Bridge mode breaks ARP
   docker run -p 8082:8082 woly-backend

   # ✅ CORRECT - Host networking required
   docker run --net host woly-backend
   ```

   **Why:** ARP packets require direct network interface access
   **Symptom:** Zero hosts discovered, even on populated network

6. **Hostname resolution timeouts** - NetBIOS queries can be slow
   ```typescript
   // Increase timeout if network is slow
   SCAN_DELAY = 10000; // 10 seconds instead of 5
   ```
   **Symptom:** Many hosts show auto-generated names (`device-192-168-1-100`)
   **Debug:** Check logs for "NetBIOS lookup failed" warnings

### Status & Discovery Issues

7. **Ping vs ARP confusion** - Use `status` field (awake/asleep) as primary indicator

   ```typescript
   // ❌ WRONG - pingResponsive unreliable due to firewalls
   if (host.pingResponsive === 0) {
     // Host might be awake but blocking ping!
   }

   // ✅ CORRECT - status is definitive
   if (host.status === 'awake') {
     // Host is definitely on network (ARP response)
   }
   ```

   **Symptom:** Mobile app shows device as "offline" but it's actually awake
   **Debug:** Check both `status` AND `pingResponsive` fields in response

8. **MAC vendor rate limit** - API calls throttled to 1/sec, cache expires after 24h
   ```typescript
   // Increase cache TTL for less frequent lookups
   MAC_VENDOR_TTL = 604800000; // 7 days
   ```
   **Symptom:** Slow initial scans with many new devices
   **Debug:** Check `macVendorCache` size in logs

### Testing Issues

9. **Test coverage thresholds** - CI fails if any threshold drops below configured value

   ```bash
   # Check coverage before commit
   npm run test:coverage
   # Look for lines below threshold
   ```

   **Common cause:** New files without tests
   **Fix:** Add `__tests__/*.unit.test.ts` alongside new service/controller files

10. **Mock timer interference** - Jest fake timers affect heartbeat/scan intervals
    ```typescript
    // Use real timers for integration tests
    beforeEach(() => {
      jest.useRealTimers();
    });
    ```

### WebSocket Connection Issues (Agent Mode)

11. **C&C connection refused** - Check C&C backend is running and URL correct

    ```bash
    # Test WebSocket connection manually
    wscat -c "ws://localhost:8080/ws/node?token=test-token"
    ```

    **Symptom:** `Failed to connect to C&C backend` in logs
    **Debug:** Check `CNC_URL`, ensure C&C server started, verify firewall rules

12. **Authentication failures** - Token mismatch between node and C&C

    ```typescript
    // C&C logs show: Invalid authentication token
    ```

    **Fix:** Ensure `NODE_AUTH_TOKEN` matches one of C&C's `NODE_AUTH_TOKENS`

13. **Heartbeat timeout** - Node marked offline despite active connection
    ```typescript
    // Increase timeout if network latency high
    HEARTBEAT_INTERVAL = 60000; // 1 minute
    // C&C must have matching or higher NODE_TIMEOUT
    ```

### Performance Issues

14. **Slow network scans** - Large networks (200+ devices) take 10-30s
    **Optimization:** Increase `SCAN_INTERVAL` to reduce frequency

    ```bash
    SCAN_INTERVAL=600000  # 10 minutes instead of 5
    ```

15. **Database lock errors** - Concurrent writes to SQLite
    **Symptom:** `SQLITE_BUSY: database is locked`
    **Fix:** SQLite has automatic retry logic, but consider PostgreSQL for high-write workloads

### Debugging Commands

```bash
# Check database contents
sqlite3 db/woly.db "SELECT name, status, lastSeen FROM hosts;"

# Monitor logs in real-time
tail -f logs/combined.log | grep -i error

# Test ARP scanning manually
node -e "require('./services/networkDiscovery').discoverHosts().then(console.log)"

# Verify WebSocket connection (agent mode)
wscat -c "ws://localhost:8080/ws/node?token=test-token"
```

## Key Files Reference

- `app.ts` - Express app, service initialization, mode detection
- `types.ts` - Shared protocol types (Host, NodeMessage, CncCommand)
- `config/index.ts` - Server configuration
- `config/agent.ts` - Agent mode configuration and validation
- `services/hostDatabase.ts` - SQLite operations, event emitter
- `services/networkDiscovery.ts` - ARP scanning, hostname resolution
- `services/agentService.ts` - Agent mode orchestration
- `services/cncClient.ts` - WebSocket connection to C&C
- `controllers/hosts.ts` - Request handlers
- `middleware/rateLimiter.ts` - Rate limiting configuration
- `middleware/errorHandler.ts` - Global error handling
- `jest.config.js` - Test configuration with coverage thresholds

## Integration with Other Projects

**Mobile App** (`woly` repo) - REST client for standalone mode, connects to `/hosts` endpoints

**C&C Backend** (`woly-cnc-backend` repo) - WebSocket server for agent mode, aggregates multiple node agents

**Switch between modes:** Change `NODE_MODE=agent` and configure C&C connection. No code changes needed.
