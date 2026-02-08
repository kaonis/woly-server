import { logger } from '../logger';
import winston from 'winston';

describe('logger utility', () => {
  describe('logger instance', () => {
    it('should be a winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(winston.Logger);
    });

    it('should have standard logging methods', () => {
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have http logging method', () => {
      expect(typeof logger.http).toBe('function');
    });
  });

  describe('logging levels', () => {
    it('should have configured log level', () => {
      expect(logger.level).toBeDefined();
      expect(typeof logger.level).toBe('string');
    });

    it('should accept all defined log levels', () => {
      const validLevels = ['error', 'warn', 'info', 'http', 'debug'];
      expect(validLevels).toContain(logger.level);
    });
  });

  describe('transports', () => {
    it('should have multiple transports configured', () => {
      expect(logger.transports).toBeDefined();
      expect(Array.isArray(logger.transports)).toBe(true);
      expect(logger.transports.length).toBeGreaterThan(0);
    });

    it('should have console transport', () => {
      const hasConsoleTransport = logger.transports.some(
        (transport) => transport instanceof winston.transports.Console
      );
      expect(hasConsoleTransport).toBe(true);
    });

    it('should have file transports', () => {
      const hasFileTransport = logger.transports.some(
        (transport) => transport instanceof winston.transports.File
      );
      expect(hasFileTransport).toBe(true);
    });
  });

  describe('logging functionality', () => {
    beforeEach(() => {
      // Mock transports to prevent actual logging during tests
      logger.transports.forEach((transport) => {
        transport.silent = true;
      });
    });

    afterEach(() => {
      // Restore transports
      logger.transports.forEach((transport) => {
        transport.silent = false;
      });
    });

    it('should log error messages', () => {
      expect(() => {
        logger.error('Test error message');
      }).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => {
        logger.info('Test info message');
      }).not.toThrow();
    });

    it('should log http messages', () => {
      expect(() => {
        logger.http('Test http message');
      }).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => {
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('should log messages with metadata', () => {
      expect(() => {
        logger.info('Test message with metadata', { userId: 123, action: 'login' });
      }).not.toThrow();
    });

    it('should log error objects', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Error occurred', { error });
      }).not.toThrow();
    });
  });

  describe('logger configuration', () => {
    it('should have format configured', () => {
      expect(logger.format).toBeDefined();
    });

    it('should have levels defined', () => {
      expect((logger as any).levels).toBeDefined();
      expect((logger as any).levels).toHaveProperty('error');
      expect((logger as any).levels).toHaveProperty('warn');
      expect((logger as any).levels).toHaveProperty('info');
      expect((logger as any).levels).toHaveProperty('http');
      expect((logger as any).levels).toHaveProperty('debug');
    });

    it('should have correct level priorities', () => {
      const levels = (logger as any).levels;
      expect(levels.error).toBeLessThan(levels.warn);
      expect(levels.warn).toBeLessThan(levels.info);
      expect(levels.info).toBeLessThan(levels.http);
      expect(levels.http).toBeLessThan(levels.debug);
    });
  });

  describe('error handling', () => {
    it('should handle null messages gracefully', () => {
      expect(() => {
        logger.info(null as any);
      }).not.toThrow();
    });

    it('should handle undefined messages gracefully', () => {
      expect(() => {
        logger.info(undefined as any);
      }).not.toThrow();
    });

    it('should handle empty string messages', () => {
      expect(() => {
        logger.info('');
      }).not.toThrow();
    });

    it('should handle numeric messages', () => {
      expect(() => {
        logger.info(123 as any);
      }).not.toThrow();
    });

    it('should handle object messages', () => {
      expect(() => {
        logger.info({ key: 'value' } as any);
      }).not.toThrow();
    });
  });
});
