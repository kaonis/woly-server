import db from '../../database/connection';
import { logger } from '../../utils/logger';
import type { Host, AggregatedHost } from '../../types';

export interface HostDiscoveredEvent {
  nodeId: string;
  host: Host;
  location: string;
}

export interface HostUpdatedEvent {
  nodeId: string;
  host: Host;
  location: string;
}

export interface HostRemovedEvent {
  nodeId: string;
  name: string;
}

type AggregatedHostRow = AggregatedHost & { id: number };

export interface HostSyncContext {
  isSqlite: boolean;
  ensureHostMetadataColumns: () => Promise<void>;
  buildFQN: (name: string, location: string, nodeId?: string) => string;
  reconcileHostByMac: (
    nodeId: string,
    host: Host,
    location: string,
  ) => Promise<{ reconciled: boolean; wasRenamed: boolean; previousHost: AggregatedHostRow | null }>;
  hasMeaningfulHostStateChange: (
    previous: AggregatedHostRow,
    next: Host,
    location: string,
  ) => boolean;
  recordHostStatusTransition: (
    hostFqn: string,
    oldStatusCandidate: unknown,
    newStatusCandidate: unknown,
    changedAtCandidate?: unknown,
  ) => Promise<void>;
  insertHost: (nodeId: string, host: Host, location: string, fullyQualifiedName: string) => Promise<void>;
  findHostRowByNodeAndName: (nodeId: string, name: string) => Promise<AggregatedHostRow | null>;
  emitEvent: (eventName: string, payload: Record<string, unknown>) => void;
}

export async function onHostDiscovered(
  context: HostSyncContext,
  event: HostDiscoveredEvent,
): Promise<void> {
  await context.ensureHostMetadataColumns();
  const { nodeId, host, location } = event;
  const fullyQualifiedName = context.buildFQN(host.name, location, nodeId);

  try {
    const { reconciled, wasRenamed, previousHost } = await context.reconcileHostByMac(nodeId, host, location);

    if (reconciled) {
      const method = wasRenamed ? 'MAC (renamed)' : 'MAC or name';
      logger.info('Host already exists, updated', {
        nodeId,
        hostName: host.name,
        fullyQualifiedName,
        mac: host.mac,
        newIp: host.ip,
        newStatus: host.status,
        reconciledBy: method,
      });

      if (previousHost && context.hasMeaningfulHostStateChange(previousHost, host, location)) {
        await context.recordHostStatusTransition(fullyQualifiedName, previousHost.status, host.status);
        context.emitEvent('host-updated', { nodeId, host, fullyQualifiedName });
      }
      return;
    }

    await context.insertHost(nodeId, host, location, fullyQualifiedName);
    logger.info('Host discovered and added to aggregated database', {
      nodeId,
      hostName: host.name,
      fullyQualifiedName,
      mac: host.mac,
      ip: host.ip,
      status: host.status,
    });

    context.emitEvent('host-added', { nodeId, host, fullyQualifiedName });
  } catch (error) {
    logger.error('Failed to process host-discovered event', {
      nodeId,
      hostName: host.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function onHostUpdated(
  context: HostSyncContext,
  event: HostUpdatedEvent,
): Promise<void> {
  await context.ensureHostMetadataColumns();
  const { nodeId, host, location } = event;
  const fullyQualifiedName = context.buildFQN(host.name, location, nodeId);

  try {
    const { reconciled, previousHost } = await context.reconcileHostByMac(nodeId, host, location);

    if (reconciled) {
      await context.recordHostStatusTransition(fullyQualifiedName, previousHost?.status, host.status);
      logger.debug('Host updated in aggregated database', {
        nodeId,
        hostName: host.name,
        fullyQualifiedName,
        status: host.status,
      });

      context.emitEvent('host-updated', { nodeId, host, fullyQualifiedName });
      return;
    }

    logger.debug('Received update for unknown host, treating as discovery', {
      nodeId,
      hostName: host.name,
    });
    await onHostDiscovered(context, event);
  } catch (error) {
    logger.error('Failed to process host-updated event', {
      nodeId,
      hostName: host.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function onHostRemoved(
  context: HostSyncContext,
  event: HostRemovedEvent,
): Promise<void> {
  await context.ensureHostMetadataColumns();
  const { nodeId, name } = event;

  try {
    const existing = await context.findHostRowByNodeAndName(nodeId, name);
    const result = await db.query('DELETE FROM aggregated_hosts WHERE node_id = $1 AND name = $2 RETURNING *', [
      nodeId,
      name,
    ]);

    if (existing?.mac) {
      await db.query('DELETE FROM aggregated_hosts WHERE node_id = $1 AND mac = $2', [nodeId, existing.mac]);
    }

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Host removed from aggregated database', {
        nodeId,
        hostName: name,
      });

      context.emitEvent('host-removed', { nodeId, name });
    } else {
      logger.debug('Host removal request for non-existent host', {
        nodeId,
        hostName: name,
      });
    }
  } catch (error) {
    logger.error('Failed to process host-removed event', {
      nodeId,
      hostName: name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function markNodeHostsUnreachable(
  context: HostSyncContext,
  nodeId: string,
): Promise<void> {
  await context.ensureHostMetadataColumns();
  try {
    const timestamp = context.isSqlite ? 'CURRENT_TIMESTAMP' : 'NOW()';
    const awakeHostsResult = await db.query<{ fullyQualifiedName: string }>(
      `SELECT fully_qualified_name as "fullyQualifiedName"
       FROM aggregated_hosts
       WHERE node_id = $1 AND status = 'awake'`,
      [nodeId],
    );

    const result = await db.query(
      `UPDATE aggregated_hosts
       SET status = 'asleep', updated_at = ${timestamp}
       WHERE node_id = $1 AND status = 'awake'`,
      [nodeId],
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      const changedAt = new Date().toISOString();
      for (const host of awakeHostsResult.rows) {
        await context.recordHostStatusTransition(host.fullyQualifiedName, 'awake', 'asleep', changedAt);
      }

      logger.info('Marked node hosts as unreachable', {
        nodeId,
        hostsAffected: count,
      });

      context.emitEvent('node-hosts-unreachable', { nodeId, count });
    }
  } catch (error) {
    logger.error('Failed to mark node hosts as unreachable', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function removeNodeHosts(context: HostSyncContext, nodeId: string): Promise<void> {
  await context.ensureHostMetadataColumns();
  try {
    const result = await db.query('DELETE FROM aggregated_hosts WHERE node_id = $1 RETURNING name', [nodeId]);

    const count = result.rowCount || 0;
    logger.info('Removed all hosts for node', {
      nodeId,
      hostsRemoved: count,
    });

    context.emitEvent('node-hosts-removed', { nodeId, count });
  } catch (error) {
    logger.error('Failed to remove node hosts', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
