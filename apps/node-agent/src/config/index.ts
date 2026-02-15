import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const parsedCorsOrigins = process.env.CORS_ORIGINS
  ?.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const defaultCorsOrigins = process.env.NODE_ENV === 'production' ? [] : ['*'];

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8082', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    path: process.env.DB_PATH || './db/woly.db',
  },
  network: {
    scanInterval: parseInt(process.env.SCAN_INTERVAL || '300000', 10), // 5 minutes
    scanDelay: parseInt(process.env.SCAN_DELAY || '5000', 10), // 5 seconds
    pingTimeout: parseInt(process.env.PING_TIMEOUT || '2000', 10), // 2 seconds
    pingConcurrency: parseInt(process.env.PING_CONCURRENCY || '10', 10), // 10 concurrent pings
    // Use ping validation: if true, ping each discovered host to verify it's awake
    // If false (default), ARP discovery alone indicates host is awake
    usePingValidation: process.env.USE_PING_VALIDATION === 'true',
  },
  cache: {
    macVendorTTL: parseInt(process.env.MAC_VENDOR_TTL || '86400000', 10), // 24 hours
    macVendorRateLimit: parseInt(process.env.MAC_VENDOR_RATE_LIMIT || '1000', 10), // 1 second
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
    timeoutMs: parseInt(process.env.WAKE_VERIFY_TIMEOUT_MS || '10000', 10),
    pollIntervalMs: parseInt(process.env.WAKE_VERIFY_POLL_INTERVAL_MS || '1000', 10),
  },
};
