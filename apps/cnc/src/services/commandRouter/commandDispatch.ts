import type { HostPowerAction } from '@kaonis/woly-protocol';
import logger from '../../utils/logger';
import type {
  CommandResult,
  HostPingResponse,
  HostPowerResponse,
  WakeupResponse,
} from '../../types';
import type {
  CommandDispatchContext,
  CorrelationRouteOptions,
  DispatchCommand,
  HostPowerRouteOptions,
  HostUpdateData,
  RouteDeleteHostCommand,
  RouteHostPowerCommand,
  RoutePingHostCommand,
  RouteScanCommand,
  RouteScanHostPortsCommand,
  RouteScanHostsCommand,
  RouteUpdateHostCommand,
  RouteWakeCommand,
  RoutedHostPortScanResult,
  RoutedHostScanDispatchResult,
  ScanHostPortsRouteOptions,
  WakeRouteOptions,
} from './types';

export const routeWakeCommand: RouteWakeCommand = async (
  context: CommandDispatchContext,
  fqn: string,
  options?: WakeRouteOptions,
): Promise<WakeupResponse> => {
  logger.info(`Routing wake command for ${fqn}`);

  const { hostname, location } = context.parseFQN(fqn);

  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const commandId = context.generateCommandId();
  const verify = options?.verify ?? null;
  const wolPort = options?.wolPort ?? host.wolPort;
  const command: DispatchCommand = {
    type: 'wake',
    commandId,
    data: {
      hostName: hostname,
      mac: host.mac,
      ...(typeof wolPort === 'number' ? { wolPort } : {}),
      ...(verify ? { verify } : {}),
    },
  };

  const correlationId = options?.correlationId ?? null;
  const result = await context.executeCommand(nodeId, command, {
    idempotencyKey: options?.idempotencyKey ?? null,
    correlationId,
  });

  if (!result.success) {
    throw new Error(result.error || 'Wake command failed');
  }

  if (verify) {
    context.trackWakeVerificationCommand(commandId, fqn);
  }

  const response: WakeupResponse = {
    success: true,
    message:
      result.state === 'queued'
        ? `Wake command queued for ${fqn} (node offline)`
        : `Wake-on-LAN packet sent to ${fqn}`,
    nodeId,
    location,
    commandId: result.commandId,
    correlationId: result.correlationId ?? correlationId ?? undefined,
  };
  if (result.state) {
    response.state = result.state;
  }

  if (verify) {
    response.wakeVerification = {
      status: 'pending',
      startedAt: new Date().toISOString(),
    };
  }

  return response;
};

export const routePingHostCommand: RoutePingHostCommand = async (
  context: CommandDispatchContext,
  fqn: string,
  options?: CorrelationRouteOptions,
): Promise<HostPingResponse> => {
  logger.info(`Routing ping-host command for ${fqn}`);

  const { location } = context.parseFQN(fqn);
  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const nodeStatus = await context.nodeManager.getNodeStatus(nodeId);
  if (nodeStatus !== 'online') {
    throw new Error(`Node ${nodeId} (${location}) is offline`);
  }

  const commandId = context.generateCommandId();
  const command: DispatchCommand = {
    type: 'ping-host',
    commandId,
    data: {
      hostName: host.name,
      mac: host.mac,
      ip: host.ip,
    },
  };

  const correlationId = options?.correlationId ?? null;
  const result = await context.executeCommand(nodeId, command, {
    idempotencyKey: null,
    correlationId,
  });
  const pingResult = context.assertPingHostResult(result);

  return {
    target: fqn,
    checkedAt: pingResult.hostPing.checkedAt,
    latencyMs: pingResult.hostPing.latencyMs,
    success: pingResult.hostPing.reachable,
    status: pingResult.hostPing.status,
    source: 'node-agent',
    correlationId: pingResult.correlationId ?? correlationId ?? undefined,
  };
};

