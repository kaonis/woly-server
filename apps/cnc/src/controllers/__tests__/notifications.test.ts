import type { Request, Response } from 'express';
import { NotificationsController } from '../notifications';
import PushNotificationModel, { DEFAULT_NOTIFICATION_PREFERENCES } from '../../models/PushNotification';

jest.mock('../../models/PushNotification', () => ({
  __esModule: true,
  DEFAULT_NOTIFICATION_PREFERENCES: {
    enabled: true,
    events: ['host.awake', 'host.asleep', 'scan.complete', 'schedule.wake', 'node.disconnected'],
    quietHours: null,
  },
  default: {
    upsertDevice: jest.fn(),
    listDevicesByUser: jest.fn(),
    deleteDevice: jest.fn(),
    getPreferences: jest.fn(),
    upsertPreferences: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createMockRequest(options?: {
  auth?: { sub: string } | undefined;
  params?: Record<string, string>;
  body?: unknown;
}): Request {
  return {
    auth: options?.auth,
    params: options?.params ?? {},
    body: options?.body ?? {},
  } as unknown as Request;
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  const mockedPushModel = PushNotificationModel as jest.Mocked<typeof PushNotificationModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationsController();
  });

  it('returns 401 when auth context is missing', async () => {
    const req = createMockRequest({ body: { platform: 'ios', token: 'test-token-token' } });
    const res = createMockResponse();

    await controller.registerDevice(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockedPushModel.upsertDevice).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid device registration payload', async () => {
    const req = createMockRequest({
      auth: { sub: 'operator-1' },
      body: { platform: 'ios', token: 'x' },
    });
    const res = createMockResponse();

    await controller.registerDevice(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedPushModel.upsertDevice).not.toHaveBeenCalled();
  });

  it('registers a push device and optional preferences', async () => {
    mockedPushModel.upsertDevice.mockResolvedValue({
      id: 'dev-1',
      userId: 'operator-1',
      platform: 'ios',
      token: 'test-device-token-123',
      createdAt: '2026-02-18T00:00:00.000Z',
      updatedAt: '2026-02-18T00:00:00.000Z',
      lastSeenAt: '2026-02-18T00:00:00.000Z',
    });
    mockedPushModel.upsertPreferences.mockResolvedValue(DEFAULT_NOTIFICATION_PREFERENCES);

    const req = createMockRequest({
      auth: { sub: 'operator-1' },
      body: {
        platform: 'ios',
        token: 'test-device-token-123',
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      },
    });
    const res = createMockResponse();

    await controller.registerDevice(req, res);

    expect(mockedPushModel.upsertDevice).toHaveBeenCalledWith({
      userId: 'operator-1',
      platform: 'ios',
      token: 'test-device-token-123',
    });
    expect(mockedPushModel.upsertPreferences).toHaveBeenCalledWith(
      'operator-1',
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'dev-1' }));
  });

  it('lists devices for authenticated users', async () => {
    mockedPushModel.listDevicesByUser.mockResolvedValue([
      {
        id: 'dev-1',
        userId: 'operator-1',
        platform: 'android',
        token: 'test-android-token-1',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
    ]);

    const req = createMockRequest({ auth: { sub: 'operator-1' } });
    const res = createMockResponse();

    await controller.listDevices(req, res);

    expect(mockedPushModel.listDevicesByUser).toHaveBeenCalledWith('operator-1');
    expect(res.json).toHaveBeenCalledWith({
      devices: [expect.objectContaining({ id: 'dev-1' })],
    });
  });

  it('returns 404 when deregistering unknown device token', async () => {
    mockedPushModel.deleteDevice.mockResolvedValue(false);

    const req = createMockRequest({
      auth: { sub: 'operator-1' },
      params: { token: 'test-unknown-token-123' },
    });
    const res = createMockResponse();

    await controller.deregisterDevice(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns preferences for the authenticated user', async () => {
    mockedPushModel.getPreferences.mockResolvedValue(DEFAULT_NOTIFICATION_PREFERENCES);

    const req = createMockRequest({ auth: { sub: 'operator-1' } });
    const res = createMockResponse();

    await controller.getPreferences(req, res);

    expect(mockedPushModel.getPreferences).toHaveBeenCalledWith('operator-1');
    expect(res.json).toHaveBeenCalledWith({
      userId: 'operator-1',
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });
  });

  it('returns 400 for invalid preferences payload', async () => {
    const req = createMockRequest({
      auth: { sub: 'operator-1' },
      body: { enabled: true, events: ['bad-event'] },
    });
    const res = createMockResponse();

    await controller.updatePreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedPushModel.upsertPreferences).not.toHaveBeenCalled();
  });

  it('updates and returns preferences payload', async () => {
    mockedPushModel.upsertPreferences.mockResolvedValue({
      enabled: true,
      events: ['host.awake'],
      quietHours: { startHour: 22, endHour: 6, timezone: 'UTC' },
    });

    const req = createMockRequest({
      auth: { sub: 'operator-1' },
      body: {
        enabled: true,
        events: ['host.awake'],
        quietHours: { startHour: 22, endHour: 6, timezone: 'UTC' },
      },
    });
    const res = createMockResponse();

    await controller.updatePreferences(req, res);

    expect(mockedPushModel.upsertPreferences).toHaveBeenCalledWith('operator-1', {
      enabled: true,
      events: ['host.awake'],
      quietHours: { startHour: 22, endHour: 6, timezone: 'UTC' },
    });
    expect(res.json).toHaveBeenCalledWith({
      userId: 'operator-1',
      preferences: {
        enabled: true,
        events: ['host.awake'],
        quietHours: { startHour: 22, endHour: 6, timezone: 'UTC' },
      },
    });
  });
});
