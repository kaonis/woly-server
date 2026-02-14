import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { CncCommand, CommandResult, WakeupResponse } from '../types';
import { NodeManager } from './nodeManager';
import { HostAggregator } from './hostAggregator';
import logger from '../utils/logger';
import { CommandModel } from '../models/Command';
import config from '../config';
import type { HostStatus } from '@kaonis/woly-protocol';

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
  private pendingCommands: Map<string, {
    resolvers: Array<{
      resolve: (result: CommandResult) => void;
      reject: (error: Error) => void;
    }>;
    timeout: NodeJS.Timeout;
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
    this.nodeManager.on('command-result', this.handleCommandResult.bind(this));
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
    options?: { idempotencyKey?: string | null }
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
    const result = await this.executeCommand(nodeId, command, { idempotencyKey: options?.idempotencyKey ?? null });

    if (!result.success) {
      throw new Error(result.error || 'Wake command failed');
    }

    return {
      success: true,
      message: `Wake-on-LAN packet sent to ${fqn}`,
      nodeId,
      location
    };
  }

  /**
   * Route a scan command to a specific node
   * 
   * @param nodeId Node identifier
   * @param immediate Whether to scan immediately
   * @returns Promise with command result
   */
  async routeScanCommand(nodeId: string, immediate = true): Promise<CommandResult> {
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
    return this.executeCommand(nodeId, command, { idempotencyKey: null });
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
    options?: { idempotencyKey?: string | null }
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
    return this.executeCommand(nodeId, command, { idempotencyKey: options?.idempotencyKey ?? null });
  }

  /**
   * Route a delete-host command to the appropriate node
   * 
   * @param fqn Fully qualified name (hostname@location)
   * @returns Promise with command result
   */
  async routeDeleteHostCommand(
    fqn: string,
    options?: { idempotencyKey?: string | null }
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
    const result = await this.executeCommand(nodeId, command, { idempotencyKey: options?.idempotencyKey ?? null });

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
    options: { idempotencyKey: string | null }
  ): Promise<CommandResult> {
    const record = await CommandModel.enqueue({
      id: command.commandId,
      nodeId,
      type: command.type,
      payload: command,
      idempotencyKey: options.idempotencyKey,
    });

    const effectiveCommandId = record.id;

    // Terminal states: return immediately for idempotent retries.
    if (record.state === 'acknowledged') {
      logger.debug('Command already acknowledged, returning cached result', {
        commandId: effectiveCommandId,
        retryCount: record.retryCount,
      });
      return {
        commandId: effectiveCommandId,
        success: true,
        timestamp: record.completedAt ?? record.updatedAt,
      };
    }

    if (record.state === 'failed' || record.state === 'timed_out') {
      logger.warn('Command in terminal state', {
        commandId: effectiveCommandId,
        state: record.state,
        retryCount: record.retryCount,
        maxRetries: this.maxRetries,
      });
      return {
        commandId: effectiveCommandId,
        success: false,
        error: record.error ?? 'Command failed',
        timestamp: record.completedAt ?? record.updatedAt,
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
        
        const error = new Error(`Command ${effectiveCommandId} timed out after ${this.commandTimeout}ms (retry ${record.retryCount}/${this.maxRetries})`);
        
        CommandModel.markTimedOut(effectiveCommandId, error.message).catch((err) => {
          logger.error('Failed to mark command as timed out', {
            commandId: effectiveCommandId,
            retryCount: record.retryCount,
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
      });

      void (async () => {
        try {
          if (record.state === 'queued') {
            // Apply exponential backoff for retries (retryCount > 0 means this is a retry)
            if (record.retryCount > 0) {
              const backoffDelay = this.calculateBackoffDelay(record.retryCount - 1);
              logger.info('Applying exponential backoff before retry', {
                commandId: effectiveCommandId,
                retryCount: record.retryCount,
                backoffDelayMs: Math.round(backoffDelay),
              });
              await new Promise((resolve) => setTimeout(resolve, backoffDelay));
            }

            this.nodeManager.sendCommand(nodeId, payloadToSend);
            await CommandModel.markSent(effectiveCommandId);
            logger.debug('Sent command to node', {
              commandId: effectiveCommandId,
              nodeId,
              retryCount: record.retryCount + 1,
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
          
          logger.error('Failed to send command', {
            commandId: effectiveCommandId,
            nodeId,
            retryCount: record.retryCount,
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
    logger.debug('Received command result', {
      commandId: result.commandId,
      success: result.success,
      error: result.error,
    });

    const pending = this.pendingCommands.get(result.commandId);
    
    // Always persist the result state, even if no pending resolver exists
    // (e.g., after a process restart or if the HTTP caller disconnected)
    if (result.success) {
      CommandModel.markAcknowledged(result.commandId).then(() => {
        logger.info('Command acknowledged', {
          commandId: result.commandId,
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
        resolver.resolve(result);
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

    return {
      hostname: parts[0],
      location: decodeURIComponent(parts[1]) // Decode URL-encoded location
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
    this.removeAllListeners();
  }
}
