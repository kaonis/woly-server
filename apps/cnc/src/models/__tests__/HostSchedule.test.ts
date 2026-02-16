import db from '../../database/connection';
import HostScheduleModel from '../HostSchedule';

describe('HostScheduleModel', () => {
  beforeAll(async () => {
    await db.connect();
    await HostScheduleModel.ensureTable();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM host_wake_schedules');
  });

  afterAll(async () => {
    await db.close();
  });

  it('lists only enabled due schedules ordered by next trigger', async () => {
    const nowIso = '2026-02-15T10:00:00.000Z';
    const dueIso = '2026-02-15T09:00:00.000Z';
    const futureIso = '2026-02-15T11:00:00.000Z';

    const dueSchedule = await HostScheduleModel.create({
      hostFqn: 'office@home',
      hostName: 'office',
      hostMac: '00:11:22:33:44:55',
      scheduledTime: '2026-02-16T09:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const futureSchedule = await HostScheduleModel.create({
      hostFqn: 'lab@home',
      hostName: 'lab',
      hostMac: 'AA:BB:CC:DD:EE:FF',
      scheduledTime: '2026-02-16T10:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const disabledSchedule = await HostScheduleModel.create({
      hostFqn: 'disabled@home',
      hostName: 'disabled',
      hostMac: '11:22:33:44:55:66',
      scheduledTime: '2026-02-16T10:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    await db.query('UPDATE host_wake_schedules SET next_trigger = $1 WHERE id = $2', [
      dueIso,
      dueSchedule.id,
    ]);
    await db.query('UPDATE host_wake_schedules SET next_trigger = $1 WHERE id = $2', [
      futureIso,
      futureSchedule.id,
    ]);
    await db.query(
      'UPDATE host_wake_schedules SET enabled = $1, next_trigger = $2 WHERE id = $3',
      [db.isSqlite ? 0 : false, dueIso, disabledSchedule.id],
    );

    const due = await HostScheduleModel.listDue(10, nowIso);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(dueSchedule.id);
  });

  it('disables one-time schedules after recording execution attempt', async () => {
    const schedule = await HostScheduleModel.create({
      hostFqn: 'one-shot@home',
      hostName: 'one-shot',
      hostMac: '00:AA:BB:CC:DD:EE',
      scheduledTime: '2026-02-15T10:00:00.000Z',
      frequency: 'once',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const executedAt = '2026-02-15T10:00:00.000Z';
    const updated = await HostScheduleModel.recordExecutionAttempt(schedule.id, executedAt);

    expect(updated).not.toBeNull();
    expect(updated?.enabled).toBe(false);
    expect(updated?.lastTriggered).toBe(executedAt);
    expect(updated?.nextTrigger).toBeUndefined();
  });

  it('advances recurring schedules to the next trigger after execution attempt', async () => {
    const schedule = await HostScheduleModel.create({
      hostFqn: 'daily@home',
      hostName: 'daily',
      hostMac: 'FF:EE:DD:CC:BB:AA',
      scheduledTime: '2026-02-15T09:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const executedAt = '2026-02-15T10:00:00.000Z';
    const updated = await HostScheduleModel.recordExecutionAttempt(schedule.id, executedAt);

    expect(updated).not.toBeNull();
    expect(updated?.enabled).toBe(true);
    expect(updated?.lastTriggered).toBe(executedAt);
    expect(updated?.nextTrigger).toBe('2026-02-16T09:00:00.000Z');
  });
});
