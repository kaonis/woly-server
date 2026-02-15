/**
 * Integration tests for host routes authentication and authorization
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

describe('Host Routes Authentication and Authorization', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    // Create mock services
    const nodeManager = {
      isNodeConnected: jest.fn().mockReturnValue(false),
    } as unknown as NodeManager;

    const hostAggregator = {
      getAllHosts: jest.fn().mockResolvedValue([]),
      getHostsByNode: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ total: 0, awake: 0, asleep: 0 }),
      getHostByFQN: jest.fn().mockResolvedValue(null),
      updateHost: jest.fn().mockResolvedValue(null),
      deleteHost: jest.fn().mockResolvedValue(false),
    } as unknown as HostAggregator;

    const commandRouter = {
      sendWakeCommand: jest.fn().mockResolvedValue({ success: false, error: 'Node not connected' }),
      routeScanCommand: jest.fn().mockResolvedValue({ success: true, commandId: 'scan-1' }),
      routeUpdateHostCommand: jest.fn().mockResolvedValue({ success: false, error: 'Node not connected' }),
      routeDeleteHostCommand: jest.fn().mockResolvedValue({ success: false, error: 'Node not connected' }),
    } as unknown as CommandRouter;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  describe('GET /api/hosts', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/hosts');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/hosts')
        .set('Authorization', 'Basic xyz123');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with invalid token signature', async () => {
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
        .get('/api/hosts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 1,
      });

      const response = await request(app)
        .get('/api/hosts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
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
        .get('/api/hosts')
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
        .get('/api/hosts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hosts');
      expect(Array.isArray(response.body.hosts)).toBe(true);
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
        .get('/api/hosts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('hosts');
    });
  });

  describe('GET /api/hosts/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/hosts/node1.example.com');

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
        .get('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
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
        .get('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
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
        .get('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since host doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/hosts/ports/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/hosts/ports/node1.example.com');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for unsupported role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/hosts/ports/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
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
        .get('/api/hosts/ports/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since host doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/hosts/scan-ports/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/hosts/scan-ports/node1.example.com');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for unsupported role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/hosts/scan-ports/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
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
        .get('/api/hosts/scan-ports/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      // Will be 404 since host doesn't exist in mock, but auth passed
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/hosts/wakeup/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).post('/api/hosts/wakeup/node1.example.com');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/hosts/wakeup/node1.example.com')
        .set('Authorization', 'Invalid');

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 100,
      });

      const response = await request(app)
        .post('/api/hosts/wakeup/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has insufficient role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .post('/api/hosts/wakeup/node1.example.com')
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
      });

      const response = await request(app)
        .post('/api/hosts/wakeup/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      // Will fail with business logic error, but auth passed
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('PUT /api/hosts/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app)
        .put('/api/hosts/node1.example.com')
        .send({ displayName: 'Test' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with invalid token signature', async () => {
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
        .put('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Test' });

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has insufficient role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .put('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
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
      });

      const response = await request(app)
        .put('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test' });

      // Will fail with service error since commandRouter returns failure
      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/hosts/:fqn', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).delete('/api/hosts/node1.example.com');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .delete('/api/hosts/node1.example.com')
        .set('Authorization', 'NotBearer xyz');

      expect(response.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now - 50,
      });

      const response = await request(app)
        .delete('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('returns 403 when user has insufficient role', async () => {
      const token = createToken({
        sub: 'user-1',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
      });

      const response = await request(app)
        .delete('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
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
        .delete('/api/hosts/node1.example.com')
        .set('Authorization', `Bearer ${token}`);

      // Will fail with service error since commandRouter returns failure
      expect(response.status).toBe(500);
    });
  });
});
