import WebSocket from 'ws';
import { HostAggregator } from './hostAggregator';
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

type HostStateStreamEvent = {
  type: string;
  changed: true;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export class HostStateStreamBroker {
  private readonly clients = new Set<WebSocket>();
  private readonly onHostAdded = (payload: HostAddedPayload) => {
    this.broadcast({
      type: 'host.discovered',
      changed: true,
      timestamp: new Date().toISOString(),
      payload: {
        nodeId: payload.nodeId,
        fullyQualifiedName: payload.fullyQualifiedName,
        hostName: payload.host?.name,
        status: payload.host?.status,
      },
    });
  };
  private readonly onHostUpdated = (payload: HostUpdatedPayload) => {
    this.broadcast({
      type: 'host.updated',
      changed: true,
      timestamp: new Date().toISOString(),
      payload: {
        nodeId: payload.nodeId,
        fullyQualifiedName: payload.fullyQualifiedName,
        hostName: payload.host?.name,
        status: payload.host?.status,
      },
    });
  };
  private readonly onHostRemoved = (payload: HostRemovedPayload) => {
    this.broadcast({
      type: 'host.removed',
      changed: true,
      timestamp: new Date().toISOString(),
      payload: {
        nodeId: payload.nodeId,
        hostName: payload.name,
      },
    });
  };
  private readonly onNodeHostsUnreachable = (payload: NodeHostsChangedPayload) => {
    this.broadcast({
      type: 'hosts.changed',
      changed: true,
      timestamp: new Date().toISOString(),
      payload: {
        nodeId: payload.nodeId,
        reason: 'node_hosts_unreachable',
        affectedHostCount: payload.count,
      },
    });
  };
  private readonly onNodeHostsRemoved = (payload: NodeHostsChangedPayload) => {
    this.broadcast({
      type: 'hosts.changed',
      changed: true,
      timestamp: new Date().toISOString(),
      payload: {
        nodeId: payload.nodeId,
        reason: 'node_hosts_removed',
        affectedHostCount: payload.count,
      },
    });
  };

  constructor(private readonly hostAggregator: HostAggregator) {
    this.hostAggregator.on('host-added', this.onHostAdded);
    this.hostAggregator.on('host-updated', this.onHostUpdated);
    this.hostAggregator.on('host-removed', this.onHostRemoved);
    this.hostAggregator.on('node-hosts-unreachable', this.onNodeHostsUnreachable);
    this.hostAggregator.on('node-hosts-removed', this.onNodeHostsRemoved);
  }

  handleConnection(ws: WebSocket, auth: AuthContext): void {
    this.clients.add(ws);
    ws.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        subscriber: auth.sub,
      })
    );

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      logger.warn('Mobile host-state stream websocket error', {
        subscriber: auth.sub,
        error: error instanceof Error ? error.message : String(error),
      });
      this.clients.delete(ws);
    });
  }

  shutdown(): void {
    this.hostAggregator.off('host-added', this.onHostAdded);
    this.hostAggregator.off('host-updated', this.onHostUpdated);
    this.hostAggregator.off('host-removed', this.onHostRemoved);
    this.hostAggregator.off('node-hosts-unreachable', this.onNodeHostsUnreachable);
    this.hostAggregator.off('node-hosts-removed', this.onNodeHostsRemoved);

    for (const client of this.clients) {
      client.close(1000, 'Server shutdown');
    }
    this.clients.clear();
  }

  private broadcast(event: HostStateStreamEvent): void {
    if (this.clients.size === 0) {
      return;
    }

    const serialized = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      try {
        client.send(serialized);
      } catch (error) {
        logger.warn('Failed to send host-state stream event', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export default HostStateStreamBroker;
