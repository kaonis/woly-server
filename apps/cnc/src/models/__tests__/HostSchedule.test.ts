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

  it('lists schedules by host FQN in reverse creation order and supports lookup by id', async () => {
    const first = await HostScheduleModel.create({
      hostFqn: 'rack@dc',
      hostName: 'rack',
      hostMac: '10:11:12:13:14:15',
      scheduledTime: '2026-02-20T08:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });
    const second = await HostScheduleModel.create({
      hostFqn: 'rack@dc',
      hostName: 'rack',
      hostMac: '10:11:12:13:14:16',
      scheduledTime: '2026-02-20T09:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    await db.query('UPDATE host_wake_schedules SET created_at = $1 WHERE id = $2', [
      '2026-01-01T00:00:00.000Z',
      first.id,
    ]);
    await db.query('UPDATE host_wake_schedules SET created_at = $1 WHERE id = $2', [
      '2026-01-02T00:00:00.000Z',
      second.id,
    ]);

    const byHost = await HostScheduleModel.listByHostFqn('rack@dc');
    expect(byHost).toHaveLength(2);
    expect(byHost[0].id).toBe(second.id);
    expect(byHost[1].id).toBe(first.id);

    const found = await HostScheduleModel.findById(first.id);
    expect(found).not.toBeNull();
    expect(found?.hostFqn).toBe('rack@dc');
    expect(found?.notifyOnWake).toBe(true);
  });

  it('returns null when findById does not exist', async () => {
    const schedule = await HostScheduleModel.findById('missing-id');
    expect(schedule).toBeNull();
  });

  it('updates schedule fields and removes next trigger when disabled', async () => {
    const schedule = await HostScheduleModel.create({
      hostFqn: 'ops@dc',
      hostName: 'ops',
      hostMac: '20:21:22:23:24:25',
      scheduledTime: '2026-02-20T08:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const updated = await HostScheduleModel.update(schedule.id, {
      scheduledTime: '2026-02-20T10:00:00.000Z',
      enabled: false,
      notifyOnWake: false,
      timezone: 'America/Los_Angeles',
    });

    expect(updated).not.toBeNull();
    expect(updated?.enabled).toBe(false);
    expect(updated?.notifyOnWake).toBe(false);
    expect(updated?.timezone).toBe('America/Los_Angeles');
    expect(updated?.nextTrigger).toBeUndefined();
  });

  it('returns null when update target does not exist', async () => {
    const updated = await HostScheduleModel.update('missing-id', { enabled: false });
    expect(updated).toBeNull();
  });

  it('deletes schedules and reports missing deletions', async () => {
    const schedule = await HostScheduleModel.create({
      hostFqn: 'cleanup@dc',
      hostName: 'cleanup',
      hostMac: '30:31:32:33:34:35',
      scheduledTime: '2026-02-20T08:00:00.000Z',
      frequency: 'daily',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    const deletedExisting = await HostScheduleModel.delete(schedule.id);
    const deletedMissing = await HostScheduleModel.delete(schedule.id);

    expect(deletedExisting).toBe(true);
    expect(deletedMissing).toBe(false);
  });

  it('returns null when recording execution attempt for unknown schedule', async () => {
    const updated = await HostScheduleModel.recordExecutionAttempt('missing-id', '2026-02-20T10:00:00.000Z');
    expect(updated).toBeNull();
  });

  it('supports weekly and weekday/weekend next-trigger calculations', async () => {
    const weekly = await HostScheduleModel.create({
      hostFqn: 'weekly@dc',
      hostName: 'weekly',
      hostMac: '40:41:42:43:44:45',
      scheduledTime: '2030-01-14T07:30:00.000Z',
      frequency: 'weekly',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });
    const weekdays = await HostScheduleModel.create({
      hostFqn: 'weekdays@dc',
      hostName: 'weekdays',
      hostMac: '50:51:52:53:54:55',
      scheduledTime: '2030-01-15T07:30:00.000Z',
      frequency: 'weekdays',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });
    const weekends = await HostScheduleModel.create({
      hostFqn: 'weekends@dc',
      hostName: 'weekends',
      hostMac: '60:61:62:63:64:65',
      scheduledTime: '2030-01-12T07:30:00.000Z',
      frequency: 'weekends',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    expect(weekly.nextTrigger).toEqual(expect.any(String));
    expect(weekdays.nextTrigger).toEqual(expect.any(String));
    expect(weekends.nextTrigger).toEqual(expect.any(String));

    const weekdayDay = new Date(weekdays.nextTrigger as string).getUTCDay();
    const weekendDay = new Date(weekends.nextTrigger as string).getUTCDay();
    expect([1, 2, 3, 4, 5]).toContain(weekdayDay);
    expect([0, 6]).toContain(weekendDay);
  });

  it('omits next trigger for one-time schedules scheduled in the past', async () => {
    const schedule = await HostScheduleModel.create({
      hostFqn: 'past-once@dc',
      hostName: 'past-once',
      hostMac: '70:71:72:73:74:75',
      scheduledTime: '2000-01-01T00:00:00.000Z',
      frequency: 'once',
      enabled: true,
      notifyOnWake: true,
      timezone: 'UTC',
    });

    expect(schedule.nextTrigger).toBeUndefined();
  });
});
