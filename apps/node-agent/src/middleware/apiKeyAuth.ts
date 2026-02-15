import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

/**
 * API Key Authentication Middleware
 * 
 * Validates the Authorization header against the configured NODE_API_KEY.
 * Only enforced when NODE_API_KEY environment variable is set.
 * 
 * Expected header format: Authorization: Bearer <api-key>
 */
export const apiKeyAuth = (req: Request, _res: Response, next: NextFunction) => {
  // If no API key is configured, skip authentication
  if (!config.auth.apiKey) {
    return next();
  }

  const authHeader = req.headers.authorization;

  // Check if Authorization header is present
  if (!authHeader) {
    logger.warn('API authentication failed: Missing Authorization header', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    throw new AppError(
      'Missing Authorization header',
      401,
      'UNAUTHORIZED'
    );
  }

  // Validate Bearer token format
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('API authentication failed: Invalid Authorization header format', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    throw new AppError(
      'Invalid Authorization header format. Expected: Bearer <api-key>',
      401,
      'UNAUTHORIZED'
    );
  }

  const providedKey = parts[1];

  // Validate API key using constant-time comparison to prevent timing attacks
  try {
    const expectedKeyBuffer = Buffer.from(config.auth.apiKey, 'utf8');
    const providedKeyBuffer = Buffer.from(providedKey, 'utf8');
    
    // Ensure both buffers are the same length before comparison
    if (expectedKeyBuffer.length !== providedKeyBuffer.length) {
      throw new Error('Invalid key length');
    }
    
    const isValid = crypto.timingSafeEqual(expectedKeyBuffer, providedKeyBuffer);
    
    if (!isValid) {
      throw new Error('Invalid API key');
    }
  } catch (_error) {
    logger.warn('API authentication failed: Invalid API key', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    throw new AppError(
      'Invalid API key',
      401,
      'UNAUTHORIZED'
    );
  }

  // Authentication successful
  logger.debug('API authentication successful', {
    path: req.path,
    method: req.method,
  });
  next();
};
