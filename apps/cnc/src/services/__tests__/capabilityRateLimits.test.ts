import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  LEGACY_AUTH_RATE_LIMIT_MAX,
  LEGACY_AUTH_RATE_LIMIT_WINDOW_MS,
  SCHEDULE_RATE_LIMIT_MAX,
  SCHEDULE_RATE_LIMIT_WINDOW_MS,
} from '../../middleware/rateLimiter';
import {
  MAC_VENDOR_RATE_LIMIT_MAX_CALLS,
  MAC_VENDOR_RATE_LIMIT_MS,
} from '../macVendorService';
import { buildCncRateLimits } from '../capabilityRateLimits';

describe('buildCncRateLimits', () => {
  const originalWsMessageLimit = process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND;
  const originalWsConnectionLimit = process.env.WS_MAX_CONNECTIONS_PER_IP;

  beforeEach(() => {
    delete process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND;
    delete process.env.WS_MAX_CONNECTIONS_PER_IP;
  });

  afterAll(() => {
    if (originalWsMessageLimit === undefined) {
      delete process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND;
    } else {
      process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND = originalWsMessageLimit;
    }

    if (originalWsConnectionLimit === undefined) {
      delete process.env.WS_MAX_CONNECTIONS_PER_IP;
    } else {
      process.env.WS_MAX_CONNECTIONS_PER_IP = originalWsConnectionLimit;
    }
  });

  it('builds rate-limit descriptors for all CNC limiters', () => {
    const limits = buildCncRateLimits();

    expect(limits.strictAuth).toMatchObject({
      maxCalls: AUTH_RATE_LIMIT_MAX,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
    });
    expect(limits.auth).toMatchObject({
      maxCalls: LEGACY_AUTH_RATE_LIMIT_MAX,
      windowMs: LEGACY_AUTH_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
    });
    expect(limits.api).toMatchObject({
      maxCalls: API_RATE_LIMIT_MAX,
      windowMs: API_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
    });
    expect(limits.scheduleSync).toMatchObject({
      maxCalls: SCHEDULE_RATE_LIMIT_MAX,
      windowMs: SCHEDULE_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
    });
    expect(limits.wsInboundMessages).toMatchObject({
      maxCalls: 100,
      windowMs: 1000,
      scope: 'connection',
    });
    expect(limits.wsConnectionsPerIp).toMatchObject({
      maxCalls: 10,
      windowMs: null,
      scope: 'ip',
    });
    expect(limits.macVendorLookup).toMatchObject({
      maxCalls: MAC_VENDOR_RATE_LIMIT_MAX_CALLS,
      windowMs: MAC_VENDOR_RATE_LIMIT_MS,
      scope: 'global',
    });
  });

  it('uses explicit WS env values when provided', () => {
    process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND = '250';
    process.env.WS_MAX_CONNECTIONS_PER_IP = '42';

    const limits = buildCncRateLimits();

    expect(limits.wsInboundMessages.maxCalls).toBe(250);
    expect(limits.wsConnectionsPerIp.maxCalls).toBe(42);
  });

  it('falls back to defaults when WS env values are invalid', () => {
    process.env.WS_MESSAGE_RATE_LIMIT_PER_SECOND = '-1';
    process.env.WS_MAX_CONNECTIONS_PER_IP = 'not-a-number';

    const limits = buildCncRateLimits();

    expect(limits.wsInboundMessages.maxCalls).toBe(100);
    expect(limits.wsConnectionsPerIp.maxCalls).toBe(10);
  });
});
