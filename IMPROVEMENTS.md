# WoLy Server — Improvement Ideas & Future Features

This document tracks improvement ideas and feature requests for the WoLy distributed Wake-on-LAN system. Each section groups related ideas by category and priority.

> **Status:** 2026-02-18 — Reconciled with repository state and GitHub issues (including #340). Completed items are marked explicitly; active backlog items include issue links where available.

---

## Priority 1: Security Enhancements

Based on the [SECURITY_AUDIT.md](SECURITY_AUDIT.md) known risks section.

### 1.1 Node-Agent API Authentication

| Priority | HIGH |
|----------|------|
| **Status** | Implemented (`#52`) |
| **Severity** | High |

**Problem:** The node-agent API (`/hosts/*`) has zero authentication. All endpoints are publicly accessible. Anyone with network access can wake computers, add/delete hosts, trigger scans.

**Solution:** Add optional API key authentication that can be enabled via environment variable.

**Implementation:**
- Add `NODE_API_KEY` environment variable (optional)
- When set, require it in `Authorization: Bearer <key>` header
- Apply middleware to all `/hosts/*` endpoints
- Document in README.md and .env.example

**References:**
- SECURITY_AUDIT.md §11
- https://github.com/kaonis/woly-server/issues/52

---

### 1.2 CnC Node Listing Authentication

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#53`) |
| **Severity** | Medium |

**Problem:** `GET /api/nodes`, `GET /api/nodes/:id`, `GET /api/nodes/:id/health` require no JWT. Node metadata (IDs, locations, capabilities, last heartbeat) is exposed to anyone.

**Solution:** Move node listing behind `authenticateJwt` middleware if the API is internet-facing.

**Implementation:**
- Apply `authenticateJwt` middleware to node listing routes
- Ensure backward compatibility for internal health checks
- Add configuration flag `NODE_LISTING_REQUIRES_AUTH` (default: false for backward compat)

**References:**
- SECURITY_AUDIT.md §12
- https://github.com/kaonis/woly-server/issues/53

---

### 1.3 CnC Rate Limiting

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#54`) |
| **Severity** | Medium |

**Problem:** `POST /api/auth/token` can be brute-forced with no throttling. No rate limiting exists on C&C endpoints.

**Solution:** Add `express-rate-limit` to the CnC app, especially on the auth endpoint.

**Implementation:**
- Install `express-rate-limit` (already used by node-agent)
- Apply strict rate limit to `/api/auth/token` (e.g., 5 attempts per 15 minutes)
- Apply general rate limit to all API endpoints (e.g., 100 requests per minute)
- Make limits configurable via environment variables

**References:**
- SECURITY_AUDIT.md §13
- https://github.com/kaonis/woly-server/issues/54

---

### 1.4 WebSocket Message Rate Limiting

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#55`) |
| **Severity** | Low |

**Problem:** A connected node could flood the server with messages.

**Solution:** Implement per-connection message rate limiting (e.g., 100 messages/second).

**Implementation:**
- Track message count per WebSocket connection
- Apply sliding window rate limiter
- Disconnect and log if limit exceeded
- Make limit configurable via environment variable

**References:**
- SECURITY_AUDIT.md §14
- https://github.com/kaonis/woly-server/issues/55

---

### 1.5 WebSocket Connection Limits per IP

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#56`) |
| **Severity** | Low |

**Problem:** An attacker could open many WebSocket connections from the same IP.

**Solution:** Track connections per IP and enforce a maximum (e.g., 10 per IP).

**Implementation:**
- Track active WebSocket connections by source IP
- Reject new connections when limit exceeded
- Make limit configurable via environment variable
- Add graceful handling for legitimate multi-node setups

**References:**
- SECURITY_AUDIT.md §15
- https://github.com/kaonis/woly-server/issues/56

---

### 1.6 Tighten Production CORS Configuration

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#57`) |
| **Severity** | Low |

**Problem:** Node-agent CORS allows ANY `*.ngrok-free.app` and `*.netlify.app` subdomain. This is fine for development but too broad for production.

**Solution:** Provide production-specific CORS configuration.

**Implementation:**
- Add `NODE_CORS_ORIGINS` environment variable
- When set, use explicit origins instead of wildcards
- Document recommended production configuration
- Keep development-friendly defaults

**References:**
- SECURITY_AUDIT.md §16
- https://github.com/kaonis/woly-server/issues/57

---

### 1.7 Separate Session Token Secret

| Priority | LOW |
|----------|-----|
| **Status** | Partial (`#58`) |
| **Severity** | Low |

**Problem:** `WS_SESSION_TOKEN_SECRETS` defaults to `JWT_SECRET`. If JWT secret is compromised, WebSocket session tokens are also compromised.

**Solution:** Use separate secrets for session tokens.

**Implementation:**
- Make `WS_SESSION_TOKEN_SECRETS` required (no fallback to JWT_SECRET)
- Update documentation to emphasize separate secrets
- Add validation that fails fast if not set in production

**References:**
- SECURITY_AUDIT.md §17
- https://github.com/kaonis/woly-server/issues/58

**Notes:**
- Dedicated `WS_SESSION_TOKEN_SECRETS` support exists, but fallback to `JWT_SECRET` still remains for compatibility.

---

## Priority 2: Code TODOs

Issues identified in code comments.

### 2.1 Get Node-Agent Version from package.json

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#88`) |

**Problem:** `apps/node-agent/src/services/cncClient.ts:159` has hardcoded version `'1.0.0'`.

**Current code:**
```typescript
metadata: {
  version: '1.0.0', // TODO: Get from package.json
```

**Solution:** Read version from `package.json` at startup.

**Implementation:**
```typescript
import packageJson from '../../package.json';
// ...
version: packageJson.version,
```

**References:**
- `apps/node-agent/src/services/cncClient.ts:159`
- https://github.com/kaonis/woly-server/issues/88

---

### 2.2 Get Actual Subnet and Gateway

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#88`) |

**Problem:** `apps/node-agent/src/services/cncClient.ts:163-164` uses placeholder network info:
```typescript
networkInfo: {
  subnet: '0.0.0.0/0', // TODO: Get actual subnet
  gateway: '0.0.0.0', // TODO: Get actual gateway
}
```

**Solution:** Detect actual network configuration at startup.

**Implementation:**
- Use `os.networkInterfaces()` to detect primary interface
- Parse subnet from interface configuration
- Detect gateway using platform-specific commands:
  - Linux: `ip route show default`
  - macOS: `route -n get default`
  - Windows: `ipconfig` or route table parsing
- Store in node metadata
- Fall back to current placeholders if detection fails

**References:**
- `apps/node-agent/src/services/cncClient.ts:163-164`
- https://github.com/kaonis/woly-server/issues/88

**Notes:**
- Current implementation derives subnet from interface CIDR and infers gateway from interface address; platform-specific route-table probing is not yet used.

---

## Priority 3: Feature Enhancements

New features to improve functionality.

### 3.1 Persistent Host Notes/Metadata

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#216`) |

**Problem:** Users cannot add custom notes or metadata to hosts (e.g., "Main gaming PC", "NAS - backup server").

**Solution:** Add a `notes` or `metadata` field to the host schema.

**Implementation:**
- Add `notes: string | null` column to host database schema
- Expose via API: `PUT /hosts/:name` to update notes
- Display in Swagger docs
- Add migration for existing databases

**Benefits:**
- Better host organization
- Easier identification in multi-device environments

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/216

---

### 3.2 Host Grouping/Tagging

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#216`) |

**Problem:** No way to organize hosts by category (e.g., "Workstations", "Servers", "IoT").

**Solution:** Add tagging or grouping functionality.

**Implementation:**
- Add `tags: string[]` field to host schema
- Add API endpoints for tag management
- Allow filtering hosts by tag
- Pre-defined tag categories (optional)

**Benefits:**
- Bulk operations on host groups
- Better organization for large networks

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/216

---

### 3.3 Host Wake Schedule

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#255`) |

**Problem:** No way to schedule automatic wake-up at specific times.

**Solution:** Add scheduled wake-up functionality.

**Implementation:**
- Add `wakeSchedule` field to host schema (cron expression)
- Background job processor (node-cron or similar)
- API endpoints to manage schedules
- Time zone support

**Benefits:**
- Automated morning wake-up for office computers
- Energy-saving with scheduled sleep/wake cycles

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/255

---

### 3.4 Wake-on-LAN Success Verification

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#217`) |

**Problem:** After sending magic packet, no automatic verification that the host actually woke up.

**Solution:** Poll host status after WoL request to confirm wake-up.

**Implementation:**
- After WoL, schedule ARP ping every 5 seconds for up to 2 minutes
- Update host status when detected as awake
- Return status in WoL response
- Optional webhook notification on wake success/failure

**Benefits:**
- Immediate feedback to user
- Detect WoL configuration issues

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/217

---

### 3.5 Historical Status Tracking

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** No historical data on host availability/uptime.

**Solution:** Track and store host status changes over time.

**Implementation:**
- Add `host_status_history` table
- Record timestamp + status on every change
- API endpoint to query history
- Retention policy (e.g., 30 days)
- Basic uptime percentage calculation

**Benefits:**
- Identify hosts with poor availability
- Troubleshoot intermittent network issues
- Usage analytics

---

### 3.6 Multi-MAC Support per Host

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Hosts with multiple network interfaces (WiFi + Ethernet) appear as separate entries.

**Solution:** Allow multiple MAC addresses per logical host.

**Implementation:**
- Modify host schema to support multiple MACs
- Primary MAC for WoL
- Track which interface is currently active
- Merge duplicate hosts in migration

**Benefits:**
- Accurate representation of multi-interface devices
- Correct host counts

---

### 3.7 Custom Wake-on-LAN Ports

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Some devices require WoL packets on non-standard ports (not port 9).

**Solution:** Allow configuring custom WoL port per host.

**Implementation:**
- Add `wolPort: number` field to host schema (default: 9)
- Pass to magic packet sender
- Validate port range (1-65535)
- API to update host WoL port

**Benefits:**
- Support for non-standard WoL configurations
- Better compatibility with diverse hardware

---

## Priority 4: Operational Improvements

### 4.1 Health Check Improvements

| Priority | MEDIUM |
|----------|--------|
| **Status** | Partial |

**Problem:** Health checks are basic, no detailed diagnostics.

**Solution:** Enhanced health check endpoints with detailed status.

**Implementation:**
- Database connection status
- Last scan timestamp
- Active WebSocket status (for agent mode)
- Memory/CPU usage
- Disk space
- Health check versioning

**Benefits:**
- Better monitoring integration (Prometheus, Datadog)
- Faster troubleshooting

**Notes:**
- Node-agent now exposes enhanced health diagnostics (`database`, `networkScan`, `agent`, telemetry), but C&C health diagnostics are still basic.

---

### 4.2 Prometheus Metrics Export

| Priority | MEDIUM |
|----------|--------|
| **Status** | Partial (`#215`) |

**Problem:** No metrics export for monitoring systems.

**Solution:** Add Prometheus metrics endpoint.

**Implementation:**
- Install `prom-client`
- Expose `/metrics` endpoint
- Track metrics:
  - Total hosts (by status)
  - WoL requests (success/failure)
  - Network scan duration
  - WebSocket connections
  - API request latency
  - Database query duration

**Benefits:**
- Production monitoring
- Performance insights
- Alerting capabilities

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/215

**Notes:**
- C&C now exposes Prometheus metrics endpoints (`/metrics`, `/api/metrics`) with runtime command/node/protocol gauges.

---

### 4.3 Structured Logging Improvements

| Priority | LOW |
|----------|-----|
| **Status** | Partial |

**Problem:** Logs are good but could be better structured for log aggregation systems.

**Solution:** Enhance Winston configuration for production log aggregation.

**Implementation:**
- Add correlation IDs to requests
- Support JSON log format (configurable)
- Add log level filtering by component
- ELK/Datadog compatible format
- Sensitive data redaction audit

**Benefits:**
- Better log aggregation
- Easier troubleshooting
- Compliance requirements

**Notes:**
- Correlation IDs are implemented on C&C API routes; broader structured logging standardization remains open.

---

### 4.4 Database Backup/Restore Tools

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** No built-in backup/restore functionality.

**Solution:** Add CLI commands for database backup and restore.

**Implementation:**
- `npm run backup` script
- `npm run restore -- <file>` script
- Automatic backup before migrations
- S3/cloud storage integration (optional)

**Benefits:**
- Data protection
- Easy migration between servers
- Disaster recovery

---

## Priority 5: Developer Experience

### 5.1 End-to-End Tests

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#218`) |

**Problem:** Current tests are unit and integration. No E2E tests across both services.

**Solution:** Add E2E test suite that tests full workflow.

**Implementation:**
- Use Playwright or similar
- Test scenarios:
  - Node connects to C&C
  - Host discovery propagates
  - WoL command routing
  - Mobile app authentication
- Run in CI

**Benefits:**
- Catch integration bugs
- Document expected behavior
- Confidence in releases

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/218

---

### 5.2 API Client Libraries

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Mobile app implements API clients manually.

**Solution:** Auto-generate TypeScript client from OpenAPI specs.

**Implementation:**
- Use `openapi-typescript-codegen` or similar
- Generate from Swagger definitions
- Publish as separate npm package
- Include in protocol package

**Benefits:**
- Type-safe API clients
- Reduced mobile app code
- Automatic updates

---

### 5.3 Development Docker Compose

| Priority | LOW |
|----------|-----|
| **Status** | Implemented (`#339`) |

**Problem:** C&C has docker-compose.yml but no unified dev environment.

**Solution:** Add root-level docker-compose.yml for full stack development.

**Implementation:**
- Node-agent service
- C&C service
- PostgreSQL
- Shared network
- Volume mounts for hot reload
- Seed data

**Benefits:**
- Easy onboarding
- Consistent dev environment
- Testing multi-node scenarios

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/339

---

### 5.4 Pre-commit Hooks

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Linting/type errors sometimes make it to commits.

**Solution:** Add pre-commit hooks with Husky.

**Implementation:**
- Install Husky + lint-staged
- Run on staged files:
  - ESLint
  - Prettier
  - TypeScript check
  - Unit tests (fast only)
- Optional git-secrets for credential detection

**Benefits:**
- Catch errors before commit
- Enforce code quality
- Prevent credential leaks

---

## Priority 6: Architecture Improvements

### 6.1 GraphQL API Option

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** REST API requires multiple roundtrips for some mobile app views.

**Solution:** Add GraphQL endpoint alongside REST API.

**Implementation:**
- Apollo Server
- Schema generation from existing types
- Maintain REST API for backward compatibility
- GraphQL for mobile app v2

**Benefits:**
- Reduced mobile app network calls
- Flexible queries
- Better mobile performance

---

### 6.2 Redis Cache Layer

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Database queries for host lists on every request.

**Solution:** Add Redis cache for frequently accessed data.

**Implementation:**
- Optional Redis integration (disabled by default)
- Cache host lists
- Cache node status
- TTL-based invalidation
- Manual invalidation on updates

**Benefits:**
- Reduced database load
- Faster API responses
- Better scalability

---

### 6.3 Message Queue for Commands

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** C&C to node communication requires active WebSocket.

**Solution:** Add message queue (RabbitMQ/Redis) for offline nodes.

**Implementation:**
- Queue WoL/scan commands
- Deliver when node reconnects
- Command expiration
- Retry logic
- Status tracking

**Benefits:**
- Reliability for intermittent connections
- Command persistence
- Better error handling

---

## Priority 7: Documentation

### 7.1 API Integration Examples

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** No example code for API integration.

**Solution:** Add examples directory with client implementations.

**Implementation:**
- cURL examples for all endpoints
- Python client example
- Node.js client example
- Postman collection

**Benefits:**
- Easier third-party integration
- Better onboarding

---

### 7.2 Deployment Guides

| Priority | MEDIUM |
|----------|--------|
| **Status** | Implemented (`#219`) |

**Problem:** No production deployment documentation.

**Solution:** Add deployment guides for common platforms.

**Implementation:**
- Docker Compose production setup
- Kubernetes manifests
- AWS deployment (ECS/Fargate)
- VPS deployment (systemd)
- Nginx reverse proxy config
- TLS/SSL setup

**Benefits:**
- Easier production deployment
- Reduced support questions

**Tracking Issue:**
- https://github.com/kaonis/woly-server/issues/219

---

### 7.3 Architecture Decision Records (ADRs)

| Priority | LOW |
|----------|-----|
| **Status** | Partial (app-level ADRs exist; root consolidation pending) |

**Problem:** ADRs exist in app-specific folders but are not consolidated in a single root-level ADR index.

**Solution:** Consolidate ADRs in root docs/ directory.

**Implementation:**
- Move existing ADRs to `/docs/adr/`
- Add cross-cutting decision records
- Document protocol versioning strategy
- Document security decisions

**Benefits:**
- Historical context for contributors
- Consistent decision tracking

---

## Priority 8: Mobile App Integration

### 8.1 Push Notifications

| Priority | MEDIUM |
|----------|--------|
| **Status** | Not Implemented |

**Problem:** Mobile app must poll for host status changes.

**Solution:** Add push notification support.

**Implementation:**
- Integrate FCM/APNS
- Register device tokens via API
- Send notifications on:
  - Host wake-up
  - Host goes offline
  - Scan complete
- User-configurable notification preferences

**Benefits:**
- Real-time updates
- Better user experience
- Reduced polling traffic

---

### 8.2 QR Code Pairing

| Priority | LOW |
|----------|-----|
| **Status** | Not Implemented |

**Problem:** Manual entry of node URLs and auth tokens is error-prone.

**Solution:** QR code-based node pairing.

**Implementation:**
- Node-agent endpoint to generate QR code
- Encode: node URL, auth token, location
- Mobile app scans and auto-configures
- Security: one-time codes or expiration

**Benefits:**
- Easier onboarding
- Fewer configuration errors

---

## Implementation Priority Summary

| Priority | Total Ideas | Current State |
|----------|-------------|---------------|
| **HIGH** | 1 | Completed (`#52`) |
| **MEDIUM** | 11 | Mixed: planned + partial + active roadmap issues |
| **LOW** | 20 | Mixed: planned + partial |

---

## How to Contribute

See individual GitHub issues for implementation tracking. Each improvement should have:

1. **Issue number** — Link back to this document
2. **Implementation plan** — Detailed technical approach
3. **Tests** — How to verify the change
4. **Documentation** — What docs need updating
5. **Breaking changes** — If any, with migration guide

---

## Next Steps

1. **Execute active roadmap issues first** — Start with `#334`, `#336`, `#337`, `#338`, `#339`, `#342`, `#343`, `#344`, `#345`, `#346`, `#347`, `#348`, `#349`
2. **Re-evaluate priority after each merge** — Keep this file aligned with real repo status
3. **Create new issues only for net-new backlog gaps** — Avoid duplicates against closed work
4. **Assign to milestones** — Group related improvements
5. **Accept contributions** — Community PRs welcome!

---

*Last updated: 2026-02-18*
