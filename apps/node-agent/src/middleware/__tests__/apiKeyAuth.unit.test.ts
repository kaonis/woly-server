import { Request, Response, NextFunction } from 'express';
import { apiKeyAuth } from '../apiKeyAuth';
import { config } from '../../config';
import { AppError } from '../errorHandler';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  config: {
    auth: {
      apiKey: undefined,
    },
  },
}));

describe('apiKeyAuth middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      path: '/hosts',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('when NODE_API_KEY is not configured', () => {
    beforeEach(() => {
      (config as any).auth.apiKey = undefined;
    });

    it('should allow request without authorization header', () => {
      apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should allow request with authorization header', () => {
      mockReq.headers = {
        authorization: 'Bearer some-key',
      };

      apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when NODE_API_KEY is configured', () => {
    const validApiKey = 'test-api-key-12345';

    beforeEach(() => {
      (config as any).auth.apiKey = validApiKey;
    });

    it('should reject request without authorization header', () => {
      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'API authentication failed: Missing Authorization header',
        expect.objectContaining({
          path: '/hosts',
          method: 'GET',
          ip: '127.0.0.1',
        })
      );
    });

    it('should reject request with invalid header format (no Bearer prefix)', () => {
      mockReq.headers = {
        authorization: 'test-api-key-12345',
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'API authentication failed: Invalid Authorization header format',
        expect.any(Object)
      );
    });

    it('should reject request with invalid header format (wrong prefix)', () => {
      mockReq.headers = {
        authorization: 'Basic test-api-key-12345',
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with incorrect API key', () => {
      mockReq.headers = {
        authorization: 'Bearer wrong-api-key',
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'API authentication failed: Invalid API key',
        expect.any(Object)
      );
    });

    it('should accept request with correct API key', () => {
      mockReq.headers = {
        authorization: `Bearer ${validApiKey}`,
      };

      apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'API authentication successful',
        expect.objectContaining({
          path: '/hosts',
          method: 'GET',
        })
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should throw AppError with correct properties for missing header', () => {
      try {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (error instanceof AppError) {
          expect(error.message).toBe('Missing Authorization header');
          expect(error.statusCode).toBe(401);
          expect(error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should throw AppError with correct properties for invalid format', () => {
      mockReq.headers = {
        authorization: 'InvalidFormat',
      };

      try {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (error instanceof AppError) {
          expect(error.message).toBe(
            'Invalid Authorization header format. Expected: Bearer <api-key>'
          );
          expect(error.statusCode).toBe(401);
          expect(error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should throw AppError with correct properties for invalid key', () => {
      mockReq.headers = {
        authorization: 'Bearer wrong-key',
      };

      try {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (error instanceof AppError) {
          expect(error.message).toBe('Invalid API key');
          expect(error.statusCode).toBe(401);
          expect(error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should handle empty Bearer token', () => {
      mockReq.headers = {
        authorization: 'Bearer ',
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle extra spaces in header', () => {
      mockReq.headers = {
        authorization: `Bearer  ${validApiKey}`,
      };

      // Should now succeed with flexible whitespace parsing
      apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should be case-sensitive for Bearer prefix', () => {
      mockReq.headers = {
        authorization: `bearer ${validApiKey}`,
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);
    });

    it('should be case-sensitive for API key', () => {
      mockReq.headers = {
        authorization: `Bearer ${validApiKey.toUpperCase()}`,
      };

      expect(() => {
        apiKeyAuth(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow(AppError);
    });
  });
});
