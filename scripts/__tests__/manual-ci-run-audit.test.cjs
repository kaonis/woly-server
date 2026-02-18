const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ALLOWLISTED_NON_MANUAL_RUNS,
  buildSummary,
  isAllowlistedNonManualRun,
} = require('../manual-ci-run-audit.cjs');

test('allowlist includes approved minimal automation exceptions', () => {
  assert.equal(ALLOWLISTED_NON_MANUAL_RUNS.length, 2);
  assert.deepEqual(
    ALLOWLISTED_NON_MANUAL_RUNS.map((rule) => ({
      event: rule.event,
      workflowName: rule.workflowName,
    })),
    [
      {
        event: 'pull_request',
        workflowName: 'CNC Sync Policy',
      },
      {
        event: 'schedule',
        workflowName: 'Dependency Health',
      },
    ]
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
      workflowName: 'CNC Sync Policy',
      createdAt: '2026-02-16T18:01:00Z',
      headBranch: 'feature/a',
      conclusion: 'success',
    },
    {
      databaseId: 3,
      event: 'schedule',
      workflowName: 'Dependency Health',
      createdAt: '2026-02-16T18:01:30Z',
      headBranch: 'master',
      conclusion: 'success',
    },
    {
      databaseId: 4,
      event: 'pull_request',
      workflowName: 'Other Workflow',
      createdAt: '2026-02-16T18:02:00Z',
      headBranch: 'feature/b',
      conclusion: 'success',
    },
  ];

  const summary = buildSummary(runs, '2026-02-16T17:59:00Z');

  assert.equal(summary.totalRuns, 4);
  assert.equal(summary.nonManualRunCount, 3);
  assert.equal(summary.allowlistedNonManualRunCount, 2);
  assert.equal(summary.unexpectedRunCount, 1);
  assert.equal(summary.allowlistedNonManualRuns[0].databaseId, 2);
  assert.equal(summary.allowlistedNonManualRuns[1].databaseId, 3);
  assert.equal(summary.unexpectedRuns[0].databaseId, 4);
});

test('isAllowlistedNonManualRun returns false for non-matching workflow', () => {
  const run = {
    event: 'pull_request',
    workflowName: 'Random Workflow',
  };

  assert.equal(isAllowlistedNonManualRun(run), false);
});
