const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs, parseMajor, buildSummary } = require('../dev-doctor.cjs');

test('parseArgs supports --json and --help', () => {
  const options = parseArgs(['--json', '--help']);
  assert.equal(options.json, true);
  assert.equal(options.help, true);
});

test('parseArgs rejects unknown argument', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
});

test('parseMajor parses version prefixes', () => {
  assert.equal(parseMajor('v24.3.1'), 24);
  assert.equal(parseMajor('10.2.0'), 10);
  assert.equal(parseMajor('invalid'), null);
});

test('buildSummary counts pass/warn/fail correctly', () => {
  const summary = buildSummary([
    { level: 'pass', message: 'ok' },
    { level: 'warn', message: 'warn' },
    { level: 'fail', message: 'fail' },
  ]);

  assert.equal(summary.counts.pass, 1);
  assert.equal(summary.counts.warn, 1);
  assert.equal(summary.counts.fail, 1);
  assert.ok(Array.isArray(summary.results));
  assert.match(summary.checkedAt, /Z$/);
});
