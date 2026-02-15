#!/usr/bin/env node
'use strict';

const { readLatestEslint10Compatibility } = require('./eslint10-compat-watchdog.cjs');

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

function buildDashboardCheckpoint(payload) {
  const status = payload.supportsEslint10
    ? 'UNBLOCKED: @typescript-eslint peer range now includes ESLint 10.'
    : 'BLOCKED: @typescript-eslint peer range does not include ESLint 10 yet.';

  return [
    '<!-- eslint10-dashboard-checkpoint -->',
    '## Dependency Dashboard ESLint10 Checkpoint',
    '',
    `Checked at: \`${payload.checkedAt}\``,
    '',
    `- Latest \`eslint\`: \`${payload.eslintVersion}\``,
    `- Latest \`@typescript-eslint/eslint-plugin\`: \`${payload.pluginVersion}\``,
    `- Latest \`@typescript-eslint/parser\`: \`${payload.parserVersion}\``,
    `- Reported \`eslint\` peer range: \`${payload.peerRange}\``,
    `- Status: **${status}**`,
    '',
    'Tracking issues:',
    '- ESLint 10 compatibility: #150',
    '- Dependency dashboard: #4',
  ].join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/eslint10-dashboard-checkpoint.cjs [options]',
      '',
      'Options:',
      '  --json          Print compatibility payload as JSON',
      '  -h, --help      Show this help text',
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

  const payload = readLatestEslint10Compatibility();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${buildDashboardCheckpoint(payload)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `eslint10-dashboard-checkpoint failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildDashboardCheckpoint,
  parseArgs,
};
