# WoLy Node Agent

> Part of the [woly-server](../../README.md) monorepo. Per-LAN Wake-on-LAN agent with automatic network discovery.

## Features

- Automatic network discovery via ARP scanning with DNS/NetBIOS hostname resolution
- Wake-on-LAN magic packet sending
- Dual status tracking — `status` (ARP-based, reliable) and `pingResponsive` (ICMP, diagnostic)
- Standalone or agent mode (connects to C&C backend via WebSocket)
- Rate limiting, input validation, CORS, Helmet security headers
- Interactive Swagger API docs at `/api-docs`
- Structured Winston logging with file rotation
- 240+ tests with 90%+ coverage

## Quick Start

### Prerequisites

- Node.js 24+ (see root `.nvmrc`)
- npm 10+

### From monorepo root

```bash
npm install
cp apps/node-agent/.env.example apps/node-agent/.env
npm run dev:node-agent
```

### Standalone development

```bash
cd apps/node-agent
npm run dev
```

## Testing

240+ tests with enforced coverage thresholds (50% branches/functions/lines/statements).

```bash
npm test                 # All tests
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:ci          # CI mode
npm run typecheck        # Type-check without emitting
```

**Test organization:**

- Unit tests: `src/**/__tests__/*.unit.test.ts` (alongside source)
- Integration tests: `src/__tests__/*.integration.test.ts`

## Host Status Fields

Hosts have two separate status indicators:

### `status` (awake/asleep)

- **Source**: ARP network discovery
- **Meaning**: If a device responds to ARP, it's on the network and awake
- **Reliability**: Very reliable - ARP responses mean the device is active

### `pingResponsive` (1/0/null)

- **Source**: ICMP ping test
- **Values**:
  - `1` - Host responds to ping
  - `0` - Host doesn't respond to ping (may still be awake due to firewall)
  - `null` - Not yet tested
- **Meaning**: Additional diagnostic information about network reachability
- **Note**: Many devices block ping for security, so `pingResponsive: 0` doesn't mean the host is asleep

**Recommended interpretation**: Use `status` for determining if a device is awake. Use `pingResponsive` for network diagnostics and troubleshooting.

## Security

Dependency/security tracking notes and mitigation strategy are documented in [`SECURITY.md`](./SECURITY.md).

## API Documentation

### Interactive Documentation

Visit **http://localhost:8082/api-docs** for interactive Swagger UI documentation with:

- Complete endpoint descriptions
- Request/response schemas
- Try-it-out functionality
- Example payloads

### Quick Reference

#### Health Check

```bash
GET /health
```

**Response:**

```json
{
  "uptime": 73.876685,
  "timestamp": 1763544894939,
  "status": "ok",
  "environment": "development",
  "checks": {
    "database": "healthy",
    "networkScan": "idle"
  }
}
```

#### Get All Hosts

```bash
GET /hosts
```

**Response:**

```json
{
  "hosts": [
    {
      "name": "PHANTOM-MBP",
      "mac": "80:6D:97:60:39:08",
      "ip": "192.168.1.147",
      "status": "awake",
      "lastSeen": "2025-11-19 09:24:30",
      "discovered": 1,
      "pingResponsive": 1
    }
  ],
  "scanInProgress": false,
  "lastScanTime": "2025-11-19T09:24:30.000Z"
}
```

#### Get Single Host

```bash
GET /hosts/:name
```

**Example:**

```bash
curl http://localhost:8082/hosts/PHANTOM-MBP
```

#### Wake Up Host

```bash
POST /hosts/wakeup/:name
```

**Example:**

```bash
curl -X POST http://localhost:8082/hosts/wakeup/PHANTOM-MBP
```

**Response:**

```json
{
  "success": true,
  "name": "PHANTOM-MBP",
  "mac": "80:6D:97:60:39:08",
  "message": "Wake-on-LAN packet sent"
}
```

#### Trigger Network Scan

```bash
POST /hosts/scan
```

**Rate Limited:** 5 requests per minute

**Example:**

```bash
curl -X POST http://localhost:8082/hosts/scan
```

#### Add Host Manually

```bash
POST /hosts
Content-Type: application/json

{
  "name": "MY-DEVICE",
  "mac": "AA:BB:CC:DD:EE:FF",
  "ip": "192.168.1.100"
}
```

**Example:**

```bash
curl -X POST http://localhost:8082/hosts \
  -H "Content-Type: application/json" \
  -d '{"name":"MY-DEVICE","mac":"AA:BB:CC:DD:EE:FF","ip":"192.168.1.100"}'
```

#### Get MAC Vendor

```bash
GET /hosts/mac-vendor/:mac
```

**Example:**

```bash
curl http://localhost:8082/hosts/mac-vendor/80:6D:97:60:39:08
```

**Response:**

