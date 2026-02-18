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
