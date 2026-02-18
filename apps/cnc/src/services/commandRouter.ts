import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CncCommand, CommandResult, HostPingResponse, WakeupResponse } from '../types';
import { NodeManager } from './nodeManager';
import { HostAggregator } from './hostAggregator';
import logger from '../utils/logger';
import { CommandModel } from '../models/Command';
import config from '../config';
import type { HostStatus, WakeVerifyOptions } from '@kaonis/woly-protocol';
import { runtimeMetrics } from './runtimeMetrics';
import type { CommandRecord } from '../types';

type DispatchCommand = Extract<CncCommand, { commandId: string }>;

// Host update data structure from API
interface HostUpdateData {
  name?: string;
  mac?: string;
  ip?: string;
  wolPort?: number;
  status?: HostStatus;
  notes?: string | null;
  tags?: string[];
}

type PingHostCommandResult = {
  hostPing: NonNullable<CommandResult['hostPing']>;
  correlationId?: string;
};

type RoutedHostPortScanResult = {
  commandId: string;
  nodeId: string;
  message?: string;
  hostPortScan: NonNullable<CommandResult['hostPortScan']>;
  correlationId?: string;
};

type RoutedHostScanDispatchResult = {
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

/**
 * CommandRouter
 * 
 * Routes commands from the mobile app API to the appropriate node agents.
 * Handles command execution, result tracking, timeouts, and error scenarios.
 * 
 * Flow:
 * 1. Parse FQN to determine owning node (via location)
 * 2. Queue command in durable storage
 * 3. If node is online, send command via NodeManager; otherwise keep queued
 * 4. Wait for command result (with timeout) when dispatched synchronously
 * 5. Return immediate queued response or execution result
 */
export class CommandRouter extends EventEmitter {
  private nodeManager: NodeManager;
  private hostAggregator: HostAggregator;
  private readonly boundHandleCommandResult: (result: CommandResult) => void;
  private readonly boundHandleNodeConnected: (event: { nodeId: string }) => void;
  private pendingCommands: Map<string, {
    resolvers: Array<{
      resolve: (result: CommandResult) => void;
      reject: (error: Error) => void;
    }>;
    timeout: NodeJS.Timeout;
    correlationId: string | null;
    commandType: DispatchCommand['type'];
  }>;
  /**
   * Maps commandId → FQN for wake commands awaiting async verification.
   * Populated after the initial wake ack resolves; consumed when the
   * node-agent sends a follow-up command-result containing wakeVerification data.
   */
  private readonly wakeVerificationCommands = new Map<string, string>();
  readonly commandTimeout: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly offlineCommandTtlMs: number;
  private readonly flushingNodes = new Set<string>();

  constructor(nodeManager: NodeManager, hostAggregator: HostAggregator) {
    super();
    this.nodeManager = nodeManager;
    this.hostAggregator = hostAggregator;
    this.pendingCommands = new Map();
    this.commandTimeout = config.commandTimeout;
    this.maxRetries = config.commandMaxRetries;
    this.retryBaseDelayMs = config.commandRetryBaseDelayMs;
    this.offlineCommandTtlMs = config.offlineCommandTtlMs;

    // Listen for command results from nodes
    this.boundHandleCommandResult = this.handleCommandResult.bind(this);
    this.nodeManager.on('command-result', this.boundHandleCommandResult);
    this.boundHandleNodeConnected = this.handleNodeConnected.bind(this);
    this.nodeManager.on('node-connected', this.boundHandleNodeConnected);
  }

  async reconcileStaleInFlight(): Promise<number> {
    return CommandModel.reconcileStaleInFlight(this.commandTimeout);
  }

  /**
   * Route a Wake-on-LAN command to the appropriate node
   * 
   * @param fqn Fully qualified name (hostname@location)
   * @returns Promise with wake-up result
   */
  async routeWakeCommand(
    fqn: string,
    options?: {
      idempotencyKey?: string | null;
      correlationId?: string | null;
      wolPort?: number | null;
      verify?: WakeVerifyOptions | null;
    }
  ): Promise<WakeupResponse> {
    logger.info(`Routing wake command for ${fqn}`);

    // Parse FQN to get hostname and location
    const { hostname, location } = this.parseFQN(fqn);

    // Get host from aggregated database
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    const nodeId = host.nodeId;

    // Create command — include verify options if requested
    const commandId = this.generateCommandId();
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
      }
    };

    // Send command and wait for result
    const correlationId = options?.correlationId ?? null;
    const result = await this.executeCommand(nodeId, command, {
      idempotencyKey: options?.idempotencyKey ?? null,
      correlationId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Wake command failed');
    }

    // Track this command for wake verification correlation
    if (verify) {
      this.trackWakeVerificationCommand(commandId, fqn);
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
  }

  /**
   * Track a wake command that is awaiting async verification.
   * Called after the initial ack resolves so the follow-up command-result
   * (containing wakeVerification data) can be correlated back to the FQN.
   */
  private trackWakeVerificationCommand(commandId: string, fqn: string): void {
    this.wakeVerificationCommands.set(commandId, fqn);
    logger.debug('Tracking wake verification command', { commandId, fqn });
  }

  /**
   * Route a host ping command to the appropriate node.
   *
   * @param fqn Fully qualified name (hostname@location)
   * @returns Promise with host ping response
   */
  async routePingHostCommand(
    fqn: string,
    options?: { correlationId?: string | null }
  ): Promise<HostPingResponse> {
    logger.info(`Routing ping-host command for ${fqn}`);

    const { location } = this.parseFQN(fqn);
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    const nodeId = host.nodeId;
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} (${location}) is offline`);
    }

    const commandId = this.generateCommandId();
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
    const result = await this.executeCommand(nodeId, command, {
      idempotencyKey: null,
      correlationId,
    });
    const pingResult = this.assertPingHostResult(result);

    return {
      target: fqn,
      checkedAt: pingResult.hostPing.checkedAt,
      latencyMs: pingResult.hostPing.latencyMs,
      success: pingResult.hostPing.reachable,
      status: pingResult.hostPing.status,
      source: 'node-agent',
      correlationId: pingResult.correlationId ?? correlationId ?? undefined,
    };
  }

  /**
   * Route a scan command to a specific node
   * 
   * @param nodeId Node identifier
   * @param immediate Whether to scan immediately
   * @returns Promise with command result
   */
  async routeScanCommand(
    nodeId: string,
    immediate = true,
    options?: { correlationId?: string | null }
  ): Promise<CommandResult> {
    logger.info(`Routing scan command to node ${nodeId}`);

    // Scan remains immediate-only. If the node is offline, fail fast.
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} is offline`);
    }

    // Create command
    const commandId = this.generateCommandId();
    const command: DispatchCommand = {
      type: 'scan',
      commandId,
      data: { immediate }
    };

    // Send command and wait for result
    return this.executeCommand(nodeId, command, {
      idempotencyKey: null,
      correlationId: options?.correlationId ?? null,
    });
  }

  /**
   * Route a scan command to all currently connected nodes.
   */
  async routeScanHostsCommand(
    options?: { correlationId?: string | null }
  ): Promise<RoutedHostScanDispatchResult> {
    const connectedNodes = this.nodeManager.getConnectedNodes();
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
          const result = await this.routeScanCommand(nodeId, true, { correlationId });
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
      })
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
        (entry) => typeof entry.result.correlationId === 'string' && entry.result.correlationId.trim().length > 0,
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
  }

  /**
   * Route a per-host TCP port scan command to the host's managing node.
   */
  async routeScanHostPortsCommand(
    fqn: string,
    options?: { correlationId?: string | null; ports?: number[] | null; timeoutMs?: number | null }
  ): Promise<RoutedHostPortScanResult> {
    logger.info(`Routing scan-host-ports command for ${fqn}`);

    const { location } = this.parseFQN(fqn);
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    const nodeId = host.nodeId;
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} (${location}) is offline`);
    }

    const commandId = this.generateCommandId();
    const commandData: Extract<DispatchCommand, { type: 'scan-host-ports' }>['data'] = {
      hostName: host.name,
      mac: host.mac,
      ip: host.ip,
    };

    const normalizedPorts = this.normalizePortList(options?.ports ?? null);
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
    const result = await this.executeCommand(nodeId, command, {
      idempotencyKey: null,
      correlationId,
    });
    const scanResult = this.assertHostPortScanResult(result);

    return {
      commandId: result.commandId,
      nodeId,
      message: result.message,
      hostPortScan: scanResult.hostPortScan,
      correlationId: scanResult.correlationId ?? correlationId ?? undefined,
    };
  }

  /**
   * Route an update-host command to the appropriate node
   * 
   * @param fqn Fully qualified name (hostname@location)
   * @param hostData Updated host data
   * @returns Promise with command result
   */
  async routeUpdateHostCommand(
    fqn: string,
    hostData: HostUpdateData,
    options?: { idempotencyKey?: string | null; correlationId?: string | null }
  ): Promise<CommandResult> {
    logger.info(`Routing update-host command for ${fqn}`);

    // Get host from aggregated database
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    const nodeId = host.nodeId;
    // Create command
    const commandId = this.generateCommandId();
    const command: DispatchCommand = {
      type: 'update-host',
      commandId,
      data: {
        currentName: host.name,
        name: hostData.name ?? host.name,
        mac: hostData.mac ?? host.mac,
        ip: hostData.ip ?? host.ip,
        wolPort: hostData.wolPort ?? host.wolPort,
        status: hostData.status ?? host.status,
        notes: hostData.notes !== undefined ? hostData.notes : host.notes,
        tags: hostData.tags !== undefined ? hostData.tags : host.tags,
      },
    };

    // Send command and wait for result
    return this.executeCommand(nodeId, command, {
      idempotencyKey: options?.idempotencyKey ?? null,
      correlationId: options?.correlationId ?? null,
    });
  }

  /**
   * Route a delete-host command to the appropriate node
   * 
   * @param fqn Fully qualified name (hostname@location)
   * @returns Promise with command result
   */
  async routeDeleteHostCommand(
    fqn: string,
    options?: { idempotencyKey?: string | null; correlationId?: string | null }
  ): Promise<CommandResult> {
    logger.info(`Routing delete-host command for ${fqn}`);

    // Parse FQN to get hostname
    const { hostname } = this.parseFQN(fqn);

    // Get host from aggregated database
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    const nodeId = host.nodeId;
    // Create command
    const commandId = this.generateCommandId();
    const command: DispatchCommand = {
      type: 'delete-host',
      commandId,
      data: { name: hostname }
    };

    // Send command and wait for result
    const result = await this.executeCommand(nodeId, command, {
      idempotencyKey: options?.idempotencyKey ?? null,
      correlationId: options?.correlationId ?? null,
    });

    // Remove from aggregated database only when the command is acknowledged.
    if (result.success && result.state === 'acknowledged') {
      await this.hostAggregator.onHostRemoved({
        nodeId,
        name: hostname
      });
    }

    return result;
  }

  /**
   * Execute a command on a node and wait for result
   * 
   * @param nodeId Node identifier
   * @param command Command to execute
   * @returns Promise with command result
   */
  private async executeCommand(
    nodeId: string,
    command: DispatchCommand,
    options: { idempotencyKey: string | null; correlationId: string | null }
  ): Promise<CommandResult> {
    const scopedIdempotencyKey = this.scopeIdempotencyKey(command.type, options.idempotencyKey);
    const record = await CommandModel.enqueue({
      id: command.commandId,
      nodeId,
      type: command.type,
      payload: command,
      idempotencyKey: scopedIdempotencyKey,
    });

    const effectiveCommandId = record.id;

    // Terminal states: return immediately for idempotent retries.
    if (record.state === 'acknowledged') {
      logger.debug('Command already acknowledged, returning cached result', {
        commandId: effectiveCommandId,
        totalAttempts: record.retryCount,
      });
      return {
        commandId: effectiveCommandId,
        success: true,
        state: 'acknowledged',
        timestamp: record.completedAt ?? record.updatedAt,
        correlationId: options.correlationId ?? undefined,
      };
    }

    if (record.state === 'failed' || record.state === 'timed_out') {
      logger.warn('Command in terminal state', {
        commandId: effectiveCommandId,
        state: record.state,
        totalAttempts: record.retryCount,
        maxRetries: this.maxRetries,
      });
      return {
        commandId: effectiveCommandId,
        success: false,
        state: record.state,
        error: record.error ?? 'Command failed',
        timestamp: record.completedAt ?? record.updatedAt,
        correlationId: options.correlationId ?? undefined,
      };
    }

    if (record.state === 'queued' && !this.nodeManager.isNodeConnected(nodeId)) {
      logger.info('Queued command for offline node', {
        commandId: effectiveCommandId,
        nodeId,
        type: command.type,
      });
      return {
        commandId: effectiveCommandId,
        success: true,
        state: 'queued',
        message: this.buildQueuedMessage(),
        timestamp: record.updatedAt,
        correlationId: options.correlationId ?? undefined,
      };
    }

    const payloadToSend = record.payload as DispatchCommand;

    return new Promise((resolve, reject) => {
      const existingPending = this.pendingCommands.get(effectiveCommandId);
      if (existingPending) {
        existingPending.resolvers.push({ resolve, reject });
        return;
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        const pending = this.pendingCommands.get(effectiveCommandId);
        this.pendingCommands.delete(effectiveCommandId);
        runtimeMetrics.recordCommandTimeout(effectiveCommandId, Date.now(), command.type);
        
        const attemptNumber = record.retryCount + 1; // Current attempt number
        const error = new Error(`Command ${effectiveCommandId} timed out after ${this.commandTimeout}ms (attempt ${attemptNumber}/${this.maxRetries})`);
        
        CommandModel.markTimedOut(effectiveCommandId, error.message).catch((err) => {
          logger.error('Failed to mark command as timed out', {
            commandId: effectiveCommandId,
            attemptNumber,
            error: err instanceof Error ? err.message : String(err)
          });
        });

        // Reject all pending resolvers on timeout
        if (pending) {
          for (const resolver of pending.resolvers) {
            resolver.reject(error);
          }
        }
      }, this.commandTimeout);

      this.pendingCommands.set(effectiveCommandId, {
        resolvers: [{ resolve, reject }],
        timeout,
        correlationId: options.correlationId,
        commandType: command.type,
      });

      if (record.state !== 'queued') {
        logger.debug(`Command ${effectiveCommandId} already ${record.state}; not resending`);
        return;
      }

      void this.dispatchPersistedCommand({
        nodeId,
        commandId: effectiveCommandId,
        commandType: command.type,
        payload: payloadToSend,
        retryCount: record.retryCount,
        timeout,
        correlationId: options.correlationId,
        applyBackoff: record.state === 'queued',
      });
    });
  }

  private async dispatchPersistedCommand(params: {
    nodeId: string;
    commandId: string;
    commandType: DispatchCommand['type'];
    payload: DispatchCommand;
    retryCount: number;
    timeout: NodeJS.Timeout;
    correlationId: string | null;
    applyBackoff: boolean;
  }): Promise<void> {
    const {
      nodeId,
      commandId,
      commandType,
      payload,
      retryCount,
      timeout,
      correlationId,
      applyBackoff,
    } = params;

    try {
      if (applyBackoff && retryCount > 0) {
        const attemptNumber = retryCount;
        const backoffDelay = this.calculateBackoffDelay(attemptNumber - 1);
        logger.info('Applying exponential backoff before retry', {
          commandId,
          attemptNumber,
          backoffDelayMs: Math.round(backoffDelay),
        });
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }

      this.nodeManager.sendCommand(nodeId, payload);
      runtimeMetrics.recordCommandDispatched(commandId, commandType, correlationId);
      await CommandModel.markSent(commandId);

      logger.debug('Sent command to node', {
        commandId,
        nodeId,
        attemptNumber: retryCount + 1,
        type: commandType,
      });
    } catch (error) {
      const pending = this.pendingCommands.get(commandId);
      clearTimeout(timeout);
      this.pendingCommands.delete(commandId);

      const message = error instanceof Error ? error.message : String(error);
      const err = error instanceof Error ? error : new Error(message);

      await CommandModel.markFailed(commandId, message);
      runtimeMetrics.recordCommandResult(commandId, false, Date.now(), commandType);

      logger.error('Failed to send command', {
        commandId,
        nodeId,
        attemptNumber: retryCount + 1,
        error: message,
      });

      if (pending) {
        for (const resolver of pending.resolvers) {
          resolver.reject(err);
        }
      }
    }
  }

  /**
   * Handle command result from a node
   * 
   * @param result Command result
   */
  private handleCommandResult(result: CommandResult): void {
    void this.applyCommandResult(result);
  }

  private async applyCommandResult(result: CommandResult): Promise<void> {
    const pending = this.pendingCommands.get(result.commandId);
    const persistedCommand = pending ? null : await this.resolvePersistedCommand(result.commandId);
    const metricCommandType = pending?.commandType ?? persistedCommand?.type ?? null;
    runtimeMetrics.recordCommandResult(
      result.commandId,
      result.success,
      Date.now(),
      metricCommandType
    );
    logger.debug('Received command result', {
      commandId: result.commandId,
      success: result.success,
      error: result.error,
      correlationId: runtimeMetrics.lookupCorrelationId(result.commandId),
    });
    
    // Always persist the result state, even if no pending resolver exists
    // (e.g., after a process restart or if the HTTP caller disconnected)
    const correlationId =
      pending?.correlationId ?? runtimeMetrics.lookupCorrelationId(result.commandId) ?? undefined;
    if (result.success) {
      CommandModel.markAcknowledged(result.commandId).then(() => {
        logger.info('Command acknowledged', {
          commandId: result.commandId,
          correlationId,
        });
      }).catch((error) => {
        logger.error('Failed to mark command as acknowledged', {
          commandId: result.commandId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } else {
      CommandModel.markFailed(result.commandId, result.error || 'Command failed').then(() => {
        logger.warn('Command failed', {
          commandId: result.commandId,
          error: result.error,
          correlationId,
        });
      }).catch((error) => {
        logger.error('Failed to mark command as failed', {
          commandId: result.commandId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    if (!pending) {
      // Check if this is a follow-up wake verification result
      const verificationFqn = this.wakeVerificationCommands.get(result.commandId);
      if (verificationFqn && result.wakeVerification) {
        this.wakeVerificationCommands.delete(result.commandId);
        logger.info('Wake verification follow-up received', {
          commandId: result.commandId,
          fqn: verificationFqn,
          status: result.wakeVerification.status,
          attempts: result.wakeVerification.attempts,
          elapsedMs: result.wakeVerification.elapsedMs,
        });
        this.emit('wake-verification-complete', {
          commandId: result.commandId,
          fullyQualifiedName: verificationFqn,
          wakeVerification: result.wakeVerification,
        });
        return;
      }

      if (persistedCommand) {
        logger.debug('Processed async command result without active HTTP waiter', {
          commandId: result.commandId,
          state: persistedCommand.state,
        });
        return;
      }

      logger.warn(`Received result for unknown command: ${result.commandId}`);
      return;
    }

    // Clear timeout and resolve/reject promises
    clearTimeout(pending.timeout);
    this.pendingCommands.delete(result.commandId);

    if (result.success) {
      for (const resolver of pending.resolvers) {
        resolver.resolve({ ...result, correlationId, state: 'acknowledged' });
      }
      return;
    }

    for (const resolver of pending.resolvers) {
      resolver.reject(new Error(result.error || 'Command failed'));
    }
  }

  private async resolvePersistedCommand(commandId: string): Promise<CommandRecord | null> {
    try {
      return await CommandModel.findById(commandId);
    } catch (error) {
      logger.warn('Failed to resolve persisted command for result attribution', {
        commandId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private handleNodeConnected(event: { nodeId: string }): void {
    const { nodeId } = event;
    if (this.flushingNodes.has(nodeId)) {
      return;
    }

    this.flushingNodes.add(nodeId);
    void this.flushQueuedCommandsForNode(nodeId).finally(() => {
      this.flushingNodes.delete(nodeId);
    });
  }

  private async flushQueuedCommandsForNode(nodeId: string): Promise<void> {
    const queued = await CommandModel.listQueuedByNode(nodeId, { limit: 500 });
    if (queued.length === 0) {
      return;
    }

    logger.info('Flushing queued commands for reconnected node', {
      nodeId,
      queuedCount: queued.length,
    });

    for (const record of queued) {
      if (this.isQueuedCommandExpired(record)) {
        await CommandModel.markFailed(record.id, this.buildQueueExpiryMessage());
        continue;
      }

      const payload = this.asDispatchCommand(record.payload);
      if (!payload) {
        await CommandModel.markFailed(record.id, 'Queued command payload is invalid');
        continue;
      }

      const existingPending = this.pendingCommands.get(record.id);
      if (existingPending) {
        continue;
      }

      const timeout = setTimeout(() => {
        const pending = this.pendingCommands.get(record.id);
        this.pendingCommands.delete(record.id);
        runtimeMetrics.recordCommandTimeout(record.id, Date.now(), payload.type);

        const attemptNumber = record.retryCount + 1;
        const error = new Error(
          `Command ${record.id} timed out after ${this.commandTimeout}ms (attempt ${attemptNumber}/${this.maxRetries})`
        );

        CommandModel.markTimedOut(record.id, error.message).catch((err) => {
          logger.error('Failed to mark command as timed out', {
            commandId: record.id,
            attemptNumber,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        if (pending) {
          for (const resolver of pending.resolvers) {
            resolver.reject(error);
          }
        }
      }, this.commandTimeout);

      this.pendingCommands.set(record.id, {
        resolvers: [],
        timeout,
        correlationId: null,
        commandType: payload.type,
      });

      await this.dispatchPersistedCommand({
        nodeId,
        commandId: record.id,
        commandType: payload.type,
        payload,
        retryCount: record.retryCount,
        timeout,
        correlationId: null,
        applyBackoff: true,
      });
    }
  }

  private asDispatchCommand(payload: unknown): DispatchCommand | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const candidate = payload as Partial<DispatchCommand>;
    if (typeof candidate.type !== 'string' || typeof candidate.commandId !== 'string') {
      return null;
    }

    return candidate as DispatchCommand;
  }

  private isQueuedCommandExpired(record: Pick<CommandRecord, 'createdAt'>): boolean {
    const ageMs = Date.now() - record.createdAt.getTime();
    return ageMs >= this.offlineCommandTtlMs;
  }

  private buildQueuedMessage(): string {
    return 'Command queued (node offline)';
  }

  private buildQueueExpiryMessage(): string {
    return `Command expired in offline queue after ${this.offlineCommandTtlMs}ms`;
  }

  /**
   * Parse fully qualified name into hostname and location
   * 
   * @param fqn Fully qualified name (hostname@location)
   * @returns Object with hostname and location
   */
  private parseFQN(fqn: string): { hostname: string; location: string } {
    const parts = fqn.split('@');
    if (parts.length !== 2) {
      throw new Error(`Invalid FQN format: ${fqn}. Expected hostname@location`);
    }

    const hostname = parts[0]?.trim();
    const encodedLocation = parts[1]?.trim();
    if (!hostname || !encodedLocation) {
      throw new Error(`Invalid FQN format: ${fqn}. Expected hostname@location`);
    }

    let location: string;
    try {
      location = decodeURIComponent(encodedLocation);
    } catch {
      throw new Error(`Invalid FQN encoding: ${fqn}`);
    }

    if (location.length === 0) {
      throw new Error(`Invalid FQN format: ${fqn}. Expected hostname@location`);
    }

    return {
      hostname,
      location,
    };
  }

  /**
   * Generate a unique command ID
   * 
   * @returns Command ID
   */
  private generateCommandId(): string {
    return `cmd_${randomUUID()}`;
  }

  private scopeIdempotencyKey(
    commandType: DispatchCommand['type'],
    idempotencyKey: string | null
  ): string | null {
    if (!idempotencyKey) {
      return null;
    }

    const trimmed = idempotencyKey.trim();
    if (trimmed.length === 0) {
      return null;
    }

    return `${commandType}:${trimmed}`;
  }

  private normalizePortList(ports: number[] | null): number[] | null {
    if (!Array.isArray(ports)) {
      return null;
    }

    const unique = new Set<number>();
    for (const port of ports) {
      if (!Number.isInteger(port)) {
        continue;
      }
      if (port < 1 || port > 65535) {
        continue;
      }
      unique.add(port);
      if (unique.size >= 1024) {
        break;
      }
    }

    if (unique.size === 0) {
      return null;
    }

    return Array.from(unique).sort((a, b) => a - b);
  }

  /**
   * Calculate exponential backoff delay with jitter
   * 
   * @param retryCount Current retry attempt (0-based)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * 2^retryCount
    // Add jitter (±25%) to prevent thundering herd
    const exponentialDelay = this.retryBaseDelayMs * Math.pow(2, retryCount);
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1); // ±25%
    const delayWithJitter = Math.max(0, exponentialDelay + jitter);
    
    // Cap at commandTimeout to ensure we don't delay longer than timeout
    return Math.min(delayWithJitter, this.commandTimeout / 2);
  }

  /**
   * Get statistics about pending commands
   * 
   * @returns Object with pending command count
   */
  public getStats(): { pendingCommands: number } {
    return {
      pendingCommands: this.pendingCommands.size
    };
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear all pending commands
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeout);
      for (const resolver of pending.resolvers) {
        resolver.reject(new Error('CommandRouter shutting down'));
      }
    }
    this.pendingCommands.clear();
    this.wakeVerificationCommands.clear();
    this.flushingNodes.clear();
    this.nodeManager.off('command-result', this.boundHandleCommandResult);
    this.nodeManager.off('node-connected', this.boundHandleNodeConnected);
    this.removeAllListeners();
  }

  private assertPingHostResult(result: CommandResult): PingHostCommandResult {
    if (!result.success) {
      throw new Error(result.error ?? 'Ping command failed');
    }

    if (!result.hostPing) {
      throw new Error('Ping command result missing host ping payload');
    }

    return {
      hostPing: result.hostPing,
      correlationId: result.correlationId,
    };
  }

  private assertHostPortScanResult(result: CommandResult): {
    hostPortScan: NonNullable<CommandResult['hostPortScan']>;
    correlationId?: string;
  } {
    if (!result.success) {
      throw new Error(result.error ?? 'Port scan command failed');
    }

    if (!result.hostPortScan) {
      throw new Error('Port scan command result missing host port payload');
    }

    return {
      hostPortScan: result.hostPortScan,
      correlationId: result.correlationId,
    };
  }
}
