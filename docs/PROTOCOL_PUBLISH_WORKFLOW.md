# Protocol External Publish Workflow

Date: 2026-02-15
Owner: Platform Team
Package: `@kaonis/woly-protocol`

## 1. Decision State

- Monorepo services (`apps/node-agent`, `apps/cnc`) use workspace-linked protocol code.
- npm publishing is **on-demand** and only required for external consumers (for example, the mobile app).
- Do not publish protocol versions that are not tied to an external consumer release need.

## 2. Publish Readiness Criteria

All items must be true before running `npm run protocol:publish` or `npm run protocol:publish:next`:

1. Version bump is correct for change type (`patch`/`minor`/`major`).
2. Compatibility docs are updated:
   - `docs/PROTOCOL_COMPATIBILITY.md`
   - `docs/compatibility.md` (if rollout guidance changed)
3. Local verification passes:
   - `npm run protocol:build`
   - `npm test -w packages/protocol`
   - `npm run test -w apps/node-agent -- protocol.contract`
   - `npm run test -w apps/cnc -- protocol.contract`
4. CI protocol gates are green on the PR branch.
5. Release notes/changelog entry exists in the PR description and includes:
   - protocol version
   - compatibility impact
   - required consumer action

## 3. Release Workflow

1. Create branch: `feat/protocol-release-<version>`.
2. Bump version from monorepo root:
   - `npm run protocol:version:patch` or
   - `npm run protocol:version:minor` or
   - `npm run protocol:version:major`
3. Run readiness verification commands from Section 2.
4. Merge PR after CI is green.
5. Publish from `master`:
   - stable: `npm run protocol:publish`
   - prerelease/canary: `npm run protocol:publish:next`
6. Create release communication entry (issue/PR comment) with:
   - published package version
   - npm dist-tag (`latest` or `next`)
   - external consumer rollout owner

## 4. Rollback Workflow

If a bad package version is published:

1. Immediately stop new consumer rollouts.
2. Deprecate the bad version on npm:
   - `npm deprecate @kaonis/woly-protocol@<bad_version> \"Deprecated due to regression; use <fixed_version_or_previous_version>\"`
3. Publish a fixed version:
   - patch bump for non-breaking fix
   - major bump plus compatibility guidance for breaking correction
4. Update compatibility docs and communicate rollback status to consumer owners.
5. Open a post-incident issue with:
   - root cause
   - affected versions
   - preventive actions

## 5. Operational Guardrails

- Never rely on npm unpublish as the primary rollback path.
- For breaking protocol changes, keep dual-version compatibility (`SUPPORTED_PROTOCOL_VERSIONS`) during migration windows.
- If rollback requires schema compatibility restoration, prioritize server-side dual support before forcing consumer upgrades.
