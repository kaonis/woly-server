import { WakeScheduleModel } from '../WakeSchedule';
import db from '../../database/connection';

describe('WakeScheduleModel', () => {
  beforeEach(async () => {
    await db.query('DELETE FROM wake_schedules WHERE owner_sub LIKE $1', ['test-%']);
  });

  it('creates and lists schedules with defaults', async () => {
    const created = await WakeScheduleModel.create('test-user-1', {
      hostName: 'office-pc',
      hostMac: 'AA:BB:CC:DD:EE:FF',
      hostFqn: 'office-pc@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
    });

    expect(created.id).toBeTruthy();
    expect(created.timezone).toBe('UTC');
    expect(created.enabled).toBe(true);
    expect(created.notifyOnWake).toBe(true);

    const listed = await WakeScheduleModel.list('test-user-1');
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
  });

  it('scopes queries by owner subject', async () => {
    await WakeScheduleModel.create('test-user-a', {
      hostName: 'office-a',
      hostMac: 'AA:AA:AA:AA:AA:AA',
      hostFqn: 'office-a@node-a',
      scheduledTime: '2026-02-16T09:00:00.000Z',
      frequency: 'once',
    });

    await WakeScheduleModel.create('test-user-b', {
      hostName: 'office-b',
      hostMac: 'BB:BB:BB:BB:BB:BB',
      hostFqn: 'office-b@node-b',
      scheduledTime: '2026-02-16T10:00:00.000Z',
      frequency: 'weekly',
    });

    const userASchedules = await WakeScheduleModel.list('test-user-a');
    const userBSchedules = await WakeScheduleModel.list('test-user-b');

    expect(userASchedules).toHaveLength(1);
    expect(userASchedules[0].hostName).toBe('office-a');
    expect(userBSchedules).toHaveLength(1);
    expect(userBSchedules[0].hostName).toBe('office-b');
  });

  it('updates schedule fields and returns the updated record', async () => {
    const created = await WakeScheduleModel.create('test-user-update', {
      hostName: 'office-pc',
      hostMac: 'AA:BB:CC:DD:EE:FF',
      hostFqn: 'office-pc@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
      timezone: 'UTC',
    });

    const updated = await WakeScheduleModel.update('test-user-update', created.id, {
      enabled: false,
      frequency: 'weekdays',
      timezone: 'America/New_York',
      nextTrigger: '2026-02-17T13:00:00.000Z',
      lastTriggered: '2026-02-16T13:00:00.000Z',
    });

    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(false);
    expect(updated!.frequency).toBe('weekdays');
    expect(updated!.timezone).toBe('America/New_York');
    expect(updated!.nextTrigger).toBe('2026-02-17T13:00:00.000Z');
    expect(updated!.lastTriggered).toBe('2026-02-16T13:00:00.000Z');
  });

  it('deletes schedules by owner scope', async () => {
    const created = await WakeScheduleModel.create('test-user-delete', {
      hostName: 'office-pc',
      hostMac: 'AA:BB:CC:DD:EE:FF',
      hostFqn: 'office-pc@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
    });

    const wrongOwnerDelete = await WakeScheduleModel.delete('test-other-user', created.id);
    expect(wrongOwnerDelete).toBe(false);

    const deleted = await WakeScheduleModel.delete('test-user-delete', created.id);
    expect(deleted).toBe(true);

    const listed = await WakeScheduleModel.list('test-user-delete');
    expect(listed).toHaveLength(0);
  });
});
