# SECURITY NOTES

## Dependency Risk Snapshot (2026-02-07)

This repository currently has a known set of transitive dependency advisories when running:

```bash
npm audit --omit=dev
```

### Current status

- Some advisories are inherited through upstream packages where no direct non-breaking fix is currently available.
- Highest-impact chain includes `local-devices` → `get-ip-range` / `ip`.

## Mitigation Strategy

1. Keep direct dependencies up-to-date on a regular schedule.
2. Restrict deployment exposure:
   - run behind trusted network boundaries where possible,
   - apply rate-limiting and input validation (already enabled),
   - avoid exposing admin-only endpoints publicly without auth controls.
3. Track upstream fixes for transitive packages and replace vulnerable libraries when a stable migration path is available.

## Next Planned Security Work

- Evaluate replacing `local-devices` with a maintained discovery implementation.
- Re-run and document audit deltas after each dependency update cycle.
- Add automated dependency update policy (Renovate/Dependabot cadence + triage rules).
