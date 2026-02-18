import express, { Express } from 'express';
import request from 'supertest';
import { createRoutes } from '../index';
import { NodeManager } from '../../services/nodeManager';
import { HostAggregator } from '../../services/hostAggregator';
import { CommandRouter } from '../../services/commandRouter';
import PushNotificationModel from '../../models/PushNotification';
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

jest.mock('../../models/PushNotification', () => ({
  __esModule: true,
  DEFAULT_NOTIFICATION_PREFERENCES: {
    enabled: true,
    events: ['host.awake', 'host.asleep', 'scan.complete', 'schedule.wake', 'node.disconnected'],
    quietHours: null,
  },
  default: {
    upsertDevice: jest.fn(async () => ({
      id: 'device-1',
      userId: 'operator-1',
      platform: 'ios',
      token: 'ios-token-12345678',
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
      lastSeenAt: '2026-02-18T00:00:00.000Z',
    })),
    listDevicesByUser: jest.fn(async () => ([
      {
        id: 'device-1',
        userId: 'operator-1',
        platform: 'ios',
        token: 'ios-token-12345678',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
    ])),
    deleteDevice: jest.fn(async () => true),
    getPreferences: jest.fn(async () => ({
      enabled: true,
      events: ['host.awake'],
      quietHours: null,
    })),
    upsertPreferences: jest.fn(async () => ({
      enabled: true,
      events: ['host.awake', 'host.asleep', 'scan.complete', 'schedule.wake', 'node.disconnected'],
      quietHours: null,
    })),
  },
}));

describe('Notification Routes Authentication and Authorization', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for /api/devices without authentication', async () => {
    const response = await request(app).get('/api/devices');
    expect(response.status).toBe(401);
  });

  it('returns 403 for /api/devices with unsupported role', async () => {
    const token = createToken({
      sub: 'viewer-1',
      role: 'viewer',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('allows operators to use push notification endpoints', async () => {
    const token = createToken({
      sub: 'operator-1',
      role: 'operator',
      iss: 'test-issuer',
      aud: 'test-audience',
      exp: now + 3600,
      nbf: now - 10,
    });

    const listResponse = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`);
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.devices)).toBe(true);

    const createResponse = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        platform: 'ios',
        token: 'ios-token-12345678',
      });
    expect(createResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete('/api/devices/ios-token-12345678')
      .set('Authorization', `Bearer ${token}`);
    expect(deleteResponse.status).toBe(200);

    const getPrefsResponse = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(getPrefsResponse.status).toBe(200);
    expect(getPrefsResponse.body.preferences).toEqual(
      expect.objectContaining({
        enabled: true,
      }),
    );

    const updatePrefsResponse = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enabled: true,
        events: ['host.awake'],
        quietHours: null,
      });
    expect(updatePrefsResponse.status).toBe(200);

    const mockedPushModel = PushNotificationModel as jest.Mocked<typeof PushNotificationModel>;
    expect(mockedPushModel.listDevicesByUser).toHaveBeenCalledWith('operator-1');
    expect(mockedPushModel.upsertDevice).toHaveBeenCalledWith({
      userId: 'operator-1',
      platform: 'ios',
      token: 'ios-token-12345678',
    });
    expect(mockedPushModel.deleteDevice).toHaveBeenCalledWith('operator-1', 'ios-token-12345678');
  });
});
