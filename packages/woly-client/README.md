# @kaonis/woly-client

Generated TypeScript API clients for:

- WoLy C&C API (`openapi/cnc.json`)
- WoLy node-agent API (`openapi/node-agent.json`)

## Build

From repository root:

```bash
npm run build -w packages/woly-client
```

`build` performs all generation steps:

1. Export OpenAPI specs from `apps/cnc` and `apps/node-agent`.
2. Regenerate client sources under `src/generated`.
3. Compile TypeScript to `dist`.

## Usage

```ts
import { CncApi, NodeAgentApi } from '@kaonis/woly-client';

const cnc = new CncApi.DefaultService();
const agent = new NodeAgentApi.DefaultService();
```
