import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
  },
  cache: {
    macVendorTTL: parseInt(process.env.MAC_VENDOR_TTL || '86400000', 10), // 24 hours
    macVendorRateLimit: parseInt(process.env.MAC_VENDOR_RATE_LIMIT || '1000', 10), // 1 second
  },
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
