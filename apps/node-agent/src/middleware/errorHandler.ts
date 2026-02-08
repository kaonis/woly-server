import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public isOperational = true
  ) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';

  // Log error with context
  logger.error('Error occurred', {
    statusCode,
    errorCode,
    message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: config.server.env === 'development' ? err.stack : undefined,
  });

  // Send standardized error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
    ...(config.server.env === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
};
