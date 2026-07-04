import {
  clearImmediate as nodeClearImmediate,
  clearInterval as nodeClearInterval,
  clearTimeout as nodeClearTimeout,
  setImmediate as nodeSetImmediate,
  setInterval as nodeSetInterval,
  setTimeout as nodeSetTimeout,
} from 'node:timers';

const restoreTimerGlobals = (): void => {
  globalThis.setTimeout ??= nodeSetTimeout as typeof setTimeout;
  globalThis.clearTimeout ??= nodeClearTimeout as typeof clearTimeout;
  globalThis.setInterval ??= nodeSetInterval as typeof setInterval;
  globalThis.clearInterval ??= nodeClearInterval as typeof clearInterval;
  globalThis.setImmediate ??= nodeSetImmediate as typeof setImmediate;
  globalThis.clearImmediate ??= nodeClearImmediate as typeof clearImmediate;
};

// Global test setup
beforeAll(() => {
  restoreTimerGlobals();
  // Suppress console logs during tests (optional - comment out if you need to debug)
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  restoreTimerGlobals();
});

afterAll(() => {
  jest.restoreAllMocks();
  restoreTimerGlobals();
});
