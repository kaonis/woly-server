/**
 * Integration tests for capabilities route authentication and payload shape
 */

import express, { Express } from 'express';
import request from 'supertest';
import { PROTOCOL_VERSION } from '@kaonis/woly-protocol';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import { createToken } from './testUtils';
import { CNC_VERSION } from '../../utils/cncVersion';

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
    operatorAuthTokens: ['operator-token-123'],
    adminAuthTokens: ['admin-token-456'],
    nodeHeartbeatInterval: 30000,
    nodeTimeout: 60000,
    jwtTtlSeconds: 3600,
  },
}));

jest.mock('../../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  strictAuthLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  scheduleSyncLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('Capabilities Route', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    const nodeManager = {} as unknown as NodeManager;
    const hostAggregator = {} as unknown as HostAggregator;
    const commandRouter = {} as unknown as CommandRouter;

    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  describe('GET /api/capabilities', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await request(app).get('/api/capabilities');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for unsupported role', async () => {
      const viewerToken = createToken({
        sub: 'viewer-user',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('returns capability payload for valid operator role', async () => {
      const operatorToken = createToken({
        sub: 'operator-user',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        mode: 'cnc',
        versions: {
          cncApi: CNC_VERSION,
          protocol: PROTOCOL_VERSION,
        },
        capabilities: {
          scan: {
            supported: true,
            routes: ['/api/hosts/scan', '/api/hosts/ports/:fqn', '/api/hosts/scan-ports/:fqn'],
          },
          notesTags: { supported: true, persistence: 'backend' },
          schedules: {
            supported: true,
            persistence: 'backend',
          },
          hostStateStreaming: {
            supported: true,
            transport: 'websocket',
            routes: ['/ws/mobile/hosts'],
          },
          commandStatusStreaming: { supported: false, transport: null },
          wakeVerification: {
            supported: true,
            transport: 'websocket',
            routes: ['/ws/mobile/hosts'],
          },
          sleep: {
            supported: true,
            routes: ['/api/hosts/:fqn/sleep'],
            persistence: 'backend',
          },
          shutdown: {
            supported: true,
            routes: ['/api/hosts/:fqn/shutdown'],
            persistence: 'backend',
          },
        },
        rateLimits: {
          strictAuth: { scope: 'ip' },
          auth: { scope: 'ip' },
          api: { scope: 'ip' },
          scheduleSync: { scope: 'ip' },
          wsInboundMessages: { scope: 'connection', windowMs: 1000 },
          wsConnectionsPerIp: { scope: 'ip', windowMs: null },
          macVendorLookup: { scope: 'global', windowMs: 1000 },
        },
      });
    });

    it('returns capability payload for valid admin role', async () => {
      const adminToken = createToken({
        sub: 'admin-user',
        role: 'admin',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('capabilities');
      expect(response.body).toHaveProperty('versions.protocol', PROTOCOL_VERSION);
    });
  });
});
