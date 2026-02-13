/**
 * Error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const errorMessage = err instanceof Error ? err.message : 'Unknown error';
  const errorStack = err instanceof Error ? err.stack : undefined;
  
  logger.error('Unhandled error', {
    error: errorMessage,
    stack: errorStack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}

export default errorHandler;
