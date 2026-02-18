import db from '../../database/connection';
import PushNotificationModel, { DEFAULT_NOTIFICATION_PREFERENCES } from '../PushNotification';

describe('PushNotificationModel', () => {
  beforeAll(async () => {
    await db.connect();
    await PushNotificationModel.ensureTables();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM push_devices');
    await db.query('DELETE FROM notification_preferences');
  });

  afterAll(async () => {
    await db.close();
  });

  it('upserts and lists device registrations per user', async () => {
    const created = await PushNotificationModel.upsertDevice({
      userId: 'operator-1',
      platform: 'ios',
      token: 'test-ios-token-12345678',
    });

    expect(created.userId).toBe('operator-1');
    expect(created.platform).toBe('ios');

    const listed = await PushNotificationModel.listDevicesByUser('operator-1');
    expect(listed).toHaveLength(1);
    expect(listed[0].token).toBe('test-ios-token-12345678');

    const all = await PushNotificationModel.listAllDevices();
    expect(all).toHaveLength(1);
  });

  it('updates existing token ownership/platform on upsert conflict', async () => {
    await PushNotificationModel.upsertDevice({
      userId: 'operator-1',
      platform: 'ios',
      token: 'test-shared-token-12345678',
    });

    const updated = await PushNotificationModel.upsertDevice({
      userId: 'operator-2',
      platform: 'android',
      token: 'test-shared-token-12345678',
    });

    expect(updated.userId).toBe('operator-2');
    expect(updated.platform).toBe('android');

    const user1Devices = await PushNotificationModel.listDevicesByUser('operator-1');
    const user2Devices = await PushNotificationModel.listDevicesByUser('operator-2');
    expect(user1Devices).toHaveLength(0);
    expect(user2Devices).toHaveLength(1);
    expect(user2Devices[0].token).toBe('test-shared-token-12345678');
  });

  it('deletes device by user/token and by token', async () => {
    await PushNotificationModel.upsertDevice({
      userId: 'operator-1',
      platform: 'android',
      token: 'test-android-token-12345678',
    });

    const missingDelete = await PushNotificationModel.deleteDevice('operator-2', 'test-android-token-12345678');
    expect(missingDelete).toBe(false);

    const deleted = await PushNotificationModel.deleteDevice('operator-1', 'test-android-token-12345678');
    expect(deleted).toBe(true);

    await PushNotificationModel.upsertDevice({
      userId: 'operator-1',
      platform: 'android',
      token: 'test-android-token-22345678',
    });

    await PushNotificationModel.deleteDeviceByToken('test-android-token-22345678');
    expect(await PushNotificationModel.listAllDevices()).toHaveLength(0);
  });

  it('returns default preferences when none exist', async () => {
    const preferences = await PushNotificationModel.getPreferences('operator-1');
    expect(preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('upserts and reads notification preferences', async () => {
    await PushNotificationModel.upsertPreferences('operator-1', {
      enabled: true,
      events: ['host.awake', 'scan.complete'],
      quietHours: { startHour: 22, endHour: 6, timezone: 'America/New_York' },
    });

    const preferences = await PushNotificationModel.getPreferences('operator-1');
    expect(preferences).toEqual({
      enabled: true,
      events: ['host.awake', 'scan.complete'],
      quietHours: { startHour: 22, endHour: 6, timezone: 'America/New_York' },
    });
  });

  it('gets preferences by users map and omits non-existent users', async () => {
    await PushNotificationModel.upsertPreferences('operator-1', {
      enabled: false,
      events: ['node.disconnected'],
      quietHours: null,
    });

    const preferences = await PushNotificationModel.getPreferencesByUsers([
      'operator-1',
      'operator-1',
      'operator-2',
      ' ',
    ]);

    expect(preferences.size).toBe(1);
    expect(preferences.get('operator-1')).toEqual({
      enabled: false,
      events: ['node.disconnected'],
      quietHours: null,
    });
    expect(preferences.get('operator-2')).toBeUndefined();
  });
});
