import request from 'supertest';
import express from 'express';
import HostDatabase from '../services/hostDatabase';
import ScanOrchestrator from '../services/scanOrchestrator';
import * as networkDiscovery from '../services/networkDiscovery';
import hosts from '../routes/hosts';
import * as hostsController from '../controllers/hosts';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import { config } from '../config';

jest.mock('../services/networkDiscovery');

// Mock config module
jest.mock('../config', () => ({
  config: {
    server: {
      port: 8082,
      host: '0.0.0.0',
      env: 'test',
    },
    database: {
      path: ':memory:',
    },
    network: {
      scanInterval: 300000,
      scanDelay: 5000,
      pingTimeout: 2000,
      usePingValidation: false,
    },
    cache: {
      macVendorTTL: 86400000,
      macVendorRateLimit: 1000,
    },
    cors: {
      origins: ['*'],
    },
    logging: {
      level: 'error',
    },
    auth: {
      apiKey: undefined,
    },
  },
}));

describe('API Key Authentication Integration Tests', () => {
  let app: express.Application;
  let db: HostDatabase;
  let scanOrchestrator: ScanOrchestrator;
  const validApiKey = 'test-api-key-12345';

  // Helper to recreate app with different config
  const createApp = async () => {
    const newApp = express();
    newApp.use(express.json());

    // Setup in-memory database
    if (!db) {
      db = new HostDatabase(':memory:');
      await db.initialize();
      scanOrchestrator = new ScanOrchestrator(db);
      hostsController.setHostDatabase(db);
      hostsController.setScanOrchestrator(scanOrchestrator);
    }

    // Setup routes
    newApp.use('/hosts', hosts);

    // Health check endpoint (should always be public)
    newApp.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Error handling middleware (must be last)
    newApp.use(notFoundHandler);
    newApp.use(errorHandler);

    return newApp;
  };

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(() => {
    (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([]);
    (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);
    (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
      mac.toUpperCase().replace(/-/g, ':')
    );
  });

  afterAll(async () => {
    if (scanOrchestrator) {
      scanOrchestrator.stopPeriodicSync();
    }
    if (db) {
      await db.close();
    }
  });

  describe('when NODE_API_KEY is not configured', () => {
    beforeAll(() => {
      (config as any).auth.apiKey = undefined;
    });

    it('should allow GET /hosts without authentication', async () => {
      const response = await request(app).get('/hosts').expect(200);

      expect(response.body).toHaveProperty('hosts');
      expect(Array.isArray(response.body.hosts)).toBe(true);
    });

    it('should allow POST /hosts/scan without authentication', async () => {
      const response = await request(app).post('/hosts/scan').expect(200);

      expect(response.body).toHaveProperty('message');
    });

    it('should allow GET /hosts/:name without authentication', async () => {
      // Add a test host first since seed data was removed
      await db.addHost('TEST-HOST-AUTH', '00:11:22:33:44:55', '192.168.1.100');
      
      await request(app).get('/hosts/TEST-HOST-AUTH').expect((res) => {
        expect([200, 204]).toContain(res.status);
      });
    });

    it('should allow POST /hosts without authentication', async () => {
      await request(app)
        .post('/hosts')
        .send({
          name: 'TEST-HOST-POST',
          mac: '00:11:22:33:44:77',
          ip: '192.168.1.110',
        })
        .expect((res) => {
          expect([200, 201, 400, 409, 500]).toContain(res.status);
        });
    });
  });

  describe('when NODE_API_KEY is configured', () => {
    beforeAll(async () => {
      (config as any).auth.apiKey = validApiKey;
      // Recreate app to pick up new config
      app = await createApp();
    });

    afterAll(() => {
      (config as any).auth.apiKey = undefined;
    });

    describe('unauthorized requests', () => {
      it('should reject GET /hosts without Authorization header', async () => {
        const response = await request(app).get('/hosts').expect(401);

        expect(response.body.error).toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization header',
          statusCode: 401,
        });
      });

      it('should reject POST /hosts/scan without Authorization header', async () => {
        const response = await request(app).post('/hosts/scan').expect(401);

        expect(response.body.error).toMatchObject({
          code: 'UNAUTHORIZED',
          statusCode: 401,
        });
      });

      it('should reject with invalid Authorization format', async () => {
        const response = await request(app)
          .get('/hosts')
          .set('Authorization', 'InvalidFormat')
          .expect(401);

        expect(response.body.error).toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'Invalid Authorization header format. Expected: Bearer <api-key>',
        });
      });

      it('should reject with incorrect API key', async () => {
        const response = await request(app)
          .get('/hosts')
          .set('Authorization', 'Bearer wrong-api-key')
          .expect(401);

        expect(response.body.error).toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        });
      });

      it('should reject POST request with incorrect API key', async () => {
        await request(app)
          .post('/hosts/scan')
          .set('Authorization', 'Bearer wrong-key')
          .expect(401);
      });

      it('should reject PUT /hosts/:name without Authorization header', async () => {
        await request(app)
          .put('/hosts/TEST-HOST-AUTH2')
          .send({ ip: '192.168.1.222' })
          .expect(401);
      });

      it('should reject DELETE /hosts/:name without Authorization header', async () => {
        await request(app).delete('/hosts/TEST-HOST-AUTH2').expect(401);
      });
    });

    describe('authorized requests', () => {
      it('should allow GET /hosts with valid API key', async () => {
        const response = await request(app)
          .get('/hosts')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect(200);

        expect(response.body).toHaveProperty('hosts');
        expect(Array.isArray(response.body.hosts)).toBe(true);
      });

      it('should allow POST /hosts/scan with valid API key', async () => {
        const response = await request(app)
          .post('/hosts/scan')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect(200);

        expect(response.body).toHaveProperty('message');
      });

      it('should allow GET /hosts/:name with valid API key', async () => {
        // Add a test host first since seed data was removed
        await db.addHost('TEST-HOST-AUTH2', '00:11:22:33:44:66', '192.168.1.101');
        
        await request(app)
          .get('/hosts/TEST-HOST-AUTH2')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect((res) => {
            expect([200, 204]).toContain(res.status);
          });
      });

      it('should allow POST /hosts with valid API key', async () => {
        await request(app)
          .post('/hosts')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send({
            name: 'AUTH-TEST-HOST',
            mac: '00:AA:BB:CC:DD:EE',
            ip: '192.168.1.200',
          })
          .expect((res) => {
            expect([200, 201, 400, 409]).toContain(res.status);
          });
      });

      it('should allow POST /hosts/wakeup/:name with valid API key', async () => {
        // Add a test host first since seed data was removed
        await db.addHost('TEST-WOL-AUTH', 'AA:BB:CC:DD:EE:77', '192.168.1.107');
        
        await request(app)
          .post('/hosts/wakeup/TEST-WOL-AUTH')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect((res) => {
            // Accept 200 (success), 204 (no content), 404 (not found), or 500 (WoL error in test env)
            expect([200, 204, 404, 500]).toContain(res.status);
          });
      });

      it('should allow GET /hosts/mac-vendor/:mac with valid API key', async () => {
        await request(app)
          .get('/hosts/mac-vendor/00:11:22:33:44:55')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect((res) => {
            // Accept 200 (success), 204 (no content), 429 (rate limit), or 500 (vendor lookup error in test env)
            expect([200, 204, 429, 500]).toContain(res.status);
          });
      });

      it('should allow PUT /hosts/:name with valid API key', async () => {
        await request(app)
          .put('/hosts/TEST-HOST-AUTH2')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send({ ip: '192.168.1.202' })
          .expect((res) => {
            expect([200, 404, 409]).toContain(res.status);
          });
      });

      it('should allow DELETE /hosts/:name with valid API key', async () => {
        await request(app)
          .delete('/hosts/TEST-HOST-AUTH2')
          .set('Authorization', `Bearer ${validApiKey}`)
          .expect((res) => {
            expect([200, 404]).toContain(res.status);
          });
      });
    });

    describe('public endpoints', () => {
      it('should allow GET /health without authentication', async () => {
        const response = await request(app).get('/health').expect(200);

        expect(response.body).toEqual({ status: 'ok' });
      });
    });

    describe('error handling', () => {
      it('should return proper error structure for missing auth', async () => {
        const response = await request(app).get('/hosts').expect(401);

        expect(response.body).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: expect.any(String),
            statusCode: 401,
            timestamp: expect.any(String),
            path: '/hosts',
          },
        });
      });

      it('should include path information in error response', async () => {
        const response = await request(app).post('/hosts/scan').expect(401);

        expect(response.body.error.path).toBe('/hosts/scan');
      });
    });
  });
});
