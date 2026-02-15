#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');
const MAX_TIMEOUT_MINUTES = 8;

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

function listWorkflowFiles() {
  const entries = fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
    .map((entry) => path.join(WORKFLOWS_DIR, entry.name))
    .sort();
}

function parseJobs(lines) {
  const jobs = [];
  let inJobs = false;
  let activeJob = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      activeJob = null;
      continue;
    }

    if (inJobs && /^[a-zA-Z0-9_-]+:\s*$/.test(line)) {
      // Reached next top-level section.
      inJobs = false;
      activeJob = null;
    }

    if (!inJobs) {
      continue;
    }

    const jobMatch = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
    if (jobMatch) {
      activeJob = {
        id: jobMatch[1],
        timeoutMinutes: null,
      };
      jobs.push(activeJob);
      continue;
    }

    if (!activeJob) {
      continue;
    }

    const timeoutMatch = line.match(/^\s{4}timeout-minutes:\s*(\d+)\s*$/);
    if (timeoutMatch) {
      activeJob.timeoutMinutes = Number.parseInt(timeoutMatch[1], 10);
    }
  }

  return jobs;
}

function validateWorkflow(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const violations = [];
  const jobs = parseJobs(lines);

  if (!/^\s*workflow_dispatch:\s*$/m.test(source)) {
    violations.push('missing `workflow_dispatch` trigger');
  }

  for (const forbidden of ['push', 'pull_request', 'schedule']) {
    if (new RegExp(`^\\s*${forbidden}:\\s*$`, 'm').test(source)) {
      violations.push(`forbidden trigger present: \`${forbidden}\``);
    }
  }

  if (jobs.length === 0) {
    violations.push('no jobs found');
  }

  for (const job of jobs) {
    if (job.timeoutMinutes === null) {
      violations.push(
        `job \`${job.id}\` missing \`timeout-minutes\` (required <= ${MAX_TIMEOUT_MINUTES})`
      );
      continue;
    }

    if (job.timeoutMinutes > MAX_TIMEOUT_MINUTES) {
      violations.push(
        `job \`${job.id}\` timeout \`${job.timeoutMinutes}\` exceeds limit \`${MAX_TIMEOUT_MINUTES}\``
      );
    }
  }

  return {
    file: path.relative(process.cwd(), filePath),
    jobs,
    violations,
    passed: violations.length === 0,
  };
}

function buildSummary(results) {
  const checkedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const failed = results.filter((result) => !result.passed);

  return {
    checkedAt,
    filesChecked: results.length,
    failedFiles: failed.length,
    results,
  };
}

function renderReport(summary) {
  const lines = [
    '## Manual CI Workflow Policy Check',
    '',
    `Checked at: \`${summary.checkedAt}\``,
    `Files checked: ${summary.filesChecked}`,
    `Failed files: ${summary.failedFiles}`,
    '',
  ];

  for (const result of summary.results) {
    if (result.passed) {
      lines.push(`- PASS: \`${result.file}\``);
      continue;
    }

    lines.push(`- FAIL: \`${result.file}\``);
    for (const violation of result.violations) {
      lines.push(`  - ${violation}`);
    }
  }

  lines.push(
    '',
    summary.failedFiles === 0
      ? 'Status: **PASS** (manual-only workflow policy is compliant).'
      : 'Status: **FAIL** (manual-only workflow policy violations detected).'
  );

  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/manual-ci-workflow-policy-check.cjs [options]',
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

  const files = listWorkflowFiles();
  const results = files.map(validateWorkflow);
  const summary = buildSummary(results);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(summary)}\n`);
  }

  if (summary.failedFiles > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-workflow-policy-check failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  parseJobs,
  validateWorkflow,
};
