import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CncCommand, CommandResult, WakeupResponse } from '../types';
import { NodeManager } from './nodeManager';
import { HostAggregator } from './hostAggregator';
import logger from '../utils/logger';
import { CommandModel } from '../models/Command';
import config from '../config';
import type { HostStatus } from '@kaonis/woly-protocol';
import { runtimeMetrics } from './runtimeMetrics';

type DispatchCommand = Extract<CncCommand, { commandId: string }>;

// Host update data structure from API
interface HostUpdateData {
  name?: string;
  mac?: string;
  ip?: string;
  status?: HostStatus;
}

/**
 * CommandRouter
 * 
 * Routes commands from the mobile app API to the appropriate node agents.
 * Handles command execution, result tracking, timeouts, and error scenarios.
 * 
 * Flow:
 * 1. Parse FQN to determine owning node (via location)
 * 2. Verify node is online
 * 3. Send command to node via NodeManager
 * 4. Wait for command result (with timeout)
 * 5. Return result to API caller
 */
export class CommandRouter extends EventEmitter {
  private nodeManager: NodeManager;
  private hostAggregator: HostAggregator;
  private readonly boundHandleCommandResult: (result: CommandResult) => void;
  private pendingCommands: Map<string, {
    resolvers: Array<{
      resolve: (result: CommandResult) => void;
      reject: (error: Error) => void;
    }>;
    timeout: NodeJS.Timeout;
    correlationId: string | null;
  }>;
  readonly commandTimeout: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;

  constructor(nodeManager: NodeManager, hostAggregator: HostAggregator) {
    super();
    this.nodeManager = nodeManager;
    this.hostAggregator = hostAggregator;
    this.pendingCommands = new Map();
    this.commandTimeout = config.commandTimeout;
    this.maxRetries = config.commandMaxRetries;
    this.retryBaseDelayMs = config.commandRetryBaseDelayMs;

    // Listen for command results from nodes
    this.boundHandleCommandResult = this.handleCommandResult.bind(this);
    this.nodeManager.on('command-result', this.boundHandleCommandResult);
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
    options?: { idempotencyKey?: string | null; correlationId?: string | null }
  ): Promise<WakeupResponse> {
    logger.info(`Routing wake command for ${fqn}`);

    // Parse FQN to get hostname and location
    const { hostname, location } = this.parseFQN(fqn);

    // Get host from aggregated database
    const host = await this.hostAggregator.getHostByFQN(fqn);
    if (!host) {
      throw new Error(`Host not found: ${fqn}`);
    }

    // Check if node is online
    const nodeId = host.nodeId;
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} (${location}) is offline`);
    }

    // Create command
    const commandId = this.generateCommandId();
    const command: DispatchCommand = {
      type: 'wake',
      commandId,
      data: {
        hostName: hostname,
        mac: host.mac
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

    return {
      success: true,
      message: `Wake-on-LAN packet sent to ${fqn}`,
      nodeId,
      location,
      correlationId: result.correlationId ?? correlationId ?? undefined,
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

    // Check if node is online
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

    // Check if node is online
    const nodeId = host.nodeId;
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} is offline`);
    }

    // Create command
    const commandId = this.generateCommandId();
    const command: DispatchCommand = {
      type: 'update-host',
      commandId,
      data: {
        currentName: host.name,
        name: hostData.name || host.name,
        mac: hostData.mac || host.mac,
        ip: hostData.ip || host.ip,
        status: hostData.status || host.status,
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

    // Check if node is online
    const nodeId = host.nodeId;
    const nodeStatus = await this.nodeManager.getNodeStatus(nodeId);
    if (nodeStatus !== 'online') {
      throw new Error(`Node ${nodeId} is offline`);
    }

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

    // If successful, also remove from aggregated database
    if (result.success) {
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
        error: record.error ?? 'Command failed',
        timestamp: record.completedAt ?? record.updatedAt,
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
        runtimeMetrics.recordCommandTimeout(effectiveCommandId);
        
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
      });

      void (async () => {
        try {
          if (record.state === 'queued') {
            // Apply exponential backoff for retries
            // retryCount represents the number of previous send attempts
            // 0 = first attempt (no delay), 1 = first retry (base delay), 2 = second retry (2x delay), etc.
            if (record.retryCount > 0) {
              const attemptNumber = record.retryCount; // This will be the Nth retry
              const backoffDelay = this.calculateBackoffDelay(attemptNumber - 1);
              logger.info('Applying exponential backoff before retry', {
                commandId: effectiveCommandId,
                attemptNumber,
                backoffDelayMs: Math.round(backoffDelay),
              });
              await new Promise((resolve) => setTimeout(resolve, backoffDelay));
            }

            this.nodeManager.sendCommand(nodeId, payloadToSend);
            runtimeMetrics.recordCommandDispatched(
              effectiveCommandId,
              command.type,
              options.correlationId
            );
            await CommandModel.markSent(effectiveCommandId);
            
            // Log after markSent to show the correct count (markSent increments it)
            logger.debug('Sent command to node', {
              commandId: effectiveCommandId,
              nodeId,
              attemptNumber: record.retryCount + 1, // Will be incremented by markSent
              type: command.type,
            });
          } else {
            logger.debug(`Command ${effectiveCommandId} already ${record.state}; not resending`);
          }
        } catch (error) {
          const pending = this.pendingCommands.get(effectiveCommandId);
          clearTimeout(timeout);
          this.pendingCommands.delete(effectiveCommandId);
          
          const message = error instanceof Error ? error.message : String(error);
          const err = error instanceof Error ? error : new Error(message);
          
          await CommandModel.markFailed(effectiveCommandId, message);
          runtimeMetrics.recordCommandResult(effectiveCommandId, false);
          
          logger.error('Failed to send command', {
            commandId: effectiveCommandId,
            nodeId,
            attemptNumber: record.retryCount + 1, // Attempt that failed
            error: message,
          });
          
          // Reject all pending resolvers on send failure
          if (pending) {
            for (const resolver of pending.resolvers) {
              resolver.reject(err);
            }
          }
        }
      })();
    });
  }

  /**
   * Handle command result from a node
   * 
   * @param result Command result
   */
  private handleCommandResult(result: CommandResult): void {
    runtimeMetrics.recordCommandResult(result.commandId, result.success);
    logger.debug('Received command result', {
      commandId: result.commandId,
      success: result.success,
      error: result.error,
      correlationId: runtimeMetrics.lookupCorrelationId(result.commandId),
    });

    const pending = this.pendingCommands.get(result.commandId);
    
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
      logger.warn(`Received result for unknown command: ${result.commandId}`);
      return;
    }

    // Clear timeout and resolve/reject promises
    clearTimeout(pending.timeout);
    this.pendingCommands.delete(result.commandId);

    if (result.success) {
      for (const resolver of pending.resolvers) {
        resolver.resolve({ ...result, correlationId });
      }
      return;
    }

    for (const resolver of pending.resolvers) {
      resolver.reject(new Error(result.error || 'Command failed'));
    }
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
    this.nodeManager.off('command-result', this.boundHandleCommandResult);
    this.removeAllListeners();
  }
}
