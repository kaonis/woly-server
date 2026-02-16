const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getWorkflowPolicy,
  validateWorkflow,
} = require('../manual-ci-workflow-policy-check.cjs');

function writeWorkflow(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

test('getWorkflowPolicy returns contract-gate exception for cnc workflow file', () => {
  const policy = getWorkflowPolicy('/tmp/cnc-mobile-contract-gate.yml');
  assert.equal(policy.requireWorkflowDispatch, false);
  assert.deepEqual(policy.requiredTriggers, ['pull_request']);
});

test('validateWorkflow accepts path-scoped pull_request contract gate workflow', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  const filePath = writeWorkflow(
    tempDir,
    'cnc-mobile-contract-gate.yml',
    [
      'name: CNC Mobile Contract Gate',
      '',
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'apps/cnc/src/routes/**'",
      '',
      'jobs:',
      '  contract-gate:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 8',
      '    steps:',
      '      - run: echo ok',
      '',
    ].join('\n')
  );

  const result = validateWorkflow(filePath);
  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
});

test('validateWorkflow rejects pull_request trigger for default workflow policy', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  const filePath = writeWorkflow(
    tempDir,
    'ci.yml',
    [
      'name: CI',
      '',
      'on:',
      '  workflow_dispatch:',
      '  pull_request:',
      '',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 8',
      '    steps:',
      '      - run: echo ok',
      '',
    ].join('\n')
  );

  const result = validateWorkflow(filePath);
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /forbidden trigger present: `pull_request`/);
});
