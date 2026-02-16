#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

const ALLOWLISTED_NON_MANUAL_RUNS = [
  {
    event: 'pull_request',
    workflowName: 'CNC Mobile Contract Gate',
    rationale:
      'Required minimal automation gate for CNC protocol/app compatibility.',
  },
];

function parseArgs(argv) {
  const options = {
    limit: 50,
    since: null,
    json: false,
    failOnUnexpected: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--limit') {
      const raw = argv[i + 1];
      if (!raw) {
        throw new Error('Missing value for --limit');
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      options.limit = parsed;
      i += 1;
      continue;
    }

    if (arg === '--since') {
      const raw = argv[i + 1];
      if (!raw) {
        throw new Error('Missing value for --since');
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('--since must be a valid ISO-8601 timestamp');
      }
      options.since = parsed.toISOString();
      i += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--fail-on-unexpected') {
      options.failOnUnexpected = true;
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

function fetchRuns(limit) {
  const output = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--limit',
      String(limit),
      '--json',
      'databaseId,event,status,conclusion,workflowName,name,createdAt,headBranch',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  return JSON.parse(output);
}

function isAllowlistedNonManualRun(run) {
  return ALLOWLISTED_NON_MANUAL_RUNS.some(
    (rule) => run.event === rule.event && run.workflowName === rule.workflowName
  );
}

function buildSummary(runs, sinceIso) {
  const checkedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const threshold = sinceIso ? new Date(sinceIso).getTime() : null;
  const filteredRuns = runs.filter((run) => {
    if (!threshold) {
      return true;
    }
    const createdAt = new Date(run.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= threshold;
  });

  const countsByEvent = {};
  for (const run of filteredRuns) {
    const key = run.event || 'unknown';
    countsByEvent[key] = (countsByEvent[key] || 0) + 1;
  }

  const nonManualRuns = filteredRuns.filter(
    (run) => run.event !== 'workflow_dispatch'
  );
  const allowlistedNonManualRuns = nonManualRuns.filter(
    isAllowlistedNonManualRun
  );
  const unexpectedRuns = nonManualRuns.filter(
    (run) => !isAllowlistedNonManualRun(run)
  );

  return {
    checkedAt,
    since: sinceIso,
    totalRuns: filteredRuns.length,
    countsByEvent,
    nonManualRunCount: nonManualRuns.length,
    allowlistedNonManualRunCount: allowlistedNonManualRuns.length,
    allowlistedNonManualRuns,
    unexpectedRunCount: unexpectedRuns.length,
    unexpectedRuns,
  };
}

function renderMarkdown(summary, limit) {
  const eventLines = Object.entries(summary.countsByEvent)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([event, count]) => `- \`${event}\`: ${count}`);

  const lines = [
    '## Manual CI Run Audit',
    '',
    `Checked at: \`${summary.checkedAt}\``,
    `Scope: latest ${limit} runs${summary.since ? ` since \`${summary.since}\`` : ''}`,
    '',
    `- Total runs analyzed: ${summary.totalRuns}`,
    '- Baseline allowed events:',
    '  - `workflow_dispatch`',
    '  - `pull_request` for `CNC Mobile Contract Gate` (path-scoped, minimal automation exception)',
    `- Non-manual runs observed: ${summary.nonManualRunCount}`,
    `- Allowlisted non-manual runs: ${summary.allowlistedNonManualRunCount}`,
    `- Unexpected non-manual runs: ${summary.unexpectedRunCount}`,
    '- Event distribution:',
  ];

  if (eventLines.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...eventLines);
  }

  if (summary.allowlistedNonManualRunCount > 0) {
    lines.push('', 'Allowlisted non-manual runs:');
    for (const run of summary.allowlistedNonManualRuns.slice(0, 10)) {
      lines.push(
        `- #${run.databaseId} \`${run.event}\` ${run.workflowName} (${run.createdAt}, branch \`${run.headBranch || 'unknown'}\`, conclusion \`${run.conclusion || 'none'}\`)`
      );
    }
  }

  if (summary.unexpectedRunCount > 0) {
    lines.push('', 'Unexpected runs:');
    for (const run of summary.unexpectedRuns.slice(0, 10)) {
      lines.push(
        `- #${run.databaseId} \`${run.event}\` ${run.workflowName} (${run.createdAt}, branch \`${run.headBranch || 'unknown'}\`, conclusion \`${run.conclusion || 'none'}\`)`
      );
    }
  }

  lines.push(
    '',
    summary.unexpectedRunCount > 0
      ? 'Status: **FAIL** (unexpected non-manual workflow events detected)'
      : 'Status: **PASS** (manual-first workflow policy observed in this scope)'
  );

  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-ci-run-audit.cjs [options]',
      '',
      'Options:',
      '  --limit <n>             Number of latest runs to inspect (default: 50)',
      '  --since <iso-8601>      Only include runs created at/after this timestamp',
      '  --json                  Print machine-readable JSON summary',
      '  --fail-on-unexpected    Exit non-zero when non-manual runs are detected',
      '  -h, --help              Show this help text',
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

  const runs = fetchRuns(options.limit);
  const summary = buildSummary(runs, options.since);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderMarkdown(summary, options.limit)}\n`);
  }

  if (options.failOnUnexpected && summary.unexpectedRunCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-run-audit failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  ALLOWLISTED_NON_MANUAL_RUNS,
  buildSummary,
  isAllowlistedNonManualRun,
  parseArgs,
  renderMarkdown,
};
