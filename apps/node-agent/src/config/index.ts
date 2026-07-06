import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({
  quiet: process.env.NODE_ENV === 'test' || process.env.DOTENV_CONFIG_QUIET === 'true',
});

const parsedCorsOrigins = process.env.CORS_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const defaultCorsOrigins = process.env.NODE_ENV === 'production' ? [] : ['*'];

function parseIntegerEnv(key: string, defaultValue: number): number {
  const rawValue = process.env[key];
  if (rawValue === undefined || rawValue.trim() === '') {
    return defaultValue;
  }

  if (!/^-?\d+$/.test(rawValue.trim())) {
    throw new Error(`${key} must be an integer`);
  }

  return Number.parseInt(rawValue, 10);
}

function parsePositiveIntegerEnv(key: string, defaultValue: number): number {
  const value = parseIntegerEnv(key, defaultValue);
  if (value <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return value;
}

function parseNonNegativeIntegerEnv(key: string, defaultValue: number): number {
  const value = parseIntegerEnv(key, defaultValue);
  if (value < 0) {
    throw new Error(`${key} must be greater than or equal to 0`);
  }

  return value;
}

function parsePortEnv(key: string, defaultValue: number): number {
  const value = parsePositiveIntegerEnv(key, defaultValue);
  if (value > 65535) {
    throw new Error(`${key} must be less than or equal to 65535`);
  }

  return value;
}

export const config = {
  server: {
    port: parsePortEnv('PORT', 8082),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    path: process.env.DB_PATH || './db/woly.db',
  },
  network: {
    scanInterval: parsePositiveIntegerEnv('SCAN_INTERVAL', 300000), // 5 minutes
    scanDelay: parseNonNegativeIntegerEnv('SCAN_DELAY', 5000), // 5 seconds
    pingTimeout: parsePositiveIntegerEnv('PING_TIMEOUT', 2000), // 2 seconds
    pingConcurrency: parsePositiveIntegerEnv('PING_CONCURRENCY', 10), // 10 concurrent pings
    // Use ping validation: if true, ping each discovered host to verify it's awake
    // If false (default), ARP discovery alone indicates host is awake
    usePingValidation: process.env.USE_PING_VALIDATION === 'true',
  },
  cache: {
    macVendorTTL: parsePositiveIntegerEnv('MAC_VENDOR_TTL', 86400000), // 24 hours
    macVendorRateLimit: parsePositiveIntegerEnv('MAC_VENDOR_RATE_LIMIT', 1000), // 1 second
  },
  cors: {
    origins: parsedCorsOrigins && parsedCorsOrigins.length > 0
      ? parsedCorsOrigins
      : defaultCorsOrigins,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  auth: {
    apiKey: process.env.NODE_API_KEY,
  },
  wakeVerification: {
    enabled: process.env.WAKE_VERIFY_ENABLED === 'true',
    timeoutMs: parsePositiveIntegerEnv('WAKE_VERIFY_TIMEOUT_MS', 10000),
    pollIntervalMs: parsePositiveIntegerEnv('WAKE_VERIFY_POLL_INTERVAL_MS', 1000),
  },
  /** Wake verification settings used when a CNC-routed wake command includes verify options. */
  wakeVerificationCnc: {
    timeoutMs: parsePositiveIntegerEnv('WAKE_VERIFY_CNC_TIMEOUT_MS', 120000), // 2 minutes
    pollIntervalMs: parsePositiveIntegerEnv('WAKE_VERIFY_CNC_POLL_INTERVAL_MS', 3000), // 3 seconds
  },
};
