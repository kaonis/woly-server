# woly-backend

[![Tests](https://github.com/kaonis/woly-backend/actions/workflows/test.yml/badge.svg)](https://github.com/kaonis/woly-backend/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/kaonis/woly-backend/branch/master/graph/badge.svg)](https://codecov.io/gh/kaonis/woly-backend)

Node.js backend for [WoLy](https://github.com/kaonis/woly) - A Wake-on-LAN application with automatic network discovery.

## Features

- 🔍 **Automatic Network Discovery** - ARP scanning with DNS/NetBIOS hostname resolution
- 💤 **Wake-on-LAN** - Remote host wake-up via magic packets
- 🔐 **Security** - Rate limiting, input validation, CORS, Helmet headers
- 📊 **Health Monitoring** - Enhanced health checks with database status
- 📝 **API Documentation** - Interactive Swagger UI
- 🪵 **Structured Logging** - Winston-based logging with file rotation
- ⚙️ **Configuration Management** - Environment-based configuration with `.env`
- 🐳 **Docker Support** - Containerized deployment ready
- ✅ **Testing** - 85 tests with 83% coverage (Jest + Supertest)

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- SQLite3

### Installation

```bash
# Clone the repository
git clone https://github.com/kaonis/woly-backend.git
cd woly-backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Build
npm run build

# Start server
npm start
```

### Development

```bash
# Run in development mode with auto-reload
npm run dev
```

## Testing

This project has comprehensive test coverage:

- **85 tests** across unit and integration test suites
- **83.68%** statement coverage
- **92.85%** function coverage

Run tests with:

```bash
npm test                # Run all tests
npm run test:coverage   # Run tests with coverage report
npm run test:watch      # Run tests in watch mode
npm run test:unit       # Run only unit tests
npm run test:integration # Run only integration tests
```

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
      "discovered": 1
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

# Caching
MAC_VENDOR_TTL=86400000        # 24 hours
MAC_VENDOR_RATE_LIMIT=1000     # 1 second between API calls

# CORS
CORS_ORIGINS=http://localhost:19000,http://192.168.1.228:8082

# Logging
LOG_LEVEL=info          # error, warn, info, http, debug
```

## Security Features

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

## Development

### Project Structure

```
woly-backend/
├── app.ts                 # Application entry point
├── config/
│   └── index.ts          # Configuration management
├── controllers/
│   └── hosts.ts          # Request handlers
├── middleware/
│   ├── errorHandler.ts   # Error handling
│   ├── rateLimiter.ts    # Rate limiting
│   └── validateRequest.ts # Input validation
├── routes/
│   └── hosts.ts          # Route definitions
├── services/
│   ├── hostDatabase.ts   # Database operations
│   └── networkDiscovery.ts # Network scanning
├── utils/
│   └── logger.ts         # Logging configuration
├── validators/
│   └── hostValidator.ts  # Joi schemas
├── swagger.ts            # API documentation config
└── types.ts              # TypeScript types
```

### Code Quality

The project uses:

- **TypeScript** for type safety
- **ESLint** for code linting
- **Prettier** for code formatting
- **Husky** for pre-commit hooks
- **lint-staged** for staged file linting

### Pre-commit Hooks

Before each commit:

1. ESLint automatically fixes issues
2. Prettier formats code
3. Commit fails if linting errors remain

## Recent Improvements (Phase 1-4)

### ✅ Phase 1: Foundation

- Environment-based configuration management
- Winston structured logging
- Global error handling middleware
- CORS and Helmet security
- Enhanced health checks
- Docker support

### ✅ Phase 2: Security & Reliability

- Rate limiting on all endpoints
- Joi input validation
- Standardized error responses
- Database connection retry logic

### ✅ Phase 4: Documentation & DX

- OpenAPI/Swagger documentation
- Modernized ESLint configuration
- Pre-commit hooks with Husky
- Enhanced README

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to verify
5. Commit (pre-commit hooks will run)
6. Push and create a pull request

## License

MIT

## Links

- **Frontend**: https://github.com/kaonis/woly
- **API Docs**: http://localhost:8082/api-docs (when running)
- **Issues**: https://github.com/kaonis/woly-backend/issues
