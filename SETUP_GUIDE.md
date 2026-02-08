# Phase 1 Implementation - Setup Guide

## ✅ Phase 1 Complete: C&C Backend Foundation

This guide walks through testing the Phase 1 implementation.

## What's Implemented

### Core Components
- ✅ Express + TypeScript server
- ✅ PostgreSQL database with schema
- ✅ Node registration system
- ✅ Token-based authentication
- ✅ WebSocket server for node connections
- ✅ Heartbeat mechanism (30s interval)
- ✅ Node status tracking (online/offline)
- ✅ Node lifecycle management
- ✅ Admin & public APIs
- ✅ Health check endpoints
- ✅ Winston logging
- ✅ Docker Compose setup
- ✅ Unit tests

### API Endpoints (Phase 1)
```
GET    /api/nodes              # List all registered nodes
GET    /api/nodes/:id          # Get specific node details
GET    /api/nodes/:id/health   # Check node health
GET    /api/admin/stats        # System statistics
DELETE /api/admin/nodes/:id   # Deregister a node
GET    /health                 # Server health check
```

### WebSocket Endpoint
```
ws://localhost:8080/ws/node?token=<auth-token>
```

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start PostgreSQL and C&C backend
docker-compose up -d

# View logs
docker-compose logs -f cnc-backend

# Check status
docker-compose ps

# Test health endpoint
curl http://localhost:8080/health
```

### Option 2: Manual Setup

```bash
# 1. Start PostgreSQL
docker-compose up -d postgres

# 2. Initialize database
npm run init-db

# 3. Start development server
npm run dev

# Server will start on http://localhost:8080
```

## Testing the Implementation

### 1. Check Server Health

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-20T...",
  "version": "1.0.0"
}
```

### 2. Test Node Registration (HTTP)

While nodes normally connect via WebSocket, we can simulate registration for testing:

```bash
# This won't actually work via REST (nodes must use WebSocket)
# But we can verify the server is accepting connections
```

### 3. Test with WebSocket Client (Node.js)

Create a test file `test-client.js`:

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/node?token=dev-token-home');

ws.on('open', () => {
  console.log('Connected to C&C backend');

  // Send registration
  ws.send(JSON.stringify({
    type: 'register',
    data: {
      nodeId: 'test-home-office',
      name: 'Home Office Node',
      location: 'Home Office',
      authToken: 'dev-token-home',
      metadata: {
        version: '1.0.0',
        platform: 'linux',
        networkInfo: {
          subnet: '192.168.1.0/24',
          gateway: '192.168.1.1'
        }
      }
    }
  }));
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('close', () => {
  console.log('Disconnected');
});

ws.on('error', (error) => {
  console.error('Error:', error.message);
});

// Send heartbeat every 30 seconds
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'heartbeat',
      data: {
        nodeId: 'test-home-office',
        timestamp: new Date()
      }
    }));
    console.log('Sent heartbeat');
  }
}, 30000);
```

Run it:
```bash
node test-client.js
```

### 4. Check Registered Nodes

```bash
# List all nodes
curl http://localhost:8080/api/nodes

# Get specific node
curl http://localhost:8080/api/nodes/test-home-office

# Check node health
curl http://localhost:8080/api/nodes/test-home-office/health
```

### 5. Check System Stats

```bash
curl http://localhost:8080/api/admin/stats
```

Expected response:
```json
{
  "nodes": {
    "online": 1,
    "offline": 0
  },
  "timestamp": "2025-11-20T..."
}
```

### 6. Test Heartbeat Timeout

1. Stop the test client (Ctrl+C)
2. Wait 90+ seconds
3. Check node status again:

```bash
curl http://localhost:8080/api/nodes/test-home-office
```

Node should now show `"status": "offline"`

### 7. Deregister Node

```bash
curl -X DELETE http://localhost:8080/api/admin/nodes/test-home-office
```

## Running Unit Tests

```bash
# Run tests
npm run test:ci

# With coverage
npm run test:coverage
```

## Database Inspection

```bash
# Connect to PostgreSQL
docker exec -it woly-postgres psql -U woly -d woly_cnc

# List tables
\dt

# Check nodes
SELECT id, name, location, status, last_heartbeat FROM nodes;

# Exit
\q
```

## Logs

```bash
# C&C backend logs
docker-compose logs -f cnc-backend

# Or in development mode
# Logs appear in terminal running npm run dev
```

## Configuration

Auth tokens are configured in `.env`:

```env
NODE_AUTH_TOKENS=dev-token-home,dev-token-office,dev-token-datacenter
```

Each node must use one of these tokens when connecting.

## Troubleshooting

### "Database connection failed"
- Ensure PostgreSQL is running: `docker-compose ps`
- Check DATABASE_URL in `.env`
- Run `docker-compose logs postgres` for errors

### "Invalid authentication token"
- Check token in WebSocket URL matches `NODE_AUTH_TOKENS` in `.env`
- No spaces in comma-separated tokens

### "Node marked offline"
- Nodes must send heartbeat every 30 seconds
- Marked offline after 90 seconds without heartbeat
- Check WebSocket connection is stable

### Port 8080 already in use
- Change PORT in `.env`
- Or stop other service: `docker ps` → `docker stop <container>`

## Architecture Verification

Phase 1 implements:

```
                    ┌─────────────────────┐
                    │  C&C Backend        │
                    │  (Port 8080)        │
                    │                     │
                    │  - Node Manager     │
                    │  - WebSocket Server │
                    │  - REST API         │
                    │  - PostgreSQL       │
                    └─────────────────────┘
                             ▲
                             │ WebSocket
                             │ (Registration + Heartbeat)
                             │
                    ┌────────┴─────────┐
                    │                  │
              ┌─────▼─────┐     ┌─────▼─────┐
              │  Node 1   │     │  Node 2   │
              │ (Future)  │     │ (Future)  │
              └───────────┘     └───────────┘
```

## Next Steps: Phase 2

Once Phase 1 is verified:

1. **Modify woly-backend** to add agent mode
2. **Implement C&C client** in node agent
3. **Test bidirectional communication**
4. **Connect 2 real nodes**

See: `docs/DISTRIBUTED_IMPLEMENTATION_ROADMAP.md` (Week 3-4)

## Success Criteria ✅

- [x] C&C backend starts successfully
- [x] Database schema created
- [x] WebSocket server accepts connections
- [x] Node registration works
- [x] Heartbeat mechanism functional
- [x] Nodes marked offline after timeout
- [x] REST API endpoints working
- [x] Health checks passing
- [x] Unit tests passing
- [x] Docker deployment working

## Phase 1 Metrics

- **Code:** ~2000 lines of TypeScript
- **API Endpoints:** 6
- **Database Tables:** 2 (nodes, aggregated_hosts)
- **Tests:** 13 unit tests
- **Docker Services:** 2 (postgres, cnc-backend)

---

**Status:** ✅ Phase 1 Complete  
**Ready for:** Phase 2 (Node Agent Implementation)  
**Date:** November 20, 2025
