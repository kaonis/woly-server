import { readFileSync } from 'fs';
import { join } from 'path';
import {
  clearImmediate as nodeClearImmediate,
  clearInterval as nodeClearInterval,
  clearTimeout as nodeClearTimeout,
  setImmediate as nodeSetImmediate,
  setInterval as nodeSetInterval,
  setTimeout as nodeSetTimeout,
} from 'node:timers';
import db from '../database/connection';

const restoreTimerGlobals = (): void => {
  globalThis.setTimeout ??= nodeSetTimeout as typeof setTimeout;
  globalThis.clearTimeout ??= nodeClearTimeout as typeof clearTimeout;
  globalThis.setInterval ??= nodeSetInterval as typeof setInterval;
  globalThis.clearInterval ??= nodeClearInterval as typeof clearInterval;
  globalThis.setImmediate ??= nodeSetImmediate as typeof setImmediate;
  globalThis.clearImmediate ??= nodeClearImmediate as typeof clearImmediate;
};

beforeAll(async () => {
  restoreTimerGlobals();
  await db.connect();

  const schemaPath = join(__dirname, '../database/schema.sqlite.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  await db.query(schema);
});

afterEach(() => {
  jest.useRealTimers();
  restoreTimerGlobals();
});

afterAll(async () => {
  await db.close();
  restoreTimerGlobals();
});
