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
