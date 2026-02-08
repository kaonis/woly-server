# Development Workflow

## Branching Policy

1. Do not push directly to `master`.
2. Create a feature branch for every change.
3. Open a pull request for review before merge.

## Standard Flow

1. Create branch:
   - `git checkout -b <type>/<short-description>`
2. Make changes and commit:
   - `git add <files>`
   - `git commit -m "<type>: <message>"`
3. Push branch:
   - `git push -u origin <branch>`
4. Open PR:
   - `gh pr create --fill --base master --head <branch>`

## Branch Name Examples

1. `feat/jwt-rbac-phase1`
2. `fix/host-lookup-timeout`
3. `docs/compatibility-matrix`
4. `chore/ci-typecheck-gate`

## Notes

1. Keep PRs small and focused.
2. Include tests for behavior changes.
3. Do not include unrelated local files (for example local DB files) in commits.
