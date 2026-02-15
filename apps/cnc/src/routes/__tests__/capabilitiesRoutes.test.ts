import express, { Express } from 'express';
import request from 'supertest';
import { PROTOCOL_VERSION, cncCapabilitiesResponseSchema } from '@kaonis/woly-protocol';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import { createToken } from './testUtils';

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

describe('Capabilities Routes', () => {
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
    it('returns 401 when JWT is missing', async () => {
      const response = await request(app).get('/api/capabilities');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });

    it('returns 403 for role without capabilities access', async () => {
      const token = createToken({
        sub: 'viewer-client',
        role: 'viewer',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: 'Forbidden',
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('returns a stable capabilities response for operator role', async () => {
      const token = createToken({
        sub: 'mobile-client',
        role: 'operator',
        iss: 'test-issuer',
        aud: 'test-audience',
        exp: now + 3600,
        nbf: now - 10,
      });

      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(cncCapabilitiesResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(response.body.supportedProtocolVersions).toContain(PROTOCOL_VERSION);
      expect(response.body.capabilities).toEqual({
        scan: false,
        notesTagsPersistence: true,
        schedulesApi: false,
        commandStatusStreaming: false,
      });
    });
  });
});
