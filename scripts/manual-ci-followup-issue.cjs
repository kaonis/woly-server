#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const DEFAULT_LABELS = [
  'technical-debt',
  'developer-experience',
  'priority:low',
];

function parseArgs(argv) {
  const options = {
    afterIssue: null,
    dryRun: false,
    labels: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--after') {
      const raw = argv[i + 1] || '';
      const issue = Number.parseInt(raw, 10);
      if (!/^\d+$/.test(raw) || issue <= 0) {
        throw new Error('Missing or invalid value for --after (expected positive integer)');
      }
      options.afterIssue = issue;
      i += 1;
      continue;
    }

    if (arg === '--label') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
        throw new Error('Missing value for --label');
      }
      options.labels.push(value.trim());
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

function resolveLabels(labels) {
  const selected = labels.length > 0 ? labels : DEFAULT_LABELS;
  return Array.from(new Set(selected));
}

function buildTitle(afterIssue) {
  return `[CI] Schedule weekly manual-only operations review (rolling follow-up after #${afterIssue})`;
}

function buildBody(afterIssue) {
  return [
    '## Summary',
    `Queue the next weekly manual-only CI operations review after #${afterIssue} closeout.`,
    '',
    '## Acceptance Criteria',
    '- Run scoped `npm run ci:audit:latest -- --fail-on-unexpected` (or equivalent with explicit `--since`).',
    '- Append a decision entry to `docs/CI_MANUAL_REVIEW_LOG.md`.',
    '- Update active roadmap progress and dependency checkpoint notes.',
    '',
    '## Definition of Done',
    '- PR merged to `master`',
    '- Manual review log updated for the reviewed period',
    '',
  ].join('\n');
}

function createIssue(title, body, labels, issueCreator) {
  return issueCreator({ title, body, labels });
}

function runGhIssueCreate({ title, body, labels }) {
  const labelArgs = labels.flatMap((label) => ['--label', label]);
  const output = execFileSync(
    'gh',
    ['issue', 'create', '--title', title, '--body', body, ...labelArgs],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  return output.trim();
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-ci-followup-issue.cjs --after <issue-number> [options]',
      '',
      'Options:',
      '  --after <number>  Source issue number used in title/body template',
      '  --label <name>    Issue label override (repeatable, defaults to standard CI labels)',
      '  --dry-run         Print title/body/labels without creating issue',
      '  -h, --help        Show this help text',
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

  const labels = resolveLabels(options.labels);
  const title = buildTitle(options.afterIssue);
  const body = buildBody(options.afterIssue);

  if (options.dryRun) {
    process.stdout.write(
      [
        'Dry run: would create issue with the following payload:',
        `Title: ${title}`,
        `Labels: ${labels.join(', ')}`,
        '',
        body,
      ].join('\n')
    );
    return;
  }

  const issueUrl = createIssue(title, body, labels, runGhIssueCreate);
  process.stdout.write(`Created follow-up issue: ${issueUrl}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-followup-issue failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildBody,
  buildTitle,
  createIssue,
  parseArgs,
  resolveLabels,
};
