#!/usr/bin/env node

const major = Number(process.versions.node.split('.')[0]);
if (major < 24) {
  console.error(`[preflight] Node.js ${process.version} detected. Node.js v24+ is required.`);
  process.exit(1);
}

try {
  require('better-sqlite3');
  process.stdout.write('[preflight] Runtime checks passed.\n');
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  console.error('[preflight] better-sqlite3 failed to load.');
  console.error(`[preflight] ${message}`);
  console.error('[preflight] Run: npm rebuild better-sqlite3 --build-from-source');
  process.exit(1);
}
