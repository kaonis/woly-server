import type { CncRateLimits } from '@kaonis/woly-protocol';
import {
  API_RATE_LIMIT_MAX,
  API_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  LEGACY_AUTH_RATE_LIMIT_MAX,
  LEGACY_AUTH_RATE_LIMIT_WINDOW_MS,
  SCHEDULE_RATE_LIMIT_MAX,
  SCHEDULE_RATE_LIMIT_WINDOW_MS,
} from '../middleware/rateLimiter';
import {
  MAC_VENDOR_RATE_LIMIT_MAX_CALLS,
  MAC_VENDOR_RATE_LIMIT_MS,
} from './macVendorService';

const DEFAULT_WS_MESSAGE_RATE_LIMIT_PER_SECOND = 100;
const DEFAULT_WS_MAX_CONNECTIONS_PER_IP = 10;

function parsePositiveIntFromEnv(key: string, fallback: number): number {
  const rawValue = process.env[key];
  if (!rawValue || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function buildCncRateLimits(): CncRateLimits {
  return {
    strictAuth: {
      maxCalls: AUTH_RATE_LIMIT_MAX,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
      appliesTo: ['/api/auth/token'],
    },
    auth: {
      maxCalls: LEGACY_AUTH_RATE_LIMIT_MAX,
      windowMs: LEGACY_AUTH_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
      note: 'Defined in middleware for legacy auth route patterns; strictAuth is currently applied to /api/auth/token.',
    },
    api: {
      maxCalls: API_RATE_LIMIT_MAX,
      windowMs: API_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
      appliesTo: ['/api/capabilities', '/api/nodes/*', '/api/hosts/*', '/api/admin/*'],
    },
    scheduleSync: {
      maxCalls: SCHEDULE_RATE_LIMIT_MAX,
      windowMs: SCHEDULE_RATE_LIMIT_WINDOW_MS,
      scope: 'ip',
      appliesTo: ['/api/hosts/:fqn/schedules', '/api/hosts/schedules/:id'],
    },
    wsInboundMessages: {
      maxCalls: parsePositiveIntFromEnv(
        'WS_MESSAGE_RATE_LIMIT_PER_SECOND',
        DEFAULT_WS_MESSAGE_RATE_LIMIT_PER_SECOND,
      ),
      windowMs: 1000,
      scope: 'connection',
      appliesTo: ['/ws/node'],
    },
    wsConnectionsPerIp: {
      maxCalls: parsePositiveIntFromEnv('WS_MAX_CONNECTIONS_PER_IP', DEFAULT_WS_MAX_CONNECTIONS_PER_IP),
      windowMs: null,
      scope: 'ip',
      appliesTo: ['/ws/node'],
      note: 'Concurrent connection cap per source IP.',
    },
    macVendorLookup: {
      maxCalls: MAC_VENDOR_RATE_LIMIT_MAX_CALLS,
      windowMs: MAC_VENDOR_RATE_LIMIT_MS,
      scope: 'global',
      appliesTo: ['/api/hosts/mac-vendor/:mac'],
      note: 'Serialized outbound provider requests to avoid macvendors.com free-tier throttling.',
    },
  };
}
