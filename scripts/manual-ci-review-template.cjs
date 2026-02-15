#!/usr/bin/env node
'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { findLatestSinceCheckpoint } = require('./manual-ci-run-audit-latest.cjs');

const REVIEW_LOG_PATH = resolve(__dirname, '..', 'docs', 'CI_MANUAL_REVIEW_LOG.md');

function parseArgs(argv) {
  const options = {
    reviewer: 'Codex autonomous loop',
    period: '<period-reviewed>',
    since: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--reviewer') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --reviewer');
      }
      options.reviewer = value;
      i += 1;
      continue;
    }

    if (arg === '--period') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --period');
      }
      options.period = value;
      i += 1;
      continue;
    }

    if (arg === '--since') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --since');
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('--since must be a valid ISO-8601 timestamp');
      }
      options.since = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
      i += 1;
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

function resolveSinceCheckpoint(explicitSince) {
  if (explicitSince) {
    return explicitSince;
  }

  const reviewLog = readFileSync(REVIEW_LOG_PATH, 'utf8');
  return findLatestSinceCheckpoint(reviewLog);
}

function buildTemplate({ reviewer, period, since }) {
  const date = new Date().toISOString().slice(0, 10);

  return [
    `Date: ${date}`,
    `Reviewer: ${reviewer}`,
    `Period reviewed: ${period}`,
    '',
    '- Unexpected automatic workflow runs observed: <Yes/No>',
    '- Local gate policy followed: <Yes/No>',
    `- Budget and throughput assessment: Scoped audit (\`npm run ci:audit:latest -- --fail-on-unexpected\`) since \`${since}\`; <summary>.`,
    '- Decision: <Continue manual-only / Start rollback>',
    '- Follow-up actions: <next issue / actions>',
    '',
  ].join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-ci-review-template.cjs [options]',
      '',
      'Options:',
      '  --reviewer <name>      Reviewer name in output template',
      '  --period <text>        Period reviewed text',
      '  --since <iso-8601>     Override since checkpoint (defaults to latest log checkpoint)',
      '  -h, --help             Show this help text',
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

  const since = resolveSinceCheckpoint(options.since);
  process.stdout.write(buildTemplate({
    reviewer: options.reviewer,
    period: options.period,
    since,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-review-template failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildTemplate,
  parseArgs,
  resolveSinceCheckpoint,
};
