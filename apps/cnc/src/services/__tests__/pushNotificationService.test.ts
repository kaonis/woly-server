import type { NotificationPreferences } from '../../types';
import PushNotificationModel from '../../models/PushNotification';
import { PushNotificationService } from '../pushNotificationService';

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  events: ['host.awake', 'host.asleep', 'scan.complete', 'schedule.wake', 'node.disconnected'],
  quietHours: null,
};

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    pushNotificationsEnabled: true,
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
    listAllDevices: jest.fn(),
    getPreferencesByUsers: jest.fn(),
    deleteDeviceByToken: jest.fn(),
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

describe('PushNotificationService', () => {
  const mockedPushModel = PushNotificationModel as jest.Mocked<typeof PushNotificationModel>;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = require('../../config').default as { pushNotificationsEnabled: boolean };
    config.pushNotificationsEnabled = true;
  });

  it('skips dispatch when push notifications are disabled', async () => {
    const config = require('../../config').default as { pushNotificationsEnabled: boolean };
    config.pushNotificationsEnabled = false;

    const service = new PushNotificationService({
      providers: {
        android: { send: jest.fn() },
        ios: { send: jest.fn() },
      },
    });

    await service.sendEvent('host.awake', {
      hostFqn: 'desktop@node-1',
    });

    expect(mockedPushModel.listAllDevices).not.toHaveBeenCalled();
  });

  it('dispatches only to enabled devices with matching event preference and no quiet-hours suppression', async () => {
    const androidSend = jest.fn(async () => ({
      success: true,
      statusCode: 200,
      error: null,
      permanentFailure: false,
    }));
    const iosSend = jest.fn(async () => ({
      success: true,
      statusCode: 200,
      error: null,
      permanentFailure: false,
    }));

    mockedPushModel.listAllDevices.mockResolvedValue([
      {
        id: 'dev-1',
        userId: 'user-1',
        platform: 'android',
        token: 'android-token-1',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
      {
        id: 'dev-2',
        userId: 'user-2',
        platform: 'ios',
        token: 'ios-token-2',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
      {
        id: 'dev-3',
        userId: 'user-3',
        platform: 'ios',
        token: 'ios-token-3',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
    ]);

    mockedPushModel.getPreferencesByUsers.mockResolvedValue(
      new Map([
        ['user-1', DEFAULT_PREFS],
        ['user-2', { enabled: false, events: ['host.awake'], quietHours: null }],
        [
          'user-3',
          {
            enabled: true,
            events: ['host.awake'],
            quietHours: { startHour: 9, endHour: 17, timezone: 'UTC' },
          },
        ],
      ]),
    );

    const service = new PushNotificationService({
      now: () => new Date('2026-02-18T10:00:00.000Z'),
      providers: {
        android: { send: androidSend },
        ios: { send: iosSend },
      },
    });

    await service.sendEvent('host.awake', {
      hostFqn: 'desktop@node-1',
    });

    expect(androidSend).toHaveBeenCalledTimes(1);
    expect(androidSend).toHaveBeenCalledWith(
      'android-token-1',
      expect.objectContaining({
        eventType: 'host.awake',
        title: 'Host Awake',
      }),
    );
    expect(iosSend).not.toHaveBeenCalled();
    expect(mockedPushModel.deleteDeviceByToken).not.toHaveBeenCalled();
  });

  it('removes tokens after permanent provider failure', async () => {
    const iosSend = jest.fn(async () => ({
      success: false,
      statusCode: 410,
      error: 'Unregistered',
      permanentFailure: true,
    }));

    mockedPushModel.listAllDevices.mockResolvedValue([
      {
        id: 'dev-1',
        userId: 'user-1',
        platform: 'ios',
        token: 'ios-token-1',
        createdAt: '2026-02-18T00:00:00.000Z',
        updatedAt: '2026-02-18T00:00:00.000Z',
        lastSeenAt: '2026-02-18T00:00:00.000Z',
      },
    ]);
    mockedPushModel.getPreferencesByUsers.mockResolvedValue(
      new Map([
        ['user-1', DEFAULT_PREFS],
      ]),
    );

    const service = new PushNotificationService({
      providers: {
        android: { send: jest.fn() },
        ios: { send: iosSend },
      },
    });

    await service.sendEvent('node.disconnected', {
      nodeId: 'node-1',
    });

    expect(iosSend).toHaveBeenCalledTimes(1);
    expect(mockedPushModel.deleteDeviceByToken).toHaveBeenCalledWith('ios-token-1');
  });
});
