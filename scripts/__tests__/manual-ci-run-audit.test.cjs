const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ALLOWLISTED_NON_MANUAL_RUNS,
  buildSummary,
  isAllowlistedNonManualRun,
} = require('../manual-ci-run-audit.cjs');

test('allowlist includes CNC Mobile Contract Gate pull_request runs', () => {
  assert.equal(ALLOWLISTED_NON_MANUAL_RUNS.length, 1);
  assert.equal(ALLOWLISTED_NON_MANUAL_RUNS[0].event, 'pull_request');
  assert.equal(
    ALLOWLISTED_NON_MANUAL_RUNS[0].workflowName,
    'CNC Mobile Contract Gate'
  );
});

test('buildSummary counts allowlisted and unexpected non-manual runs separately', () => {
  const runs = [
    {
      databaseId: 1,
      event: 'workflow_dispatch',
      workflowName: 'CI',
      createdAt: '2026-02-16T18:00:00Z',
      headBranch: 'master',
      conclusion: 'success',
    },
    {
      databaseId: 2,
      event: 'pull_request',
      workflowName: 'CNC Mobile Contract Gate',
      createdAt: '2026-02-16T18:01:00Z',
      headBranch: 'feature/a',
      conclusion: 'success',
    },
    {
      databaseId: 3,
      event: 'pull_request',
      workflowName: 'Other Workflow',
      createdAt: '2026-02-16T18:02:00Z',
      headBranch: 'feature/b',
      conclusion: 'success',
    },
  ];

  const summary = buildSummary(runs, '2026-02-16T17:59:00Z');

  assert.equal(summary.totalRuns, 3);
  assert.equal(summary.nonManualRunCount, 2);
  assert.equal(summary.allowlistedNonManualRunCount, 1);
  assert.equal(summary.unexpectedRunCount, 1);
  assert.equal(summary.allowlistedNonManualRuns[0].databaseId, 2);
  assert.equal(summary.unexpectedRuns[0].databaseId, 3);
});

test('isAllowlistedNonManualRun returns false for non-matching workflow', () => {
  const run = {
    event: 'pull_request',
    workflowName: 'Random Workflow',
  };

  assert.equal(isAllowlistedNonManualRun(run), false);
});
