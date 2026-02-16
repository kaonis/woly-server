#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const {
  buildDashboardCheckpoint,
} = require('./eslint10-dashboard-checkpoint.cjs');
const {
  readLatestEslint10Compatibility,
} = require('./eslint10-compat-watchdog.cjs');

function parseArgs(argv) {
  const options = {
    issues: [],
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--issue') {
      const raw = argv[i + 1] || '';
      const issue = Number.parseInt(raw, 10);
      if (!/^\d+$/.test(raw) || issue <= 0) {
        throw new Error('Missing or invalid value for --issue (expected positive integer)');
      }
      options.issues.push(issue);
      i += 1;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
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

function resolveIssues(issues) {
  const selected = issues.length > 0 ? issues : [150, 4];
  return Array.from(new Set(selected));
}

function runGhIssueComment(issueNumber, body) {
  const output = execFileSync(
    'gh',
    ['issue', 'comment', String(issueNumber), '--body', body],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  return output.trim();
}

function postCheckpointToIssues(issues, body, issueCommenter) {
  const results = [];

  for (const issueNumber of issues) {
    const output = issueCommenter(issueNumber, body);
    results.push({ issueNumber, output });
  }

  return results;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/eslint10-dashboard-checkpoint-post.cjs [options]',
      '',
      'Options:',
      '  --issue <number>   Target issue number (repeatable). Defaults to #150 and #4',
      '  --dry-run          Print markdown and target issues without posting',
      '  -h, --help         Show this help text',
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

  const issues = resolveIssues(options.issues);
  const payload = readLatestEslint10Compatibility();
  const markdown = buildDashboardCheckpoint(payload);

  if (options.dryRun) {
    process.stdout.write(
      [
        `Dry run: would post ESLint10 checkpoint to issues ${issues
          .map((issue) => `#${issue}`)
          .join(', ')}`,
        '',
        markdown,
        '',
      ].join('\n')
    );
    return;
  }

  const results = postCheckpointToIssues(issues, markdown, runGhIssueComment);
  for (const result of results) {
    process.stdout.write(`Posted checkpoint to #${result.issueNumber}: ${result.output}\n`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `eslint10-dashboard-checkpoint-post failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  postCheckpointToIssues,
  resolveIssues,
};
