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

  constructor(nodeManager: NodeManager, hostAggregator: HostAggregator) {
    super();
    this.nodeManager = nodeManager;
    this.hostAggregator = hostAggregator;
    this.pendingCommands = new Map();
    this.commandTimeout = config.commandTimeout;

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
      return {
        commandId: effectiveCommandId,
        success: true,
        timestamp: record.completedAt ?? record.updatedAt,
      };
    }

    if (record.state === 'failed' || record.state === 'timed_out') {
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
        
        const error = new Error(`Command ${effectiveCommandId} timed out after ${this.commandTimeout}ms`);
        
        CommandModel.markTimedOut(effectiveCommandId, error.message).catch((err) => {
          logger.error('Failed to mark command as timed out', {
            commandId: effectiveCommandId,
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
            this.nodeManager.sendCommand(nodeId, payloadToSend);
            await CommandModel.markSent(effectiveCommandId);
            logger.debug(`Sent command ${effectiveCommandId} to node ${nodeId}`);
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
    logger.debug(`Received command result: ${result.commandId}`);

    const pending = this.pendingCommands.get(result.commandId);
    
    // Always persist the result state, even if no pending resolver exists
    // (e.g., after a process restart or if the HTTP caller disconnected)
    if (result.success) {
      CommandModel.markAcknowledged(result.commandId).catch((error) => {
        logger.error('Failed to mark command as acknowledged', {
          commandId: result.commandId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } else {
      CommandModel.markFailed(result.commandId, result.error || 'Command failed').catch((error) => {
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
      location: parts[1].replace(/-/g, ' ') // Convert hyphens back to spaces
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
