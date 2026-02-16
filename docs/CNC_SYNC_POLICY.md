# CNC Sync Policy

## Purpose

Keep CNC mode behavior in sync across:
1. `@kaonis/woly-protocol` contracts
2. `woly-server` backend endpoints/commands
3. `woly` frontend integration

This policy applies to CNC mode work only. Standalone probing de-scope happens only after CNC parity is complete.

## Required Delivery Chain

Every CNC feature ships as a 3-part chain:
1. Protocol contract change (type/schema/version note) or explicit confirmation no contract change is needed.
2. Backend endpoint/command implementation.
3. Frontend integration using the same contract.

Do not merge partial chain PRs that leave frontend/backend contract intent ambiguous.

## Linked Issue Requirement

Before merge, each CNC PR must link:
- one `kaonis/woly-server` issue
- one `kaonis/woly` issue
- protocol issue when protocol surface changes

If one side is already delivered, link the merged PR/issue explicitly in the active PR body.

## Sequencing Rules

- Capability negotiation endpoint must be the source of truth for app behavior in CNC mode.
- Merge gates must include contract compatibility checks:
  - backend mobile compatibility contract tests
  - protocol consumer typecheck fixture
  - app-side protocol export typecheck when app repo changes
- Probe-based standalone fallback de-scope is last, after CNC parity is verified.

## Merge Gates

Minimum local validation for CNC backend PRs:
- `npm run typecheck -w apps/cnc`
- `npm run lint -w apps/cnc`
- `npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts`
- `npm run test:consumer-typecheck -w packages/protocol` (when protocol/contracts touched)

Minimum GitHub Actions policy:
- Keep broad CI manual-dispatch to control budget.
- Keep only lightweight, path-scoped automatic gates for CNC contract drift.

## Review Checklist

Reviewers should block merge if:
- linked issue(s) in both repos are missing
- chain stage is missing (protocol/backend/frontend)
- capabilities contract and route payloads drift from app expectations
- contract gates were skipped
