# Contributing

## Setup

```bash
git clone https://github.com/kaonis/woly-server.git
cd woly-server
nvm use          # Node.js 24
npm install      # All workspaces
npm run build    # Protocol first, then apps
npm run test     # Verify everything works
```

Copy environment files before running dev servers:

```bash
cp apps/node-agent/.env.example apps/node-agent/.env
cp apps/cnc/.env.example apps/cnc/.env
```

## Development Workflow

1. Create a branch from `master`
2. Make changes
3. Run `npm run build && npm run typecheck && npm run test` to verify
4. Push and open a PR against `master`

## Git Hooks and Commit Policy

Local hooks are managed by Husky (`npm install` runs `npm run prepare`):

- `pre-commit`: staged secret scan (`gitleaks`) + `lint-staged`.
- `pre-push`: `npm run prepush:checks` (`typecheck` + related Jest tests).
- `commit-msg`: commit message linting via `commitlint` (Conventional Commits).

Install `gitleaks` locally so `pre-commit` can run:

```bash
brew install gitleaks
```

## CNC Mode Sync Requirements

For CNC feature work, follow `docs/CNC_SYNC_POLICY.md`.

Before merge:
- link issues in both repos (`kaonis/woly-server` and `kaonis/woly`)
- keep the 3-part chain explicit:
  1. protocol contract
  2. backend endpoint/command
  3. frontend integration
- run contract gates (mobile compatibility + protocol consumer typecheck when protocol is touched)

## Working With Workspaces

This is an npm workspaces monorepo with Turborepo for task orchestration.

**Run a command in a specific workspace:**

```bash
npm run test -w apps/node-agent
npm run build -w packages/protocol
```

**Build order matters.** `packages/protocol` must build before either app. Turborepo handles this automatically via `turbo.json`, but if running `tsc` directly in an app, build protocol first.

**Adding a dependency to a workspace:**

```bash
npm install axios -w apps/node-agent        # Runtime dep
npm install @types/ws -w apps/cnc --save-dev # Dev dep
```

Shared dev dependencies (typescript, eslint, prettier) live in the root `package.json`.

## Protocol Changes

When modifying `packages/protocol/src/index.ts`:

1. Make the change
2. Run `npm run build -w packages/protocol` to regenerate `dist/`
3. Run `npm run typecheck` to verify both apps still compile
4. Run `npm run test` to verify no runtime regressions
5. If the mobile app needs the update, publish to npm (see below)

### Publishing `@kaonis/woly-protocol` to npm

The protocol package is published to npm for the mobile app to consume. Use these scripts from the **monorepo root**:

```bash
# 1. Bump version (creates a git commit and tag)
npm run protocol:version:patch   # Bug fixes (1.1.0 → 1.1.1)
npm run protocol:version:minor   # New features (1.1.0 → 1.2.0)
npm run protocol:version:major   # Breaking changes (1.1.0 → 2.0.0)

# 2. Build and publish to npm
npm run protocol:publish         # Publish with 'latest' tag
npm run protocol:publish:next    # Publish with 'next' tag (for pre-releases)
```

**Notes:**
- `protocol:publish` automatically runs `protocol:build` before publishing
- Requires npm authentication and publish permissions for `@kaonis` scope
- The `publishConfig.access: "public"` in package.json ensures scoped packages are published publicly
- Monorepo apps always use the workspace-linked source, so publishing only affects the mobile app

## TypeScript

All workspaces extend `tsconfig.base.json` which enables strict mode. Key settings:

- `noUnusedLocals: true` / `noUnusedParameters: true` — prefix unused params with `_`
- `strict: true` — no implicit any, strict null checks, etc.
- Express 5 types: `req.params` values are `string | string[]`, cast with `as string`

Test files use `tsconfig.test.json` which relaxes unused variable checks.

## Testing

```bash
npm run test              # All workspaces
npm run test:ci           # CI mode with coverage
npm run test -w apps/cnc  # Single workspace
```

**If `better-sqlite3` fails after switching Node versions:**

```bash
npm rebuild better-sqlite3 --build-from-source
```

## Docker

Build images from the repo root (Dockerfiles copy root workspace files):

```bash
docker build -f apps/node-agent/Dockerfile -t woly-node-agent .
docker build -f apps/cnc/Dockerfile -t woly-cnc .
```

The node agent requires `--net host` for ARP scanning to discover devices on the local network.

## Code Style

- Formatting: Prettier (run `npm run format`)
- Linting: ESLint with TypeScript plugin (run `npm run lint`)
- Logging: Winston with structured object context, not string interpolation
- Error handling: Throw `AppError` instances, caught by global error handler middleware
