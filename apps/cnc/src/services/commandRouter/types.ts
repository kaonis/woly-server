import type {
  CncCommand,
  CommandResult,
  HostPingResponse,
  HostPowerResponse,
  WakeupResponse,
  CommandRecord,
} from '../../types';
import type { HostPowerAction, HostStatus, WakeVerifyOptions } from '@kaonis/woly-protocol';

export type DispatchCommand = Extract<CncCommand, { commandId: string }>;

export interface HostUpdateData {
  name?: string;
  mac?: string;
  secondaryMacs?: string[];
  ip?: string;
  wolPort?: number;
  status?: HostStatus;
  notes?: string | null;
  tags?: string[];
  powerControl?: Extract<DispatchCommand, { type: 'update-host' }>['data']['powerControl'];
}

export type PingHostCommandResult = {
  hostPing: NonNullable<CommandResult['hostPing']>;
  correlationId?: string;
};

export type RoutedHostPortScanResult = {
  commandId: string;
  nodeId: string;
  message?: string;
  hostPortScan: NonNullable<CommandResult['hostPortScan']>;
  correlationId?: string;
};

export type RoutedHostScanDispatchResult = {
  state: 'acknowledged';
  queuedAt: string;
  startedAt: string;
  completedAt: string;
  lastScanAt: string;
  commandId?: string;
  message: string;
  correlationId?: string;
  nodeResults: Array<{
    nodeId: string;
    commandId?: string;
    state: 'acknowledged' | 'failed';
    message?: string;
    error?: string;
  }>;
};

export interface CommandResolver {
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
}

export interface PendingCommandEntry {
  resolvers: CommandResolver[];
  timeout: NodeJS.Timeout;
  correlationId: string | null;
  commandType: DispatchCommand['type'];
}

export type ExecuteCommandOptions = {
  idempotencyKey: string | null;
  correlationId: string | null;
};

export type WakeRouteOptions = {
  idempotencyKey?: string | null;
  correlationId?: string | null;
  wolPort?: number | null;
  verify?: WakeVerifyOptions | null;
};

export type CorrelationRouteOptions = {
  correlationId?: string | null;
};

export type HostPowerRouteOptions = {
  idempotencyKey?: string | null;
  correlationId?: string | null;
};

export type ScanHostPortsRouteOptions = {
  correlationId?: string | null;
  ports?: number[] | null;
  timeoutMs?: number | null;
};

export interface CommandDispatchContext {
  parseFQN: (fqn: string) => { hostname: string; location: string };
  generateCommandId: () => string;
  normalizePortList: (ports: number[] | null) => number[] | null;
  routeScanCommand: (
    nodeId: string,
    immediate?: boolean,
    options?: CorrelationRouteOptions
  ) => Promise<CommandResult>;
  executeCommand: (
    nodeId: string,
    command: DispatchCommand,
    options: ExecuteCommandOptions
  ) => Promise<CommandResult>;
  trackWakeVerificationCommand: (commandId: string, fqn: string) => void;
  assertPingHostResult: (result: CommandResult) => PingHostCommandResult;
  assertHostPortScanResult: (result: CommandResult) => {
    hostPortScan: NonNullable<CommandResult['hostPortScan']>;
    correlationId?: string;
  };
  nodeManager: {
    getNodeStatus: (nodeId: string) => Promise<'online' | 'offline'>;
    getConnectedNodes: () => string[];
  };
  hostAggregator: {
    getHostByFQN: (fullyQualifiedName: string) => Promise<{
      nodeId: string;
      name: string;
      mac: string;
      secondaryMacs?: string[];
      ip: string;
      wolPort?: number;
      status: HostStatus;
      notes?: string | null;
      tags?: string[];
      powerControl?: Extract<DispatchCommand, { type: 'update-host' }>['data']['powerControl'];
    } | null>;
    onHostRemoved: (event: { nodeId: string; name: string }) => Promise<void>;
  };
}

export interface CommandLifecycleContext {
  pendingCommands: Map<string, PendingCommandEntry>;
  wakeVerificationCommands: Map<string, string>;
  flushingNodes: Set<string>;
  commandTimeout: number;
  maxRetries: number;
  offlineCommandTtlMs: number;
  calculateBackoffDelay: (retryCount: number) => number;
  scopeIdempotencyKey: (
    commandType: DispatchCommand['type'],
    idempotencyKey: string | null
  ) => string | null;
  buildQueuedMessage: () => string;
  buildQueueExpiryMessage: () => string;
  isQueuedCommandExpired: (record: Pick<CommandRecord, 'createdAt'>) => boolean;
  asDispatchCommand: (payload: unknown) => DispatchCommand | null;
  resolvePersistedCommand: (commandId: string) => Promise<CommandRecord | null>;
  emitWakeVerificationComplete: (payload: {
    commandId: string;
    fullyQualifiedName: string;
    wakeVerification: NonNullable<CommandResult['wakeVerification']>;
  }) => void;
  nodeManager: {
    isNodeConnected: (nodeId: string) => boolean;
    sendCommand: (nodeId: string, payload: DispatchCommand) => void;
  };
}

export type RouteWakeCommand = (
  context: CommandDispatchContext,
  fqn: string,
  options?: WakeRouteOptions
) => Promise<WakeupResponse>;

export type RoutePingHostCommand = (
  context: CommandDispatchContext,
  fqn: string,
  options?: CorrelationRouteOptions
) => Promise<HostPingResponse>;

export type RouteHostPowerCommand = (
  context: CommandDispatchContext,
  action: HostPowerAction,
  fqn: string,
  options?: HostPowerRouteOptions
) => Promise<HostPowerResponse>;

export type RouteScanCommand = (
  context: CommandDispatchContext,
  nodeId: string,
  immediate?: boolean,
  options?: CorrelationRouteOptions
) => Promise<CommandResult>;

export type RouteScanHostsCommand = (
  context: CommandDispatchContext,
  options?: CorrelationRouteOptions
) => Promise<RoutedHostScanDispatchResult>;

export type RouteScanHostPortsCommand = (
  context: CommandDispatchContext,
  fqn: string,
  options?: ScanHostPortsRouteOptions
) => Promise<RoutedHostPortScanResult>;

export type RouteUpdateHostCommand = (
  context: CommandDispatchContext,
  fqn: string,
  hostData: HostUpdateData,
  options?: HostPowerRouteOptions
) => Promise<CommandResult>;

export type RouteDeleteHostCommand = (
  context: CommandDispatchContext,
  fqn: string,
  options?: HostPowerRouteOptions
) => Promise<CommandResult>;
