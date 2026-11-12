const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SELF_HOSTED_RUNS_ON, validateWorkflow } = require('../manual-ci-workflow-policy-check.cjs');

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
    'eslint10-compat-watchdog.yml',
    [
      'name: Watchdog',
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

function selfHostedWorkflow(runsOn, timeout, { triggers = ['push', 'pull_request'], jobs = ['validate'] } = {}) {
  const lines = ['name: CI', '', 'on:', '  workflow_dispatch:'];
  for (const trigger of triggers) {
    lines.push(`  ${trigger}:`);
  }
  lines.push('', 'jobs:');
  for (const job of jobs) {
    lines.push(
      `  ${job}:`,
      `    runs-on: ${typeof runsOn === 'function' ? runsOn(job) : runsOn}`,
      `    timeout-minutes: ${timeout}`,
      '    steps:',
      '      - run: echo ok'
    );
  }
  lines.push('');
  return lines.join('\n');
}

function check(name, source) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woly-policy-'));
  return validateWorkflow(writeWorkflow(tempDir, name, source));
}

test('validateWorkflow accepts push and pull_request on self-hosted ci workflow with fork guard', () => {
  const result = check('ci.yml', selfHostedWorkflow(SELF_HOSTED_RUNS_ON, 15));
  assert.deepEqual(result.violations, []);
  assert.equal(result.passed, true);
});

test('validateWorkflow rejects self-hosted workflow job without fork guard', () => {
  const result = check('ci.yml', selfHostedWorkflow("${{ vars.CI_RUNNER || 'ubuntu-latest' }}", 15));
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /must route fork PRs to a GitHub-hosted runner/);
});

test('validateWorkflow rejects a reordered guard that checks CI_RUNNER first', () => {
  const reordered =
    "${{ vars.CI_RUNNER || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'ubuntu-latest') || 'ubuntu-latest' }}";
  const result = check('ci.yml', selfHostedWorkflow(reordered, 15));
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /must route fork PRs/);
});

test('validateWorkflow rejects the fail-open head.repo.fork guard', () => {
  const failOpen =
    "${{ (github.event.pull_request.head.repo.fork && 'ubuntu-latest') || vars.CI_RUNNER || 'ubuntu-latest' }}";
  const result = check('ci.yml', selfHostedWorkflow(failOpen, 15));
  assert.equal(result.passed, false);
});

test('validateWorkflow checks every job of a self-hosted workflow', () => {
  const result = check(
    'ci.yml',
    selfHostedWorkflow((job) => (job === 'second' ? 'woly-ci-mini' : SELF_HOSTED_RUNS_ON), 15, {
      jobs: ['first', 'second'],
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /job `second`/);
  assert.doesNotMatch(result.violations.join('\n'), /job `first`/);
});

test('validateWorkflow rejects automatic triggers on the manual self-hosted smoke workflow', () => {
  const result = check(
    'cross-service-e2e-smoke.yml',
    selfHostedWorkflow(SELF_HOSTED_RUNS_ON, 15, { triggers: ['push'] })
  );
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /forbidden trigger present: `push`/);
});

test('validateWorkflow fails closed on a multi-line runs-on in a self-hosted workflow', () => {
  const source = selfHostedWorkflow(SELF_HOSTED_RUNS_ON, 15).replace(
    `    runs-on: ${SELF_HOSTED_RUNS_ON}`,
    `    runs-on: >-\n      ${SELF_HOSTED_RUNS_ON}`
  );
  const result = check('ci.yml', source);
  assert.equal(result.passed, false);
});

test('validateWorkflow rejects self-hosted workflow timeout above 15 minutes', () => {
  const result = check('ci.yml', selfHostedWorkflow(SELF_HOSTED_RUNS_ON, 20));
  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /timeout `20` exceeds limit `15`/);
});
