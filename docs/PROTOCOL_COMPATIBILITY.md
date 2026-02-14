# Protocol Compatibility Strategy

## Overview

The WoLy distributed system uses a shared protocol package (`@kaonis/woly-protocol`) to ensure type-safe, runtime-validated communication between node agents and the C&C backend. This document defines our compatibility strategy and CI enforcement.

## Protocol Package

**Package**: `@kaonis/woly-protocol`  
**Purpose**: Shared TypeScript types and Zod runtime schemas for node ↔ C&C communication  
**Current Version**: 1.1.0  
**Location**: `packages/protocol/`

### Exports

- **Types**: `Host`, `HostStatus`, `CommandState`, `NodeMessage`, `CncCommand`, etc.
- **Schemas**: `outboundNodeMessageSchema`, `inboundCncCommandSchema`, etc.
- **Constants**: `PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`

## Versioning Policy

### Semantic Versioning

Protocol package follows strict semantic versioning:

- **MAJOR** (x.0.0): Breaking changes to message structure or validation rules
  - Example: Removing a message type, changing required fields, removing supported versions
  - Requires coordinated deployment of both apps
  
- **MINOR** (0.x.0): Backward-compatible additions
  - Example: Adding new optional fields, new message types, new supported versions
  - Older nodes can continue working with newer C&C
  
- **PATCH** (0.0.x): Bug fixes in validation or types without semantic changes
  - Example: Fixing Zod schema edge cases, documentation updates
  - No deployment coordination required

### Version Bumping

From monorepo root:

```bash
# Bug fix (1.1.0 → 1.1.1)
npm run protocol:version:patch

# New feature (1.1.0 → 1.2.0)
npm run protocol:version:minor

# Breaking change (1.1.0 → 2.0.0)
npm run protocol:version:major
```

## Compatibility Matrix

### Current Support

| Protocol Version | Node Agent | C&C Backend | Status |
|------------------|------------|-------------|--------|
| 1.0.0 | ✅ 0.0.1+ | ✅ 1.0.0+ | Supported |

### Runtime Version Negotiation

1. Node sends `register` message with `metadata.protocolVersion`
2. C&C validates version against `SUPPORTED_PROTOCOL_VERSIONS`
3. C&C responds with `registered` command including its `protocolVersion`
4. If versions incompatible, C&C sends `error` command and disconnects

```typescript
// In protocol package
export const PROTOCOL_VERSION = '1.0.0';
export const SUPPORTED_PROTOCOL_VERSIONS = ['1.0.0'];
```

## CI Enforcement

### Protocol Compatibility Job

CI includes a dedicated `protocol-compatibility` job that runs **before** main validation:

```yaml
protocol-compatibility:
  - Build protocol package
  - Run protocol contract tests (packages/protocol)
  - Verify node-agent contract tests (apps/node-agent)
  - Verify cnc contract tests (apps/cnc)
```

This job **blocks** the main build if:
- Protocol contract tests fail
- Apps cannot consume the protocol package
- Message encoding/decoding round-trips fail

### Contract Tests

#### Protocol Package Tests
- Location: `packages/protocol/src/__tests__/contract.cross-repo.test.ts`
- Coverage: All message/command types, JSON serialization, version validation
- Runs: 90+ tests covering full protocol surface area

#### Node Agent Contract Tests
- Location: `apps/node-agent/src/__tests__/protocol.contract.unit.test.ts`
- Coverage: Node → C&C message encoding, C&C → node command decoding
- Verifies: App can successfully use protocol schemas

#### C&C Contract Tests
- Location: `apps/cnc/src/services/__tests__/protocol.contract.test.ts`
- Coverage: C&C → node command encoding, node → C&C message decoding
- Verifies: Backend can successfully use protocol schemas

## Dependency Management

### Monorepo Workspace Links

Both apps consume the protocol package via npm workspace link:

```json
{
  "dependencies": {
    "@kaonis/woly-protocol": "*"
  }
}
```

This ensures:
- Apps always use the local protocol package source
- Changes to protocol are immediately available to apps
- No version drift between protocol and consumers in the monorepo

### Publishing to npm Registry

The protocol package is also published to npm for external consumers (e.g., mobile app):

```bash
# Build and publish with 'latest' tag
npm run protocol:publish

# Build and publish with 'next' tag (pre-release)
npm run protocol:publish:next
```

