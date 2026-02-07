import { EventEmitter } from 'events';
import { isIP } from 'node:net';
import { cncClient } from './cncClient';
import { agentConfig, validateAgentConfig } from '../config/agent';
import { logger } from '../utils/logger';
import { CncCommand, Host } from '../types';
import HostDatabase from './hostDatabase';

type WakeCommand = Extract<CncCommand, { type: 'wake' }>;
type ScanCommand = Extract<CncCommand, { type: 'scan' }>;
type UpdateHostCommand = Extract<CncCommand, { type: 'update-host' }>;
type DeleteHostCommand = Extract<CncCommand, { type: 'delete-host' }>;

type ValidatedUpdateHostData = {
  currentName?: string;
  name: string;
  mac?: string;
  ip?: string;
  status?: Host['status'];
};

const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown configuration error';
      logger.error('Invalid agent configuration', { error: message });
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
    cncClient.on('command:wake', async (command: WakeCommand) => {
      await this.handleWakeCommand(command);
    });

    cncClient.on('command:scan', async (command: ScanCommand) => {
      await this.handleScanCommand(command);
    });

    cncClient.on('command:update-host', async (command: UpdateHostCommand) => {
      await this.handleUpdateHostCommand(command);
    });

    cncClient.on('command:delete-host', async (command: DeleteHostCommand) => {
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send initial host list to C&C', { error: message });
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

  private sendCommandResult(
    commandId: string,
    payload: { success: boolean; message?: string; error?: string }
  ): void {
    cncClient.send({
      type: 'command-result',
      data: {
        nodeId: agentConfig.nodeId,
        commandId,
        ...payload,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Handle wake command from C&C
   */
  private async handleWakeCommand(command: WakeCommand): Promise<void> {
    const { commandId, data } = command;
    const { hostName, mac } = data;

    logger.info('Received wake command from C&C', { commandId, hostName, mac });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      this.sendCommandResult(commandId, {
        success: false,
        error: 'Host database not initialized',
      });
      return;
    }

    try {
      // Prefer hostname lookup, but fall back to MAC for stale/missing hostnames.
      let host = await this.hostDb.getHost(hostName);
      if (!host) {
        host = await this.hostDb.getHostByMAC(mac);
      }

      const targetMac = host?.mac ?? mac;
      if (!targetMac) {
        throw new Error(`Host ${hostName} not found`);
      }

      // Send Wake-on-LAN packet
      const wol = await import('wake_on_lan');
      await new Promise<void>((resolve, reject) => {
        wol.wake(targetMac, (error: Error | null) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.sendCommandResult(commandId, {
        success: true,
        message: `Wake-on-LAN packet sent to ${host?.name || hostName} (${targetMac})`,
      });

      logger.info('Wake command completed', { commandId, hostName });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Wake command failed', { commandId, error: message });

      this.sendCommandResult(commandId, {
        success: false,
        error: message,
      });
    }
  }

  /**
   * Handle scan command from C&C
   */
  private async handleScanCommand(command: ScanCommand): Promise<void> {
    const { commandId, data } = command;
    const { immediate } = data;

    logger.info('Received scan command from C&C', { commandId, immediate });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      this.sendCommandResult(commandId, {
        success: false,
        error: 'Host database not initialized',
      });
      return;
    }

    try {
      if (immediate) {
        await this.hostDb.syncWithNetwork();
        const hosts = await this.hostDb.getAllHosts();

        this.sendCommandResult(commandId, {
          success: true,
          message: `Scan completed, found ${hosts.length} hosts`,
        });

        logger.info('Scan command completed', { commandId, hostCount: hosts.length });
      } else {
        const hostDb = this.hostDb;
        setTimeout(() => {
          hostDb.syncWithNetwork().catch((backgroundError: unknown) => {
            const message =
              backgroundError instanceof Error ? backgroundError.message : 'Unknown error';
            logger.error('Background scan command failed', { commandId, error: message });
          });
        }, 0);

        this.sendCommandResult(commandId, {
          success: true,
          message: 'Background scan scheduled',
        });

        logger.info('Scan command scheduled in background', { commandId });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Scan command failed', { commandId, error: message });

      this.sendCommandResult(commandId, {
        success: false,
        error: message,
      });
    }
  }

  /**
   * Handle update-host command from C&C
   */
  private async handleUpdateHostCommand(command: UpdateHostCommand): Promise<void> {
    const { commandId } = command;

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      this.sendCommandResult(commandId, {
        success: false,
        error: 'Host database not initialized',
      });
      return;
    }

    try {
      const data = this.validateUpdateHostData(command.data);
      const currentName = data.currentName ?? data.name;

      logger.info('Received update-host command from C&C', {
        commandId,
        currentName,
        targetName: data.name,
      });

      const existing = await this.hostDb.getHost(currentName);
      if (!existing) {
        throw new Error(`Host ${currentName} not found`);
      }

      await this.hostDb.updateHost(currentName, {
        name: data.name,
        mac: data.mac,
        ip: data.ip,
        status: data.status,
      });

      const updated = await this.hostDb.getHost(data.name);
      if (updated) {
        this.sendHostUpdated(updated);
      }

      this.sendCommandResult(commandId, {
        success: true,
        message:
          currentName === data.name
            ? `Host ${data.name} updated successfully`
            : `Host ${currentName} renamed to ${data.name} and updated successfully`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Update-host command failed', { commandId, error: message });

      this.sendCommandResult(commandId, {
        success: false,
        error: message,
      });
    }
  }

  /**
   * Handle delete-host command from C&C
   */
  private async handleDeleteHostCommand(command: DeleteHostCommand): Promise<void> {
    const { commandId, data } = command;
    const { name } = data;

    logger.info('Received delete-host command from C&C', { commandId, name });

    if (!this.hostDb) {
      logger.error('Host database not initialized');
      this.sendCommandResult(commandId, {
        success: false,
        error: 'Host database not initialized',
      });
      return;
    }

    try {
      await this.hostDb.deleteHost(name);
      this.sendHostRemoved(name);

      this.sendCommandResult(commandId, {
        success: true,
        message: `Host ${name} deleted successfully`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Delete-host command failed', { commandId, error: message });

      this.sendCommandResult(commandId, {
        success: false,
        error: message,
      });
    }
  }

  private validateUpdateHostData(data: unknown): ValidatedUpdateHostData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid update-host payload: data must be an object');
    }

    const payload = data as Record<string, unknown>;
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const currentNameRaw = payload.currentName;

    if (!name) {
      throw new Error('Invalid update-host payload: name is required');
    }

    if (name.length > 255) {
      throw new Error('Invalid update-host payload: name must be at most 255 characters');
    }

    let currentName: string | undefined;
    if (currentNameRaw !== undefined) {
      if (typeof currentNameRaw !== 'string' || !currentNameRaw.trim()) {
        throw new Error('Invalid update-host payload: currentName must be a non-empty string');
      }
      currentName = currentNameRaw.trim();
    }

    let mac: string | undefined;
    if (payload.mac !== undefined) {
      if (typeof payload.mac !== 'string') {
        throw new Error('Invalid update-host payload: mac must be a string');
      }
      const normalizedMac = payload.mac.trim();
      if (!MAC_ADDRESS_REGEX.test(normalizedMac)) {
        throw new Error('Invalid update-host payload: mac has invalid format');
      }
      mac = normalizedMac.includes('-') ? normalizedMac.replace(/-/g, ':') : normalizedMac;
    }

    let ip: string | undefined;
    if (payload.ip !== undefined) {
      if (typeof payload.ip !== 'string') {
        throw new Error('Invalid update-host payload: ip must be a string');
      }
      const normalizedIp = payload.ip.trim();
      if (isIP(normalizedIp) !== 4) {
        throw new Error('Invalid update-host payload: ip must be a valid IPv4 address');
      }
      ip = normalizedIp;
    }

    let status: Host['status'] | undefined;
    if (payload.status !== undefined) {
      if (payload.status !== 'awake' && payload.status !== 'asleep') {
        throw new Error('Invalid update-host payload: status must be awake or asleep');
      }
      status = payload.status;
    }

    return {
      currentName,
      name,
      mac,
      ip,
      status,
    };
  }
}

// Export singleton instance
export const agentService = new AgentService();
