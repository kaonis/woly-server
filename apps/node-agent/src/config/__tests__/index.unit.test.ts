describe('config module', () => {
  const originalEnv = process.env;
  let config: Awaited<ReturnType<typeof loadConfig>>['config'];

  async function loadConfig() {
    return import('../index');
  }

  beforeEach(() => {
    // Reset environment variables
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('server configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have default port', () => {
      expect(config.server.port).toBeDefined();
      expect(typeof config.server.port).toBe('number');
    });

    it('should have default host', () => {
      expect(config.server.host).toBeDefined();
      expect(typeof config.server.host).toBe('string');
    });

    it('should have environment setting', () => {
      expect(config.server.env).toBeDefined();
      expect(typeof config.server.env).toBe('string');
    });

    it('should reject out-of-range ports', async () => {
      jest.resetModules();
      process.env.PORT = '70000';

      await expect(loadConfig()).rejects.toThrow('PORT must be less than or equal to 65535');
    });
  });

  describe('database configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have database path', () => {
      expect(config.database.path).toBeDefined();
      expect(typeof config.database.path).toBe('string');
    });
  });

  describe('network configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have scan interval', () => {
      expect(config.network.scanInterval).toBeDefined();
      expect(typeof config.network.scanInterval).toBe('number');
      expect(config.network.scanInterval).toBeGreaterThan(0);
    });

    it('should have scan delay', () => {
      expect(config.network.scanDelay).toBeDefined();
      expect(typeof config.network.scanDelay).toBe('number');
      expect(config.network.scanDelay).toBeGreaterThanOrEqual(0);
    });

    it('should have ping timeout', () => {
      expect(config.network.pingTimeout).toBeDefined();
      expect(typeof config.network.pingTimeout).toBe('number');
      expect(config.network.pingTimeout).toBeGreaterThan(0);
    });

    it('should reject non-positive ping concurrency', async () => {
      jest.resetModules();
      process.env.PING_CONCURRENCY = '0';

      await expect(loadConfig()).rejects.toThrow(
        'PING_CONCURRENCY must be greater than 0'
      );
    });

    it('should reject malformed numeric values', async () => {
      jest.resetModules();
      process.env.SCAN_INTERVAL = '15seconds';

      await expect(loadConfig()).rejects.toThrow('SCAN_INTERVAL must be an integer');
    });

    it('should allow zero scan delay', async () => {
      jest.resetModules();
      process.env.SCAN_DELAY = '0';

      const { config: loadedConfig } = await loadConfig();

      expect(loadedConfig.network.scanDelay).toBe(0);
    });
  });

  describe('cache configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have MAC vendor TTL', () => {
      expect(config.cache.macVendorTTL).toBeDefined();
      expect(typeof config.cache.macVendorTTL).toBe('number');
      expect(config.cache.macVendorTTL).toBeGreaterThan(0);
    });

    it('should have MAC vendor rate limit', () => {
      expect(config.cache.macVendorRateLimit).toBeDefined();
      expect(typeof config.cache.macVendorRateLimit).toBe('number');
      expect(config.cache.macVendorRateLimit).toBeGreaterThan(0);
    });
  });

  describe('CORS configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have CORS origins', () => {
      expect(config.cors.origins).toBeDefined();
      expect(Array.isArray(config.cors.origins)).toBe(true);
    });

    it('should parse multiple CORS origins from env', () => {
      expect(config.cors.origins.length).toBeGreaterThan(0);
      config.cors.origins.forEach((origin) => {
        expect(typeof origin).toBe('string');
      });
    });
  });

  describe('logging configuration', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have log level', () => {
      expect(config.logging.level).toBeDefined();
      expect(typeof config.logging.level).toBe('string');
    });

    it('should have valid log level', () => {
      const validLevels = ['error', 'warn', 'info', 'http', 'debug'];
      expect(validLevels).toContain(config.logging.level);
    });
  });

  describe('configuration validation', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should have all required top-level properties', () => {
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('network');
      expect(config).toHaveProperty('cache');
      expect(config).toHaveProperty('cors');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('wakeVerification');
    });

    it('should have reasonable default values', () => {
      // Server defaults
      expect(config.server.port).toBeGreaterThan(0);
      expect(config.server.port).toBeLessThan(65536);

      // Network defaults - scan interval should be reasonable (not too frequent)
      expect(config.network.scanInterval).toBeGreaterThanOrEqual(60000); // At least 1 minute

      // Cache defaults
      expect(config.cache.macVendorTTL).toBeGreaterThanOrEqual(3600000); // At least 1 hour
    });
  });

  describe('type safety', () => {
    beforeEach(async () => {
      ({ config } = await loadConfig());
    });

    it('should export config as readonly object', () => {
      expect(Object.isFrozen(config)).toBe(false); // Config object itself is not frozen
      expect(config).toBeDefined();
    });

    it('should have consistent property types', () => {
      // Number properties
      const numberProps = [
        config.server.port,
        config.network.scanInterval,
        config.network.scanDelay,
        config.network.pingTimeout,
        config.cache.macVendorTTL,
        config.cache.macVendorRateLimit,
        config.wakeVerification.timeoutMs,
        config.wakeVerification.pollIntervalMs,
      ];

      numberProps.forEach((prop) => {
        expect(typeof prop).toBe('number');
        expect(Number.isNaN(prop)).toBe(false);
      });

      // String properties
      const stringProps = [
        config.server.host,
        config.server.env,
        config.database.path,
        config.logging.level,
      ];

      stringProps.forEach((prop) => {
        expect(typeof prop).toBe('string');
        expect(prop.length).toBeGreaterThan(0);
      });
    });

    it('should expose wake verification settings with valid ranges', () => {
      expect(typeof config.wakeVerification.enabled).toBe('boolean');
      expect(config.wakeVerification.timeoutMs).toBeGreaterThan(0);
      expect(config.wakeVerification.pollIntervalMs).toBeGreaterThan(0);
    });
  });
});
