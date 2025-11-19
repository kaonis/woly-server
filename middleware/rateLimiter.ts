import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

/**
 * General API rate limiter
 * Allows 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes',
    });
  },
});

/**
 * Network scan rate limiter
 * More restrictive - allows only 5 scan requests per minute per IP
 * to prevent abuse of the resource-intensive network scanning operation
 */
export const scanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    error: 'Too many scan requests. Network scanning is resource-intensive.',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Scan rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many scan requests. Network scanning is resource-intensive.',
      retryAfter: '1 minute',
      hint: 'Use GET /hosts to retrieve cached results instead',
    });
  },
  // Skip rate limiting for successful GET requests (reading cached data)
  skip: (req) => req.method === 'GET',
});

/**
 * Wake-on-LAN rate limiter
 * Moderate restriction - allows 20 wake requests per minute per IP
 */
export const wakeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    error: 'Too many wake requests. Please wait before trying again.',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Wake rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many wake requests. Please wait before trying again.',
      retryAfter: '1 minute',
    });
  },
});
