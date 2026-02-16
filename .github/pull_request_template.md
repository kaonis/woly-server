## Linked Issues

- Backend issue (`woly-server`): #
- Frontend issue (`woly`): #
- Protocol issue (if contract changed): #

## CNC 3-Part Chain

- [ ] Protocol contract stage is covered (or explicitly unchanged with rationale).
- [ ] Backend endpoint/command stage is implemented.
- [ ] Frontend integration stage is linked and tracked.

## Contract Compatibility

- [ ] `npm run test -w apps/cnc -- src/routes/__tests__/mobileCompatibility.smoke.test.ts`
- [ ] `npm run typecheck -w apps/cnc`
- [ ] `npm run test:consumer-typecheck -w packages/protocol` (if protocol/contracts touched)
- [ ] App-side protocol export/typecheck link included (when relevant).

## Capability Negotiation / Mode Behavior

- [ ] CNC behavior is capability-driven (not probe-driven) for the touched feature.
- [ ] Any standalone fallback change is sequenced after CNC parity validation.

## CI Budget

- [ ] No broad always-on workflow added.
- [ ] Any new automatic gate is path-scoped and minimal.

## Notes

<!-- Add rollout/migration details and cross-repo links -->
