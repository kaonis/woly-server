import { HostAggregator } from './hostAggregator';
import logger from '../utils/logger';

let pruningInterval: NodeJS.Timeout | null = null;

export async function pruneHostStatusHistory(
  hostAggregator: HostAggregator,
  retentionDays: number,
): Promise<number> {
  try {
    const count = await hostAggregator.pruneHostStatusHistory(retentionDays);
    if (count > 0) {
      logger.info('Pruned host status history records', { count, retentionDays });
    }
    return count;
  } catch (error) {
    logger.error('Failed to prune host status history records', { error, retentionDays });
    return 0;
  }
}

export function startHostStatusHistoryPruning(
  hostAggregator: HostAggregator,
  retentionDays: number,
): void {
  if (pruningInterval) {
    clearInterval(pruningInterval);
    pruningInterval = null;
  }

  if (retentionDays <= 0) {
    logger.info('Host status history pruning disabled (HOST_STATUS_HISTORY_RETENTION_DAYS <= 0)');
    return;
  }

  void pruneHostStatusHistory(hostAggregator, retentionDays).catch((error) => {
    logger.error('Initial host status history pruning failed', { error, retentionDays });
  });

  const intervalHours = 24;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  pruningInterval = setInterval(() => {
    void pruneHostStatusHistory(hostAggregator, retentionDays);
  }, intervalMs);

  logger.info('Host status history pruning scheduled', { retentionDays, intervalHours });
}

export function stopHostStatusHistoryPruning(): void {
  if (pruningInterval) {
    clearInterval(pruningInterval);
    pruningInterval = null;
    logger.info('Host status history pruning stopped');
  }
}
