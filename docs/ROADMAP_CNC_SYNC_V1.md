# CNC Sync Roadmap V1 (woly + woly-server + protocol)

## Scope
- Mode: CNC only.
- Out of scope: standalone node-agent API compatibility work, except where temporary compatibility is needed during migration.
- Protocol location: `woly-protocol/protocol` repo was not found locally; canonical protocol package is `packages/protocol` in `woly-server`.

## Audit Baseline (What is currently out of sync)
1. Frontend expects CNC host scan endpoints (`/api/hosts/ports/:fqn`, `/api/hosts/scan-ports/:fqn`) in `/Users/phantom/projects/woly/src/services/woly-service.ts`, but CNC routes in `/Users/phantom/projects/woly-server/apps/cnc/src/routes/index.ts` do not expose them.
2. CNC command routing already supports scan in `/Users/phantom/projects/woly-server/apps/cnc/src/services/commandRouter.ts`, but route/controller wiring is missing.
3. Frontend host type in `/Users/phantom/projects/woly/src/types.ts` does not include protocol host fields like `notes` and `tags` that already exist in `/Users/phantom/projects/woly-server/packages/protocol/src/index.ts` and backend update validation in `/Users/phantom/projects/woly-server/apps/cnc/src/controllers/hosts.ts`.
4. Frontend edit flow in `/Users/phantom/projects/woly/app/edit/[id].tsx` only updates `name`, `ip`, `mac`.
5. Notes/schedules/scan history are local-only state (`/Users/phantom/projects/woly/src/stores/notes-store.ts`, `/Users/phantom/projects/woly/src/stores/schedules-store.ts`, `/Users/phantom/projects/woly/src/stores/scan-history-store.ts`).
6. Mobile compatibility smoke coverage in `/Users/phantom/projects/woly-server/apps/cnc/src/routes/__tests__/mobileCompatibility.smoke.test.ts` validates core hosts/nodes only, not richer CNC interactions.

## Cross-Repo Issue Map
### woly-server
- #253 CNC: Add host port-scan API endpoints used by mobile app
  - https://github.com/kaonis/woly-server/issues/253
- #254 CNC: Add capabilities endpoint for frontend feature negotiation
  - https://github.com/kaonis/woly-server/issues/254
- #255 CNC: Implement server-side wake schedule API and persistence
  - https://github.com/kaonis/woly-server/issues/255
- #256 CNC: Expand mobile compatibility contract tests beyond hosts/nodes
  - https://github.com/kaonis/woly-server/issues/256
- #257 Protocol: Provide app-consumable DTO exports and consumer contract checks
  - https://github.com/kaonis/woly-server/issues/257

### woly
- #307 App: CNC-only networking mode (de-prioritize standalone fallback)
  - https://github.com/kaonis/woly/issues/307
- #308 App: Adopt @kaonis/woly-protocol shared types for CNC entities
  - https://github.com/kaonis/woly/issues/308
- #309 App: Implement host notes/tags full sync with CNC backend
  - https://github.com/kaonis/woly/issues/309
- #310 App: Migrate wake schedules from local store to CNC API
  - https://github.com/kaonis/woly/issues/310
- #311 App: Refactor host scan flow for CNC command lifecycle
  - https://github.com/kaonis/woly/issues/311

## Delivery Order
1. Contract and capability handshake
- Complete #254, #257, #308.
- Goal: app and backend share typed contracts and explicit capability negotiation.

2. Scan parity in CNC mode
- Complete #253, #311, then tighten #307 for CNC-only scan path.
- Goal: port scan feature works through CNC APIs without standalone probing.

3. Host metadata parity (notes/tags)
- Complete #309 with backend contract validation and compatibility tests (#256).
- Goal: notes/tags are truly server-synced and reflected across clients.

4. Schedules as shared backend state
- Complete #255 and #310.
- Goal: schedules are authoritative in CNC backend, app uses local state only as cache/offline queue.

5. Hardening gate
- Finish #256 and block merge on contract + compatibility checks for CNC routes.

## Operating Model (How to keep frontend/backend in sync)
1. Feature starts as a protocol/API contract change, then backend implementation, then frontend wiring.
2. Every feature has linked issues in both repos and a clear dependency chain.
3. No merge to default branch unless:
- protocol types compile for app consumption,
- backend compatibility tests pass,
- frontend typecheck/tests pass against current contract.
4. App should detect capabilities on startup and disable unsupported UI actions.
5. Prefer additive API evolution; remove deprecated behavior only after app release has switched.

## Definition of Done for each CNC feature
- Shared type/DTO exists in protocol package (or explicit adapter with rationale).
- Backend endpoint/command path is implemented and documented.
- Frontend uses CNC-only path for that feature.
- Cross-repo compatibility tests cover success and error envelope.
- Migration notes are added for any behavior changes.
