/**
 * Integration tests for node routes authentication
 */

import express, { Express } from 'express';
import request from 'supertest';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import { createToken } from './testUtils';

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
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
  },
}));

describe('Node Routes Authentication', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    // Create mock services
    const nodeManager = {
      isNodeConnected: jest.fn().mockReturnValue(false),
    } as unknown as NodeManager;

    const hostAggregator = {} as unknown as HostAggregator;
    const commandRouter = {} as unknown as CommandRouter;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  describe('GET /api/nodes', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/nodes');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with invalid token', async () => {
      const token = createToken(
        {
          sub: 'user-1',
          role: 'operator',
          iss: 'test-issuer',
          aud: 'test-audience',
          exp: now + 3600,
        },
        'wrong-secret'
      );

      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', 'Token invalid');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 5,
      });

      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 when user has insufficient role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('allows access with valid operator token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nodes');
      expect(Array.isArray(response.body.nodes)).toBe(true);
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
        .get('/api/nodes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('nodes');
    });
  });

  describe('GET /api/nodes/:id', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/nodes/test-node');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('allows access with valid operator token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since node doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/nodes/test-node')
        .set('Authorization', 'Basic xyz123');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for role mismatch', async () => {
      const token = createToken({
        sub: 'viewer-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/nodes/test-node')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('GET /api/nodes/:id/health', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/nodes/test-node/health');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
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
        .get('/api/nodes/test-node/health')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since node doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/nodes/test-node/health')
        .set('Authorization', 'Basic xyz123');

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
        'wrong-secret'
      );

      const response = await request(app)
        .get('/api/nodes/test-node/health')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
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
        .get('/api/nodes/test-node/health')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for role mismatch', async () => {
      const token = createToken({
        sub: 'viewer-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/nodes/test-node/health')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });
  });

  describe('Public routes remain accessible', () => {
    it('allows access to /api/health without authentication', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });
});
