# Improvement Tracking

This document provides a quick reference for tracking the implementation status of improvements documented in [IMPROVEMENTS.md](../IMPROVEMENTS.md).

## Quick Links

- [Full Improvements Document](../IMPROVEMENTS.md)
- [Security Audit](../SECURITY_AUDIT.md)
- [Contributing Guide](../CONTRIBUTING.md)

## GitHub Issue Creation Template

When creating GitHub issues from the improvements list, use this template:

```markdown
## Description
[Brief description from IMPROVEMENTS.md]

## Priority
[HIGH/MEDIUM/LOW from IMPROVEMENTS.md]

## Category
[Security/Feature/Operations/Documentation]

## Implementation Checklist
- [ ] Review detailed plan in IMPROVEMENTS.md §X.X
- [ ] Create implementation branch
- [ ] Write tests
- [ ] Implement changes
- [ ] Update documentation
- [ ] Run full test suite
- [ ] Request code review
- [ ] Update IMPROVEMENTS.md with issue number

## References
- IMPROVEMENTS.md §X.X [Title]
- Related: [link to related issues]

## Breaking Changes
[Yes/No - If yes, describe migration path]
```

## Status Overview

| Category | Total | Implemented | In Progress | Planned |
|----------|-------|-------------|-------------|---------|
| Security | 7 | 0 | 0 | 7 |
| Code TODOs | 2 | 0 | 0 | 2 |
| Features | 7 | 0 | 0 | 7 |
| Operations | 4 | 0 | 0 | 4 |
| Developer Experience | 4 | 0 | 0 | 4 |
| Architecture | 3 | 0 | 0 | 3 |
| Documentation | 3 | 0 | 0 | 3 |
| Mobile Integration | 2 | 0 | 0 | 2 |
| **TOTAL** | **32** | **0** | **0** | **32** |

## High Priority Items (Create Issues First)

1. **Security §1.1** — Node-Agent API Authentication
   - Issue: TBD
   - Status: Planned

2. **Features §3.4** — Wake-on-LAN Success Verification
   - Issue: TBD
   - Status: Planned

3. **Operations §4.1** — Health Check Improvements
   - Issue: TBD
   - Status: Planned

4. **Documentation §7.2** — Deployment Guides
   - Issue: TBD
   - Status: Planned

## Medium Priority Queue

- Security §1.2 — CnC Node Listing Authentication
- Security §1.3 — CnC Rate Limiting
- Code TODOs §2.2 — Get Actual Subnet and Gateway
- Features §3.1 — Persistent Host Notes/Metadata
- Features §3.2 — Host Grouping/Tagging
- Operations §4.2 — Prometheus Metrics Export
- Developer Experience §5.1 — End-to-End Tests
- Mobile Integration §8.1 — Push Notifications

## Labels to Use

Create these labels in GitHub:

- `enhancement` — New features
- `security` — Security improvements
- `documentation` — Documentation updates
- `developer-experience` — DX improvements
- `operations` — Ops/monitoring improvements
- `priority:high` — Must have
- `priority:medium` — Should have
- `priority:low` — Nice to have
- `good-first-issue` — Good for new contributors
- `breaking-change` — Requires migration

## Milestones

Suggested milestone grouping:

### v1.1 — Security & Stability (Q1 2026)
- All Priority 1 security items
- Health check improvements
- Deployment guides

### v1.2 — Core Features (Q2 2026)
- Host metadata/notes
- Host grouping/tagging
- WoL success verification
- Prometheus metrics

### v1.3 — Advanced Features (Q3 2026)
- Historical status tracking
- Host wake schedules
- End-to-end tests
- API client libraries

### v2.0 — Architecture Evolution (Q4 2026)
- GraphQL API
- Redis cache layer
- Message queue integration
- Push notifications

---

*Last updated: 2026-02-09*