export const routeHostPowerCommand: RouteHostPowerCommand = async (
  context: CommandDispatchContext,
  action: HostPowerAction,
  fqn: string,
  options?: HostPowerRouteOptions,
): Promise<HostPowerResponse> => {
  logger.info(`Routing ${action} command for ${fqn}`);

  const { location } = context.parseFQN(fqn);
  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const nodeStatus = await context.nodeManager.getNodeStatus(nodeId);
  if (nodeStatus !== 'online') {
    throw new Error(`Node ${nodeId} (${location}) is offline`);
  }

  const commandId = context.generateCommandId();
  const command: DispatchCommand =
    action === 'sleep'
      ? {
          type: 'sleep-host',
          commandId,
          data: {
            hostName: host.name,
            mac: host.mac,
            ip: host.ip,
            confirmation: 'sleep',
          },
        }
      : {
          type: 'shutdown-host',
          commandId,
          data: {
            hostName: host.name,
            mac: host.mac,
            ip: host.ip,
            confirmation: 'shutdown',
          },
        };

  const correlationId = options?.correlationId ?? null;
  const result = await context.executeCommand(nodeId, command, {
    idempotencyKey: options?.idempotencyKey ?? null,
    correlationId,
  });

  if (!result.success) {
    throw new Error(result.error || `${action} command failed`);
  }

  const response: HostPowerResponse = {
    success: true,
    action,
    message: result.message ?? `${action} command executed for ${fqn}`,
    nodeId,
    location,
    commandId: result.commandId,
    correlationId: result.correlationId ?? correlationId ?? undefined,
  };

  if (result.state) {
    response.state = result.state;
  }

  return response;
};

export const routeScanCommand: RouteScanCommand = async (
  context: CommandDispatchContext,
  nodeId: string,
  immediate = true,
  options?: CorrelationRouteOptions,
): Promise<CommandResult> => {
  logger.info(`Routing scan command to node ${nodeId}`);

  const nodeStatus = await context.nodeManager.getNodeStatus(nodeId);
  if (nodeStatus !== 'online') {
    throw new Error(`Node ${nodeId} is offline`);
  }

  const commandId = context.generateCommandId();
  const command: DispatchCommand = {
    type: 'scan',
    commandId,
    data: { immediate },
  };

  return context.executeCommand(nodeId, command, {
    idempotencyKey: null,
    correlationId: options?.correlationId ?? null,
  });
};

export const routeScanHostsCommand: RouteScanHostsCommand = async (
  context: CommandDispatchContext,
  options?: CorrelationRouteOptions,
): Promise<RoutedHostScanDispatchResult> => {
  const connectedNodes = context.nodeManager.getConnectedNodes();
  if (connectedNodes.length === 0) {
    throw new Error('All nodes are offline; no connected nodes available for scan');
  }

  logger.info('Routing scan command across connected nodes', {
    nodeCount: connectedNodes.length,
  });

  const queuedAt = new Date().toISOString();
  const correlationId = options?.correlationId ?? null;

  const settled = await Promise.all(
    connectedNodes.map(async (nodeId) => {
      try {
        const result = await context.routeScanCommand(nodeId, true, { correlationId });
        return {
          nodeId,
          success: true as const,
          result,
        };
      } catch (error) {
        return {
          nodeId,
          success: false as const,
          error,
        };
      }
    }),
  );

  const successful = settled.filter(
    (entry): entry is { nodeId: string; success: true; result: CommandResult } => entry.success,
  );

  if (successful.length === 0) {
    const failed = settled.find(
      (entry): entry is { nodeId: string; success: false; error: unknown } => !entry.success,
    );
    const message = failed
      ? failed.error instanceof Error
        ? failed.error.message
        : String(failed.error)
      : 'Failed to dispatch scan command';
    throw new Error(message);
  }

  const completedAt = new Date().toISOString();
  const failedCount = settled.length - successful.length;
  const message =
    failedCount === 0
      ? `Scan command dispatched to ${successful.length} connected node(s).`
      : `Scan command dispatched to ${successful.length} node(s); ${failedCount} node(s) failed to accept the command.`;

  const responseCorrelationId =
    successful.find(
      (entry) =>
        typeof entry.result.correlationId === 'string' &&
        entry.result.correlationId.trim().length > 0,
    )?.result.correlationId ??
    correlationId ??
    undefined;

  return {
    state: 'acknowledged',
    queuedAt,
    startedAt: queuedAt,
    completedAt,
    lastScanAt: completedAt,
    commandId: successful[0]?.result.commandId,
    message,
    ...(responseCorrelationId ? { correlationId: responseCorrelationId } : {}),
    nodeResults: settled.map((entry) => {
      if (entry.success) {
        return {
          nodeId: entry.nodeId,
          commandId: entry.result.commandId,
          state: 'acknowledged' as const,
          message: entry.result.message,
        };
      }

      return {
        nodeId: entry.nodeId,
        state: 'failed' as const,
        error: entry.error instanceof Error ? entry.error.message : String(entry.error),
      };
    }),
  };
};

