import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { agentConfig } from '../config/agent';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

/**
 * Auth middleware for tunnel command dispatch from C&C.
 * Uses NODE_AUTH_TOKEN and constant-time comparison.
 */
export function agentCommandAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!agentConfig.authToken) {
    throw new AppError(
      'Agent command tunnel authentication is not configured',
      503,
      'SERVICE_UNAVAILABLE',
    );
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    logger.warn('Agent tunnel auth failed: missing Authorization header', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    throw new AppError('Missing Authorization header', 401, 'UNAUTHORIZED');
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Agent tunnel auth failed: invalid Authorization header format', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    throw new AppError(
      'Invalid Authorization header format. Expected: Bearer <token>',
      401,
      'UNAUTHORIZED',
    );
  }

  const providedToken = parts[1];

  try {
    const expectedBuffer = Buffer.from(agentConfig.authToken, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length) {
      throw new Error('Token length mismatch');
    }

    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new Error('Token mismatch');
    }
  } catch {
    logger.warn('Agent tunnel auth failed: invalid token', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    throw new AppError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  next();
}
