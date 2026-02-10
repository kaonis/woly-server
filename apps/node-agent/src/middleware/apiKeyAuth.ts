import { Request, Response, NextFunction } from 'express';
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
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
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
  const parts = authHeader.split(' ');
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

  // Validate API key
  if (providedKey !== config.auth.apiKey) {
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
