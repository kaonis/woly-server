import express, { Express } from 'express';
import request from 'supertest';
import { cncCapabilitiesResponseSchema, wakeScheduleListResponseSchema } from '@kaonis/woly-protocol';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import { createToken } from './testUtils';
import { NodeModel } from '../../models/Node';
import db from '../../database/connection';

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

jest.mock('../../models/Node', () => ({
  NodeModel: {
    findAll: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  strictAuthLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('Mobile API compatibility smoke checks', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);
  const mockedNodeModel = NodeModel as jest.Mocked<typeof NodeModel>;

  beforeEach(async () => {
    jest.clearAllMocks();
    await db.query('DELETE FROM wake_schedules');

    mockedNodeModel.findAll.mockResolvedValue([
      {
        id: 'node-1',
        name: 'Home Node',
        location: 'Home',
        status: 'online',
        lastHeartbeat: new Date('2026-02-15T00:00:00.000Z'),
        capabilities: [],
        metadata: {
          version: '1.0.0',
          platform: 'darwin',
          protocolVersion: '1.1.1',
          networkInfo: {
            subnet: '192.168.1.0/24',
            gateway: '192.168.1.1',
          },
        },
        createdAt: new Date('2026-02-14T00:00:00.000Z'),
        updatedAt: new Date('2026-02-15T00:00:00.000Z'),
      },
    ]);
    mockedNodeModel.findById.mockResolvedValue(null);

    const nodeManager = {
      isNodeConnected: jest.fn().mockReturnValue(true),
    } as unknown as NodeManager;

    const hostAggregator = {
      getAllHosts: jest.fn().mockResolvedValue([
        {
          name: 'Office-Mac',
          ip: '192.168.1.10',
          mac: '00:11:22:33:44:55',
          status: 'awake',
          lastSeen: '2026-02-15T00:00:00.000Z',
          nodeId: 'node-1',
          location: 'Home',
          fullyQualifiedName: 'Office-Mac@Home',
        },
      ]),
      getHostsByNode: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ total: 1, awake: 1, asleep: 0 }),
      getHostByFQN: jest.fn().mockResolvedValue({
        name: 'Office-Mac',
        ip: '192.168.1.10',
        mac: '00:11:22:33:44:55',
        status: 'awake',
        lastSeen: '2026-02-15T00:00:00.000Z',
        nodeId: 'node-1',
        location: 'Home',
        fullyQualifiedName: 'Office-Mac@Home',
      }),
    } as unknown as HostAggregator;

    const commandRouter = {
      routeScanCommand: jest.fn().mockResolvedValue({
        commandId: 'scan-command-1',
        success: true,
        timestamp: new Date('2026-02-15T00:00:00.000Z'),
      }),
    } as unknown as CommandRouter;

    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  describe('POST /api/auth/token', () => {
    it('returns token payload compatible with woly client parser', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer operator-token-123')
        .send({ role: 'operator' });

      expect(response.status).toBe(200);
      expect(typeof response.body.token).toBe('string');
      expect(typeof response.body.expiresAt).toBe('string');
      expect(new Date(response.body.expiresAt).toString()).not.toBe('Invalid Date');
    });

    it('returns auth error envelope for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/token')
        .set('Authorization', 'Bearer invalid-token')
        .send({ role: 'operator' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
      expect(typeof response.body.message).toBe('string');
    });
  });

  describe('GET /api/hosts', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns hosts payload compatible with woly HostsResponse type', async () => {
      const response = await request(app)
        .get('/api/hosts')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.hosts)).toBe(true);
      expect(response.body.hosts[0]).toMatchObject({
        name: 'Office-Mac',
        ip: '192.168.1.10',
        mac: '00:11:22:33:44:55',
        status: 'awake',
        fullyQualifiedName: 'Office-Mac@Home',
      });
    });

    it('returns auth error envelope when JWT is missing', async () => {
      const response = await request(app).get('/api/hosts');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });
  });

  describe('GET /api/nodes', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns nodes payload compatible with woly NodesResponse type', async () => {
      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.nodes)).toBe(true);
      expect(response.body.nodes[0]).toMatchObject({
        id: 'node-1',
        name: 'Home Node',
        location: 'Home',
        status: 'online',
        connected: true,
      });
    });

    it('returns auth error envelope for malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/nodes')
        .set('Authorization', 'InvalidHeader');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });
  });

  describe('GET /api/hosts/ports/:fqn', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns mobile-compatible port payload shape', async () => {
      const response = await request(app)
        .get('/api/hosts/ports/Office-Mac%40Home')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        target: 'Office-Mac@Home',
        openPorts: [],
      });
      expect(typeof response.body.scannedAt).toBe('string');
      expect(new Date(response.body.scannedAt).toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/hosts/scan-ports/:fqn', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns scan payload with compatibility port shape', async () => {
      const response = await request(app)
        .get('/api/hosts/scan-ports/Office-Mac%40Home')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        target: 'Office-Mac@Home',
        openPorts: [],
        scan: {
          commandId: 'scan-command-1',
          state: 'acknowledged',
        },
      });
      expect(typeof response.body.scannedAt).toBe('string');
      expect(new Date(response.body.scannedAt).toString()).not.toBe('Invalid Date');
    });

    it('returns auth error envelope when JWT is missing', async () => {
      const response = await request(app).get('/api/hosts/scan-ports/Office-Mac%40Home');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });
  });

  describe('GET /api/capabilities', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns capability payload compatible with mobile feature negotiation', async () => {
      const response = await request(app)
        .get('/api/capabilities')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(cncCapabilitiesResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        capabilities: {
          scan: expect.any(Boolean),
          notesTagsPersistence: expect.any(Boolean),
          schedulesApi: expect.any(Boolean),
          commandStatusStreaming: expect.any(Boolean),
        },
      });
    });

    it('returns auth error envelope when JWT is missing', async () => {
      const response = await request(app).get('/api/capabilities');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        code: 'AUTH_UNAUTHORIZED',
      });
    });
  });

  describe('GET /api/schedules', () => {
    const operatorJwt = createToken({
      sub: 'mobile-client',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    it('returns schedule payload compatible with mobile schedule migration contract', async () => {
      const createResponse = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${operatorJwt}`)
        .send({
          hostName: 'Office-Mac',
          hostMac: '00:11:22:33:44:55',
          hostFqn: 'Office-Mac@Home',
          scheduledTime: '2026-02-16T08:00:00.000Z',
          timezone: 'UTC',
          frequency: 'daily',
        });

      expect(createResponse.status).toBe(201);

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${operatorJwt}`);

      expect(response.status).toBe(200);
      expect(wakeScheduleListResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.schedules).toHaveLength(1);
      expect(response.body.schedules[0]).toMatchObject({
        hostName: 'Office-Mac',
        hostMac: '00:11:22:33:44:55',
        hostFqn: 'Office-Mac@Home',
        frequency: 'daily',
      });
    });
  });
});
