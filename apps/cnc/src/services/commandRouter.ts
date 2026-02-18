import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { HostPowerAction } from '@kaonis/woly-protocol';
import type {
  CommandResult,
  HostPingResponse,
  HostPowerResponse,
  WakeupResponse,
  CommandRecord,
} from '../types';
import { CommandModel } from '../models/Command';
import config from '../config';
import logger from '../utils/logger';
import { NodeManager } from './nodeManager';
import { HostAggregator } from './hostAggregator';
import {
  routeDeleteHostCommand,
  routeHostPowerCommand,
  routePingHostCommand,
  routeScanCommand,
  routeScanHostPortsCommand,
  routeScanHostsCommand,
  routeUpdateHostCommand,
  routeWakeCommand,
} from './commandRouter/commandDispatch';
import {
  applyCommandResult,
  executeCommand,
  handleNodeConnected,
} from './commandRouter/commandLifecycle';
import { calculateBackoffDelay } from './commandRouter/commandRetry';
import type {
  CommandDispatchContext,
  CommandLifecycleContext,
  CorrelationRouteOptions,
  DispatchCommand,
  HostPowerRouteOptions,
  HostUpdateData,
  PendingCommandEntry,
  RoutedHostPortScanResult,
  RoutedHostScanDispatchResult,
  ScanHostPortsRouteOptions,
  WakeRouteOptions,
} from './commandRouter/types';

/**
 * CommandRouter
 *
 * Routes commands from the mobile app API to the appropriate node agents.
 * Handles command execution, result tracking, timeouts, and error scenarios.
 */
export class CommandRouter extends EventEmitter {
  private nodeManager: NodeManager;
  private hostAggregator: HostAggregator;
  private readonly boundHandleCommandResult: (result: CommandResult) => void;
  private readonly boundHandleNodeConnected: (event: { nodeId: string }) => void;
  private pendingCommands: Map<string, PendingCommandEntry>;
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

    this.boundHandleCommandResult = this.handleCommandResult.bind(this);
    this.nodeManager.on('command-result', this.boundHandleCommandResult);

