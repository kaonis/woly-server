import { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler, notFoundHandler } from '../errorHandler';
import { config } from '../../config';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  config: {
    server: {
      env: 'test',
    },
  },
}));

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('AppError class', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should create AppError with custom values', () => {
      const error = new AppError('Validation failed', 400, 'VALIDATION_ERROR', false);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.isOperational).toBe(false);
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError with custom status code', () => {
      const error = new AppError('Bad request', 400, 'BAD_REQUEST');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'BAD_REQUEST',
          message: 'Bad request',
          statusCode: 400,
          timestamp: expect.any(String),
          path: '/test',
        },
      });
      expect(logger.error).toHaveBeenCalledWith('Error occurred', expect.any(Object));
    });

    it('should handle generic Error as 500', () => {
      const error = new Error('Database connection failed');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed',
          statusCode: 500,
          timestamp: expect.any(String),
          path: '/test',
        },
      });
    });

    it('should include stack trace in development mode', () => {
      (config as any).server.env = 'development';
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: 'Error stack trace',
        })
      );

      // Reset to test
      (config as any).server.env = 'test';
    });

    it('should not include stack trace in production', () => {
      (config as any).server.env = 'production';
      const error = new Error('Test error');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const jsonCall = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall).not.toHaveProperty('stack');

      // Reset to test
      (config as any).server.env = 'test';
    });

    it('should log error with context information', () => {
      const error = new AppError('Test error', 500, 'TEST_ERROR');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error occurred', {
        statusCode: 500,
        errorCode: 'TEST_ERROR',
        message: 'Test error',
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        stack: undefined,
      });
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 for non-existent routes', () => {
      mockReq.method = 'POST';
      mockReq.path = '/api/nonexistent';

      notFoundHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          statusCode: 404,
          timestamp: expect.any(String),
          path: '/api/nonexistent',
        },
      });
    });

    it('should log warning for not found routes', () => {
      mockReq.method = 'DELETE';
      mockReq.path = '/api/unknown';

      notFoundHandler(mockReq as Request, mockRes as Response);

      expect(logger.warn).toHaveBeenCalledWith('Route not found: DELETE /api/unknown');
    });
  });
});
