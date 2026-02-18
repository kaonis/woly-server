# CNC Sync Policy (Budget Mode)

This policy keeps `woly` and `woly-server` synchronized in CNC mode while minimizing GitHub Actions spend.

## 1. Mandatory Feature Chain

Every CNC feature must be shipped as a linked 3-part chain:

1. Protocol contract (`packages/protocol`)
2. Backend endpoint/command (`apps/cnc`)
3. Frontend integration (`kaonis/woly`)

## 2. Mandatory Linked Issues

Each CNC feature PR must link all of the following:

- Protocol issue: `kaonis/woly-server#...`
- Backend issue: `kaonis/woly-server#...`
- Frontend issue: `kaonis/woly#...`

## 3. Ordering Rules

- Capability negotiation first: `kaonis/woly-server#254`.
- Do not remove/de-scope standalone probing (`kaonis/woly#307`) until parity issues are complete:
  - `kaonis/woly-server#253`
  - `kaonis/woly#311`
  - `kaonis/woly#309`
  - `kaonis/woly#310`
  - `kaonis/woly-server#256`
  - `kaonis/woly#308`
  - `kaonis/woly-server#257`

## 4. CI Budget Rule

GitHub Actions runs only bare-minimum policy checks on pull requests.
Heavy validation runs locally before merge.

## 5. Required Local Pre-Merge Gates

### In `woly-server`

```bash
npm ci
npm run build -w packages/protocol
npm run test -w packages/protocol -- contract.cross-repo
npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts
npm run validate:standard
```

### In `woly`

```bash
npm ci --legacy-peer-deps
npm run typecheck
npm run test:ci:coverage
```

## 6. Evidence Required in PR

Each CNC feature PR must include:

- Linked protocol/backend/frontend issue refs
- Checked 3-part chain checklist
- Checked Review Pass checklist
- Exact local commands run
- Pass/fail summary from local validation

## 7. Review Pass Requirement

Every PR must complete a final review pass before merge (peer review preferred; self-review required at minimum), and all review comments/threads must be resolved with follow-up commits or explicit rationale.

## 8. Host-State Stream Semantics (Singleton Mobile Clients)

The mobile app now maintains a single shared app-level host stream connection (see `kaonis/woly#401` / merged `kaonis/woly#402`). Backend and protocol behavior must follow this contract:

- Transport: `GET /api/capabilities` advertises `hostStateStreaming.transport=websocket` and `routes=['/ws/mobile/hosts']`.
- Invalidating event classes: any `host.*`, `hosts.*`, or `node.*` event is mutating and should trigger host-list invalidation/refetch in clients.
- Non-mutating event classes: connection lifecycle/keepalive style events (`connected`, `heartbeat`, `keepalive`, `ping`, `pong`) must not trigger host invalidation.
- Reconnect behavior: clients should reconnect on transient disconnects and then refetch current host state; stream events are not guaranteed replay buffers.
- Payload model: events are **mixed deltas/summaries** (not authoritative snapshots). Canonical state remains `GET /api/hosts`; stream events are invalidation hints.

## 9. Local App-Side Wake Fallback Classification (Issue #323)

- Scope: mobile app LAN fallback Wake-on-LAN transport implemented in `kaonis/woly`.
- Protocol impact: none.
- CNC request/response contracts: unchanged.
- Capability negotiation format/versioning: unchanged.
- Decision: classify local app-side wake fallback as an execution-strategy change in the app, not a CNC protocol contract delta.

## 10. Polling Snapshot Stability (GET /api/hosts)

Backend assessment for polling clients (tracked by `kaonis/woly-server#328`):

- Ordering behavior: `HostAggregator.getAllHosts()` returns rows ordered by `fully_qualified_name`, which provides deterministic host list ordering for unchanged datasets.
- Cache negotiation: hosts responses emit `ETag`; clients that send `If-None-Match` receive `304` when the payload is unchanged.
- Identity guidance: clients should key by `fullyQualifiedName` (fallback: `nodeId + mac`) and avoid index-based diffing.
- Non-guarantees: object reference identity and JSON property insertion order are not part of the backend contract.

Current recommendation:

- No backend payload shape change is required at this time.
- If stricter snapshot revision semantics become necessary later, track a non-breaking additive field (for example, a monotonic snapshot revision) in a dedicated follow-up issue.
