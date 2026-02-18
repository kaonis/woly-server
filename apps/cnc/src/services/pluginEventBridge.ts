import type { Host, HostStatus } from '@kaonis/woly-protocol';
import type { HostAggregator } from './hostAggregator';
import type { NodeManager } from './nodeManager';
import type { PluginEventBus } from './pluginEventBus';

type HostAddedPayload = {
  nodeId: string;
  fullyQualifiedName?: string;
  hostFqn?: string;
  host: Host;
};

type HostRemovedPayload = {
  nodeId: string;
  name: string;
};

type HostStatusTransitionPayload = {
  hostFqn: string;
  oldStatus: HostStatus;
  newStatus: HostStatus;
  changedAt: string;
};

type NodeConnectionPayload = {
  nodeId: string;
};

type ScanCompletePayload = {
  nodeId: string;
  hostCount: number;
};

export class PluginEventBridge {
  private started = false;

  constructor(
    private readonly hostAggregator: HostAggregator,
    private readonly nodeManager: NodeManager,
    private readonly eventBus: PluginEventBus,
  ) {}

  private readonly onHostAdded = (payload: HostAddedPayload): void => {
    const hostFqn = payload.hostFqn ?? payload.fullyQualifiedName;
    if (!hostFqn) {
      return;
    }

    this.eventBus.publish({
      type: 'host.discovered',
      timestamp: new Date().toISOString(),
      data: {
        nodeId: payload.nodeId,
        hostFqn,
        host: payload.host,
      },
    });
  };

  private readonly onHostRemoved = (payload: HostRemovedPayload): void => {
    this.eventBus.publish({
      type: 'host.removed',
      timestamp: new Date().toISOString(),
      data: {
        nodeId: payload.nodeId,
        name: payload.name,
      },
    });
  };

  private readonly onHostStatusTransition = (payload: HostStatusTransitionPayload): void => {
    this.eventBus.publish({
      type: 'host.status-transition',
      timestamp: new Date().toISOString(),
      data: {
        hostFqn: payload.hostFqn,
        oldStatus: payload.oldStatus,
        newStatus: payload.newStatus,
        changedAt: payload.changedAt,
      },
    });
  };

  private readonly onNodeConnected = (payload: NodeConnectionPayload): void => {
    this.eventBus.publish({
      type: 'node.connected',
      timestamp: new Date().toISOString(),
      data: {
        nodeId: payload.nodeId,
      },
    });
  };

  private readonly onNodeDisconnected = (payload: NodeConnectionPayload): void => {
    this.eventBus.publish({
      type: 'node.disconnected',
      timestamp: new Date().toISOString(),
      data: {
        nodeId: payload.nodeId,
      },
    });
  };

  private readonly onScanComplete = (payload: ScanCompletePayload): void => {
    this.eventBus.publish({
      type: 'scan.complete',
      timestamp: new Date().toISOString(),
      data: {
        nodeId: payload.nodeId,
        hostCount: payload.hostCount,
      },
    });
  };

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.hostAggregator.on('host-added', this.onHostAdded);
    this.hostAggregator.on('host-removed', this.onHostRemoved);
    this.hostAggregator.on('host-status-transition', this.onHostStatusTransition);
    this.nodeManager.on('node-connected', this.onNodeConnected);
    this.nodeManager.on('node-disconnected', this.onNodeDisconnected);
    this.nodeManager.on('scan-complete', this.onScanComplete);
  }

  shutdown(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.hostAggregator.off('host-added', this.onHostAdded);
    this.hostAggregator.off('host-removed', this.onHostRemoved);
    this.hostAggregator.off('host-status-transition', this.onHostStatusTransition);
    this.nodeManager.off('node-connected', this.onNodeConnected);
    this.nodeManager.off('node-disconnected', this.onNodeDisconnected);
    this.nodeManager.off('scan-complete', this.onScanComplete);
  }
}

export default PluginEventBridge;
