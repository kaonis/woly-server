import { EventEmitter } from 'events';
import { cncClient } from './cncClient';
import { agentConfig, validateAgentConfig } from '../config/agent';
import { logger } from '../utils/logger';
import { Host } from '../types';
import HostDatabase from './hostDatabase';

/**
 * Agent Service
 * Orchestrates agent mode operations and connects network discovery to C&C backend
 */
export class AgentService extends EventEmitter {
  private isRunning = false;
  private hostCache: Map<string, Host> = new Map();
  private hostDb: HostDatabase | null = null;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  /**
   * Set host database instance
   */
  public setHostDatabase(db: HostDatabase): void {
    this.hostDb = db;

    // Listen to database events
    this.hostDb.on('host-discovered', (host: Host) => {
      this.sendHostDiscovered(host);
    });

    this.hostDb.on('host-updated', (host: Host) => {
      this.sendHostUpdated(host);
    });

    this.hostDb.on('scan-complete', (hostCount: number) => {
      this.sendScanComplete(hostCount);
    });
  }

  /**
   * Start agent service
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent service already running');
      return;
    }

    // Validate configuration
    try {
      validateAgentConfig();
    } catch (error: any) {
      logger.error('Invalid agent configuration', { error: error.message });
      throw error;
    }

    logger.info('Starting agent service', {
      nodeId: agentConfig.nodeId,
      location: agentConfig.location,
      cncUrl: agentConfig.cncUrl,
    });

    // Connect to C&C backend
    await cncClient.connect();
    this.isRunning = true;

    logger.info('Agent service started');
  }

  /**
   * Stop agent service
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping agent service');
    cncClient.disconnect();
    this.isRunning = false;

    logger.info('Agent service stopped');
  }

  /**
   * Check if agent service is running
   */
  public isActive(): boolean {
    return this.isRunning && cncClient.isConnected();
  }

  /**
   * Setup event handlers for C&C client and network discovery
   */
  private setupEventHandlers(): void {
    // C&C connection events
    cncClient.on('connected', () => {
      logger.info('Agent connected to C&C backend');
      this.onConnected();
    });

    cncClient.on('disconnected', () => {
      logger.warn('Agent disconnected from C&C backend');
    });

    cncClient.on('error', (error: Error) => {
      logger.error('C&C connection error', { error: error.message });
    });

    cncClient.on('reconnect-failed', () => {
      logger.error('Failed to reconnect to C&C backend, giving up');
      this.stop();
    });

    // C&C command handlers
    cncClient.on('command:wake', async (command) => {
      await this.handleWakeCommand(command);
    });

    cncClient.on('command:scan', async (command) => {
      await this.handleScanCommand(command);
    });

    cncClient.on('command:update-host', async (command) => {
      await this.handleUpdateHostCommand(command);
    });

    cncClient.on('command:delete-host', async (command) => {
      await this.handleDeleteHostCommand(command);
    });
  }

  /**
   * Handle connected event - send initial host list
   */
  private async onConnected(): Promise<void> {
    if (!this.hostDb) {
      logger.warn('Host database not initialized');
      return;
    }

    // Send current host list to C&C
    try {
      const hosts = await this.hostDb.getAllHosts();
      logger.info(`Sending ${hosts.length} hosts to C&C backend`);

      for (const host of hosts) {
        this.sendHostDiscovered(host);
      }
    } catch (error: any) {
      logger.error('Failed to send initial host list to C&C', { error: error.message });
    }
  }

  /**
   * Send host-discovered event to C&C
   */
  public sendHostDiscovered(host: Host): void {
    if (!this.isActive()) {
      return;
    }

    cncClient.send({
      type: 'host-discovered',
      data: {
        nodeId: agentConfig.nodeId,
        ...host,
      },
    });

    // Update cache
    this.hostCache.set(host.name, host);
  }

  /**
   * Send host-updated event to C&C
   */
  public sendHostUpdated(host: Host): void {
    if (!this.isActive()) {
      return;
    }

    cncClient.send({
      type: 'host-updated',
      data: {
        nodeId: agentConfig.nodeId,
        ...host,
      },
    });

    // Update cache
    this.hostCache.set(host.name, host);
  }

