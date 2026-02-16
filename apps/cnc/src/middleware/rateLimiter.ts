import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { logger } from '../utils/logger';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Configurable auth rate limit parameters with validation
const parsePositiveInt = (
  value: string | undefined,
  defaultValue: number,
): number => {
  if (!value || value.trim() === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.warn(
      `Invalid rate limit config value "${value}", using default ${defaultValue}`,
    );
    return defaultValue;
  }
  return parsed;
};

const AUTH_RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  900000,
); // 15 minutes default
const AUTH_RATE_LIMIT_MAX = parsePositiveInt(
  process.env.AUTH_RATE_LIMIT_MAX,
  5,
); // 5 attempts default

const API_RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.API_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const API_RATE_LIMIT_MAX = parsePositiveInt(
  process.env.API_RATE_LIMIT_MAX,
  isDevelopment ? 10000 : 300,
);
const SCHEDULE_RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.SCHEDULE_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const SCHEDULE_RATE_LIMIT_MAX = parsePositiveInt(
  process.env.SCHEDULE_RATE_LIMIT_MAX,
  isDevelopment ? 20000 : 3000,
);

function isHealthEndpoint(path: string): boolean {
  return path === '/' || path === '/health' || path === '/api/health';
}

function isHostScheduleRoute(req: Request): boolean {
  const path = req.originalUrl || req.path || '';
  return /\/api\/hosts\/(?:[^/]+\/schedules|schedules\/[^/]+)\/?$/.test(path);
}

/**
 * Strict authentication endpoint rate limiter
 * Very strict limit to prevent brute-force attacks on token exchange
 * Default: 5 requests per 15 minutes per IP (configurable via env vars)
 */
export const strictAuthLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  limit: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(
      `Strict auth rate limit exceeded for IP: ${req.ip} on path: ${req.path}`,
    );
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later',
    });
  },
});

/**
 * Authentication endpoint rate limiter
 * Strict limit to prevent brute-force attacks on token exchange
 * Development: 100 requests per 15 minutes per IP
 * Production: 10 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 100 : 10, // Higher limit in development
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health check endpoints in development
    if (isDevelopment && isHealthEndpoint(req.path)) {
      return true;
    }
    return false;
  },
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * General API rate limiter
 * Moderate limit for general API access
 * Development: 10000 requests per 15 minutes per IP (effectively unlimited)
 * Production: 300 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Schedule sync can burst on startup; dedicated schedule limiter handles these routes.
    if (isHostScheduleRoute(req)) {
      return true;
    }

    // Skip rate limiting for health check endpoints in development.
    if (isDevelopment && isHealthEndpoint(req.path)) {
      return true;
    }

    return false;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

/**
 * Host schedule API limiter
 * Dedicated higher throughput for app schedule sync bursts.
 * Development: 20000 requests per 15 minutes per IP
 * Production: 3000 requests per 15 minutes per IP
 */
export const scheduleSyncLimiter = rateLimit({
  windowMs: SCHEDULE_RATE_LIMIT_WINDOW_MS,
  max: SCHEDULE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Schedule API rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many schedule sync requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});
