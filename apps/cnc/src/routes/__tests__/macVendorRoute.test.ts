/**
 * Integration tests for MAC vendor lookup endpoint
 */

import { createHmac } from 'crypto';
import express, { Express } from 'express';
import request from 'supertest';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';

// Mock config before importing middleware
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    jwtSecret: 'test-secret',
    jwtIssuer: 'test-issuer',
    jwtAudience: 'test-audience',
    port: 8080,
    dbType: 'sqlite',
    dbPath: ':memory:',
    nodeAuthTokens: ['test-node-token'],
    nodeHeartbeatInterval: 30000,
    nodeTimeout: 60000,
    jwtTtlSeconds: 3600,
  },
}));

// Mock the MAC vendor service
jest.mock('../../services/macVendorService', () => ({
  lookupMacVendor: jest.fn(),
  MAC_ADDRESS_PATTERN: /^([0-9A-Fa-f]{2}([-:])){5}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{12}$/,
}));

// Mock logger
jest.mock('../../utils/logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    logger: mockLogger,
    default: mockLogger,
  };
});

import { lookupMacVendor } from '../../services/macVendorService';

const mockLookup = lookupMacVendor as jest.MockedFunction<typeof lookupMacVendor>;

function encodeBase64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(payload: Record<string, unknown>, secret = 'test-secret'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('MAC Vendor Lookup Route Integration', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);
  const validToken = createToken({
    sub: 'user-1',
    role: 'operator',
    iss: 'test-issuer',
    aud: 'test-audience',
    exp: now + 3600,
  });

  beforeAll(() => {
    // Create mock services
    const nodeManager = {} as unknown as NodeManager;
    const hostAggregator = {} as unknown as HostAggregator;
    const commandRouter = {} as unknown as CommandRouter;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/hosts/mac-vendor/:mac', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/hosts/mac-vendor/80:6D:97:60:39:08');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns vendor info with valid auth', async () => {
      mockLookup.mockResolvedValueOnce({
        mac: '80:6D:97:60:39:08',
        vendor: 'Apple, Inc.',
        source: 'macvendors.com',
      });

      const response = await request(app)
        .get('/api/hosts/mac-vendor/80:6D:97:60:39:08')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        mac: '80:6D:97:60:39:08',
        vendor: 'Apple, Inc.',
        source: 'macvendors.com',
      });
    });

    it('returns 429 when rate limited', async () => {
      mockLookup.mockRejectedValueOnce(
        Object.assign(new Error('Rate limit exceeded, please try again later'), {
          statusCode: 429,
        }),
      );

      const response = await request(app)
        .get('/api/hosts/mac-vendor/AA:BB:CC:DD:EE:FF')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, please try again later',
      });
    });

    it('returns 500 on internal error', async () => {
      mockLookup.mockRejectedValueOnce(
        Object.assign(new Error('Failed to lookup MAC vendor'), { statusCode: 500 }),
      );

      const response = await request(app)
        .get('/api/hosts/mac-vendor/AA:BB:CC:DD:EE:FF')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to lookup MAC vendor',
      });
    });

    it('does not conflict with :fqn route', async () => {
      // This test verifies that /hosts/mac-vendor/:mac is matched before /hosts/:fqn
      mockLookup.mockResolvedValueOnce({
        mac: '00:11:22:33:44:55',
        vendor: 'Test Vendor',
        source: 'macvendors.com',
      });

      const response = await request(app)
        .get('/api/hosts/mac-vendor/00:11:22:33:44:55')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(mockLookup).toHaveBeenCalledWith('00:11:22:33:44:55');
    });

    it('allows admin role', async () => {
      const adminToken = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      mockLookup.mockResolvedValueOnce({
        mac: '80:6D:97:60:39:08',
        vendor: 'Apple, Inc.',
        source: 'macvendors.com',
      });

      const response = await request(app)
        .get('/api/hosts/mac-vendor/80:6D:97:60:39:08')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });
});
