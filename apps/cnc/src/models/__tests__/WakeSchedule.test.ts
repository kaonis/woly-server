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

  it('computes next trigger on create when nextTrigger is omitted', async () => {
    const created = await WakeScheduleModel.create('test-user-next-trigger', {
      hostName: 'office-next',
      hostMac: 'CC:DD:EE:FF:00:11',
      hostFqn: 'office-next@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
    });

    expect(created.nextTrigger).toBeTruthy();
  });

  it('lists only due schedules that are enabled', async () => {
    const nowIso = '2026-02-16T12:00:00.000Z';
    const due = await WakeScheduleModel.create('test-user-due-a', {
      hostName: 'due-a',
      hostMac: 'AA:11:22:33:44:55',
      hostFqn: 'due-a@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
      nextTrigger: '2026-02-16T11:00:00.000Z',
    });
    const future = await WakeScheduleModel.create('test-user-due-b', {
      hostName: 'due-b',
      hostMac: 'BB:11:22:33:44:55',
      hostFqn: 'due-b@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
      nextTrigger: '2026-02-16T13:00:00.000Z',
    });
    const disabled = await WakeScheduleModel.create('test-user-due-c', {
      hostName: 'due-c',
      hostMac: 'CC:11:22:33:44:55',
      hostFqn: 'due-c@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
      nextTrigger: '2026-02-16T10:30:00.000Z',
    });

    await WakeScheduleModel.update('test-user-due-c', disabled.id, { enabled: false });

    const dueSchedules = await WakeScheduleModel.listDue(10, nowIso);
    expect(dueSchedules.map((schedule) => schedule.id)).toContain(due.id);
    expect(dueSchedules.map((schedule) => schedule.id)).not.toContain(future.id);
    expect(dueSchedules.map((schedule) => schedule.id)).not.toContain(disabled.id);
  });

  it('disables one-time schedules after recording execution attempt', async () => {
    const created = await WakeScheduleModel.create('test-user-once', {
      hostName: 'once',
      hostMac: 'DD:11:22:33:44:55',
      hostFqn: 'once@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'once',
      nextTrigger: '2026-02-16T08:00:00.000Z',
    });

    const updated = await WakeScheduleModel.recordExecutionAttempt(
      created.id,
      '2026-02-16T08:00:00.000Z',
    );

    expect(updated).not.toBeNull();
    expect(updated?.enabled).toBe(false);
    expect(updated?.lastTriggered).toBe('2026-02-16T08:00:00.000Z');
    expect(updated?.nextTrigger).toBeNull();
  });

  it('advances recurring schedules after recording execution attempt', async () => {
    const created = await WakeScheduleModel.create('test-user-recurring', {
      hostName: 'recurring',
      hostMac: 'EE:11:22:33:44:55',
      hostFqn: 'recurring@home-node',
      scheduledTime: '2026-02-16T08:00:00.000Z',
      frequency: 'daily',
      nextTrigger: '2026-02-16T08:00:00.000Z',
    });

    const updated = await WakeScheduleModel.recordExecutionAttempt(
      created.id,
      '2026-02-16T08:00:00.000Z',
    );

    expect(updated).not.toBeNull();
    expect(updated?.enabled).toBe(true);
    expect(updated?.lastTriggered).toBe('2026-02-16T08:00:00.000Z');
    expect(updated?.nextTrigger).toBe('2026-02-17T08:00:00.000Z');
  });
});
