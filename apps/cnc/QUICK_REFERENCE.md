# WoLy C&C Backend - Quick Reference

## 🚀 Quick Start
```bash
# Development
npm install --legacy-peer-deps
npm run dev

# Production
docker-compose up -d
```

## 📡 Endpoints

### REST API
```bash
GET    /health                      # Health check
GET    /api/nodes                   # List all nodes
GET    /api/nodes/:id               # Node details
GET    /api/nodes/:id/health        # Node health
GET    /api/admin/stats             # System stats
DELETE /api/admin/nodes/:id         # Delete node
```

### WebSocket
```
ws://localhost:8080/ws/node?token=<auth-token>
```

## 🔑 Environment Variables
```env
PORT=8080
TRUST_PROXY=false
DATABASE_URL=postgresql://user:pass@host:5432/db
NODE_AUTH_TOKENS=token1,token2,token3
NODE_HEARTBEAT_INTERVAL=30000    # 30s
NODE_TIMEOUT=90000               # 90s
LOG_LEVEL=info
```

## 📨 WebSocket Messages

### Node → C&C
```javascript
// Register
{ type: 'register', data: { nodeId, name, location, authToken, metadata } }

// Heartbeat
{ type: 'heartbeat', data: { nodeId, timestamp } }
```

### C&C → Node
```javascript
// Registration confirmed
{ type: 'registered', data: { nodeId, status, heartbeatInterval } }

// Error
{ type: 'error', message: 'Description' }
```

## 🧪 Testing
```bash
npm test           # Watch mode
npm run test:ci    # Single run
npm run test:coverage
```

## 📊 Database
```sql
-- Check nodes
SELECT id, name, location, status, last_heartbeat FROM nodes;

-- Check hosts (Phase 3)
SELECT node_id, name, ip, status FROM aggregated_hosts;
```

## 🐳 Docker
```bash
docker-compose up -d              # Start all services
docker-compose logs -f cnc-backend # View logs
docker-compose down               # Stop all services
docker-compose ps                 # Check status
```

## 🔧 Scripts
```bash
npm run dev          # Development with hot reload
npm run build        # Compile TypeScript
npm start            # Production mode
npm run init-db      # Initialize database schema
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

## 🏗️ Architecture
```
Mobile App → C&C Backend (this) → Node Agents → LANs
             ├─ Node Manager
             ├─ WebSocket Server
             ├─ REST API
             └─ PostgreSQL
```

## 📝 Key Files
```
src/server.ts           # Main server
src/services/nodeManager.ts  # Node lifecycle
src/models/Node.ts      # Database operations
src/types.ts            # Type definitions
```

## ⚠️ Common Issues

**Database connection failed**
→ Check `DATABASE_URL`, ensure PostgreSQL is running

**Invalid auth token**
→ Token must match `NODE_AUTH_TOKENS` in `.env`

**Node marked offline**
→ Must send heartbeat every 30s, offline after 90s

**Port in use**
→ Change `PORT` in `.env` or stop conflicting service

## 🔗 Documentation
- `README.md` - Full documentation
- `SETUP_GUIDE.md` - Testing guide
- `PHASE1_SUMMARY.md` - Implementation details

---

**Version:** 1.0.0 (Phase 1)  
**Port:** 8080  
**Status:** ✅ Production Ready
