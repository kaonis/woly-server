import type { CommandRouter } from './commandRouter';
import HostScheduleModel from '../models/HostSchedule';
import logger from '../utils/logger';

interface ProcessDueWakeSchedulesParams {
  commandRouter: CommandRouter;
  batchSize?: number;
}

interface StartWakeScheduleWorkerParams {
  commandRouter: CommandRouter;
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
}

let workerInterval: NodeJS.Timeout | null = null;
let isTickRunning = false;

export async function processDueWakeSchedules(
  params: ProcessDueWakeSchedulesParams,
): Promise<number> {
  const dueSchedules = await HostScheduleModel.listDue(params.batchSize ?? 25);
  if (dueSchedules.length === 0) {
    return 0;
  }

  for (const schedule of dueSchedules) {
    const attemptedAt = new Date().toISOString();
    const correlationId = `schedule:${schedule.id}:${Date.now()}`;

    try {
      await params.commandRouter.routeWakeCommand(schedule.hostFqn, { correlationId });
      logger.info('Wake schedule executed', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        correlationId,
      });
    } catch (error) {
      logger.warn('Wake schedule execution failed', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        correlationId,
        error,
      });
    }

    try {
      await HostScheduleModel.recordExecutionAttempt(schedule.id, attemptedAt);
    } catch (error) {
      logger.error('Failed to record wake schedule execution attempt', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        attemptedAt,
        error,
      });
    }
  }

  return dueSchedules.length;
}

export function startWakeScheduleWorker(params: StartWakeScheduleWorkerParams): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }

  if (!params.enabled) {
    logger.info('Wake schedule worker disabled (SCHEDULE_WORKER_ENABLED=false)');
    return;
  }

  const runTick = async () => {
    if (isTickRunning) {
      return;
    }

    isTickRunning = true;
    try {
      const count = await processDueWakeSchedules({
        commandRouter: params.commandRouter,
        batchSize: params.batchSize,
      });

      if (count > 0) {
        logger.info('Processed due wake schedules', { count });
      }
    } catch (error) {
      logger.error('Wake schedule worker tick failed', { error });
    } finally {
      isTickRunning = false;
    }
  };

  void runTick();
  workerInterval = setInterval(() => {
    void runTick();
  }, params.pollIntervalMs);

  logger.info('Wake schedule worker started', {
    pollIntervalMs: params.pollIntervalMs,
    batchSize: params.batchSize,
  });
}

export function stopWakeScheduleWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('Wake schedule worker stopped');
  }
}
