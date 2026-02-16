import { processDueWakeSchedules, startWakeScheduleWorker, stopWakeScheduleWorker } from '../wakeScheduleWorker';
import WakeScheduleModel from '../../models/WakeSchedule';
import logger from '../../utils/logger';
import type { CommandRouter } from '../commandRouter';

jest.mock('../../models/WakeSchedule', () => ({
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

const mockedWakeScheduleModel = WakeScheduleModel as jest.Mocked<typeof WakeScheduleModel>;
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

    mockedWakeScheduleModel.listDue.mockResolvedValue([]);

    const processed = await processDueWakeSchedules({ commandRouter });

    expect(processed).toBe(0);
    expect(commandRouter.routeWakeCommand).not.toHaveBeenCalled();
    expect(mockedWakeScheduleModel.recordExecutionAttempt).not.toHaveBeenCalled();
  });

  it('dispatches wake commands for due schedules and records attempts', async () => {
    const commandRouter = {
      routeWakeCommand: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as CommandRouter;

    mockedWakeScheduleModel.listDue.mockResolvedValue([
      {
        id: 'schedule-1',
        hostName: 'office',
        hostMac: 'AA:BB:CC:DD:EE:FF',
        hostFqn: 'office@home',
        scheduledTime: '2026-02-16T08:00:00.000Z',
        timezone: 'UTC',
        frequency: 'daily',
        enabled: true,
        notifyOnWake: true,
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
        lastTriggered: null,
        nextTrigger: '2026-02-16T08:00:00.000Z',
      },
    ]);
    mockedWakeScheduleModel.recordExecutionAttempt.mockResolvedValue(null);

    const processed = await processDueWakeSchedules({ commandRouter, batchSize: 15 });

    expect(processed).toBe(1);
    expect(mockedWakeScheduleModel.listDue).toHaveBeenCalledWith(15);
    expect(commandRouter.routeWakeCommand).toHaveBeenCalledWith(
      'office@home',
      expect.objectContaining({
        correlationId: expect.stringContaining('wake-schedule:schedule-1'),
      }),
    );
    expect(mockedWakeScheduleModel.recordExecutionAttempt).toHaveBeenCalledWith(
      'schedule-1',
      expect.any(String),
    );
  });

  it('continues and records execution when dispatch fails', async () => {
    const commandRouter = {
      routeWakeCommand: jest.fn().mockRejectedValue(new Error('node offline')),
    } as unknown as CommandRouter;

    mockedWakeScheduleModel.listDue.mockResolvedValue([
      {
        id: 'schedule-1',
        hostName: 'office',
        hostMac: 'AA:BB:CC:DD:EE:FF',
        hostFqn: 'office@home',
        scheduledTime: '2026-02-16T08:00:00.000Z',
        timezone: 'UTC',
        frequency: 'daily',
        enabled: true,
        notifyOnWake: true,
        createdAt: '2026-02-15T00:00:00.000Z',
        updatedAt: '2026-02-15T00:00:00.000Z',
        lastTriggered: null,
        nextTrigger: '2026-02-16T08:00:00.000Z',
      },
    ]);
    mockedWakeScheduleModel.recordExecutionAttempt.mockResolvedValue(null);

    const processed = await processDueWakeSchedules({ commandRouter });

    expect(processed).toBe(1);
    expect(mockedWakeScheduleModel.recordExecutionAttempt).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Wake schedule dispatch failed',
      expect.objectContaining({
        scheduleId: 'schedule-1',
      }),
    );
  });

  it('does not start interval when worker disabled', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    startWakeScheduleWorker({
      commandRouter: { routeWakeCommand: jest.fn() } as unknown as CommandRouter,
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

  it('avoids overlapping ticks while prior tick is in progress', async () => {
    jest.useFakeTimers();
    const commandRouter = { routeWakeCommand: jest.fn() } as unknown as CommandRouter;

    let resolveListDue: () => void = () => undefined;
    mockedWakeScheduleModel.listDue.mockImplementation(
      () => new Promise((resolve) => {
        resolveListDue = () => resolve([]);
      }),
    );

    startWakeScheduleWorker({
      commandRouter,
      enabled: true,
      pollIntervalMs: 1000,
      batchSize: 25,
    });

    await Promise.resolve();
    expect(mockedWakeScheduleModel.listDue).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    expect(mockedWakeScheduleModel.listDue).toHaveBeenCalledTimes(1);

    resolveListDue();
    await Promise.resolve();
    await Promise.resolve();

    stopWakeScheduleWorker();
  });
});