export const routeScanHostPortsCommand: RouteScanHostPortsCommand = async (
  context: CommandDispatchContext,
  fqn: string,
  options?: ScanHostPortsRouteOptions,
): Promise<RoutedHostPortScanResult> => {
  logger.info(`Routing scan-host-ports command for ${fqn}`);

  const { location } = context.parseFQN(fqn);
  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const nodeStatus = await context.nodeManager.getNodeStatus(nodeId);
  if (nodeStatus !== 'online') {
    throw new Error(`Node ${nodeId} (${location}) is offline`);
  }

  const commandId = context.generateCommandId();
  const commandData: Extract<DispatchCommand, { type: 'scan-host-ports' }>['data'] = {
    hostName: host.name,
    mac: host.mac,
    ip: host.ip,
  };

  const normalizedPorts = context.normalizePortList(options?.ports ?? null);
  if (normalizedPorts) {
    commandData.ports = normalizedPorts;
  }

  if (typeof options?.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)) {
    commandData.timeoutMs = Math.trunc(options.timeoutMs);
  }

  const command: DispatchCommand = {
    type: 'scan-host-ports',
    commandId,
    data: commandData,
  };

  const correlationId = options?.correlationId ?? null;
  const result = await context.executeCommand(nodeId, command, {
    idempotencyKey: null,
    correlationId,
  });
  const scanResult = context.assertHostPortScanResult(result);

  return {
    commandId: result.commandId,
    nodeId,
    message: result.message,
    hostPortScan: scanResult.hostPortScan,
    correlationId: scanResult.correlationId ?? correlationId ?? undefined,
  };
};

export const routeUpdateHostCommand: RouteUpdateHostCommand = async (
  context: CommandDispatchContext,
  fqn: string,
  hostData: HostUpdateData,
  options?: HostPowerRouteOptions,
): Promise<CommandResult> => {
  logger.info(`Routing update-host command for ${fqn}`);

  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const commandId = context.generateCommandId();
  const command: DispatchCommand = {
    type: 'update-host',
    commandId,
    data: {
      currentName: host.name,
      name: hostData.name ?? host.name,
      mac: hostData.mac ?? host.mac,
      secondaryMacs: hostData.secondaryMacs ?? host.secondaryMacs,
      ip: hostData.ip ?? host.ip,
      wolPort: hostData.wolPort ?? host.wolPort,
      status: hostData.status ?? host.status,
      notes: hostData.notes !== undefined ? hostData.notes : host.notes,
      tags: hostData.tags !== undefined ? hostData.tags : host.tags,
      ...(hostData.powerControl !== undefined || host.powerControl !== undefined
        ? {
            powerControl:
              hostData.powerControl !== undefined ? hostData.powerControl : host.powerControl,
          }
        : {}),
    },
  };

  return context.executeCommand(nodeId, command, {
    idempotencyKey: options?.idempotencyKey ?? null,
    correlationId: options?.correlationId ?? null,
  });
};

export const routeDeleteHostCommand: RouteDeleteHostCommand = async (
  context: CommandDispatchContext,
  fqn: string,
  options?: HostPowerRouteOptions,
): Promise<CommandResult> => {
  logger.info(`Routing delete-host command for ${fqn}`);

  const { hostname } = context.parseFQN(fqn);
  const host = await context.hostAggregator.getHostByFQN(fqn);
  if (!host) {
    throw new Error(`Host not found: ${fqn}`);
  }

  const nodeId = host.nodeId;
  const commandId = context.generateCommandId();
  const command: DispatchCommand = {
    type: 'delete-host',
    commandId,
    data: { name: hostname },
  };

  const result = await context.executeCommand(nodeId, command, {
    idempotencyKey: options?.idempotencyKey ?? null,
    correlationId: options?.correlationId ?? null,
  });

  if (result.success && result.state === 'acknowledged') {
    await context.hostAggregator.onHostRemoved({
      nodeId,
      name: hostname,
    });
  }

  return result;
};
