# C&C Testing Guide

## Local Commands

From repository root:

```bash
npm run test -w apps/cnc
npm run test:e2e:smoke -w apps/cnc
```

## Cross-Service E2E Smoke

`npm run test:e2e:smoke -w apps/cnc` runs `src/services/__tests__/crossService.e2e.smoke.test.ts` in-band.

This suite starts temporary C&C and node-agent services with isolated SQLite files and validates:

1. Node registration and host propagation.
2. Manual host create/update/delete propagation.
3. Wake command routing.
4. One-time schedule creation and execution.
5. Node disconnect -> offline command queue -> reconnect flush.
6. JWT token exchange and protected endpoint role access.

The suite is expected to finish in under 3 minutes in CI.

## Manual CI Dispatch

For budget mode, use the dedicated manual workflow:

```bash
gh workflow run cross-service-e2e-smoke.yml --ref master
```
