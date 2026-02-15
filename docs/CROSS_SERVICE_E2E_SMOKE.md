# Cross-Service E2E Smoke Suite

This smoke suite validates the core C&C <-> node-agent integration path in one real flow:

1. Node agent registers to C&C over WebSocket.
2. Seeded node-agent host inventory propagates to C&C aggregated hosts.
3. Wake command routing executes from C&C API to node agent and returns a terminal result.

## Run Locally

From repository root:

```bash
npm run test:e2e:smoke
```

This command runs:

- `apps/cnc` preflight checks.
- `crossService.e2e.smoke.test.ts` in-band (`--runInBand`).

The suite starts temporary C&C and node-agent processes with isolated SQLite files in a temp directory and cleans them up automatically.

## Notes

- Expected runtime is typically under 30 seconds.
- Wake packet send can fail in restricted environments; the smoke suite accepts either success (`200`) or terminal failure (`500`) as long as routing completes without timeout.
