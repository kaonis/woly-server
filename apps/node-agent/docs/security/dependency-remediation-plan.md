# Node-Agent Dependency Remediation Plan

Date: 2026-02-15  
Owner: Platform Team  
Issue: #127

## Current Audit State

Command run:

```bash
npm audit --json
```

Result (2026-02-15):

- High: `0`
- Critical: `0`
- Total vulnerabilities: `0`

The previous low-severity `qs` advisory was removed after lockfile remediation via:

```bash
npm audit fix --package-lock-only
```

## Remediation Strategy

1. Prefer non-breaking dependency updates (`npm audit fix`) first.
2. Avoid semver-major or risky forced updates unless a high/critical advisory requires it.
3. If a high/critical finding cannot be patched immediately, document a time-bound exception with:
   - owner
   - risk description
   - compensating controls
   - expiry date

## CI Security Policy

Node-agent now enforces a dependency audit gate in CI:

```bash
npm run security:audit -w apps/node-agent
```

This runs `npm audit --audit-level=high` and fails CI on any high or critical vulnerability.

## Exception Register

No active high/critical exceptions as of 2026-02-15.