**Note**: Monorepo apps continue using workspace links. Publishing is only required for external consumers.

## Breaking Change Workflow

When introducing breaking changes to the protocol:

### 1. Pre-Release Phase

```bash
# Create feature branch
git checkout -b feat/protocol-v2-breaking-change

# Make breaking changes to packages/protocol/src/index.ts
# Update protocol version
npm run protocol:version:major  # 1.1.0 → 2.0.0

# Update SUPPORTED_PROTOCOL_VERSIONS
# Example: ['1.0.0', '2.0.0'] for dual-stack support
```

### 2. Dual-Stack Window

Maintain backward compatibility by supporting both versions temporarily:

```typescript
export const PROTOCOL_VERSION = '2.0.0';
export const SUPPORTED_PROTOCOL_VERSIONS = ['1.0.0', '2.0.0'];
```

This allows:
- Old nodes (v1.0.0) to connect to new C&C (supporting both)
- New nodes (v2.0.0) to connect to new C&C
- Gradual rollout of node agents

### 3. Migration

1. Deploy C&C with dual-stack support
2. Gradually upgrade node agents to v2.0.0
3. Monitor metrics for v1.0.0 usage
4. Once all nodes upgraded, remove v1.0.0 from `SUPPORTED_PROTOCOL_VERSIONS`

### 4. Remove Legacy Support

```typescript
export const PROTOCOL_VERSION = '2.0.0';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2.0.0'];
```

## Testing Strategy

### Unit Tests

- **Scope**: Individual message/command validation
- **Location**: `packages/protocol/src/__tests__/schemas.test.ts`
- **Coverage**: All Zod schemas, edge cases, error conditions

### Contract Tests

- **Scope**: Cross-repo encoding/decoding compatibility
- **Location**: `packages/protocol/src/__tests__/contract.cross-repo.test.ts`
- **Coverage**: JSON serialization round-trips, data integrity, version negotiation

### Integration Tests

- **Scope**: Full WebSocket message flow between apps
- **Location**: `apps/node-agent/src/__tests__/agentService.integration.test.ts`, etc.
- **Coverage**: Real message exchange, error handling, reconnection

## Troubleshooting

### CI Failure: "Protocol contract tests failed"

**Cause**: Changes to protocol broke encoding/decoding guarantees

**Fix**:
1. Review changes to `packages/protocol/src/index.ts`
2. Run `npm test -w packages/protocol` locally
3. Fix validation failures in Zod schemas
4. Ensure all message types have matching test coverage

### CI Failure: "Apps cannot consume protocol package"

**Cause**: Apps use protocol types/schemas that were removed or changed

**Fix**:
1. Run `npm run test -w apps/node-agent -- --testPathPattern=protocol.contract`
2. Run `npm run test -w apps/cnc -- --testPathPattern=protocol.contract`
3. Update app code to use new protocol API
4. If breaking change is intentional, follow breaking change workflow

### Runtime: "Unsupported protocol version"

**Cause**: Node agent protocol version not in C&C's `SUPPORTED_PROTOCOL_VERSIONS`

**Fix**:
1. Check node metadata: `data.metadata.protocolVersion`
2. Check C&C supported versions
3. Either upgrade node or add backward compatibility to C&C

## Best Practices

### DO

✅ Run `npm run protocol:build` before publishing  
✅ Run contract tests locally before pushing: `npm test -w packages/protocol`  
✅ Use semantic versioning strictly  
✅ Add test coverage for new message types  
✅ Document breaking changes in CHANGELOG  
✅ Maintain backward compatibility during migrations  
✅ Update compatibility matrix when bumping versions  

### DON'T

❌ Publish without running tests  
❌ Make breaking changes without major version bump  
❌ Remove message types without deprecation period  
❌ Change required fields without dual-stack support  
❌ Skip CI checks  
❌ Directly modify deployed node agents without C&C support  

## References

- [Architecture Plan Phase 3](../apps/node-agent/ARCHITECTURE_PLAN.md)
- [Implementation Checklist](../apps/node-agent/IMPLEMENTATION_CHECKLIST.md)
- [Protocol Package README](../packages/protocol/README.md)
- [CI Workflow](../.github/workflows/ci.yml)
