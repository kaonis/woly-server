const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { validateWorkflow } = require('../manual-ci-workflow-policy-check.cjs');

function writeWorkflow(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

test('validateWorkflow accepts pull_request trigger for cnc-sync-policy workflow', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  const filePath = writeWorkflow(
    tempDir,
    'cnc-sync-policy.yml',
    [
      'name: CNC Sync Policy',
      '',
      'on:',
      '  workflow_dispatch:',
      '  pull_request:',
      '',
      'jobs:',
      '  policy-check:',
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

test('validateWorkflow accepts schedule trigger for dependency-health workflow', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  const filePath = writeWorkflow(
    tempDir,
    'dependency-health.yml',
    [
      'name: Dependency Health',
      '',
      'on:',
      '  workflow_dispatch:',
      '  schedule:',
      '    - cron: "17 9 * * 1"',
      '',
      'jobs:',
      '  checks:',
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

test('validateWorkflow rejects schedule trigger for default workflow policy', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  const filePath = writeWorkflow(
    tempDir,
    'publish.yml',
    [
      'name: Publish',
      '',
      'on:',
      '  workflow_dispatch:',
      '  schedule:',
      '    - cron: "0 12 * * 1"',
      '',
      'jobs:',
      '  publish:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 8',
      '    steps:',
      '      - run: echo ok',
      '',
    ].join('\n')
  );

  const result = validateWorkflow(filePath);
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /forbidden trigger present: `schedule`/);
});
