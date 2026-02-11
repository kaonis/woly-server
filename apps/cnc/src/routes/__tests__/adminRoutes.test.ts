/**
 * Integration tests for admin routes authentication and authorization
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

// Mock the Node model
jest.mock('../../models/Node', () => ({
  NodeModel: {
    findById: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(false),
    getStatusCounts: jest.fn().mockResolvedValue({ total: 0, active: 0, inactive: 0 }),
  },
}));

// Mock the Command model
jest.mock('../../models/Command', () => ({
  CommandModel: {
    listRecent: jest.fn().mockResolvedValue([]),
  },
}));

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

describe('Admin Routes Authentication and Authorization', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    // Create mock services
    const nodeManager = {
      getNodeCount: jest.fn().mockReturnValue(0),
      getConnectedCount: jest.fn().mockReturnValue(0),
      getAllNodes: jest.fn().mockReturnValue([]),
      getConnectedNodes: jest.fn().mockReturnValue([]),
      getProtocolValidationStats: jest.fn().mockReturnValue({ totalFailures: 0 }),
    } as unknown as NodeManager;

    const hostAggregator = {
      getHostCount: jest.fn().mockReturnValue(0),
      getStats: jest.fn().mockResolvedValue({ total: 0, awake: 0, asleep: 0 }),
    } as unknown as HostAggregator;

    const commandRouter = {} as unknown as CommandRouter;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  describe('DELETE /api/admin/nodes/:id', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).delete('/api/admin/nodes/test-node');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', 'Basic xyz123');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with invalid token signature', async () => {
      const token = createToken(
        {
          sub: 'admin-1',
          role: 'admin',
          iss: 'test-issuer',
          aud: 'test-audience',
          exp: now + 3600,
        },
        'wrong-secret'
      );

      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 1,
      });

      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has operator role (insufficient)', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('returns 403 when user has viewer role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('allows access with valid admin token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .delete('/api/admin/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since node doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/admin/stats');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with invalid token signature', async () => {
      const token = createToken(
        {
          sub: 'admin-1',
          role: 'admin',
          iss: 'test-issuer',
          aud: 'test-audience',
          exp: now + 3600,
        },
        'invalid-secret'
      );

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 100,
      });

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has operator role (insufficient)', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('returns 403 when user has viewer role', async () => {
      const token = createToken({
        sub: 'viewer-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('allows access with valid admin token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nodes');
      expect(response.body).toHaveProperty('hosts');
    });
  });

  describe('GET /api/admin/commands', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/admin/commands');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/admin/commands')
        .set('Authorization', 'Token abc123');

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 10,
      });

      const response = await request(app)
        .get('/api/admin/commands')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has operator role (insufficient)', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/commands')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('returns 403 when user has viewer role', async () => {
      const token = createToken({
        sub: 'viewer-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/commands')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('allows access with valid admin token', async () => {
      const token = createToken({
        sub: 'admin-1',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .get('/api/admin/commands')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('commands');
      expect(Array.isArray(response.body.commands)).toBe(true);
    });
  });
});
