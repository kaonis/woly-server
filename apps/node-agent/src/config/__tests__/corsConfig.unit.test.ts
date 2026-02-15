describe('CORS config defaults', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('defaults to wildcard in non-production when CORS_ORIGINS is unset', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development', CORS_ORIGINS: '' };

    jest.isolateModules(() => {
      const { config } = require('../index');
      expect(config.cors.origins).toEqual(['*']);
    });
  });

  it('defaults to empty list in production when CORS_ORIGINS is unset', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', CORS_ORIGINS: '' };

    jest.isolateModules(() => {
      const { config } = require('../index');
      expect(config.cors.origins).toEqual([]);
    });
  });

  it('parses configured origins in production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com, https://ops.example.com ',
    };

    jest.isolateModules(() => {
      const { config } = require('../index');
      expect(config.cors.origins).toEqual([
        'https://app.example.com',
        'https://ops.example.com',
      ]);
    });
  });
});
