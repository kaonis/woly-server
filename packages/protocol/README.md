# @kaonis/woly-protocol

> Part of the [woly-server](../../README.md) monorepo. Shared protocol types and Zod schemas for node agent ↔ C&C communication.

## Exports

### Types

- `HostStatus` — `'awake' | 'asleep'`
- `Host` — Canonical host representation shared across all WoLy apps (replaces `HostPayload`)
- `HostPayload` — **@deprecated** Alias for `Host`, kept for backwards compatibility
- `CommandState` — Command lifecycle state: `'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out'`
- `ErrorResponse` — Standardized error response shape with `error`, `message`, optional `code` and `details`
- `NodeMetadata` — Agent platform/version/network info
- `NodeRegistration` — Registration payload sent by nodes
- `NodeMessage` — Discriminated union of all node → C&C messages
- `CncCommand` — Discriminated union of all C&C → node commands
- `CommandResultPayload` — Result data for command acknowledgements
- `RegisteredCommandData` — Server response after successful registration

### Zod Schemas

- `hostStatusSchema` — Validates `HostStatus` (`'awake' | 'asleep'`)
- `hostSchema` — Validates `Host` object
- `commandStateSchema` — Validates `CommandState`
- `errorResponseSchema` — Validates `ErrorResponse` object
- `outboundNodeMessageSchema` — Validates `NodeMessage` at runtime
- `inboundCncCommandSchema` — Validates `CncCommand` at runtime

### Constants

- `PROTOCOL_VERSION` — Current protocol version (`'1.0.0'`)
- `SUPPORTED_PROTOCOL_VERSIONS` — Array of supported versions

## Usage

Both apps consume this package via npm workspace link:

```json
{
  "dependencies": {
    "@kaonis/woly-protocol": "*"
  }
}
```

```typescript
import {
  Host,
  HostStatus,
  CommandState,
  ErrorResponse,
  NodeMessage,
  CncCommand,
  hostSchema,
  commandStateSchema,
  errorResponseSchema,
  outboundNodeMessageSchema,
  inboundCncCommandSchema,
  PROTOCOL_VERSION,
} from '@kaonis/woly-protocol';

// Validate incoming message
const result = inboundCncCommandSchema.safeParse(JSON.parse(rawMessage));
if (result.success) {
  handleCommand(result.data);
}

// Validate a host object
const hostResult = hostSchema.safeParse(hostData);
if (hostResult.success) {
  const validHost: Host = hostResult.data;
}
```

## Building

```bash
# From monorepo root
npm run build -w packages/protocol

# Or directly
cd packages/protocol && npx tsc
```

Output goes to `dist/`. Both `main` and `types` in package.json point there.

## Testing

```bash
# From monorepo root
npm test -w packages/protocol

# Or directly
cd packages/protocol && npm test
```

The package includes schema validation tests in `src/__tests__/schemas.test.ts`.

## Publishing to npm

This package is also published to npm for the mobile app to consume.

### Quick Start (Recommended)

From the **monorepo root**, use the provided npm scripts:

```bash
# 1. Bump version (patch/minor/major)
npm run protocol:version:patch   # For bug fixes (1.1.0 → 1.1.1)
npm run protocol:version:minor   # For new features (1.1.0 → 1.2.0)
npm run protocol:version:major   # For breaking changes (1.1.0 → 2.0.0)

# 2. Publish to npm (builds automatically)
npm run protocol:publish         # Publish with 'latest' tag

# OR publish as pre-release
npm run protocol:publish:next    # Publish with 'next' tag
```

### Manual Publishing (Legacy)

If you prefer to publish manually:

```bash
cd packages/protocol
npm version patch
npm run build
npm publish --access public
```

### Notes

- The monorepo apps always use the workspace-linked source, so publishing is only needed when the mobile app needs updated types.
- Publishing requires proper npm authentication and permissions for the `@kaonis` scope.
- The `publishConfig.access: "public"` in package.json ensures scoped packages are published publicly.

## Protocol Compatibility

This package includes comprehensive contract tests to ensure protocol compatibility between node agents and the C&C backend.

### Contract Tests

- **Location**: `src/__tests__/contract.cross-repo.test.ts`
- **Coverage**: 32+ test cases covering all message types, command types, JSON serialization, version negotiation, and error handling
- **CI Enforcement**: Dedicated `protocol-compatibility` CI job runs before main validation

### Documentation

See [docs/PROTOCOL_COMPATIBILITY.md](../../docs/PROTOCOL_COMPATIBILITY.md) for:
- Versioning policy and semantic versioning rules
- Runtime version negotiation
- Breaking change workflow
- CI enforcement details
- Troubleshooting guide
