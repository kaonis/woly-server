#!/usr/bin/env node

const net = require('net');

const major = Number(process.versions.node.split('.')[0]);
if (major < 24) {
  console.error(`[preflight] Node.js ${process.version} detected. Node.js v24+ is required.`);
  process.exit(1);
}

const server = net.createServer();
server.once('error', (error) => {
  console.error(`[preflight] Local socket bind failed (${error.code || 'UNKNOWN'}).`);
  console.error('[preflight] Test suites using supertest need loopback bind permission in this environment.');
  process.exit(1);
});

server.listen(0, '127.0.0.1', () => {
  server.close(() => {
    try {
      const { ensureProtocolBuild } = require('../../../scripts/ensure-protocol-build.cjs');
      ensureProtocolBuild();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error('[preflight] Protocol preflight failed.');
      console.error(`[preflight] ${message}`);
      process.exit(1);
    }

    try {
      require('better-sqlite3');
      process.stdout.write('[preflight] Runtime checks passed.\n');
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error('[preflight] better-sqlite3 failed to load.');
      console.error(`[preflight] ${message}`);
      console.error(`[preflight] node execPath: ${process.execPath}`);
      console.error(`[preflight] node modules ABI: ${process.versions.modules}`);
      console.error('[preflight] Run: npm rebuild better-sqlite3 --build-from-source');
      process.exit(1);
    }
  });
});
