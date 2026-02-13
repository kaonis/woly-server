/**
 * Integration tests for auth token endpoint
 */

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
    operatorAuthTokens: ['operator-token-123'],
    adminAuthTokens: ['admin-token-456'],
  },
}));

// Mock rate limiters to pass through
jest.mock('../../middleware/rateLimiter', () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  strictAuthLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
}));

describe('Auth Token Endpoint Authentication', () => {
  let app: Express;

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

  describe('POST /api/auth/token', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .send({ role: 'operator' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
      });
    });

    it('returns 401 with malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'InvalidFormat')
        .send({ role: 'operator' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 401 with invalid bearer token', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .send({ role: 'operator' });

      expect(response.status).toBe(401);
    });

    it('returns 401 when operator token is used for admin role', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer operator-token-123')
        .send({ role: 'admin' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('returns 401 when admin token is used for operator role', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer admin-token-456')
        .send({ role: 'operator' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('defaults to operator role when role is missing in request body', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer operator-token-123')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('defaults to operator role when role is invalid', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer operator-token-123')
        .send({ role: 'superadmin' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    it('issues JWT token for valid operator credentials', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer operator-token-123')
        .send({ role: 'operator' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresAt');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.split('.').length).toBe(3); // JWT format
    });

    it('issues JWT token for valid admin credentials', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer admin-token-456')
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresAt');
      expect(typeof response.body.token).toBe('string');
    });
  });
});
