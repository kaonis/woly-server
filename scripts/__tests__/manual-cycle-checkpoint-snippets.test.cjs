const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_REVIEWER,
  buildSnippets,
  parseArgs,
  renderOutput,
} = require('../manual-cycle-checkpoint-snippets.cjs');

test('parseArgs validates and normalizes required values', () => {
  const parsed = parseArgs([
    '--issue',
    '251',
    '--follow-up',
    '252',
    '--checkpoint',
    '2026-02-16T20:00:00Z',
    '--roadmap-file',
    'docs/ROADMAP_CNC_SYNC_V1.md',
  ]);

  assert.equal(parsed.issue, 251);
  assert.equal(parsed.followUpIssue, 252);
  assert.equal(parsed.checkpoint, '2026-02-16T20:00:00.000Z');
  assert.equal(parsed.roadmapFile, 'docs/ROADMAP_CNC_SYNC_V1.md');
  assert.equal(parsed.reviewer, DEFAULT_REVIEWER);
  assert.equal(parsed.date, '2026-02-16');
});

test('parseArgs rejects missing required flags', () => {
  assert.throws(
    () =>
      parseArgs([
        '--issue',
        '251',
        '--follow-up',
        '252',
        '--roadmap-file',
        'docs/ROADMAP_CNC_SYNC_V1.md',
      ]),
    /Missing required argument: --checkpoint/
  );
});

test('buildSnippets renders copy-ready content with key values', () => {
  const parsed = parseArgs([
    '--issue',
    '251',
    '--follow-up',
    '253',
    '--checkpoint',
    '2026-02-16T21:30:00Z',
    '--roadmap-file',
    'docs/ROADMAP_CNC_SYNC_V1.md',
    '--reviewer',
    'Platform Rotation',
    '--date',
    '2026-02-17',
  ]);
  const snippets = buildSnippets(parsed);

  assert.match(snippets.ciReviewLog, /Date: 2026-02-17/);
  assert.match(snippets.ciReviewLog, /Reviewer: Platform Rotation/);
  assert.match(snippets.ciReviewLog, /post-merge cycle \(#251 to #253\)/);
  assert.match(
    snippets.ciReviewLog,
    /npm run ci:audit:manual -- --since 2026-02-16T21:30:00.000Z --fail-on-unexpected/
  );
  assert.match(snippets.dependencyPlan, /issue #251/);
  assert.match(snippets.dependencyPlan, /follow-up issue #253/);
  assert.match(snippets.roadmapProgress, /docs\/ROADMAP_CNC_SYNC_V1\.md/);
});

test('renderOutput includes all three markdown sections', () => {
  const parsed = parseArgs([
    '--issue',
    '251',
    '--follow-up',
    '253',
    '--checkpoint',
    '2026-02-16T21:30:00Z',
    '--roadmap-file',
    'docs/ROADMAP_CNC_SYNC_V1.md',
  ]);
  const rendered = renderOutput(parsed, buildSnippets(parsed));

  assert.match(rendered, /Rolling-Cycle Checkpoint Snippets \(Dry Run\)/);
  assert.match(rendered, /## docs\/CI_MANUAL_REVIEW_LOG\.md/);
  assert.match(rendered, /## docs\/DEPENDENCY_MAJOR_UPGRADE_PLAN\.md/);
  assert.match(rendered, /## docs\/ROADMAP_CNC_SYNC_V1\.md/);
  assert.match(rendered, /```md/);
});
