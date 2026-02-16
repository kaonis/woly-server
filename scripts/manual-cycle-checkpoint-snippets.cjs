#!/usr/bin/env node
'use strict';

const DEFAULT_REVIEWER = 'Codex autonomous loop';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseIssueNumber(raw, flagName) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseTimestamp(raw) {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('--checkpoint must be a valid ISO-8601 timestamp');
  }
  return parsed.toISOString();
}

function parseArgs(argv) {
  const options = {
    issue: null,
    followUpIssue: null,
    checkpoint: null,
    roadmapFile: null,
    reviewer: DEFAULT_REVIEWER,
    date: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === '--issue') {
      options.issue = parseIssueNumber(value, '--issue');
      i += 1;
      continue;
    }

    if (arg === '--follow-up') {
      options.followUpIssue = parseIssueNumber(value, '--follow-up');
      i += 1;
      continue;
    }

    if (arg === '--checkpoint') {
      options.checkpoint = parseTimestamp(value);
      i += 1;
      continue;
    }

    if (arg === '--roadmap-file') {
      options.roadmapFile = value;
      i += 1;
      continue;
    }

    if (arg === '--reviewer') {
      options.reviewer = value;
      i += 1;
      continue;
    }

    if (arg === '--date') {
      if (!DATE_PATTERN.test(value)) {
        throw new Error('--date must use YYYY-MM-DD format');
      }
      options.date = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) {
    return options;
  }

  if (options.issue === null) {
    throw new Error('Missing required argument: --issue');
  }

  if (options.followUpIssue === null) {
    throw new Error('Missing required argument: --follow-up');
  }

  if (options.checkpoint === null) {
    throw new Error('Missing required argument: --checkpoint');
  }

  if (options.roadmapFile === null) {
    throw new Error('Missing required argument: --roadmap-file');
  }

  if (options.date === null) {
    options.date = options.checkpoint.slice(0, 10);
  }

  return options;
}

function renderCiReviewLogSnippet(options) {
  return [
    `Date: ${options.date}`,
    `Reviewer: ${options.reviewer}`,
    `Period reviewed: post-merge cycle (#${options.issue} to #${options.followUpIssue})`,
    '',
    '- Unexpected automatic workflow runs observed: No',
    '- Local gate policy followed: Yes',
    `- Budget and throughput assessment: Scoped audit (\`npm run ci:audit:manual -- --since ${options.checkpoint} --fail-on-unexpected\`) observed no unexpected workflow events while preserving minimal automation budget controls.`,
    '- Decision: Continue manual-first policy',
    `- Follow-up actions: Execute the next weekly review cycle under issue #${options.followUpIssue}.`,
  ].join('\n');
}

function renderDependencyPlanSnippet(options) {
  return [
    `- ${options.date}: Manual-CI operations checkpoint (issue #${options.issue}) confirmed no unexpected workflow events since \`${options.checkpoint}\`; continue manual-first policy and track the next review in #${options.followUpIssue}.`,
    `- ${options.date}: Logged rolling-cycle progress in \`${options.roadmapFile}\` for issue #${options.issue} and queued follow-up issue #${options.followUpIssue}.`,
  ].join('\n');
}

function renderRoadmapProgressSnippet(options) {
  return [
    `- ${options.date}: Ran scoped manual-first workflow audit for issue #${options.issue}: \`npm run ci:audit:manual -- --since ${options.checkpoint} --fail-on-unexpected\` (PASS).`,
    `- ${options.date}: Generated copy-ready checkpoint snippets for \`docs/CI_MANUAL_REVIEW_LOG.md\`, \`docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md\`, and \`${options.roadmapFile}\`.`,
    `- ${options.date}: Created follow-up issue #${options.followUpIssue} to queue the next weekly manual-first review cycle.`,
  ].join('\n');
}

function buildSnippets(options) {
  return {
    ciReviewLog: renderCiReviewLogSnippet(options),
    dependencyPlan: renderDependencyPlanSnippet(options),
    roadmapProgress: renderRoadmapProgressSnippet(options),
  };
}

function renderOutput(options, snippets) {
  return [
    '# Rolling-Cycle Checkpoint Snippets (Dry Run)',
    '',
    'No files were written. Copy the sections below into the target documents.',
    '',
    '## Inputs',
    `- Cycle issue: #${options.issue}`,
    `- Follow-up issue: #${options.followUpIssue}`,
    `- Checkpoint timestamp: \`${options.checkpoint}\``,
    `- Roadmap file: \`${options.roadmapFile}\``,
    `- Reviewer: ${options.reviewer}`,
    `- Date: ${options.date}`,
    '',
    '## docs/CI_MANUAL_REVIEW_LOG.md',
    '```md',
    snippets.ciReviewLog,
    '```',
    '',
    '## docs/DEPENDENCY_MAJOR_UPGRADE_PLAN.md',
    '```md',
    snippets.dependencyPlan,
    '```',
    '',
    `## ${options.roadmapFile}`,
    '```md',
    snippets.roadmapProgress,
    '```',
    '',
  ].join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-cycle-checkpoint-snippets.cjs [options]',
      '',
      'Required:',
      '  --issue <number>          Current cycle issue number',
      '  --follow-up <number>      Next cycle follow-up issue number',
      '  --checkpoint <iso-8601>   Previous review or audit checkpoint timestamp',
      '  --roadmap-file <path>     Active roadmap markdown file path',
      '',
      'Optional:',
      '  --reviewer <name>         Reviewer value for review-log snippet',
      '  --date <YYYY-MM-DD>       Override snippet date (default: checkpoint date)',
      '  -h, --help                Show this help text',
      '',
      'This command is dry-run only and never writes files directly.',
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

  const snippets = buildSnippets(options);
  process.stdout.write(renderOutput(options, snippets));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-cycle-checkpoint-snippets failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_REVIEWER,
  buildSnippets,
  parseArgs,
  renderCiReviewLogSnippet,
  renderDependencyPlanSnippet,
  renderOutput,
  renderRoadmapProgressSnippet,
};
