import { processDueWakeSchedules, startWakeScheduleWorker, stopWakeScheduleWorker } from '../wakeScheduleWorker';
import HostScheduleModel from '../../models/HostSchedule';
import logger from '../../utils/logger';
import type { CommandRouter } from '../commandRouter';

jest.mock('../../models/HostSchedule', () => ({
  __esModule: true,
  default: {
    listDue: jest.fn(),
    recordExecutionAttempt: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedHostScheduleModel = HostScheduleModel as jest.Mocked<typeof HostScheduleModel>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('wakeScheduleWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopWakeScheduleWorker();
  });

  afterEach(() => {
    stopWakeScheduleWorker();
    jest.useRealTimers();
  });

  it('returns 0 when there are no due schedules', async () => {
    const commandRouter = {
      routeWakeCommand: jest.fn(),
    } as unknown as CommandRouter;

    mockedHostScheduleModel.listDue.mockResolvedValue([]);

    const processed = await processDueWakeSchedules({ commandRouter });

    expect(processed).toBe(0);
    expect(commandRouter.routeWakeCommand).not.toHaveBeenCalled();
    expect(mockedHostScheduleModel.recordExecutionAttempt).not.toHaveBeenCalled();
  });

  it('routes due schedules and records execution attempts', async () => {
    const commandRouter = {
      routeWakeCommand: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as CommandRouter;

    mockedHostScheduleModel.listDue.mockResolvedValue([
      {
        id: 'schedule-1',
        hostFqn: 'office@home',
        hostName: 'office',
        hostMac: '00:11:22:33:44:55',
        scheduledTime: '2026-02-16T09:00:00.000Z',
        frequency: 'daily',
        enabled: true,
        notifyOnWake: true,
        timezone: 'UTC',
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
      },
      {
        id: 'schedule-2',
        hostFqn: 'lab@home',
        hostName: 'lab',
        hostMac: 'AA:BB:CC:DD:EE:FF',
        scheduledTime: '2026-02-16T10:00:00.000Z',
        frequency: 'weekly',
        enabled: true,
        notifyOnWake: true,
        timezone: 'UTC',
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
      },
    ]);
    mockedHostScheduleModel.recordExecutionAttempt.mockResolvedValue(null);

    const processed = await processDueWakeSchedules({ commandRouter, batchSize: 50 });

    expect(processed).toBe(2);
    expect(mockedHostScheduleModel.listDue).toHaveBeenCalledWith(50);
    expect(commandRouter.routeWakeCommand).toHaveBeenCalledTimes(2);
    expect(mockedHostScheduleModel.recordExecutionAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLogger.info).toHaveBeenCalledWith(
      'Wake schedule executed',
      expect.objectContaining({
        scheduleId: 'schedule-1',
        hostFqn: 'office@home',
      }),
    );
  });

  it('continues processing when wake command routing fails', async () => {
    const commandRouter = {
      routeWakeCommand: jest.fn().mockRejectedValue(new Error('node offline')),
    } as unknown as CommandRouter;

    mockedHostScheduleModel.listDue.mockResolvedValue([
      {
        id: 'schedule-1',
        hostFqn: 'office@home',
        hostName: 'office',
        hostMac: '00:11:22:33:44:55',
        scheduledTime: '2026-02-16T09:00:00.000Z',
        frequency: 'daily',
        enabled: true,
        notifyOnWake: true,
        timezone: 'UTC',
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
      },
    ]);
    mockedHostScheduleModel.recordExecutionAttempt.mockResolvedValue(null);

    const processed = await processDueWakeSchedules({ commandRouter });

    expect(processed).toBe(1);
    expect(mockedHostScheduleModel.recordExecutionAttempt).toHaveBeenCalledWith(
      'schedule-1',
      expect.any(String),
    );
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Wake schedule execution failed',
      expect.objectContaining({
        scheduleId: 'schedule-1',
      }),
    );
  });

  it('does not schedule intervals when worker is disabled', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const commandRouter = {
      routeWakeCommand: jest.fn(),
    } as unknown as CommandRouter;

    startWakeScheduleWorker({
      commandRouter,
      enabled: false,
      pollIntervalMs: 60_000,
      batchSize: 25,
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(mockedLogger.info).toHaveBeenCalledWith(
      'Wake schedule worker disabled (SCHEDULE_WORKER_ENABLED=false)',
    );

    setIntervalSpy.mockRestore();
  });

  it('schedules polling and avoids overlapping ticks', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const commandRouter = {
      routeWakeCommand: jest.fn(),
    } as unknown as CommandRouter;

    let resolveListDue: () => void = () => undefined;
    mockedHostScheduleModel.listDue.mockImplementation(
      () => new Promise((resolve) => {
        resolveListDue = () => resolve([]);
      }),
    );

    startWakeScheduleWorker({
      commandRouter,
      enabled: true,
      pollIntervalMs: 1000,
      batchSize: 10,
    });

    await Promise.resolve();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(mockedHostScheduleModel.listDue).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    expect(mockedHostScheduleModel.listDue).toHaveBeenCalledTimes(1);

    resolveListDue();
    await Promise.resolve();
    await Promise.resolve();

    stopWakeScheduleWorker();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
