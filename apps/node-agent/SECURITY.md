# SECURITY NOTES

## Dependency Risk Snapshot (Last Updated: 2026-02-07)

This document tracks known security vulnerabilities and remediation status.

### Current Status: 3 High Severity Vulnerabilities (Accepted Risk)

Running `npm audit` reports:

- **3 high severity vulnerabilities** in the `ip` package dependency chain
- **0 fixable vulnerabilities** (all remaining vulnerabilities have no patches available)

## Resolved Vulnerabilities (2026-02-07)

✅ **Fixed: tar Package Vulnerabilities (via sqlite3 → better-sqlite3 Migration)**

- **node-tar: Arbitrary File Overwrite and Symlink Poisoning** in versions ≤7.5.2 ([GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97))
- **node-tar: Race Condition via Unicode Ligature Collisions on macOS APFS** in versions ≤7.5.3 ([GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w))
- **node-tar: Hardlink Path Traversal** in versions <7.5.7 ([GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v))
- **Resolution**: Migrated from `sqlite3@5.1.7` to `better-sqlite3@12.6.2`
- **Impact**: Eliminated 5 high severity vulnerabilities by removing the `sqlite3` → `node-gyp` → `tar` dependency chain entirely
- **Additional Benefits**:
  - Better performance (synchronous API, faster queries)
  - Simpler code (no callback hell)
  - Improved type safety
  - No native build dependency on tar

## Known Vulnerabilities (Accepted Risk)

### 🔴 CVE-2024-29415: ip SSRF Improper Categorization in isPublic

**Severity**: High (CVSS 8.1)  
**Affected Package**: `ip@*` (all versions including 2.0.1)  
**Dependency Chain**: `local-devices@4.0.0` → `get-ip-range@4.0.1` → `ip@2.0.1`  
**Advisory**: https://github.com/advisories/GHSA-2p57-rm9w-gvfp

**Vulnerability Description**:
The `ip.isPublic()` function incorrectly categorizes certain IP ranges, potentially allowing Server-Side Request Forgery (SSRF) attacks when applications use this function to validate if an IP is public/private.

**Risk Assessment**: ⚠️ **LOW ACTUAL RISK**

Despite the high CVSS score, this vulnerability has **minimal impact** on this application because:

1. **Function Not Used**: The vulnerable `isPublic()` function is NOT used by `get-ip-range` or anywhere in our codebase

   - `get-ip-range` only uses `ip.toLong()` and `ip.fromLong()` for IP range calculations
   - We verified via code inspection that `isPublic()` and `isPrivate()` are not called

2. **Network Discovery Context**:

   - `local-devices` is used purely for local network ARP scanning
   - Only operates on RFC1918 private network ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
   - No user-supplied IPs are processed for public/private validation

3. **No Remote Exploitation Vector**:
   - The application does not make outbound requests based on discovered IPs
   - Network scanning is isolated to the local subnet
   - Rate limiting and input validation prevent abuse

**Compensating Controls**:

- ✅ Application runs behind trusted network boundaries (private networks only)
- ✅ Rate limiting enabled on all API endpoints
- ✅ Input validation with Joi schemas
- ✅ CORS restrictions limit origin access
- ✅ No direct usage of vulnerable `isPublic()` function

**Remediation Status**:

- **No patch available** from upstream `ip` package maintainers
- **Monitoring**: Tracking issue at https://github.com/indutny/node-ip/issues/144
- **Package overrides**: Already using latest `ip@2.0.1` and `get-ip-range@4.0.1`

**Future Mitigation Options**:

1. **Replace `local-devices`**: Evaluate alternative ARP scanning libraries when available
2. **Fork and patch**: If critical, could fork `ip` package with fix for `isPublic()`
3. **Custom implementation**: Replace with native ARP command parsing (no third-party dependency)

## Deployment Security Guidelines

### Network Isolation

- **Required**: Deploy behind firewall/VPN for production use
- **Avoid**: Exposing the API directly to the public internet
- **Best Practice**: Use reverse proxy (nginx/Apache) with additional security headers

### Monitoring

- Monitor `npm audit` output regularly (included in CI/CD)
- Subscribe to GitHub security advisories for dependencies
- Review Dependabot/Renovate PRs promptly

### Additional Hardening

### API Authentication (NEW: 2026-02-10)

✅ **Implemented**: Optional API key authentication for `/hosts/*` endpoints

- **Environment Variable**: `NODE_API_KEY` - Set to enable authentication
- **Header Format**: `Authorization: Bearer <api-key>`
- **Endpoints Protected**: All `/hosts/*` routes when `NODE_API_KEY` is set
- **Public Endpoints**: `/health` (always accessible for monitoring)
- **Security Features**:
  - Constant-time key comparison (prevents timing attacks)
  - Proper 401 error responses
  - Case-sensitive validation
  - HTTP spec compliant whitespace handling

**Usage**:

```bash
# Without authentication (default - standalone mode)
export NODE_API_KEY=""  # or leave unset

# With authentication (recommended for exposed deployments)
export NODE_API_KEY="your-secure-random-key-here"
```

**Recommendation**: Enable authentication for any deployment exposed beyond the local network.

### Other Security Measures

- Use HTTPS/TLS for all network communication
- Implement request logging and monitoring
- Regular security updates via `npm update`

## Security Update Policy

1. **Automated Updates**: Renovate bot creates PRs for dependency updates
2. **Review Cadence**: Security updates reviewed within 48 hours
3. **Patch Priority**:
   - Critical vulnerabilities: Immediate (same day)
   - High vulnerabilities: 1-3 days
   - Medium/Low: Next release cycle

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainers directly rather than opening a public issue. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested remediation (if applicable)

---

**Last Audit**: 2026-02-07  
**Next Review**: 2026-03-07 (monthly cadence)
