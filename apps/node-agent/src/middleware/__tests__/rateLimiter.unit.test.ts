import express from 'express';
import request from 'supertest';
import { apiLimiter, healthLimiter, scanLimiter, wakeLimiter } from '../rateLimiter';

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('node-agent rateLimiter middleware', () => {
  const createApp = (
    path: string,
    middleware: express.RequestHandler,
    method: 'get' | 'post'
  ) => {
    const app = express();
    app.use(express.json());
    app[method](path, middleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  };

  it('exports middleware functions', () => {
    expect(typeof apiLimiter).toBe('function');
    expect(typeof healthLimiter).toBe('function');
    expect(typeof scanLimiter).toBe('function');
    expect(typeof wakeLimiter).toBe('function');
  });

  it('scanLimiter skips GET requests (cached read path)', async () => {
    const app = createApp('/scan', scanLimiter, 'get');

    for (let i = 0; i < 12; i += 1) {
      const response = await request(app).get('/scan');
      expect(response.status).toBe(200);
    }
  });

  it('scanLimiter limits POST scan bursts and returns hint payload', async () => {
    const app = createApp('/scan', scanLimiter, 'post');

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).post('/scan');
      expect(response.status).toBe(200);
    }

    const limited = await request(app).post('/scan');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too many scan requests. Network scanning is resource-intensive.',
      retryAfter: '1 minute',
      hint: 'Use GET /hosts to retrieve cached results instead',
    });
  });

  it('wakeLimiter throttles after 20 wake requests/minute', async () => {
    const app = createApp('/wake', wakeLimiter, 'post');

    for (let i = 0; i < 20; i += 1) {
      const response = await request(app).post('/wake');
      expect(response.status).toBe(200);
    }

    const limited = await request(app).post('/wake');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too many wake requests. Please wait before trying again.',
      retryAfter: '1 minute',
    });
  });

  it('healthLimiter throttles high-frequency health polling', async () => {
    const app = createApp('/health', healthLimiter, 'get');

    for (let i = 0; i < 60; i += 1) {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    }

    const limited = await request(app).get('/health');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: 'Too many health check requests. Please try again later.',
      retryAfter: '1 minute',
    });
  });
});