```json
{
  "mac": "80:6D:97:60:39:08",
  "vendor": "Apple, Inc.",
  "source": "macvendors.com (cached)"
}
```

## Configuration

Configuration is managed via environment variables. Create a `.env` file:

```env
# Server Configuration
PORT=8082
HOST=0.0.0.0
NODE_ENV=development

# Database
DB_PATH=./db/woly.db

# Network Discovery
SCAN_INTERVAL=300000    # 5 minutes
SCAN_DELAY=5000         # 5 seconds initial delay
PING_TIMEOUT=2000       # 2 seconds
USE_PING_VALIDATION=false  # Use ping to validate awake status (default: false, ARP is sufficient)
# Note: ARP discovery means a host is responding on the network (awake)
# Ping validation is optional but may fail even for awake hosts due to firewalls
# All hosts are always ping-tested to track pingResponsive status (separate from awake/asleep)

# Caching
MAC_VENDOR_TTL=86400000        # 24 hours
MAC_VENDOR_RATE_LIMIT=1000     # 1 second between API calls

# CORS
CORS_ORIGINS=http://localhost:19000,http://192.168.1.228:8082

# Logging
LOG_LEVEL=info          # error, warn, info, http, debug
```

## Security Features

### API Authentication (Optional)

**NEW**: Optional API key authentication for `/hosts/*` endpoints.

- **Enable**: Set `NODE_API_KEY` environment variable
- **Disable**: Leave `NODE_API_KEY` unset (default - standalone mode)
- **Header Format**: `Authorization: Bearer <your-api-key>`
- **Protected Endpoints**: All `/hosts/*` routes when enabled
- **Public Endpoints**: `/health` (always accessible)

**Example Usage**:

```bash
# Request without authentication (fails when NODE_API_KEY is set)
curl http://localhost:8082/hosts
# Response: 401 Unauthorized

# Request with authentication
curl -H "Authorization: Bearer your-api-key" http://localhost:8082/hosts
# Response: 200 OK with hosts list

# Health check (always public)
curl http://localhost:8082/health
# Response: 200 OK (no auth required)
```

**Security Features**:
- Constant-time key comparison (prevents timing attacks)
- Flexible whitespace handling per HTTP spec
- Case-sensitive validation
- Descriptive error messages

**Recommendation**: Enable for deployments exposed beyond local network.

### Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Network Scans**: 5 requests per minute per IP
- **Wake Requests**: 20 requests per minute per IP

Rate limit information is returned in response headers:

- `RateLimit-Limit`: Maximum requests per window
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Seconds until reset

### Input Validation

All endpoints validate input using Joi schemas:

- MAC address format: `XX:XX:XX:XX:XX:XX` or `XX-XX-XX-XX-XX-XX`
- IP address format: Valid IPv4/IPv6
- Hostname: 1-255 characters

### Security Headers

Helmet.js provides security headers:

- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

### CORS

Configurable CORS origins via environment variable.

## Error Handling

All errors follow a standardized format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "MAC address must be in format XX:XX:XX:XX:XX:XX",
    "statusCode": 400,
    "timestamp": "2025-11-19T09:35:06.541Z",
    "path": "/hosts/mac-vendor/INVALID"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR` (400) - Invalid input
- `NOT_FOUND` (404) - Resource not found
- `INTERNAL_ERROR` (500) - Server error

## Docker Deployment

### Build Image

```bash
docker build -t woly-backend:latest .
```

### Run Container

```bash
docker run -d \
  --name woly-backend \
  --net host \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/logs:/app/logs \
  -e NODE_ENV=production \
  woly-backend:latest
```

### Docker Compose

```bash
docker-compose up -d
```

**Note:** Host networking mode is required for ARP scanning.

## Logging

Winston-based structured logging with levels:

- `error`: Error messages (logged to `logs/error.log`)
- `warn`: Warnings
- `info`: General information
- `http`: HTTP requests
- `debug`: Detailed debugging

Logs are written to:

- Console (colored output in development)
- `logs/combined.log` (all levels)
- `logs/error.log` (errors only)

## Project Structure

```
apps/node-agent/
├── src/
│   ├── app.ts                 # Express app + initialization
│   ├── types.ts               # Local TypeScript types
│   ├── swagger.ts             # OpenAPI/Swagger config
│   ├── config/                # Environment configuration
│   ├── controllers/           # Request handlers
│   ├── middleware/            # Error handling, rate limiting, validation
│   ├── routes/                # Route definitions
│   ├── services/              # Business logic (hostDatabase, networkDiscovery, agent)
│   ├── utils/                 # Logger
│   └── validators/            # Joi schemas
├── types/                     # Ambient .d.ts for untyped packages
├── jest.config.js
├── tsconfig.json              # Extends ../../tsconfig.base.json
└── Dockerfile
```

## License

Apache License 2.0 (see `LICENSE` in the repo root).
