# @kaonis/protocol

Shared protocol types and runtime schemas for communication between `woly-backend` (node agent) and `woly-cnc-backend` (C&C).

## Exports

- `PROTOCOL_VERSION`
- `SUPPORTED_PROTOCOL_VERSIONS`
- `outboundNodeMessageSchema`
- `inboundCncCommandSchema`
- Type exports from `index.d.ts` (`NodeMessage`, `CncCommand`, `NodeRegistration`, etc.)

## Publish

From the `woly-backend` repo root:

```bash
npm run protocol:pack
npm run protocol:publish
```

Or use the GitHub workflow: `Publish Protocol Package`.

## Versioning

1. Bump `packages/protocol/package.json` version.
2. Publish package.
3. Update both repos to consume the new semver version.
4. Run protocol contract tests in both repos before merge.
