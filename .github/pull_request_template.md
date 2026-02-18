## CNC Sync Classification

- [ ] This PR is a CNC feature change.

## Linked Issues (required when CNC feature checkbox is checked)

- Protocol issue: kaonis/woly-server#REQUIRED
- Backend issue: kaonis/woly-server#REQUIRED
- Frontend issue: kaonis/woly#REQUIRED

## 3-Part Chain Checklist (required for CNC feature changes)

- [ ] Protocol contract updated or verified.
- [ ] Backend endpoint/command implemented or explicitly unchanged.
- [ ] Frontend integration implemented or tracked in linked issue.

## Ordering Gates

- [ ] Capability negotiation endpoint is implemented/linked (kaonis/woly-server#254) before probe-based behavior changes.
- [ ] Standalone probing de-scope work (kaonis/woly#307) is blocked until parity issues are complete.

## Review Pass (required for all PRs)

- [ ] I completed a final review pass after my latest implementation commit (peer review preferred; self-review completed at minimum).
- [ ] I reviewed the final diff for correctness, scope control, and regression risk.
- [ ] I addressed all review comments/threads with follow-up commits or explicit rationale.
- [ ] I re-reviewed the updated diff after applying review feedback.

## Local Validation (required for CNC feature changes)

Commands run:

```bash
# paste exact commands
```

Result summary:

- [ ] Local validation passed
- [ ] Any known gaps are documented below

Notes:
