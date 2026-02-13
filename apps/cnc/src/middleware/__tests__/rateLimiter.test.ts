import { authLimiter, apiLimiter, strictAuthLimiter } from '../rateLimiter';

// Mock the logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('strictAuthLimiter', () => {
    it('should be defined and be a function', () => {
      expect(strictAuthLimiter).toBeDefined();
      expect(typeof strictAuthLimiter).toBe('function');
    });

    it('should be configured as Express middleware', () => {
      // Express middleware functions should have at least 3 parameters (req, res, next)
      expect(strictAuthLimiter.length).toBeGreaterThanOrEqual(3);
    });

    it('should not be the same as authLimiter', () => {
      expect(strictAuthLimiter).not.toBe(authLimiter);
    });
  });

  describe('authLimiter', () => {
    it('should be defined and be a function', () => {
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe('function');
    });

    it('should be configured as Express middleware', () => {
      // Express middleware functions should have at least 3 parameters (req, res, next)
      expect(authLimiter.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('apiLimiter', () => {
    it('should be defined and be a function', () => {
      expect(apiLimiter).toBeDefined();
      expect(typeof apiLimiter).toBe('function');
    });

    it('should be configured as Express middleware', () => {
      // Express middleware functions should have at least 3 parameters (req, res, next)
      expect(apiLimiter.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Rate limiter exports', () => {
    it('should export strictAuthLimiter, authLimiter and apiLimiter', () => {
      expect(strictAuthLimiter).toBeTruthy();
      expect(authLimiter).toBeTruthy();
      expect(apiLimiter).toBeTruthy();
      expect(strictAuthLimiter).not.toBe(authLimiter);
      expect(authLimiter).not.toBe(apiLimiter);
      expect(strictAuthLimiter).not.toBe(apiLimiter);
    });
  });
});
