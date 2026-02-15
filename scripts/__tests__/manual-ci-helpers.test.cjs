'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findLatestSinceCheckpoint,
  hasSinceArg,
} = require('../manual-ci-run-audit-latest.cjs');
const {
  buildTemplate,
  parseArgs,
  resolveSinceCheckpoint,
} = require('../manual-ci-review-template.cjs');
const {
  buildDashboardCheckpoint,
  parseArgs: parseDashboardArgs,
} = require('../eslint10-dashboard-checkpoint.cjs');
const {
  parseArgs: parseCheckpointPostArgs,
  postCheckpointToIssues,
  resolveIssues,
} = require('../eslint10-dashboard-checkpoint-post.cjs');

test('findLatestSinceCheckpoint returns the latest valid checkpoint', () => {
  const markdown = [
    '- Budget: `ci:audit:manual --since 2026-02-15T17:07:43Z`',
    '- Budget: `ci:audit:manual --since 2026-02-15T21:31:02Z --fail-on-unexpected`',
  ].join('\n');

  const latest = findLatestSinceCheckpoint(markdown);
  assert.equal(latest, '2026-02-15T21:31:02Z');
});

test('findLatestSinceCheckpoint throws when no checkpoint exists', () => {
  assert.throws(
    () => findLatestSinceCheckpoint('no checkpoint lines here'),
    /No valid ci:audit:manual --since checkpoint/
  );
});

test('hasSinceArg detects explicit since flag', () => {
  assert.equal(hasSinceArg(['--fail-on-unexpected']), false);
  assert.equal(hasSinceArg(['--since', '2026-02-15T21:31:02Z']), true);
});

test('parseArgs accepts reviewer/period/since overrides', () => {
  const parsed = parseArgs([
    '--reviewer',
    'Jane Reviewer',
    '--period',
    'post-merge cycle',
    '--since',
    '2026-02-15T21:31:02Z',
  ]);

  assert.equal(parsed.reviewer, 'Jane Reviewer');
  assert.equal(parsed.period, 'post-merge cycle');
  assert.equal(parsed.since, '2026-02-15T21:31:02Z');
  assert.equal(parsed.help, false);
});

test('resolveSinceCheckpoint returns explicit value without reading log', () => {
  const resolved = resolveSinceCheckpoint('2026-02-15T21:31:02Z');
  assert.equal(resolved, '2026-02-15T21:31:02Z');
});

test('buildTemplate includes mandatory review fields', () => {
  const template = buildTemplate({
    reviewer: 'Reviewer A',
    period: 'cycle X',
    since: '2026-02-15T21:31:02Z',
  });

  assert.match(template, /Reviewer: Reviewer A/);
  assert.match(template, /Period reviewed: cycle X/);
  assert.match(template, /Unexpected automatic workflow runs observed/);
  assert.match(template, /Decision: <Continue manual-only \/ Start rollback>/);
  assert.match(template, /2026-02-15T21:31:02Z/);
});

test('parseDashboardArgs supports --json and --help flags', () => {
  assert.deepEqual(parseDashboardArgs(['--json']), {
    json: true,
    help: false,
  });
  assert.deepEqual(parseDashboardArgs(['--help']), {
    json: false,
    help: true,
  });
});

test('buildDashboardCheckpoint includes expected dependency fields', () => {
  const markdown = buildDashboardCheckpoint({
    checkedAt: '2026-02-15T21:52:27Z',
    eslintVersion: '10.0.0',
    pluginVersion: '8.55.0',
    parserVersion: '8.55.0',
    peerRange: '^8.57.0 || ^9.0.0',
    supportsEslint10: false,
  });

  assert.match(markdown, /Dependency Dashboard ESLint10 Checkpoint/);
  assert.match(markdown, /Latest `eslint`: `10.0.0`/);
  assert.match(markdown, /peer range: `\^8.57.0 \|\| \^9.0.0`/);
  assert.match(markdown, /Status: \*\*BLOCKED/);
  assert.match(markdown, /Dependency dashboard: #4/);
});

test('parseCheckpointPostArgs supports repeated issue flags and dry-run', () => {
  const parsed = parseCheckpointPostArgs([
    '--issue',
    '150',
    '--issue',
    '4',
    '--dry-run',
  ]);

  assert.deepEqual(parsed, {
    issues: [150, 4],
    dryRun: true,
    help: false,
  });
});

test('parseCheckpointPostArgs validates issue inputs', () => {
  assert.throws(
    () => parseCheckpointPostArgs(['--issue']),
    /Missing or invalid value for --issue/
  );
  assert.throws(
    () => parseCheckpointPostArgs(['--issue', 'abc']),
    /Missing or invalid value for --issue/
  );
});

test('resolveIssues defaults and deduplicates while preserving order', () => {
  assert.deepEqual(resolveIssues([]), [150, 4]);
  assert.deepEqual(resolveIssues([150, 4, 150]), [150, 4]);
});

test('postCheckpointToIssues calls commenter for each issue', () => {
  const calls = [];
  const results = postCheckpointToIssues(
    [150, 4],
    'checkpoint-body',
    (issueNumber, body) => {
      calls.push([issueNumber, body]);
      return `ok-${issueNumber}`;
    }
  );

  assert.deepEqual(calls, [
    [150, 'checkpoint-body'],
    [4, 'checkpoint-body'],
  ]);
  assert.deepEqual(results, [
    { issueNumber: 150, output: 'ok-150' },
    { issueNumber: 4, output: 'ok-4' },
  ]);
});
