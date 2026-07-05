const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs, evaluateProtection } = require('../branch-protection-check.cjs');

test('parseArgs defaults to master branch', () => {
  const options = parseArgs([]);
  assert.equal(options.branch, 'master');
  assert.equal(options.json, false);
});

test('parseArgs accepts branch and json flags', () => {
  const options = parseArgs(['--branch', 'release', '--json']);
  assert.equal(options.branch, 'release');
  assert.equal(options.json, true);
});

test('parseArgs rejects unknown argument', () => {
  assert.throws(() => parseArgs(['--oops']), /Unknown argument/);
});

test('evaluateProtection passes when policy-check context exists', () => {
  const result = evaluateProtection({
    required_status_checks: {
      strict: true,
      contexts: ['CNC Sync Policy / policy-check'],
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
});

test('evaluateProtection fails when policy-check context is missing', () => {
  const result = evaluateProtection({
    required_status_checks: {
      strict: false,
      contexts: ['Build, Lint, Typecheck, Test, Smoke / validate'],
    },
  });

  assert.equal(result.passed, false);
  assert.match(result.violations.join('\n'), /policy-check/);
});
