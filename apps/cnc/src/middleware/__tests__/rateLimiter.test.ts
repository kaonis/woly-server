import express from 'express';
import request from 'supertest';

type RateLimiterModule = {
  authLimiter: express.RequestHandler;
  apiLimiter: express.RequestHandler;
  scheduleSyncLimiter: express.RequestHandler;
  strictAuthLimiter: express.RequestHandler;
};

describe('cnc rateLimiter middleware', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const loadRateLimiter = (): RateLimiterModule & { warnSpy: jest.Mock } => {
    let moduleUnderTest: RateLimiterModule | undefined;
    const warnSpy = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('../../utils/logger', () => ({
        logger: {
          warn: warnSpy,
        },
      }));

      moduleUnderTest = require('../rateLimiter') as RateLimiterModule;
    });

    if (!moduleUnderTest) {
      throw new Error('failed to load rateLimiter module');
    }

    return { ...moduleUnderTest, warnSpy };
  };

  const createApp = (middleware: express.RequestHandler, path = '/limited') => {
    const app = express();
    app.use(path, middleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  };

  it('does not warn for empty env vars and still enforces strict auth defaults', async () => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;

    const { strictAuthLimiter, warnSpy } = loadRateLimiter();
    const app = createApp(strictAuthLimiter, '/auth/strict');

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).post('/auth/strict');
      expect(response.status).toBe(200);
    }

    const limited = await request(app).post('/auth/strict');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Strict auth rate limit exceeded'),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Invalid rate limit config value'),
    );
  });

  it('warns when env vars are invalid and falls back to defaults', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '-3';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = 'invalid-ms';

    const { strictAuthLimiter, warnSpy } = loadRateLimiter();
    const app = createApp(strictAuthLimiter, '/auth/strict');

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/auth/strict');
    }

    const limited = await request(app).post('/auth/strict');

    expect(limited.status).toBe(429);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid rate limit config value'),
    );
  });

  it('enforces authLimiter in production and returns rate-limit error payload', async () => {
    process.env.NODE_ENV = 'production';

    const { authLimiter, apiLimiter } = loadRateLimiter();
    const app = express();
    app.use('/auth', authLimiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use('/api', apiLimiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    for (let i = 0; i < 10; i += 1) {
      const response = await request(app).post('/auth');
      expect(response.status).toBe(200);
    }

    const limited = await request(app).post('/auth');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('skips schedule endpoints in apiLimiter while rate limiting other host routes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_RATE_LIMIT_MAX = '1';

    const { apiLimiter } = loadRateLimiter();
    const app = express();
    app.use('/api', apiLimiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const scheduleFirst = await request(app).get('/api/hosts/office%40home/schedules');
    const scheduleSecond = await request(app).get('/api/hosts/office%40home/schedules');
    expect(scheduleFirst.status).toBe(200);
    expect(scheduleSecond.status).toBe(200);

    const hostsFirst = await request(app).get('/api/hosts');
    const hostsSecond = await request(app).get('/api/hosts');
    expect(hostsFirst.status).toBe(200);
    expect(hostsSecond.status).toBe(429);
  });

  it('enforces dedicated scheduleSyncLimiter threshold', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SCHEDULE_RATE_LIMIT_MAX = '2';

    const { scheduleSyncLimiter } = loadRateLimiter();
    const app = createApp(scheduleSyncLimiter, '/api/hosts/office%40home/schedules');

    expect((await request(app).get('/api/hosts/office%40home/schedules')).status).toBe(200);
    expect((await request(app).get('/api/hosts/office%40home/schedules')).status).toBe(200);

    const limited = await request(app).get('/api/hosts/office%40home/schedules');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  });
});
