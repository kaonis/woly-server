# Improvement Tracking

This document tracks the current implementation status of items in [IMPROVEMENTS.md](../IMPROVEMENTS.md), based on merged code and linked GitHub issues.

## Quick Links

- [Full Improvements Document](../IMPROVEMENTS.md)
- [Security Audit](../SECURITY_AUDIT.md)
- [Roadmap V11](../docs/ROADMAP_V11_AUTONOMOUS_CYCLE.md)

## Status Overview

| Category | Total | Implemented | In Progress (Partial) | Planned |
|----------|-------|-------------|------------------------|---------|
| Security | 7 | 6 | 1 | 0 |
| Code TODOs | 2 | 2 | 0 | 0 |
| Features | 7 | 0 | 0 | 7 |
| Operations | 4 | 0 | 2 | 2 |
| Developer Experience | 4 | 0 | 1 | 3 |
| Architecture | 3 | 0 | 0 | 3 |
| Documentation | 3 | 0 | 1 | 2 |
| Mobile Integration | 2 | 0 | 0 | 2 |
| **TOTAL** | **32** | **8** | **5** | **19** |

## Completed Security / TODO Items

1. `Security §1.1` Node-agent API authentication — [#52](https://github.com/kaonis/woly-server/issues/52)
2. `Security §1.2` C&C node listing auth — [#53](https://github.com/kaonis/woly-server/issues/53)
3. `Security §1.3` C&C rate limiting — [#54](https://github.com/kaonis/woly-server/issues/54)
4. `Security §1.4` WebSocket message rate limiting — [#55](https://github.com/kaonis/woly-server/issues/55)
5. `Security §1.5` WebSocket connection limits per IP — [#56](https://github.com/kaonis/woly-server/issues/56)
6. `Security §1.6` Production CORS tightening — [#57](https://github.com/kaonis/woly-server/issues/57)
7. `Code TODO §2.1` Node-agent version from package metadata — [#88](https://github.com/kaonis/woly-server/issues/88)
8. `Code TODO §2.2` Subnet/gateway metadata resolution — [#88](https://github.com/kaonis/woly-server/issues/88)

## Active Priority Queue

1. `A2` Reconcile backlog docs and tracking consistency — [#214](https://github.com/kaonis/woly-server/issues/214)
2. `B1` Prometheus metrics endpoint and baseline metric export — [#215](https://github.com/kaonis/woly-server/issues/215)
3. `C1` Host notes/tags metadata support — [#216](https://github.com/kaonis/woly-server/issues/216)
4. `C2` Wake verification workflow — [#217](https://github.com/kaonis/woly-server/issues/217)
5. `D1` Cross-service E2E smoke tests — [#218](https://github.com/kaonis/woly-server/issues/218)
6. `D2` Production deployment guide — [#219](https://github.com/kaonis/woly-server/issues/219)
7. Dependency follow-up: ESLint 10 revisit — [#150](https://github.com/kaonis/woly-server/issues/150)

## Label Reference

Use existing repository labels:

- `enhancement`
- `security`
- `documentation`
- `developer-experience`
- `technical-debt`
- `observability`
- `testing`
- `priority:high`
- `priority:medium`
- `priority:low`

## Update Rules

1. Update this file only after code is merged or issue status materially changes.
2. Keep implemented items linked to issue numbers.
3. Keep active queue de-duplicated and aligned with `docs/ROADMAP_V11_AUTONOMOUS_CYCLE.md`.

---

*Last updated: 2026-02-15*
