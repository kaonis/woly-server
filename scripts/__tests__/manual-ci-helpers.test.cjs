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
