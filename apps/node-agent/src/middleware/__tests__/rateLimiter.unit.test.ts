import { Request, Response, NextFunction } from 'express';
import { apiLimiter, scanLimiter, wakeLimiter } from '../rateLimiter';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('rateLimiter middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      ip: '127.0.0.1',
      path: '/test',
      method: 'POST',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('apiLimiter', () => {
    it('should be defined', () => {
      expect(apiLimiter).toBeDefined();
      expect(typeof apiLimiter).toBe('function');
    });

    it('should be a middleware function', () => {
      // Rate limiters from express-rate-limit are middleware functions
      expect(apiLimiter.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('scanLimiter', () => {
    it('should be defined', () => {
      expect(scanLimiter).toBeDefined();
      expect(typeof scanLimiter).toBe('function');
    });

    it('should be a middleware function', () => {
      // Rate limiters from express-rate-limit are middleware functions
      expect(scanLimiter.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('wakeLimiter', () => {
    it('should be defined', () => {
      expect(wakeLimiter).toBeDefined();
      expect(typeof wakeLimiter).toBe('function');
    });

    it('should be a middleware function', () => {
      // Rate limiters from express-rate-limit are middleware functions
      expect(wakeLimiter.length).toBeGreaterThanOrEqual(2);
    });
  });
});