  /**
   * Send host-removed event to C&C
   */
  public sendHostRemoved(hostName: string): void {
    if (!this.isActive()) {
      return;
    }

    cncClient.send({
      type: 'host-removed',
      data: {
        nodeId: agentConfig.nodeId,
        name: hostName,
      },
    });

    // Remove from cache
    this.hostCache.delete(hostName);
  }

  /**
   * Send scan-complete event to C&C
   */
  public sendScanComplete(hostCount: number): void {
    if (!this.isActive()) {
      return;
    }

    cncClient.send({
      type: 'scan-complete',
      data: {
        nodeId: agentConfig.nodeId,
        hostCount,
      },
    });

    logger.info('Sent scan complete to C&C', { hostCount });
  }

  /**
   * Handle wake command from C&C
   */
  private async handleWakeCommand(command: any): Promise<void> {
    const { commandId, data } = command;
    const { hostName, mac } = data;

    logger.info('Received wake command from C&C', { commandId, hostName, mac });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: 'Host database not initialized',
        },
      });
      return;
    }

    try {
      // Get host from database to verify it exists
      const host = await this.hostDb.getHost(hostName);

      if (!host) {
        throw new Error(`Host ${hostName} not found`);
      }

      // Send Wake-on-LAN packet
      const wol = await import('wake_on_lan');
      await new Promise<void>((resolve, reject) => {
        wol.wake(host.mac, (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      // Send result back to C&C
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: true,
          message: `Wake-on-LAN packet sent to ${hostName} (${host.mac})`,
        },
      });

      logger.info('Wake command completed', { commandId, hostName });
    } catch (error: any) {
      logger.error('Wake command failed', { commandId, error: error.message });

      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: error.message,
        },
      });
    }
  }

  /**
   * Handle scan command from C&C
   */
  private async handleScanCommand(command: any): Promise<void> {
    const { commandId, data } = command;
    const { immediate } = data;

    logger.info('Received scan command from C&C', { commandId, immediate });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: 'Host database not initialized',
        },
      });
      return;
    }

    try {
      // Trigger network scan
      await this.hostDb.syncWithNetwork();

      // Get updated host list
      const hosts = await this.hostDb.getAllHosts();

      // Send result back to C&C
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: true,
          message: `Scan completed, found ${hosts.length} hosts`,
        },
      });

      logger.info('Scan command completed', { commandId, hostCount: hosts.length });
    } catch (error: any) {
      logger.error('Scan command failed', { commandId, error: error.message });

      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: error.message,
        },
      });
    }
  }

  /**
   * Handle update-host command from C&C
   */
  private async handleUpdateHostCommand(command: any): Promise<void> {
    const { commandId, data } = command;

    logger.info('Received update-host command from C&C', { commandId, host: data.name });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: 'Host database not initialized',
        },
      });
      return;
    }

    try {
      // For now, just log that we received the command
      // Host updates will be handled via the REST API
      logger.warn('Update-host command not implemented yet', { commandId, host: data.name });

      // Send result back to C&C
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          message: 'Update-host command not implemented yet',
        },
      });
    } catch (error: any) {
      logger.error('Update-host command failed', { commandId, error: error.message });

      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: error.message,
        },
      });
    }
  }

  /**
   * Handle delete-host command from C&C
   */
  private async handleDeleteHostCommand(command: any): Promise<void> {
    const { commandId, data } = command;
    const { name } = data;

    logger.info('Received delete-host command from C&C', { commandId, name });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: 'Host database not initialized',
        },
      });
      return;
    }

    try {
      // For now, just log that we received the command
      // Host deletion will be handled via the REST API
      logger.warn('Delete-host command not implemented yet', { commandId, name });

      // Send result back to C&C
      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          message: 'Delete-host command not implemented yet',
        },
      });
    } catch (error: any) {
      logger.error('Delete-host command failed', { commandId, error: error.message });

      cncClient.send({
        type: 'command-result',
        data: {
          commandId,
          success: false,
          error: error.message,
        },
      });
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();
