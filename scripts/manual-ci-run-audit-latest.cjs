#!/usr/bin/env node
'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const REVIEW_LOG_PATH = resolve(__dirname, '..', 'docs', 'CI_MANUAL_REVIEW_LOG.md');
const AUDIT_SCRIPT_PATH = resolve(__dirname, 'manual-ci-run-audit.cjs');
const SINCE_ARG_PATTERN = /^--since$/;
const SINCE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function hasSinceArg(argv) {
  return argv.some((arg) => SINCE_ARG_PATTERN.test(arg));
}

function findLatestSinceCheckpoint(markdown) {
  const regex = /ci:audit:manual\s+--since\s+([^\s`]+)/g;
  let match;
  let latest = null;

  while ((match = regex.exec(markdown)) !== null) {
    const candidate = match[1];
    if (!candidate || !SINCE_VALUE_PATTERN.test(candidate)) {
      continue;
    }

    latest = candidate;
  }

  if (!latest) {
    throw new Error(
      `No valid ci:audit:manual --since checkpoint found in ${REVIEW_LOG_PATH}`
    );
  }

  return latest;
}

function main() {
  const passthroughArgs = process.argv.slice(2);
  const userProvidedSince = hasSinceArg(passthroughArgs);

  let args = passthroughArgs;
  if (!userProvidedSince) {
    const reviewLog = readFileSync(REVIEW_LOG_PATH, 'utf8');
    const latestSince = findLatestSinceCheckpoint(reviewLog);
    args = ['--since', latestSince, ...passthroughArgs];
    process.stderr.write(
      `[ci:audit:latest] Using latest checkpoint --since ${latestSince}\n`
    );
  }

  const result = spawnSync(process.execPath, [AUDIT_SCRIPT_PATH, ...args], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `manual-ci-run-audit-latest failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  findLatestSinceCheckpoint,
  hasSinceArg,
};
