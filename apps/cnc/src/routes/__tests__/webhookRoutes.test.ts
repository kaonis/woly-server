import express, { Express } from 'express';
import request from 'supertest';
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

jest.mock('../../models/Webhook', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async () => ({
      id: 'webhook-1',
      url: 'https://example.com/hooks/woly',
      events: ['host.awake'],
      hasSecret: false,
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
    })),
    list: jest.fn(async () => ([
      {
        id: 'webhook-1',
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
        hasSecret: false,
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
      },
    ])),
    delete: jest.fn(async () => true),
    findById: jest.fn(async () => ({
      id: 'webhook-1',
      url: 'https://example.com/hooks/woly',
      events: ['host.awake'],
      hasSecret: false,
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
    })),
    listDeliveries: jest.fn(async () => ([])),
  },
}));

describe('Webhook Routes Authentication and Authorization', () => {
  let app: Express;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    const nodeManager = {
      isNodeConnected: jest.fn().mockReturnValue(false),
    } as unknown as NodeManager;

    const hostAggregator = {
      getAllHosts: jest.fn().mockResolvedValue([]),
      getHostsByNode: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ total: 0, awake: 0, asleep: 0 }),
      getHostByFQN: jest.fn().mockResolvedValue(null),
      getHostStatusHistory: jest.fn().mockResolvedValue([]),
      getHostUptime: jest.fn().mockRejectedValue(new Error('Host not found')),
      updateHost: jest.fn().mockResolvedValue(null),
      deleteHost: jest.fn().mockResolvedValue(false),
    } as unknown as HostAggregator;

    const commandRouter = {
      routeWakeCommand: jest.fn().mockRejectedValue(new Error('Node not connected')),
      routeSleepHostCommand: jest.fn().mockRejectedValue(new Error('Node not connected')),
      routeShutdownHostCommand: jest.fn().mockRejectedValue(new Error('Node not connected')),
      routeScanHostsCommand: jest.fn().mockResolvedValue({
        state: 'acknowledged',
        queuedAt: '2026-02-18T00:00:00.000Z',
      }),
      routePingHostCommand: jest.fn().mockRejectedValue(new Error('Host not found')),
      routeScanHostPortsCommand: jest.fn().mockRejectedValue(new Error('Host not found')),
      routeUpdateHostCommand: jest.fn().mockResolvedValue({ success: false, error: 'Node not connected' }),
      routeDeleteHostCommand: jest.fn().mockResolvedValue({ success: false, error: 'Node not connected' }),
    } as unknown as CommandRouter;

    app = express();
    app.use(express.json());
    app.use('/api', createRoutes(nodeManager, hostAggregator, commandRouter));
  });

  it('returns 401 for /api/webhooks without authentication', async () => {
    const response = await request(app).get('/api/webhooks');
    expect(response.status).toBe(401);
  });

  it('returns 403 for /api/webhooks with unsupported role', async () => {
    const token = createToken({
      sub: 'viewer-1',
      role: 'viewer',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    const response = await request(app)
      .get('/api/webhooks')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('allows operators to list/create/delete webhooks', async () => {
    const token = createToken({
      sub: 'operator-1',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    const listResponse = await request(app)
      .get('/api/webhooks')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.webhooks)).toBe(true);

    const createResponse = await request(app)
      .post('/api/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://example.com/hooks/woly',
        events: ['host.awake'],
      });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete('/api/webhooks/webhook-1')
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(200);

    const deliveriesResponse = await request(app)
      .get('/api/webhooks/webhook-1/deliveries')
      .set('Authorization', `Bearer ${token}`);
    expect(deliveriesResponse.status).toBe(200);
  });
});