    this.boundHandleNodeConnected = this.handleNodeConnected.bind(this);
    this.nodeManager.on('node-connected', this.boundHandleNodeConnected);
  }
  async reconcileStaleInFlight(): Promise<number> {
    return CommandModel.reconcileStaleInFlight(this.commandTimeout);
  }
  async routeWakeCommand(fqn: string, options?: WakeRouteOptions): Promise<WakeupResponse> {
    return routeWakeCommand(this.createDispatchContext(), fqn, options);
  }
  async routePingHostCommand(
    fqn: string,
    options?: CorrelationRouteOptions,
  ): Promise<HostPingResponse> {
    return routePingHostCommand(this.createDispatchContext(), fqn, options);
  }
  async routeSleepHostCommand(
    fqn: string,
    options?: HostPowerRouteOptions,
  ): Promise<HostPowerResponse> {
    return this.routeHostPowerCommand('sleep', fqn, options);
  }
  async routeShutdownHostCommand(
    fqn: string,
    options?: HostPowerRouteOptions,
  ): Promise<HostPowerResponse> {
    return this.routeHostPowerCommand('shutdown', fqn, options);
  }
  private async routeHostPowerCommand(
    action: HostPowerAction,
    fqn: string,
    options?: HostPowerRouteOptions,
  ): Promise<HostPowerResponse> {
    return routeHostPowerCommand(this.createDispatchContext(), action, fqn, options);
  }

  async routeScanCommand(
    nodeId: string,
    immediate = true,
    options?: CorrelationRouteOptions,
  ): Promise<CommandResult> {
    return routeScanCommand(this.createDispatchContext(), nodeId, immediate, options);
  }

  async routeScanHostsCommand(
    options?: CorrelationRouteOptions,
  ): Promise<RoutedHostScanDispatchResult> {
    return routeScanHostsCommand(this.createDispatchContext(), options);
  }

  async routeScanHostPortsCommand(
    fqn: string,
    options?: ScanHostPortsRouteOptions,
  ): Promise<RoutedHostPortScanResult> {
    return routeScanHostPortsCommand(this.createDispatchContext(), fqn, options);
  }

  async routeUpdateHostCommand(
    fqn: string,
    hostData: HostUpdateData,
    options?: HostPowerRouteOptions,
  ): Promise<CommandResult> {
    return routeUpdateHostCommand(this.createDispatchContext(), fqn, hostData, options);
  }

  async routeDeleteHostCommand(
    fqn: string,
    options?: HostPowerRouteOptions,
  ): Promise<CommandResult> {
    return routeDeleteHostCommand(this.createDispatchContext(), fqn, options);
  }

  private async executeCommand(
    nodeId: string,
    command: DispatchCommand,
    options: { idempotencyKey: string | null; correlationId: string | null },
  ): Promise<CommandResult> {
    return executeCommand(this.createLifecycleContext(), nodeId, command, options);
  }

  private trackWakeVerificationCommand(commandId: string, fqn: string): void {
    this.wakeVerificationCommands.set(commandId, fqn);
    logger.debug('Tracking wake verification command', { commandId, fqn });
  }

  private handleCommandResult(result: CommandResult): void {
    void this.applyCommandResult(result);
  }

  private async applyCommandResult(result: CommandResult): Promise<void> {
    await applyCommandResult(this.createLifecycleContext(), result);
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
    handleNodeConnected(this.createLifecycleContext(), event);
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

    return { hostname, location };
  }

  private generateCommandId(): string {
    return `cmd_${randomUUID()}`;
  }

  private scopeIdempotencyKey(
    commandType: DispatchCommand['type'],
    idempotencyKey: string | null,
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

  private calculateBackoffDelay(retryCount: number): number {
    return calculateBackoffDelay(this.retryBaseDelayMs, this.commandTimeout, retryCount);
  }

  public getStats(): { pendingCommands: number } {
    return {
      pendingCommands: this.pendingCommands.size,
    };
  }

  public cleanup(): void {
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

  private assertPingHostResult(result: CommandResult): {
    hostPing: NonNullable<CommandResult['hostPing']>;
    correlationId?: string;
  } {
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

  private createDispatchContext(): CommandDispatchContext {
    return {
      parseFQN: (fqn) => this.parseFQN(fqn),
      generateCommandId: () => this.generateCommandId(),
      normalizePortList: (ports) => this.normalizePortList(ports),
      routeScanCommand: (nodeId, immediate, options) =>
        this.routeScanCommand(nodeId, immediate, options),
      executeCommand: (nodeId, command, options) => this.executeCommand(nodeId, command, options),
      trackWakeVerificationCommand: (commandId, fqn) =>
        this.trackWakeVerificationCommand(commandId, fqn),
      assertPingHostResult: (result) => this.assertPingHostResult(result),
      assertHostPortScanResult: (result) => this.assertHostPortScanResult(result),
      nodeManager: {
        getNodeStatus: (nodeId) => this.nodeManager.getNodeStatus(nodeId),
        getConnectedNodes: () => this.nodeManager.getConnectedNodes(),
      },
      hostAggregator: {
        getHostByFQN: (fullyQualifiedName) => this.hostAggregator.getHostByFQN(fullyQualifiedName),
        onHostRemoved: (event) => this.hostAggregator.onHostRemoved(event),
      },
    };
  }

  private createLifecycleContext(): CommandLifecycleContext {
    return {
      pendingCommands: this.pendingCommands,
      wakeVerificationCommands: this.wakeVerificationCommands,
      flushingNodes: this.flushingNodes,
      commandTimeout: this.commandTimeout,
      maxRetries: this.maxRetries,
      offlineCommandTtlMs: this.offlineCommandTtlMs,
      calculateBackoffDelay: (retryCount) => this.calculateBackoffDelay(retryCount),
      scopeIdempotencyKey: (commandType, idempotencyKey) =>
        this.scopeIdempotencyKey(commandType, idempotencyKey),
      buildQueuedMessage: () => this.buildQueuedMessage(),
      buildQueueExpiryMessage: () => this.buildQueueExpiryMessage(),
      isQueuedCommandExpired: (record) => this.isQueuedCommandExpired(record),
      asDispatchCommand: (payload) => this.asDispatchCommand(payload),
      resolvePersistedCommand: (commandId) => this.resolvePersistedCommand(commandId),
      emitWakeVerificationComplete: (payload) => {
        this.emit('wake-verification-complete', payload);
      },
      nodeManager: {
        isNodeConnected: (nodeId) => this.nodeManager.isNodeConnected(nodeId),
        sendCommand: (nodeId, payload) => this.nodeManager.sendCommand(nodeId, payload),
      },
    };
  }
}
