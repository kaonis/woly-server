import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { specs } from '../src/swagger';

function main(): void {
  const outputArg = process.argv[2];
  if (!outputArg) {
    throw new Error('Usage: npm run openapi:export -- <output-path>');
  }

  const outputPath = resolve(process.cwd(), outputArg);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(specs, null, 2)}\n`, 'utf8');

  // stdout log is useful in CI/manual export runs.
  process.stdout.write(`Exported CNC OpenAPI spec to ${outputPath}\n`);
}

main();
