# WoLy Compatibility Upgrade Guide

This guide defines the required steps to roll protocol or auth changes safely across `apps/node-agent` and `apps/cnc`.

## Version Matrices

- Node-agent matrix: `apps/node-agent/docs/compatibility.md`
- C&C matrix: `apps/cnc/docs/compatibility.md`
- Protocol contract policy: `docs/PROTOCOL_COMPATIBILITY.md`

## Required Upgrade Flow

1. Update protocol/auth code in `packages/protocol`, `apps/node-agent`, and/or `apps/cnc`.
2. Bump `@kaonis/woly-protocol` version when schema or type contracts change.
3. Update both compatibility matrices with the new supported pairing.
4. Run local gates:
   - `npm run test -w packages/protocol -- schemas.test`
   - `npm run test -w packages/protocol -- contract.cross-repo`
   - `npm run test -w apps/node-agent -- protocol.contract`
   - `npm run test -w apps/cnc -- protocol.contract`
   - `npm run test:schema-gate -w apps/cnc`
5. Merge only after CI protocol and schema gates are green.

## CI Enforcement

The `.github/workflows/ci.yml` `protocol-compatibility` job blocks merges unless all of these pass:

1. Protocol schema tests (`packages/protocol`)
2. Protocol cross-repo contract tests (`packages/protocol`)
3. Node-agent protocol contract tests
4. C&C protocol contract tests
5. C&C schema-validation gate (`nodeManager` runtime validation path)

## Breaking Change Policy

When a protocol change is not backward compatible:

1. Bump protocol major version.
2. Keep a transition window where C&C accepts both the old and new versions.
3. Roll out node-agent upgrades in phases (canary -> staged -> full).
4. Remove old-version compatibility only after all active nodes are upgraded.
