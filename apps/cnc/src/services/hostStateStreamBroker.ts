import WebSocket from 'ws';
import type {
  HostStateStreamEvent,
  HostStateStreamEventType,
  HostStateStreamMutatingEventType,
  HostStateStreamNonMutatingEventType,
  WakeVerificationResult,
} from '@kaonis/woly-protocol';
import { HostAggregator } from './hostAggregator';
import type { CommandRouter } from './commandRouter';
import logger from '../utils/logger';
import type { AuthContext } from '../types/auth';

type HostAddedPayload = {
  nodeId: string;
  fullyQualifiedName?: string;
  host?: {
    name?: string;
    status?: string;
    mac?: string;
  };
};

type HostUpdatedPayload = {
  nodeId: string;
  fullyQualifiedName?: string;
  host?: {
    name?: string;
    status?: string;
    mac?: string;
  };
};

type HostRemovedPayload = {
  nodeId: string;
  name: string;
};

type NodeHostsChangedPayload = {
  nodeId: string;
  count: number;
};

type WakeVerificationCompletePayload = {
  commandId: string;
  fullyQualifiedName: string;
  wakeVerification: WakeVerificationResult;
};

type HostStateStreamBrokerStats = {
  activeClients: number;
  totalConnections: number;
  totalDisconnects: number;
  totalErrors: number;
  closeCodes: Record<string, number>;
  closeReasons: Record<string, number>;
  events: {
    totalBroadcasts: number;
    byType: Record<string, number>;
    deliveries: number;
    droppedNoSubscribers: number;
    sendFailures: number;
  };
};

export class HostStateStreamBroker {
  private readonly clients = new Set<WebSocket>();
  private totalConnections = 0;
  private totalDisconnects = 0;
  private totalErrors = 0;
  private totalBroadcasts = 0;
  private totalBroadcastDeliveries = 0;
  private totalBroadcastDroppedNoSubscribers = 0;
  private totalBroadcastSendFailures = 0;
  private readonly closeCodeCounts = new Map<string, number>();
  private readonly closeReasonCounts = new Map<string, number>();
  private readonly broadcastEventCounts = new Map<HostStateStreamEventType, number>();

  private readonly onHostAdded = (payload: HostAddedPayload) => {
    this.broadcast(
      this.createMutatingEvent('host.discovered', {
        nodeId: payload.nodeId,
        fullyQualifiedName: payload.fullyQualifiedName,
        hostName: payload.host?.name,
        status: payload.host?.status,
      })
    );
  };

  private readonly onHostUpdated = (payload: HostUpdatedPayload) => {
    this.broadcast(
      this.createMutatingEvent('host.updated', {
        nodeId: payload.nodeId,
        fullyQualifiedName: payload.fullyQualifiedName,
        hostName: payload.host?.name,
        status: payload.host?.status,
      })
    );
  };

  private readonly onHostRemoved = (payload: HostRemovedPayload) => {
    this.broadcast(
      this.createMutatingEvent('host.removed', {
        nodeId: payload.nodeId,
        hostName: payload.name,
      })
    );
  };

  private readonly onNodeHostsUnreachable = (payload: NodeHostsChangedPayload) => {
    this.broadcast(
      this.createMutatingEvent('hosts.changed', {
        nodeId: payload.nodeId,
        reason: 'node_hosts_unreachable',
        affectedHostCount: payload.count,
      })
    );
  };

  private readonly onNodeHostsRemoved = (payload: NodeHostsChangedPayload) => {
    this.broadcast(
      this.createMutatingEvent('hosts.changed', {
        nodeId: payload.nodeId,
        reason: 'node_hosts_removed',
        affectedHostCount: payload.count,
      })
    );
  };

  private readonly onWakeVerificationComplete = (payload: WakeVerificationCompletePayload) => {
    this.broadcast(
      this.createMutatingEvent('wake.verified', {
        commandId: payload.commandId,
        fullyQualifiedName: payload.fullyQualifiedName,
        status: payload.wakeVerification.status,
        attempts: payload.wakeVerification.attempts,
        elapsedMs: payload.wakeVerification.elapsedMs,
        source: payload.wakeVerification.source,
      })
    );
  };

  private commandRouter: CommandRouter | null = null;

  constructor(private readonly hostAggregator: HostAggregator) {
    this.hostAggregator.on('host-added', this.onHostAdded);
    this.hostAggregator.on('host-updated', this.onHostUpdated);
    this.hostAggregator.on('host-removed', this.onHostRemoved);
    this.hostAggregator.on('node-hosts-unreachable', this.onNodeHostsUnreachable);
    this.hostAggregator.on('node-hosts-removed', this.onNodeHostsRemoved);
  }

