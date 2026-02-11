import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

const isDevelopment = process.env.NODE_ENV !== 'production';

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
    if (
      isDevelopment &&
      (req.path === '/' || req.path === '/health' || req.path === '/api/health')
    ) {
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 300, // Much higher limit in development
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check endpoints in development
    if (
      isDevelopment &&
      (req.path === '/' || req.path === '/health' || req.path === '/api/health')
    ) {
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
