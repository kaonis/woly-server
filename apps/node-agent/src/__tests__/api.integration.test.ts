import request from 'supertest';
import express from 'express';
import HostDatabase from '../services/hostDatabase';
import hosts from '../routes/hosts';
import * as hostsController from '../controllers/hosts';
import * as networkDiscovery from '../services/networkDiscovery';
import wol from 'wake_on_lan';
import axios from 'axios';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';

// Mock external dependencies
jest.mock('../services/networkDiscovery');
jest.mock('wake_on_lan');
jest.mock('axios');

describe('API Integration Tests', () => {
  let app: express.Application;
  let db: HostDatabase;

  beforeAll(async () => {
    // Setup express app
    app = express();
    app.use(express.json());

    // Setup in-memory database
    db = new HostDatabase(':memory:');
    await db.initialize();

    // Inject database into controller
    hostsController.setHostDatabase(db);

    // Setup routes
    app.use('/hosts', hosts);

    // Health check endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', message: 'Test server running' });
    });

    // Error handling middleware (must be last)
    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
      mac.toUpperCase().replace(/-/g, ':')
    );
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        message: 'Test server running',
      });
    });
  });

  describe('GET /hosts', () => {
    beforeAll(async () => {
      // Add test hosts since seed data was removed
      await db.addHost('TEST-HOST-1', 'AA:BB:CC:11:11:11', '192.168.1.101');
    });

    it('should return 200 with hosts array', async () => {
      const response = await request(app).get('/hosts').expect(200).expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('hosts');
      expect(Array.isArray(response.body.hosts)).toBe(true);
      expect(response.body.hosts.length).toBeGreaterThan(0);
    });

    it('should return hosts with correct structure', async () => {
      const response = await request(app).get('/hosts').expect(200);

      const host = response.body.hosts[0];
      expect(host).toHaveProperty('name');
      expect(host).toHaveProperty('mac');
      expect(host).toHaveProperty('ip');
      expect(host).toHaveProperty('status');
      expect(host).toHaveProperty('discovered');
    });
  });

  describe('GET /hosts/:name', () => {
    beforeAll(async () => {
      // Add test host since seed data was removed
      await db.addHost('TEST-GET-HOST', 'AA:BB:CC:22:22:22', '192.168.1.102');
    });

    it('should return 200 with host object for existing host', async () => {
      const response = await request(app).get('/hosts/TEST-GET-HOST').expect(200);

      expect(response.body.name).toBe('TEST-GET-HOST');
      expect(response.body).toHaveProperty('mac');
      expect(response.body).toHaveProperty('ip');
    });

    it('should return 404 for non-existent host', async () => {
      const response = await request(app).get('/hosts/NONEXISTENT').expect(404);
      
      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('message', "Host 'NONEXISTENT' not found");
    });
  });

  describe('POST /hosts', () => {
    it('should create new host with valid data', async () => {
      const newHost = {
        name: 'TestHost',
        mac: 'FF:EE:DD:CC:BB:AA',
        ip: '192.168.1.250',
      };

      const response = await request(app).post('/hosts').send(newHost).expect(201);

      expect(response.body.name).toBe('TestHost');
      expect(response.body.mac).toBe('FF:EE:DD:CC:BB:AA');
      expect(response.body.ip).toBe('192.168.1.250');

      // Verify it was actually added
      const getResponse = await request(app).get('/hosts/TestHost').expect(200);

      expect(getResponse.body.name).toBe('TestHost');
    });

    it('should return 400 for missing fields', async () => {
      const invalidHost = {
        name: 'TestHost',
        // Missing mac and ip
      };

      const response = await request(app).post('/hosts').send(invalidHost).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message.toLowerCase()).toContain('required');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 for duplicate MAC address', async () => {
      const host1 = {
        name: 'Host1',
        mac: 'AA:BB:CC:DD:EE:11',
        ip: '192.168.1.251',
      };

      const host2 = {
        name: 'Host2',
        mac: 'AA:BB:CC:DD:EE:11', // Same MAC
        ip: '192.168.1.252',
      };

      const response1 = await request(app).post('/hosts').send(host1);
      expect(response1.status).toBe(201);

      const response2 = await request(app).post('/hosts').send(host2);
      expect(response2.status).toBe(500);
    });
  });

  describe('PUT /hosts/:name', () => {
    beforeAll(async () => {
      await db.addHost('TEST-UPDATE-HOST', 'AA:BB:CC:44:44:44', '192.168.1.104');
    });

    it('should update host fields', async () => {
      const response = await request(app)
        .put('/hosts/TEST-UPDATE-HOST')
        .send({
          name: 'TEST-UPDATE-HOST-RENAMED',
          ip: '192.168.1.105',
        })
        .expect(200);

      expect(response.body.name).toBe('TEST-UPDATE-HOST-RENAMED');
      expect(response.body.ip).toBe('192.168.1.105');

      await request(app).get('/hosts/TEST-UPDATE-HOST-RENAMED').expect(200);
    });

    it('should return 404 for unknown host', async () => {
      const response = await request(app)
        .put('/hosts/DOES-NOT-EXIST')
        .send({ ip: '192.168.1.200' })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('DELETE /hosts/:name', () => {
    beforeEach(async () => {
      try {
        await db.addHost('TEST-DELETE-HOST', 'AA:BB:CC:55:55:55', '192.168.1.106');
      } catch {
        // host may already exist from previous test iteration
      }
    });

    it('should delete existing host', async () => {
      const response = await request(app).delete('/hosts/TEST-DELETE-HOST').expect(200);
      expect(response.body).toEqual({
        message: 'Host deleted',
        name: 'TEST-DELETE-HOST',
      });

      await request(app).get('/hosts/TEST-DELETE-HOST').expect(404);
    });

    it('should return 404 for unknown host', async () => {
      const response = await request(app).delete('/hosts/NO-SUCH-HOST').expect(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('POST /hosts/wakeup/:name', () => {
    beforeAll(async () => {
      // Add test host for WoL tests since seed data was removed
      await db.addHost('TEST-WOL-HOST', 'AA:BB:CC:33:33:33', '192.168.1.103');
    });

    it('should send WoL packet for existing host', async () => {
      // Mock successful WoL
      (wol.wake as jest.Mock).mockImplementation(
        (mac: string, callback: (err: Error | null) => void) => {
          callback(null);
        }
      );

      const response = await request(app).post('/hosts/wakeup/TEST-WOL-HOST').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.name).toBe('TEST-WOL-HOST');
      expect(wol.wake).toHaveBeenCalled();
    });

    it('should return 404 for non-existent host', async () => {
      const response = await request(app).post('/hosts/wakeup/NONEXISTENT').expect(404);
      
      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('message', "Host 'NONEXISTENT' not found");
    });

    it('should handle WoL errors', async () => {
      // Mock WoL failure
      (wol.wake as jest.Mock).mockImplementation(
        (mac: string, callback: (err: Error | null) => void) => {
          callback(new Error('WoL failed'));
        }
      );

      const response = await request(app).post('/hosts/wakeup/TEST-WOL-HOST').expect(500);

      // Error handler wraps errors in error.message format
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('POST /hosts/scan', () => {
    it('should trigger network scan and return results', async () => {
      // Mock network discovery
      (networkDiscovery.scanNetworkARP as jest.Mock).mockResolvedValue([
        { ip: '192.168.1.100', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'TestDevice' },
      ]);
      (networkDiscovery.formatMAC as jest.Mock).mockImplementation((mac: string) =>
        mac.toUpperCase().replace(/-/g, ':')
      );
      (networkDiscovery.isHostAlive as jest.Mock).mockResolvedValue(true);

      const response = await request(app).post('/hosts/scan').expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Network scan completed');
      expect(response.body).toHaveProperty('hostsCount');
      expect(response.body).toHaveProperty('hosts');
      expect(Array.isArray(response.body.hosts)).toBe(true);
    });

    it('should handle network scan errors gracefully', async () => {
      // Mock network discovery failure
      (networkDiscovery.scanNetworkARP as jest.Mock).mockRejectedValue(new Error('Network error'));

      // syncWithNetwork catches errors internally, so it still returns 200
      // but the scan will log the error
      const response = await request(app).post('/hosts/scan').expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Network scan completed');
    });
  });

  describe('GET /hosts/mac-vendor/:mac', () => {
    it('should return vendor information', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: 'Apple Inc.' });

      const response = await request(app).get('/hosts/mac-vendor/AA:BB:CC:DD:EE:FF').expect(200);

      expect(response.body).toHaveProperty('mac');
      expect(response.body).toHaveProperty('vendor');
      expect(response.body).toHaveProperty('source');
    });

    it('should handle rate limiting', async () => {
      (axios.get as jest.Mock).mockRejectedValue({
        response: { status: 429 },
      });

      const response = await request(app).get('/hosts/mac-vendor/BB:BB:CC:DD:EE:FF').expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Rate limit');
    });

    it('should cache vendor lookups', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: 'Test Vendor' });

      // First request
      await request(app).get('/hosts/mac-vendor/CC:CC:CC:DD:EE:FF').expect(200);

      // Clear mock calls
      jest.clearAllMocks();

      // Second request should use cache
      const response = await request(app).get('/hosts/mac-vendor/CC:CC:CC:DD:EE:FF').expect(200);

      expect(response.body.source).toContain('cached');
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/hosts')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Error handler catches JSON syntax errors
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid routes', async () => {
      await request(app).get('/hosts/invalid/route/structure').expect(404);
    });
  });
});
