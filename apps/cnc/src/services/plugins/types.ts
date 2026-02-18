import type { Host, HostStatus } from '@kaonis/woly-protocol';
import type { PluginEventBus } from '../pluginEventBus';

export type CncPluginEventType =
  | 'host.discovered'
  | 'host.removed'
  | 'host.status-transition'
  | 'node.connected'
  | 'node.disconnected'
  | 'scan.complete';

export type CncPluginEventMap = {
  'host.discovered': {
    type: 'host.discovered';
    timestamp: string;
    data: {
      nodeId: string;
      hostFqn: string;
      host: Host;
    };
  };
  'host.removed': {
    type: 'host.removed';
    timestamp: string;
    data: {
      nodeId: string;
      name: string;
    };
  };
  'host.status-transition': {
    type: 'host.status-transition';
    timestamp: string;
    data: {
      hostFqn: string;
      oldStatus: HostStatus;
      newStatus: HostStatus;
      changedAt: string;
    };
  };
  'node.connected': {
    type: 'node.connected';
    timestamp: string;
    data: {
      nodeId: string;
    };
  };
  'node.disconnected': {
    type: 'node.disconnected';
    timestamp: string;
    data: {
      nodeId: string;
    };
  };
  'scan.complete': {
    type: 'scan.complete';
    timestamp: string;
    data: {
      nodeId: string;
      hostCount: number;
    };
  };
};

export interface PluginContext {
  eventBus: PluginEventBus;
}

export interface WolyPlugin {
  readonly name: string;
  readonly version: string;
  init(context: PluginContext): Promise<void> | void;
  destroy(): Promise<void> | void;
}

export type PluginFactory = () => WolyPlugin;
