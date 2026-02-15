#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

function parseIssueNumber(raw, flag) {
  const issue = Number.parseInt(raw || '', 10);
  if (!/^\d+$/.test(raw || '') || issue <= 0) {
    throw new Error(`Missing or invalid value for ${flag} (expected positive integer)`);
  }
  return issue;
}

function parseArgs(argv) {
  const options = {
    afterIssue: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--after') {
      options.afterIssue = parseIssueNumber(argv[i + 1], '--after');
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

  if (!options.help && options.afterIssue === null) {
    throw new Error('Missing required --after <issue-number>');
  }

  return options;
}

function runNpmCommand(args) {
  return execFileSync('npm', ['run', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseAuditOutput(output) {
  const status = output.match(/Status:\s+\*\*([^*]+)\*\*/)?.[1]?.trim() || 'unknown';
  const checkedAt = output.match(/Checked at:\s+`([^`]+)`/)?.[1] || 'unknown';
  const since =
    output.match(/Using latest checkpoint --since\s+([^\n]+)/)?.[1]?.trim() ||
    'unknown';

  return { status, checkedAt, since };
}

function parseFollowupOutput(output) {
  const issueUrl =
    output.match(/Created follow-up issue:\s*(https:\/\/github\.com\/[^\s]+)/)?.[1] ||
    null;
  const issueNumber =
    issueUrl && issueUrl.match(/\/issues\/(\d+)/)
      ? Number.parseInt(issueUrl.match(/\/issues\/(\d+)/)[1], 10)
      : null;

  return { issueUrl, issueNumber };
}

function parseDepsCheckpointOutput(output) {
  const issue150Url =
    output.match(/Posted checkpoint to #150:\s*(https:\/\/github\.com\/[^\s]+)/)?.[1] ||
    null;
  const issue4Url =
    output.match(/Posted checkpoint to #4:\s*(https:\/\/github\.com\/[^\s]+)/)?.[1] ||
    null;

  return { issue150Url, issue4Url };
}

function buildCycleSummary(result) {
  const followupLine = result.followup.issueNumber
    ? `- Follow-up issue created: #${result.followup.issueNumber} (${result.followup.issueUrl})`
    : '- Follow-up issue created: unknown';

  const depsLine150 = result.deps.issue150Url
    ? `- #150 checkpoint comment: ${result.deps.issue150Url}`
    : '- #150 checkpoint comment: unknown';

  const depsLine4 = result.deps.issue4Url
    ? `- #4 checkpoint comment: ${result.deps.issue4Url}`
    : '- #4 checkpoint comment: unknown';

  return [
    '## Manual CI Cycle Summary',
    '',
    `- Source issue: #${result.afterIssue}`,
    `- Audit status: ${result.audit.status}`,
    `- Audit checked at: ${result.audit.checkedAt}`,
    `- Audit since checkpoint: ${result.audit.since}`,
    followupLine,
    depsLine150,
    depsLine4,
    '',
  ].join('\n');
}

function runCycle(afterIssue, commandRunner) {
  const auditOutput = commandRunner(['ci:audit:latest', '--', '--fail-on-unexpected']);
  const followupOutput = commandRunner(['ci:followup:create', '--', '--after', String(afterIssue)]);
  const depsOutput = commandRunner(['deps:checkpoint:eslint10:post']);

  return {
    afterIssue,
    audit: parseAuditOutput(auditOutput),
    followup: parseFollowupOutput(followupOutput),
    deps: parseDepsCheckpointOutput(depsOutput),
    raw: {
      auditOutput,
      followupOutput,
      depsOutput,
    },
  };
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-ci-cycle-orchestrator.cjs --after <issue-number> [options]',
      '',
      'Options:',
      '  --after <number>  Current rolling review issue number (required)',
      '  --dry-run         Print planned commands only',
      '  -h, --help        Show this help text',
      '',
      'Runs sequence:',
      '  1) npm run ci:audit:latest -- --fail-on-unexpected',
      '  2) npm run ci:followup:create -- --after <issue>',
      '  3) npm run deps:checkpoint:eslint10:post',
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

  if (options.dryRun) {
    process.stdout.write(
      [
        'Dry run: would execute the following commands:',
        '1) npm run ci:audit:latest -- --fail-on-unexpected',
        `2) npm run ci:followup:create -- --after ${options.afterIssue}`,
        '3) npm run deps:checkpoint:eslint10:post',
        '',
      ].join('\n')
    );
    return;
  }

  const result = runCycle(options.afterIssue, runNpmCommand);
  process.stdout.write(buildCycleSummary(result));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-cycle-orchestrator failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildCycleSummary,
  parseArgs,
  parseAuditOutput,
  parseDepsCheckpointOutput,
  parseFollowupOutput,
  runCycle,
};
