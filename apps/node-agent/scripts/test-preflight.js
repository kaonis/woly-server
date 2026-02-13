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
    process.stdout.write('[preflight] Runtime checks passed.\n');
  });
});
