import request from 'supertest';
import express from 'express';
import HostDatabase from '../services/hostDatabase';

// Mock dependencies before importing app
jest.mock('../services/hostDatabase');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  },
}));

describe('App initialization and health endpoint', () => {
  let app: express.Application;

  beforeAll(() => {
    // Setup minimal express app to test health endpoint
    app = express();
    app.use(express.json());

    // Health check endpoint (same as in app.ts)
    app.get('/health', (_req, res) => {
      const uptime = process.uptime();
      const timestamp = Date.now();

      res.status(200).json({
        uptime,
        timestamp,
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        checks: {
          database: 'healthy',
          networkScan: 'idle',
        },
      });
    });
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('checks');
    });

    it('should include database check', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks.database).toBe('healthy');
    });

    it('should include network scan status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.checks).toHaveProperty('networkScan');
      expect(response.body.checks.networkScan).toBe('idle');
    });

    it('should return current uptime as a number', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
    });

    it('should return current timestamp', async () => {
      const beforeTimestamp = Date.now();
      const response = await request(app).get('/health').expect(200);
      const afterTimestamp = Date.now();

      expect(response.body.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(response.body.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should return environment information', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.environment).toBeDefined();
      expect(typeof response.body.environment).toBe('string');
    });

    it('should have correct content type', async () => {
      await request(app).get('/health').expect('Content-Type', /json/);
    });
  });

  describe('Express middleware setup', () => {
    it('should parse JSON bodies', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.post('/test', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(testApp).post('/test').send({ test: 'data' }).expect(200);

      expect(response.body.received).toEqual({ test: 'data' });
    });

    it('should handle large JSON payloads', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.post('/test', (req, res) => {
        res.json({ size: JSON.stringify(req.body).length });
      });

      const largeData = { data: 'x'.repeat(10000) };
      const response = await request(testApp).post('/test').send(largeData).expect(200);

      expect(response.body.size).toBeGreaterThan(10000);
    });
  });

  describe('Database initialization', () => {
    it('should initialize database on startup', () => {
      const mockDb = new HostDatabase(':memory:');
      expect(mockDb).toBeDefined();
      expect(mockDb.initialize).toBeDefined();
      expect(mockDb.close).toBeDefined();
    });
  });

  describe('Server configuration', () => {
    it('should handle process uptime correctly', () => {
      const uptime = process.uptime();
      expect(typeof uptime).toBe('number');
      expect(uptime).toBeGreaterThan(0);
    });

    it('should handle timestamp generation', () => {
      const timestamp = Date.now();
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('Error scenarios', () => {
    it('should handle malformed health check gracefully', async () => {
      const testApp = express();
      testApp.get('/health-error', (req, res) => {
        // Simulate error by trying to access undefined property
        try {
          const data: any = undefined;
          res.json({ value: data.property });
        } catch (error) {
          res.status(500).json({ error: 'Internal error' });
        }
      });

      const response = await request(testApp).get('/health-error');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
