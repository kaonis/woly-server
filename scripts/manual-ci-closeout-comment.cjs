#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { resolveSinceCheckpoint } = require('./manual-ci-review-template.cjs');

function parseIssueNumber(raw, flagName) {
  const issue = Number.parseInt(raw || '', 10);
  if (!/^\d+$/.test(raw || '') || issue <= 0) {
    throw new Error(`Missing or invalid value for ${flagName} (expected positive integer)`);
  }
  return issue;
}

function parseArgs(argv) {
  const options = {
    issue: null,
    followup: null,
    merge: '<merge-commit-sha>',
    cycle: '<post-merge-cycle>',
    roadmap: '<roadmap-file>',
    since: null,
    depsPayload: null,
    post: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--issue') {
      options.issue = parseIssueNumber(argv[i + 1], '--issue');
      i += 1;
      continue;
    }

    if (arg === '--followup') {
      options.followup = parseIssueNumber(argv[i + 1], '--followup');
      i += 1;
      continue;
    }

    if (arg === '--merge') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
        throw new Error('Missing value for --merge');
      }
      options.merge = value.trim();
      i += 1;
      continue;
    }

    if (arg === '--cycle') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
        throw new Error('Missing value for --cycle');
      }
      options.cycle = value.trim();
      i += 1;
      continue;
    }

    if (arg === '--roadmap') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
        throw new Error('Missing value for --roadmap');
      }
      options.roadmap = value.trim();
      i += 1;
      continue;
    }

    if (arg === '--since') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
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

    if (arg === '--deps-payload') {
      const value = argv[i + 1] || '';
      if (!value.trim()) {
        throw new Error('Missing value for --deps-payload');
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('--deps-payload must be a valid ISO-8601 timestamp');
      }
      options.depsPayload = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
      i += 1;
      continue;
    }

    if (arg === '--post') {
      options.post = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.help && options.issue === null) {
    throw new Error('Missing required --issue <issue-number>');
  }

  if (!options.help && options.followup === null) {
    throw new Error('Missing required --followup <issue-number>');
  }

  return options;
}

function buildCloseoutComment({
  issue,
  followup,
  merge,
  cycle,
  roadmap,
  since,
  depsPayload,
}) {
  const depsLine = depsPayload
    ? `- Posted updated ESLint10 checkpoint comments to #150 and #4 using \`npm run deps:checkpoint:eslint10:post\` (payload \`${depsPayload}\`).`
    : '- Posted updated ESLint10 checkpoint comments to #150 and #4 using `npm run deps:checkpoint:eslint10:post`.';

  return [
    `Completed in merge commit ${merge}.`,
    '',
    'What was done:',
    `- Ran \`npm run ci:audit:latest -- --fail-on-unexpected\` (PASS; 0 runs; checkpoint \`${since}\`).`,
    `- Appended a policy decision entry to \`docs/CI_MANUAL_REVIEW_LOG.md\` for ${cycle}.`,
    '- Updated checkpoint notes in `docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md`.',
    `- Updated roadmap progress in \`${roadmap}\`.`,
    '- Created follow-up rolling review issue using helper command:',
    `  - \`npm run ci:followup:create -- --after ${issue}\` (issue #${followup}).`,
    depsLine,
    '',
  ].join('\n');
}

function postCloseoutComment(issueNumber, commentBody, commentPoster) {
  return commentPoster(issueNumber, commentBody);
}

function runGhIssueComment(issueNumber, commentBody) {
  const output = execFileSync(
    'gh',
    ['issue', 'comment', String(issueNumber), '--body', commentBody],
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
      'Usage: node scripts/manual-ci-closeout-comment.cjs --issue <n> --followup <n> [options]',
      '',
      'Options:',
      '  --issue <number>         Issue number to comment on (required)',
      '  --followup <number>      Follow-up issue number referenced in comment (required)',
      '  --merge <sha>            Merge commit sha to include in comment',
      '  --cycle <text>           Review cycle description (for review log bullet)',
      '  --roadmap <path>         Roadmap path to include in comment',
      '  --since <iso-8601>       Override audit checkpoint timestamp',
      '  --deps-payload <iso>     Optional ESLint10 checkpoint payload timestamp',
      '  --post                   Post comment directly to target issue via gh',
      '  -h, --help               Show this help text',
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
  const comment = buildCloseoutComment({
    issue: options.issue,
    followup: options.followup,
    merge: options.merge,
    cycle: options.cycle,
    roadmap: options.roadmap,
    since,
    depsPayload: options.depsPayload,
  });

  if (!options.post) {
    process.stdout.write(
      [
        'Dry run: would post the following closeout comment:',
        '',
        comment,
      ].join('\n')
    );
    return;
  }

  const output = postCloseoutComment(options.issue, comment, runGhIssueComment);
  process.stdout.write(`Posted closeout comment to #${options.issue}: ${output}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-closeout-comment failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildCloseoutComment,
  parseArgs,
  postCloseoutComment,
};
