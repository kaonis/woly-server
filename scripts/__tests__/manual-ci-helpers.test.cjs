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
const {
  buildBody: buildFollowupBody,
  buildTitle: buildFollowupTitle,
  createIssue: createFollowupIssue,
  parseArgs: parseFollowupIssueArgs,
  resolveLabels: resolveFollowupLabels,
} = require('../manual-ci-followup-issue.cjs');
const {
  buildCloseoutComment,
  parseArgs: parseCloseoutArgs,
  postCloseoutComment,
} = require('../manual-ci-closeout-comment.cjs');

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

test('parseFollowupIssueArgs parses required --after and dry-run', () => {
  const parsed = parseFollowupIssueArgs(['--after', '243', '--dry-run']);
  assert.deepEqual(parsed, {
    afterIssue: 243,
    dryRun: true,
    labels: [],
    help: false,
  });
});

test('parseFollowupIssueArgs validates required and unknown args', () => {
  assert.throws(
    () => parseFollowupIssueArgs([]),
    /Missing required --after/
  );
  assert.throws(
    () => parseFollowupIssueArgs(['--after', 'abc']),
    /Missing or invalid value for --after/
  );
  assert.throws(
    () => parseFollowupIssueArgs(['--bogus']),
    /Unknown argument/
  );
});

test('resolveFollowupLabels defaults and deduplicates labels', () => {
  assert.deepEqual(resolveFollowupLabels([]), [
    'technical-debt',
    'developer-experience',
    'priority:low',
  ]);
  assert.deepEqual(resolveFollowupLabels(['a', 'b', 'a']), ['a', 'b']);
});

test('buildFollowupTitle and buildFollowupBody render standard template', () => {
  const title = buildFollowupTitle(243);
  const body = buildFollowupBody(243);

  assert.equal(
    title,
    '[CI] Schedule weekly manual-only operations review (rolling follow-up after #243)'
  );
  assert.match(body, /after #243 closeout/);
  assert.match(body, /npm run ci:audit:latest -- --fail-on-unexpected/);
  assert.match(body, /docs\/CI_MANUAL_REVIEW_LOG.md/);
});

test('createFollowupIssue delegates to provided issue creator', () => {
  const calls = [];
  const result = createFollowupIssue(
    'title',
    'body',
    ['l1', 'l2'],
    (payload) => {
      calls.push(payload);
      return 'https://example.invalid/issue/999';
    }
  );

  assert.equal(result, 'https://example.invalid/issue/999');
  assert.deepEqual(calls, [
    {
      title: 'title',
      body: 'body',
      labels: ['l1', 'l2'],
    },
  ]);
});

test('parseCloseoutArgs parses required flags and post mode', () => {
  const parsed = parseCloseoutArgs([
    '--issue',
    '243',
    '--followup',
    '245',
    '--post',
  ]);

  assert.deepEqual(parsed, {
    issue: 243,
    followup: 245,
    merge: '<merge-commit-sha>',
    cycle: '<post-merge-cycle>',
    roadmap: '<roadmap-file>',
    since: null,
    depsPayload: null,
    post: true,
    help: false,
  });
});

test('parseCloseoutArgs validates required issue arguments', () => {
  assert.throws(
    () => parseCloseoutArgs(['--followup', '245']),
    /Missing required --issue/
  );
  assert.throws(
    () => parseCloseoutArgs(['--issue', '243']),
    /Missing required --followup/
  );
  assert.throws(
    () => parseCloseoutArgs(['--issue', 'abc', '--followup', '245']),
    /Missing or invalid value for --issue/
  );
});

test('buildCloseoutComment includes core closeout sections', () => {
  const markdown = buildCloseoutComment({
    issue: 243,
    followup: 245,
    merge: 'abc1234',
    cycle: 'post-merge cycle (#242 to #244)',
    roadmap: 'docs/ROADMAP_V21_AUTONOMOUS_CYCLE.md',
    since: '2026-02-15T21:31:02Z',
    depsPayload: '2026-02-15T22:11:32Z',
  });

  assert.match(markdown, /Completed in merge commit abc1234/);
  assert.match(markdown, /checkpoint `2026-02-15T21:31:02Z`/);
  assert.match(markdown, /docs\/CI_MANUAL_REVIEW_LOG.md/);
  assert.match(markdown, /issue #245/);
  assert.match(markdown, /payload `2026-02-15T22:11:32Z`/);
});

test('postCloseoutComment delegates to provided comment poster', () => {
  const calls = [];
  const output = postCloseoutComment(
    243,
    'closeout-body',
    (issueNumber, body) => {
      calls.push([issueNumber, body]);
      return 'https://example.invalid/issue/243#comment';
    }
  );

  assert.equal(output, 'https://example.invalid/issue/243#comment');
  assert.deepEqual(calls, [[243, 'closeout-body']]);
});