  /**
   * Subscribe to wake verification events from the CommandRouter.
   * Called after construction so the broker can broadcast wake.verified events.
   */
  subscribeToCommandRouter(commandRouter: CommandRouter): void {
    if (this.commandRouter) {
      this.commandRouter.off('wake-verification-complete', this.onWakeVerificationComplete);
    }
    this.commandRouter = commandRouter;
    this.commandRouter.on('wake-verification-complete', this.onWakeVerificationComplete);
  }

  handleConnection(ws: WebSocket, auth: AuthContext): void {
    this.clients.add(ws);
    this.totalConnections += 1;
    this.sendDirect(
      ws,
      this.createNonMutatingEvent('connected', {
        subscriber: auth.sub,
      })
    );

    ws.on('close', (code: number, reason: Buffer) => {
      this.clients.delete(ws);
      this.totalDisconnects += 1;

      const normalizedReason = this.normalizeCloseReason(reason);
      this.incrementCounter(this.closeCodeCounts, String(code));
      this.incrementCounter(this.closeReasonCounts, normalizedReason);

      if (code === 1000) {
        logger.info('Mobile host-state stream websocket closed', {
          subscriber: auth.sub,
          code,
          reason: normalizedReason,
          activeClients: this.clients.size,
        });
        return;
      }

      logger.warn('Mobile host-state stream websocket closed unexpectedly', {
        subscriber: auth.sub,
        code,
        reason: normalizedReason,
        activeClients: this.clients.size,
      });
    });

    ws.on('error', (error) => {
      this.totalErrors += 1;
      logger.warn('Mobile host-state stream websocket error', {
        subscriber: auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      this.clients.delete(ws);
    });
  }

  getStats(): HostStateStreamBrokerStats {
    return {
      activeClients: this.clients.size,
      totalConnections: this.totalConnections,
      totalDisconnects: this.totalDisconnects,
      totalErrors: this.totalErrors,
      closeCodes: this.mapToRecord(this.closeCodeCounts),
      closeReasons: this.mapToRecord(this.closeReasonCounts),
      events: {
        totalBroadcasts: this.totalBroadcasts,
        byType: this.mapToRecord(this.broadcastEventCounts),
        deliveries: this.totalBroadcastDeliveries,
        droppedNoSubscribers: this.totalBroadcastDroppedNoSubscribers,
        sendFailures: this.totalBroadcastSendFailures,
      },
    };
  }

  shutdown(): void {
    this.hostAggregator.off('host-added', this.onHostAdded);
    this.hostAggregator.off('host-updated', this.onHostUpdated);
    this.hostAggregator.off('host-removed', this.onHostRemoved);
    this.hostAggregator.off('node-hosts-unreachable', this.onNodeHostsUnreachable);
    this.hostAggregator.off('node-hosts-removed', this.onNodeHostsRemoved);

    if (this.commandRouter) {
      this.commandRouter.off('wake-verification-complete', this.onWakeVerificationComplete);
      this.commandRouter = null;
    }

    for (const client of this.clients) {
      client.close(1000, 'Server shutdown');
    }
    this.clients.clear();
  }

  private createMutatingEvent(
    type: HostStateStreamMutatingEventType,
    payload?: Record<string, unknown>
  ): HostStateStreamEvent {
    return {
      type,
      changed: true,
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  private createNonMutatingEvent(
    type: HostStateStreamNonMutatingEventType,
    payload?: Record<string, unknown>
  ): HostStateStreamEvent {
    return {
      type,
      changed: false,
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  private sendDirect(ws: WebSocket, event: HostStateStreamEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch (error) {
      this.totalBroadcastSendFailures += 1;
      logger.warn('Failed to send direct host-state stream event', {
        type: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private broadcast(event: HostStateStreamEvent): void {
    this.totalBroadcasts += 1;
    this.incrementCounter(this.broadcastEventCounts, event.type);

    if (this.clients.size === 0) {
      this.totalBroadcastDroppedNoSubscribers += 1;
      return;
    }

    const serialized = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      try {
        client.send(serialized);
        this.totalBroadcastDeliveries += 1;
      } catch (error) {
        this.totalBroadcastSendFailures += 1;
        logger.warn('Failed to send host-state stream event', {
          type: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private incrementCounter<T>(counter: Map<T, number>, key: T): void {
    counter.set(key, (counter.get(key) || 0) + 1);
  }

  private mapToRecord<T extends string>(counter: Map<T, number>): Record<string, number> {
    return Object.fromEntries(counter.entries());
  }

  private normalizeCloseReason(reason: Buffer): string {
    const trimmed = reason.toString('utf8').trim();
    if (trimmed.length === 0) {
      return 'none';
    }
    return trimmed;
  }
}

export default HostStateStreamBroker;
