# Woly-Server CNC Sync Rules

These rules define how CNC features are shipped without frontend/backend drift.

## Required Delivery Chain
For every CNC feature, always deliver in this order:
1. Protocol contract (`packages/protocol` types/schemas)
2. Backend endpoint/command implementation (`apps/cnc`)
3. Frontend integration (`kaonis/woly`)

## Linked-Issue Policy
Each CNC feature PR must link all three issue tracks:
- Protocol issue: `kaonis/woly-server#...`
- Backend issue: `kaonis/woly-server#...`
- Frontend issue: `kaonis/woly#...`

## Ordering Constraints
- Capability negotiation is first-class and must land first: `kaonis/woly-server#254`.
- Standalone probing de-scope (`kaonis/woly#307`) is blocked until CNC parity is complete.

## Merge Gates
A CNC feature is not mergeable unless:
- PR checklist confirms protocol -> backend -> frontend chain.
- Contract compatibility tests are green (`kaonis/woly-server#256`).
- App protocol export typecheck gate is green (`kaonis/woly#308` + `kaonis/woly-server#257`).

## Budget Mode CI
- GitHub Actions: keep only low-cost policy checks on pull requests.
- Heavy gates run locally before merge:
  - `npm ci`
  - `npm run build -w packages/protocol`
  - `npm run test -w packages/protocol -- contract.cross-repo`
  - `npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts`
  - `npm run validate:standard`

## Source of Truth
- Policy doc: `docs/CNC_SYNC_POLICY.md`
- Combined roadmap: `docs/ROADMAP_CNC_SYNC_V1.md`
