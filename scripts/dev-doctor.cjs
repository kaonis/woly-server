#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MIN_NODE_MAJOR = 24;
const MIN_NPM_MAJOR = 10;

function parseArgs(argv) {
  const options = {
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commandExists(cmd) {
  try {
    run('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

function parseMajor(version) {
  const match = String(version).trim().match(/^v?(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function checkNodeVersion(results) {
  const nodeVersion = process.versions.node;
  const major = parseMajor(nodeVersion);
  if (major !== null && major >= MIN_NODE_MAJOR) {
    results.push({
      level: 'pass',
      check: 'node-version',
      message: `Node.js ${nodeVersion} (>= ${MIN_NODE_MAJOR})`,
    });
    return;
  }

  results.push({
    level: 'fail',
    check: 'node-version',
    message: `Node.js ${nodeVersion} detected; required >= ${MIN_NODE_MAJOR}.`,
  });
}

function checkNpmVersion(results) {
  try {
    const npmVersion = run('npm', ['--version']);
    const major = parseMajor(npmVersion);
    if (major !== null && major >= MIN_NPM_MAJOR) {
      results.push({
        level: 'pass',
        check: 'npm-version',
        message: `npm ${npmVersion} (>= ${MIN_NPM_MAJOR})`,
      });
      return;
    }

    results.push({
      level: 'fail',
      check: 'npm-version',
      message: `npm ${npmVersion} detected; required >= ${MIN_NPM_MAJOR}.`,
    });
  } catch (error) {
    results.push({
      level: 'fail',
      check: 'npm-version',
      message: `Unable to read npm version: ${error.message || String(error)}`,
    });
  }
}

function checkCommands(results) {
  const requiredCommands = [
    {
      name: 'gitleaks',
      install: 'brew install gitleaks',
    },
  ];
  const optionalCommands = [
    {
      name: 'gh',
      install: 'brew install gh',
    },
  ];

  for (const command of requiredCommands) {
    if (commandExists(command.name)) {
      results.push({
        level: 'pass',
        check: `command-${command.name}`,
        message: `Command available: ${command.name}`,
      });
      continue;
    }

    results.push({
      level: 'fail',
      check: `command-${command.name}`,
      message: `Missing required command: ${command.name} (${command.install})`,
    });
  }

  for (const command of optionalCommands) {
    if (commandExists(command.name)) {
      results.push({
        level: 'pass',
        check: `command-${command.name}`,
        message: `Command available: ${command.name}`,
      });
      continue;
    }

    results.push({
      level: 'warn',
      check: `command-${command.name}`,
      message: `Missing optional command: ${command.name} (${command.install})`,
    });
  }
}

function checkFiles(results) {
  const repoRoot = process.cwd();
  const requiredFiles = [
    '.gitleaks.toml',
    'commitlint.config.cjs',
    '.husky/pre-commit',
    '.husky/pre-push',
    '.husky/commit-msg',
  ];

  for (const relativePath of requiredFiles) {
    const filePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      results.push({
        level: 'fail',
        check: `file-${relativePath}`,
        message: `Missing required file: ${relativePath}`,
      });
      continue;
    }

    if (relativePath.startsWith('.husky/') && !isExecutable(filePath)) {
      results.push({
        level: 'fail',
        check: `file-${relativePath}`,
        message: `Hook is not executable: ${relativePath}`,
      });
      continue;
    }

    results.push({
      level: 'pass',
      check: `file-${relativePath}`,
      message: `Found: ${relativePath}`,
    });
  }
}

function buildSummary(results) {
  const counts = {
    pass: 0,
    warn: 0,
    fail: 0,
  };

  for (const result of results) {
    counts[result.level] += 1;
  }

  return {
    checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    counts,
    results,
  };
}

function renderSummary(summary) {
  const lines = [
    '## Dev Doctor',
    '',
    `Checked at: \`${summary.checkedAt}\``,
    `Pass: ${summary.counts.pass}`,
    `Warn: ${summary.counts.warn}`,
    `Fail: ${summary.counts.fail}`,
    '',
  ];

  for (const result of summary.results) {
    const prefix = result.level === 'pass' ? 'PASS' : result.level === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`- ${prefix}: ${result.message}`);
  }

  lines.push('');
  lines.push(
    summary.counts.fail === 0
      ? 'Status: **PASS** (local development prerequisites are satisfied).'
      : 'Status: **FAIL** (fix required prerequisites before continuing).'
  );

  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/dev-doctor.cjs [options]',
      '',
      'Options:',
      '  --json        Print machine-readable JSON output',
      '  -h, --help    Show this help text',
      '',
    ].join('\n')
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const results = [];
  checkNodeVersion(results);
  checkNpmVersion(results);
  checkCommands(results);
  checkFiles(results);

  const summary = buildSummary(results);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderSummary(summary)}\n`);
  }

  if (summary.counts.fail > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`dev-doctor failed: ${error.message || String(error)}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  parseMajor,
  buildSummary,
};
