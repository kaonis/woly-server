# Woly-Server Roadmap V11 (Autonomous Cycle)

Date: 2026-02-15  
Scope: Post-V10 product and platform improvements after full-remediation closeout.

## 1. Audit Snapshot

Current baseline (executed 2026-02-15):
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test:ci` ✅
- `npm run build` ✅

Current open GitHub issues at audit time:
- #210 `[CI] Schedule weekly manual-only operations review (rolling follow-up cycle)`
- #150 `[Dependencies] Revisit ESLint 10 adoption after typescript-eslint compatibility`
- #4 `Dependency Dashboard`

Assessment:
- Core reliability/security backlog from V10 is closed.
- The next gap set is feature depth, observability surface area, and delivery workflow hardening.

## 2. Missing / Incomplete Areas

1. C&C version reporting is hardcoded (`1.0.0`) in multiple API responses instead of resolving from package metadata at runtime.
2. No Prometheus-compatible `/metrics` scrape endpoint for operational monitoring.
3. Host model lacks user metadata capabilities (notes/tags), limiting organization at scale.
4. Wake-on-LAN flow does not verify wake success post packet send.
5. No end-to-end test coverage for node-agent <-> C&C happy paths and failure-path integration.
6. Root-level production deployment guide is still missing.
7. Improvements tracking docs are stale versus actual closed issues and implemented features.

## 3. Roadmap Items

## Phase A: Backlog Hygiene + Fast Technical Debt

- [ ] **A1** Replace hardcoded C&C version values with runtime package version lookup.  
  Issue: `#213` https://github.com/kaonis/woly-server/issues/213
- [ ] **A2** Refresh improvements tracking docs to reflect implemented work and active backlog only.  
  Issue: `#214` https://github.com/kaonis/woly-server/issues/214

## Phase B: Observability

- [ ] **B1** Add Prometheus metrics endpoint(s) and wire runtime metrics to counters/gauges/histograms.  
  Issue: `#215` https://github.com/kaonis/woly-server/issues/215

## Phase C: Product Capability

- [ ] **C1** Add host notes/tags support across schema, protocol, storage, and APIs.  
  Issue: `#216` https://github.com/kaonis/woly-server/issues/216
- [ ] **C2** Add wake verification workflow (poll + timeout + explicit wake result state).  
  Issue: `#217` https://github.com/kaonis/woly-server/issues/217

## Phase D: Delivery Confidence

- [ ] **D1** Add E2E smoke tests for cross-service flows (registration, host sync, wake route).  
  Issue: `#218` https://github.com/kaonis/woly-server/issues/218
- [ ] **D2** Add production deployment guide (Docker Compose baseline + security defaults + ops checklist).  
  Issue: `#219` https://github.com/kaonis/woly-server/issues/219

## 4. Execution Policy

For each roadmap item:
1. Create/confirm issue.
2. Implement on dedicated branch.
3. Run focused tests + full repo gates.
4. Self-review changes and risk profile.
5. Merge to `master` after validation.
6. Update roadmap status and proceed to next item.

## 5. Exit Criteria for V11

V11 is complete when all A/B/C/D items are merged and validated by green gates (`lint`, `typecheck`, `test:ci`, `build`).
