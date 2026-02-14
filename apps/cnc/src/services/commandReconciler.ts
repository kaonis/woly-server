import { CommandModel } from '../models/Command';
import logger from '../utils/logger';

export async function reconcileCommandsOnStartup(params: { commandTimeoutMs: number }): Promise<void> {
  try {
    // Always reconcile in durable storage, even if the command router is not initialized yet.
    const count = await CommandModel.reconcileStaleInFlight(params.commandTimeoutMs);
    if (count > 0) {
      logger.warn('Reconciled stale in-flight commands on startup', { count });
    } else {
      logger.info('No stale in-flight commands to reconcile on startup');
    }
  } catch (error) {
    logger.error('Failed to reconcile commands on startup', { error });
  }
}

export async function pruneOldCommands(retentionDays: number): Promise<number> {
  try {
    const count = await CommandModel.pruneOldCommands(retentionDays);
    if (count > 0) {
      logger.info('Pruned old commands', { count, retentionDays });
    }
    return count;
  } catch (error) {
    logger.error('Failed to prune old commands', { error, retentionDays });
    return 0;
  }
}

let pruningInterval: NodeJS.Timeout | null = null;

export function startCommandPruning(retentionDays: number): void {
  if (retentionDays <= 0) {
    logger.info('Command pruning disabled (COMMAND_RETENTION_DAYS <= 0)');
    return;
  }

  // Run initial pruning
  pruneOldCommands(retentionDays);

  // Schedule periodic pruning every 24 hours
  const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
  pruningInterval = setInterval(() => {
    pruneOldCommands(retentionDays);
  }, intervalMs);

  logger.info('Command pruning scheduled', { retentionDays, intervalMs });
}

export function stopCommandPruning(): void {
  if (pruningInterval) {
    clearInterval(pruningInterval);
    pruningInterval = null;
    logger.info('Command pruning stopped');
  }
}
