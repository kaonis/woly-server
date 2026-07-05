# OpenAPI Client Generation

This repository now generates a publishable TypeScript API client package:

- Package: `@kaonis/woly-client`
- Source location: `packages/woly-client`
- Generated from:
  - `apps/cnc` OpenAPI spec
  - `apps/node-agent` OpenAPI spec

## Local Generation

From repository root:

```bash
# Export only specs
npm run openapi:export

# Full generation (export + codegen)
npm run client:generate

# Full package build (generation + tsc)
npm run client:build

# Verify external-consumer compile compatibility
npm run client:consumer-typecheck
```

`packages/woly-client/build` is reproducible and always regenerates specs and client source before compilation.

## Publishing

Manual workflow:

```bash
gh workflow run publish-client.yml --ref master -f dry-run=true
```

Or locally:

```bash
npm run client:publish
```

## Mobile App Consumption

The mobile app (`kaonis/woly`) can consume the generated package directly:

```bash
npm install @kaonis/woly-client
```

Then import generated clients:

```ts
import { CncApi, NodeAgentApi } from '@kaonis/woly-client';
```
