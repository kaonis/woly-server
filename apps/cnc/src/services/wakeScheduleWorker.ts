import type { CommandRouter } from './commandRouter';
import WakeScheduleModel from '../models/WakeSchedule';
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

let wakeScheduleInterval: NodeJS.Timeout | null = null;
let tickInProgress = false;

export async function processDueWakeSchedules(
  params: ProcessDueWakeSchedulesParams,
): Promise<number> {
  const schedules = await WakeScheduleModel.listDue(params.batchSize ?? 25);
  if (schedules.length === 0) {
    return 0;
  }

  for (const schedule of schedules) {
    const attemptedAt = new Date().toISOString();
    const correlationId = `wake-schedule:${schedule.id}:${Date.now()}`;

    try {
      await params.commandRouter.routeWakeCommand(schedule.hostFqn, { correlationId });
      logger.info('Wake schedule command dispatched', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        correlationId,
      });
    } catch (error) {
      logger.warn('Wake schedule dispatch failed', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        correlationId,
        error,
      });
    }

    try {
      await WakeScheduleModel.recordExecutionAttempt(schedule.id, attemptedAt);
    } catch (error) {
      logger.error('Failed to persist wake schedule execution attempt', {
        scheduleId: schedule.id,
        hostFqn: schedule.hostFqn,
        attemptedAt,
        error,
      });
    }
  }

  return schedules.length;
}

export function startWakeScheduleWorker(params: StartWakeScheduleWorkerParams): void {
  if (wakeScheduleInterval) {
    clearInterval(wakeScheduleInterval);
    wakeScheduleInterval = null;
  }

  if (!params.enabled) {
    logger.info('Wake schedule worker disabled (SCHEDULE_WORKER_ENABLED=false)');
    return;
  }

  const tick = async () => {
    if (tickInProgress) {
      return;
    }

    tickInProgress = true;
    try {
      const processed = await processDueWakeSchedules({
        commandRouter: params.commandRouter,
        batchSize: params.batchSize,
      });
      if (processed > 0) {
        logger.info('Processed due wake schedules', { processed });
      }
    } catch (error) {
      logger.error('Wake schedule worker tick failed', { error });
    } finally {
      tickInProgress = false;
    }
  };

  void tick();
  wakeScheduleInterval = setInterval(() => {
    void tick();
  }, params.pollIntervalMs);

  logger.info('Wake schedule worker started', {
    pollIntervalMs: params.pollIntervalMs,
    batchSize: params.batchSize,
  });
}

export function stopWakeScheduleWorker(): void {
  if (wakeScheduleInterval) {
    clearInterval(wakeScheduleInterval);
    wakeScheduleInterval = null;
    logger.info('Wake schedule worker stopped');
  }
}
