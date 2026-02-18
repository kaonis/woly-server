import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const openapiBin = resolve(repoRoot, 'node_modules', '.bin', 'openapi');

const targets = [
  {
    name: 'cnc',
    input: resolve(packageRoot, 'openapi', 'cnc.json'),
    output: resolve(packageRoot, 'src', 'generated', 'cnc'),
  },
  {
    name: 'node-agent',
    input: resolve(packageRoot, 'openapi', 'node-agent.json'),
    output: resolve(packageRoot, 'src', 'generated', 'node-agent'),
  },
];

for (const target of targets) {
  if (!existsSync(target.input)) {
    throw new Error(
      `Missing OpenAPI spec for ${target.name}: ${target.input}. Run \`npm run openapi:export\` from repo root first.`
    );
  }

  rmSync(target.output, { recursive: true, force: true });
  mkdirSync(target.output, { recursive: true });

  const result = spawnSync(
    openapiBin,
    [
      '--input',
      target.input,
      '--output',
      target.output,
      '--client',
      'fetch',
      '--useUnionTypes',
      '--exportCore',
      'true',
      '--exportServices',
      'true',
      '--exportModels',
      'true',
      '--exportSchemas',
      'false',
    ],
    {
      cwd: packageRoot,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to generate ${target.name} client (exit ${result.status ?? 'unknown'})`);
  }
}
