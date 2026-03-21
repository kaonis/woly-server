#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXCLUDED_COPY_BASENAMES = new Set([
  '.git',
  '.expo',
  '.turbo',
  'coverage',
  'node_modules',
]);

function parseArgs(argv) {
  const options = {
    wolyPath: process.env.WOLY_PATH || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--woly-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --woly-path');
      }
      options.wolyPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    encoding: options.encoding || 'utf8',
  }).trim();
}

function runInherited(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function assertPathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found: ${targetPath}`);
  }
}

function copyWolyCheckout(sourcePath, destinationPath) {
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    filter: (entryPath) => {
      const basename = path.basename(entryPath);
      return !EXCLUDED_COPY_BASENAMES.has(basename);
    },
  });
}

function packWorkspace(repoRoot, workspaceName, destinationPath) {
  const tarballName = run(
    'npm',
    ['pack', `--workspace=${workspaceName}`, '--pack-destination', destinationPath],
    { cwd: repoRoot },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!tarballName) {
    throw new Error(`npm pack did not produce a tarball name for ${workspaceName}`);
  }

  const tarballPath = path.join(destinationPath, tarballName);
  assertPathExists(tarballPath, `Packed tarball for ${workspaceName}`);
  return tarballPath;
}

function main() {
  const repoRoot = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const resolvedWolyPath = path.resolve(
    repoRoot,
    options.wolyPath || path.join('..', 'woly'),
  );

  assertPathExists(path.join(resolvedWolyPath, 'package.json'), 'woly checkout');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-consumer-'));
  const tempWolyPath = path.join(tempRoot, 'woly');
  const packedArtifactsPath = path.join(tempRoot, 'artifacts');
  fs.mkdirSync(packedArtifactsPath, { recursive: true });

  try {
    console.log(`Using woly checkout: ${resolvedWolyPath}`);
    console.log('Building local protocol and client packages...');
    runInherited('npm', ['run', 'build', '--workspace=@kaonis/woly-protocol'], repoRoot);
    runInherited('npm', ['run', 'build', '--workspace=@kaonis/woly-client'], repoRoot);

    console.log('Packing local protocol and client artifacts...');
    const protocolTarballPath = packWorkspace(
      repoRoot,
      '@kaonis/woly-protocol',
      packedArtifactsPath,
    );
    const clientTarballPath = packWorkspace(
      repoRoot,
      '@kaonis/woly-client',
      packedArtifactsPath,
    );

    console.log('Preparing clean temp copy of woly...');
    copyWolyCheckout(resolvedWolyPath, tempWolyPath);

    console.log('Running plain npm ci in temp woly copy...');
    runInherited('npm', ['ci'], tempWolyPath);

    console.log('Overlaying local protocol/client tarballs...');
    runInherited(
      'npm',
      ['install', '--no-save', protocolTarballPath, clientTarballPath],
      tempWolyPath,
    );

    console.log('Running woly contract gate against local tarballs...');
    runInherited('npm', ['run', 'test:contracts'], tempWolyPath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`validate-woly-consumer failed: ${message}`);
  process.exit(1);
}
