import { EventEmitter } from 'events';
import { isIP } from 'node:net';
import type { CommandState } from '@kaonis/woly-protocol';
import { cncClient } from './cncClient';
import { agentConfig, validateAgentConfig } from '../config/agent';
import { logger } from '../utils/logger';
import { CncCommand, Host, NodeMessage } from '../types';
import HostDatabase from './hostDatabase';
import ScanOrchestrator from './scanOrchestrator';
import { runtimeTelemetry } from './runtimeTelemetry';
import * as networkDiscovery from './networkDiscovery';

type WakeCommand = Extract<CncCommand, { type: 'wake' }>;
type ScanCommand = Extract<CncCommand, { type: 'scan' }>;
type UpdateHostCommand = Extract<CncCommand, { type: 'update-host' }>;
type DeleteHostCommand = Extract<CncCommand, { type: 'delete-host' }>;
type PingHostCommand = Extract<CncCommand, { type: 'ping-host' }>;
type DispatchableCommand =
  | WakeCommand
  | ScanCommand
  | UpdateHostCommand
  | DeleteHostCommand
  | PingHostCommand;
type HostEventMessage = Extract<
  NodeMessage,
  { type: 'host-discovered' | 'host-updated' | 'host-removed' | 'scan-complete' }
>;
type CommandResultMessage = Extract<NodeMessage, { type: 'command-result' }>;
type CommandResultPayload = Pick<
  CommandResultMessage['data'],
  'success' | 'message' | 'error' | 'hostPing'
>;

type ValidatedUpdateHostData = {
  currentName?: string;
  name: string;
  mac?: string;
  ip?: string;
  status?: Host['status'];
  notes?: string | null;
  tags?: string[];
};

const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{12})$/;
const COMMAND_EXECUTION_TIMEOUT_CODE = 'COMMAND_EXECUTION_TIMEOUT';

type CommandExecutionPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  retryOnFailure: boolean;
};

type CommandExecutionRecord = {
  commandId: string;
  commandType: DispatchableCommand['type'];
  state: CommandState;
  attempts: number;
  receivedAtMs: number;
  updatedAtMs: number;
  lastError?: string;
  result?: CommandResultPayload;
};

const COMMAND_EXECUTION_POLICIES: Record<DispatchableCommand['type'], CommandExecutionPolicy> = {
  wake: {
    timeoutMs: 7_500,
    maxAttempts: 2,
    retryDelayMs: 250,
    retryOnFailure: true,
  },
  scan: {
    timeoutMs: 90_000,
    maxAttempts: 1,
    retryDelayMs: 0,
    retryOnFailure: false,
  },
  'update-host': {
    timeoutMs: 5_000,
    maxAttempts: 1,
    retryDelayMs: 200,
    retryOnFailure: false,
  },
  'delete-host': {
    timeoutMs: 5_000,
    maxAttempts: 1,
    retryDelayMs: 200,
    retryOnFailure: false,
  },
  'ping-host': {
    timeoutMs: 5_000,
    maxAttempts: 1,
    retryDelayMs: 200,
    retryOnFailure: false,
  },
};

class NonRetryableCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableCommandError';
  }
}

/**
 * Agent Service
 * Orchestrates agent mode operations and connects network discovery to C&C backend
 */
export class AgentService extends EventEmitter {
  private isRunning = false;
  private hostCache: Map<string, Host> = new Map();
  private hostDb: HostDatabase | null = null;
  private scanOrchestrator: ScanOrchestrator | null = null;
  private readonly maxBufferedHostEvents = Math.max(agentConfig.maxBufferedHostEvents, 1);
  private readonly hostEventFlushBatchSize = Math.max(agentConfig.hostEventFlushBatchSize, 1);
  private readonly hostUpdateDebounceMs = Math.max(agentConfig.hostUpdateDebounceMs, 0);
  private readonly initialSyncChunkSize = Math.max(agentConfig.initialSyncChunkSize, 1);
  private readonly hostStaleAfterMs = Math.max(agentConfig.hostStaleAfterMs, 0);
  private readonly maxTrackedCommandExecutions = 500;
  private readonly commandExecutionRetentionMs = 30 * 60 * 1000;
  private readonly maxBufferedCommandResults = 250;
  private readonly bufferedHostEvents: HostEventMessage[] = [];
  private readonly pendingHostUpdates: Map<string, Host> = new Map();
  private readonly commandExecutions: Map<string, CommandExecutionRecord> = new Map();
  private readonly bufferedCommandResults: Map<string, CommandResultMessage> = new Map();
  private hostUpdateDebounceTimer: NodeJS.Timeout | null = null;
  private hostEventFlushTimer: NodeJS.Timeout | null = null;

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

    this.hostDb.on('host-removed', (hostName: string) => {
      this.sendHostRemoved(hostName);
    });

    this.hostDb.on('scan-complete', (hostCount: number) => {
      this.sendScanComplete(hostCount);
    });
  }

  public setScanOrchestrator(orchestrator: ScanOrchestrator | null): void {
    this.scanOrchestrator = orchestrator;
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
    this.clearHostEventTimers();
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
      void this.onConnected();
    });

    cncClient.on('disconnected', () => {
      logger.warn('Agent disconnected from C&C backend');
      this.flushPendingHostUpdates();
    });

    cncClient.on('error', (error: Error) => {
      logger.error('C&C connection error', { error: error.message });
    });

    cncClient.on('reconnect-failed', () => {
      logger.error('Failed to reconnect to C&C backend, giving up');
      this.stop();
    });

    cncClient.on('auth-expired', () => {
      logger.warn('C&C authentication expired, attempting token refresh on reconnect');
    });

    cncClient.on('auth-revoked', () => {
      logger.error('C&C authentication revoked, reconnect attempts will likely fail');
    });

    cncClient.on('auth-unavailable', () => {
      logger.warn('C&C session token service unavailable, reconnect will retry');
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

    cncClient.on('command:ping-host', async (command: PingHostCommand) => {
      await this.handlePingHostCommand(command);
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

    await this.refreshHostsFromNetwork();
    this.flushPendingHostUpdates();
    this.flushBufferedCommandResults();
    this.flushBufferedHostEvents();

    // Send current host list to C&C
    try {
      const hosts = await this.hostDb.getAllHosts();
      logger.info(`Sending ${hosts.length} hosts to C&C backend`);
      await this.sendHostsInChunks(hosts);
      this.flushBufferedCommandResults();
      this.flushBufferedHostEvents();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send initial host list to C&C', { error: message });
    }
  }

  private async refreshHostsFromNetwork(): Promise<void> {
    if (!this.scanOrchestrator) {
      return;
    }

    try {
      const syncResult = await this.scanOrchestrator.syncWithNetwork();
      if (!syncResult.success && syncResult.code !== 'SCAN_IN_PROGRESS') {
        logger.warn('Network refresh before initial host sync failed', {
          error: syncResult.error,
          code: syncResult.code,
        });
      }
    } catch (error: unknown) {
      logger.warn('Network refresh before initial host sync threw an error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send host-discovered event to C&C
   */
  public sendHostDiscovered(host: Host): void {
    const normalizedHost = this.normalizeHostForReporting(host);
    const message: HostEventMessage = {
      type: 'host-discovered',
      data: {
        nodeId: agentConfig.nodeId,
        ...normalizedHost,
      },
    };
    this.dispatchHostEvent(message);

    // Update cache
    this.hostCache.set(normalizedHost.name, normalizedHost);
  }

  /**
   * Send host-updated event to C&C
   */
  public sendHostUpdated(host: Host): void {
    const normalizedHost = this.normalizeHostForReporting(host);
    this.hostCache.set(normalizedHost.name, normalizedHost);
    this.pendingHostUpdates.set(normalizedHost.name, normalizedHost);
    this.scheduleHostUpdateFlush();
  }

  /**
   * Send host-removed event to C&C
   */
  public sendHostRemoved(hostName: string): void {
    this.pendingHostUpdates.delete(hostName);
    this.dispatchHostEvent({
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
    this.dispatchHostEvent({
      type: 'scan-complete',
      data: {
        nodeId: agentConfig.nodeId,
        hostCount,
      },
    });

    logger.info('Sent scan complete to C&C', { hostCount });
  }

  private dispatchHostEvent(message: HostEventMessage): void {
    if (!this.isRunning) {
      return;
    }

    if (this.isActive()) {
      cncClient.send(message);
      return;
    }

    this.enqueueBufferedHostEvent(message);
  }

  private enqueueBufferedHostEvent(message: HostEventMessage): void {
    if (this.bufferedHostEvents.length >= this.maxBufferedHostEvents) {
      this.bufferedHostEvents.shift();
      logger.warn('Host event buffer reached capacity; dropping oldest event', {
        maxBufferedHostEvents: this.maxBufferedHostEvents,
      });
    }

    this.bufferedHostEvents.push(message);
  }

  private flushBufferedHostEvents(): void {
    if (!this.isActive() || this.bufferedHostEvents.length === 0 || this.hostEventFlushTimer) {
      return;
    }

    const flushBatch = () => {
      this.hostEventFlushTimer = null;

      if (!this.isActive() || this.bufferedHostEvents.length === 0) {
        return;
      }

      const batch = this.bufferedHostEvents.splice(0, this.hostEventFlushBatchSize);
      for (const bufferedMessage of batch) {
        cncClient.send(bufferedMessage);
      }

      if (this.bufferedHostEvents.length > 0) {
        this.hostEventFlushTimer = setTimeout(flushBatch, 0);
      }
    };

    flushBatch();
  }

  private scheduleHostUpdateFlush(): void {
    if (this.hostUpdateDebounceTimer) {
      return;
    }

    this.hostUpdateDebounceTimer = setTimeout(() => {
      this.hostUpdateDebounceTimer = null;
      this.flushPendingHostUpdates();
      this.flushBufferedHostEvents();
    }, this.hostUpdateDebounceMs);
  }

  private flushPendingHostUpdates(): void {
    if (this.pendingHostUpdates.size === 0) {
      return;
    }

    for (const host of this.pendingHostUpdates.values()) {
      this.dispatchHostEvent({
        type: 'host-updated',
        data: {
          nodeId: agentConfig.nodeId,
          ...host,
        },
      });
    }

    this.pendingHostUpdates.clear();
  }

  private async sendHostsInChunks(hosts: Host[]): Promise<void> {
    for (let index = 0; index < hosts.length; index += this.initialSyncChunkSize) {
      const chunk = hosts.slice(index, index + this.initialSyncChunkSize);
      for (const host of chunk) {
        this.sendHostDiscovered(host);
      }

      if (index + this.initialSyncChunkSize < hosts.length) {
        await this.yieldToEventLoop();
      }
    }
  }

  private normalizeHostForReporting(host: Host): Host {
    if (!this.isStaleHost(host)) {
      return host;
    }

    if (host.status === 'asleep' && host.pingResponsive === 0) {
      return host;
    }

    logger.debug('Flagging stale host as asleep for outbound reporting', {
      name: host.name,
      lastSeen: host.lastSeen,
      staleAfterMs: this.hostStaleAfterMs,
    });

    return {
      ...host,
      status: 'asleep',
      pingResponsive: 0,
    };
  }

  private isStaleHost(host: Host): boolean {
    if (!host.lastSeen) {
      return true;
    }

    const lastSeenMs = new Date(host.lastSeen).getTime();
    if (Number.isNaN(lastSeenMs)) {
      return true;
    }

    return Date.now() - lastSeenMs > this.hostStaleAfterMs;
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  private clearHostEventTimers(): void {
    if (this.hostUpdateDebounceTimer) {
      clearTimeout(this.hostUpdateDebounceTimer);
      this.hostUpdateDebounceTimer = null;
    }

    if (this.hostEventFlushTimer) {
      clearTimeout(this.hostEventFlushTimer);
      this.hostEventFlushTimer = null;
    }
  }

  private sendCommandResult(
    commandType: DispatchableCommand['type'],
    commandId: string,
    payload: CommandResultPayload,
    options?: { startedAtMs?: number; replay?: boolean }
  ): void {
    if (!options?.replay) {
      runtimeTelemetry.recordCommandResult(
        commandType,
        payload.success,
        options?.startedAtMs !== undefined ? Date.now() - options.startedAtMs : 0
      );
    }

    const message: CommandResultMessage = {
      type: 'command-result',
      data: {
        nodeId: agentConfig.nodeId,
        commandId,
        ...payload,
        timestamp: new Date(),
      },
    };

    if (cncClient.isConnected()) {
      cncClient.send(message);
      this.bufferedCommandResults.delete(commandId);
      return;
    }

    this.enqueueBufferedCommandResult(message);
  }

  private enqueueBufferedCommandResult(message: CommandResultMessage): void {
    const commandId = message.data.commandId;
    if (!this.bufferedCommandResults.has(commandId) &&
      this.bufferedCommandResults.size >= this.maxBufferedCommandResults
    ) {
      const oldestCommandId = this.bufferedCommandResults.keys().next().value;
      if (oldestCommandId) {
        this.bufferedCommandResults.delete(oldestCommandId);
        logger.warn('Command result buffer reached capacity; dropping oldest entry', {
          maxBufferedCommandResults: this.maxBufferedCommandResults,
        });
      }
    }

    this.bufferedCommandResults.set(commandId, message);
  }

  private flushBufferedCommandResults(): void {
    if (!cncClient.isConnected() || this.bufferedCommandResults.size === 0) {
      return;
    }

    for (const [commandId, message] of this.bufferedCommandResults.entries()) {
      cncClient.send(message);
      this.bufferedCommandResults.delete(commandId);
    }
  }

  private async executeCommandWithReliability(
    command: DispatchableCommand,
    execute: () => Promise<CommandResultPayload>
  ): Promise<void> {
    const existingRecord = this.commandExecutions.get(command.commandId);
    if (existingRecord) {
      this.handleDuplicateCommand(command, existingRecord);
      return;
    }

    const record: CommandExecutionRecord = {
      commandId: command.commandId,
      commandType: command.type,
      state: 'queued',
      attempts: 0,
      receivedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    this.commandExecutions.set(command.commandId, record);

    logger.debug('Command lifecycle transition', {
      commandId: record.commandId,
      commandType: record.commandType,
      from: null,
      to: record.state,
      attempts: record.attempts,
    });

    const policy = COMMAND_EXECUTION_POLICIES[command.type];
    let finalResult: CommandResultPayload | null = null;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      record.attempts = attempt;
      this.transitionCommandState(record, 'sent');

      try {
        const attemptResult = await this.executeWithTimeout(
          command,
          attempt,
          policy.timeoutMs,
          execute
        );

        if (attemptResult.success) {
          finalResult = attemptResult;
          this.transitionCommandState(record, 'acknowledged');
          break;
        }

        record.lastError = attemptResult.error ?? 'Command failed';
        finalResult = attemptResult;

        const shouldRetry = attempt < policy.maxAttempts && policy.retryOnFailure;
        if (shouldRetry) {
          logger.warn('Command attempt failed; retrying', {
            commandId: command.commandId,
            commandType: command.type,
            attempt,
            maxAttempts: policy.maxAttempts,
            retryDelayMs: policy.retryDelayMs,
            error: record.lastError,
          });
          await this.delay(policy.retryDelayMs);
          continue;
        }

        this.transitionCommandState(record, 'failed');
        break;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const timedOut = this.isCommandTimeoutError(error);
        const nonRetryable = error instanceof NonRetryableCommandError;
        record.lastError = message;

        const shouldRetry = !nonRetryable && attempt < policy.maxAttempts;
        if (shouldRetry) {
          logger.warn('Command attempt failed; retrying', {
            commandId: command.commandId,
            commandType: command.type,
            attempt,
            maxAttempts: policy.maxAttempts,
            retryDelayMs: policy.retryDelayMs,
            timedOut,
            error: message,
          });
          await this.delay(policy.retryDelayMs);
          continue;
        }

        finalResult = {
          success: false,
          error: message,
        };
        this.transitionCommandState(record, timedOut ? 'timed_out' : 'failed');
        break;
      }
    }

    if (!finalResult) {
      finalResult = {
        success: false,
        error: 'Command failed with no terminal result',
      };
      record.lastError = finalResult.error;
      this.transitionCommandState(record, 'failed');
    }

    record.result = finalResult;
    if (!finalResult.success) {
      logger.error('Command execution failed', {
        commandId: command.commandId,
        commandType: command.type,
        attempts: record.attempts,
        error: finalResult.error,
      });
    }

    this.sendCommandResult(command.type, command.commandId, finalResult, {
      startedAtMs: record.receivedAtMs,
    });
    this.pruneCommandExecutionRecords();
  }

  private handleDuplicateCommand(
    command: DispatchableCommand,
    existingRecord: CommandExecutionRecord
  ): void {
    if (existingRecord.commandType !== command.type) {
      logger.error('Command id collision detected across command types', {
        commandId: command.commandId,
        incomingCommandType: command.type,
        existingCommandType: existingRecord.commandType,
      });
      return;
    }

    logger.warn('Duplicate command delivery detected', {
      commandId: command.commandId,
      commandType: command.type,
      state: existingRecord.state,
      attempts: existingRecord.attempts,
    });

    if (this.isTerminalCommandState(existingRecord.state) && existingRecord.result) {
      this.sendCommandResult(command.type, command.commandId, existingRecord.result, {
        startedAtMs: existingRecord.receivedAtMs,
        replay: true,
      });
      return;
    }

    logger.info('Ignoring duplicate command while original execution remains in-flight', {
      commandId: command.commandId,
      commandType: command.type,
      state: existingRecord.state,
      attempts: existingRecord.attempts,
    });
  }

  private transitionCommandState(record: CommandExecutionRecord, nextState: CommandState): void {
    const previousState = record.state;
    record.state = nextState;
    record.updatedAtMs = Date.now();

    const transitionContext = {
      commandId: record.commandId,
      commandType: record.commandType,
      from: previousState,
      to: nextState,
      attempts: record.attempts,
      error: record.lastError,
    };

    if (this.isTerminalCommandState(nextState)) {
      logger.info('Command lifecycle transition', transitionContext);
      return;
    }

    logger.debug('Command lifecycle transition', transitionContext);
  }

  private executeWithTimeout<T>(
    command: DispatchableCommand,
    attempt: number,
    timeoutMs: number,
    execute: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        const timeoutError = new Error(
          `Command ${command.commandId} (${command.type}) timed out after ${timeoutMs}ms on attempt ${attempt}`
        ) as Error & { code?: string };
        timeoutError.code = COMMAND_EXECUTION_TIMEOUT_CODE;
        reject(timeoutError);
      }, timeoutMs);

      Promise.resolve()
        .then(() => execute())
        .then((result) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private isCommandTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    return (error as { code?: unknown }).code === COMMAND_EXECUTION_TIMEOUT_CODE;
  }

  private isTerminalCommandState(state: CommandState): boolean {
    return state === 'acknowledged' || state === 'failed' || state === 'timed_out';
  }

  private pruneCommandExecutionRecords(): void {
    const nowMs = Date.now();

    for (const [commandId, record] of this.commandExecutions.entries()) {
      if (
        this.isTerminalCommandState(record.state) &&
        nowMs - record.updatedAtMs > this.commandExecutionRetentionMs
      ) {
        this.commandExecutions.delete(commandId);
      }
    }

    if (this.commandExecutions.size <= this.maxTrackedCommandExecutions) {
      return;
    }

    for (const [commandId, record] of this.commandExecutions.entries()) {
      if (this.commandExecutions.size <= this.maxTrackedCommandExecutions) {
        break;
      }

      if (this.isTerminalCommandState(record.state)) {
        this.commandExecutions.delete(commandId);
      }
    }

    while (this.commandExecutions.size > this.maxTrackedCommandExecutions) {
      const oldestCommandId = this.commandExecutions.keys().next().value;
      if (!oldestCommandId) {
        break;
      }
      this.commandExecutions.delete(oldestCommandId);
    }
  }

  /**
   * Handle wake command from C&C
   */
  private async handleWakeCommand(command: WakeCommand): Promise<void> {
    const { commandId, data } = command;
    const { hostName, mac } = data;

    logger.info('Received wake command from C&C', { commandId, hostName, mac });

    await this.executeCommandWithReliability(command, async () => {
      if (!this.hostDb) {
        throw new NonRetryableCommandError('Host database not initialized');
      }

      // Prefer hostname lookup, but fall back to MAC for stale/missing hostnames.
      let host = await this.hostDb.getHost(hostName);
      if (!host) {
        host = await this.hostDb.getHostByMAC(mac);
      }

      const targetMac = host?.mac ?? mac;
      if (!targetMac) {
        throw new NonRetryableCommandError(`Host ${hostName} not found`);
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

      logger.info('Wake command completed', { commandId, hostName });

      return {
        success: true,
        message: `Wake-on-LAN packet sent to ${host?.name || hostName} (${targetMac})`,
      };
    });
  }

  /**
   * Handle scan command from C&C
   */
  private async handleScanCommand(command: ScanCommand): Promise<void> {
    const { commandId, data } = command;
    const { immediate } = data;

    logger.info('Received scan command from C&C', { commandId, immediate });

    await this.executeCommandWithReliability(command, async () => {
      if (!this.hostDb) {
        throw new NonRetryableCommandError('Host database not initialized');
      }
      if (!this.scanOrchestrator) {
        throw new NonRetryableCommandError('Scan orchestrator not initialized');
      }

      if (immediate) {
        const scanResult = await this.scanOrchestrator.syncWithNetwork();
        if (!scanResult.success) {
          throw new Error(scanResult.error);
        }
        const hosts = await this.hostDb.getAllHosts();

        logger.info('Scan command completed', { commandId, hostCount: hosts.length });

        return {
          success: true,
          message: `Scan completed, found ${hosts.length} hosts`,
        };
      }

      const scanOrchestrator = this.scanOrchestrator;
      setTimeout(() => {
        void scanOrchestrator.syncWithNetwork().then((scanResult) => {
          if (!scanResult.success && scanResult.code !== 'SCAN_IN_PROGRESS') {
            logger.error('Background scan command failed', {
              commandId,
              error: scanResult.error,
            });
          }
        });
      }, 0);

      logger.info('Scan command scheduled in background', { commandId });

      return {
        success: true,
        message: 'Background scan scheduled',
      };
    });
  }

  /**
   * Handle update-host command from C&C
   */
  private async handleUpdateHostCommand(command: UpdateHostCommand): Promise<void> {
    const { commandId } = command;

    await this.executeCommandWithReliability(command, async () => {
      if (!this.hostDb) {
        throw new NonRetryableCommandError('Host database not initialized');
      }

      let data: ValidatedUpdateHostData;
      try {
        data = this.validateUpdateHostData(command.data);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid update-host payload';
        throw new NonRetryableCommandError(message);
      }

      const currentName = data.currentName ?? data.name;

      logger.info('Received update-host command from C&C', {
        commandId,
        currentName,
        targetName: data.name,
      });

      const existing = await this.hostDb.getHost(currentName);
      if (!existing) {
        throw new NonRetryableCommandError(`Host ${currentName} not found`);
      }

      await this.hostDb.updateHost(currentName, {
        name: data.name,
        mac: data.mac,
        ip: data.ip,
        status: data.status,
        notes: data.notes,
        tags: data.tags,
      }, {
        emitLifecycleEvent: false,
      });

      const updated = await this.hostDb.getHost(data.name);
      if (updated) {
        this.sendHostUpdated(updated);
      }

      return {
        success: true,
        message:
          currentName === data.name
            ? `Host ${data.name} updated successfully`
            : `Host ${currentName} renamed to ${data.name} and updated successfully`,
      };
    });
  }

  /**
   * Handle delete-host command from C&C
   */
  private async handleDeleteHostCommand(command: DeleteHostCommand): Promise<void> {
    const { commandId, data } = command;
    const { name } = data;

    logger.info('Received delete-host command from C&C', { commandId, name });

    await this.executeCommandWithReliability(command, async () => {
      if (!this.hostDb) {
        throw new NonRetryableCommandError('Host database not initialized');
      }

      await this.hostDb.deleteHost(name, { emitLifecycleEvent: false });
      this.sendHostRemoved(name);

      return {
        success: true,
        message: `Host ${name} deleted successfully`,
      };
    });
  }

  /**
   * Handle ping-host command from C&C
   */
  private async handlePingHostCommand(command: PingHostCommand): Promise<void> {
    const { commandId, data } = command;
    const { hostName, mac, ip } = data;

    logger.info('Received ping-host command from C&C', { commandId, hostName, ip });

    await this.executeCommandWithReliability(command, async () => {
      if (!this.hostDb) {
        throw new NonRetryableCommandError('Host database not initialized');
      }

      let host = await this.hostDb.getHost(hostName);
      if (!host) {
        host = await this.hostDb.getHostByMAC(mac);
      }

      const targetIp = host?.ip ?? ip;
      if (!targetIp || isIP(targetIp) === 0) {
        throw new NonRetryableCommandError(`Host ${hostName} has no valid IP to ping`);
      }

      const startedAtMs = Date.now();
      const reachable = await networkDiscovery.isHostAlive(targetIp);
      const latencyMs = Math.max(0, Date.now() - startedAtMs);
      const status: Host['status'] = reachable ? 'awake' : 'asleep';
      const pingResponsive = reachable ? 1 : 0;
      const checkedAt = new Date().toISOString();

      const resolvedMac = host?.mac ?? mac;
      if (resolvedMac) {
        await this.hostDb.updateHostSeen(resolvedMac, status, pingResponsive);
        const refreshedHost = await this.hostDb.getHostByMAC(resolvedMac);
        if (refreshedHost) {
          this.sendHostUpdated(refreshedHost);
        }
      }

      return {
        success: true,
        message: `Host ${host?.name ?? hostName} is ${status}`,
        hostPing: {
          hostName: host?.name ?? hostName,
          mac: resolvedMac,
          ip: targetIp,
          reachable,
          status,
          latencyMs,
          checkedAt,
        },
      };
    });
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

    let notes: string | null | undefined;
    if (payload.notes !== undefined) {
      if (payload.notes !== null && typeof payload.notes !== 'string') {
        throw new Error('Invalid update-host payload: notes must be a string or null');
      }
      const normalizedNotes = typeof payload.notes === 'string' ? payload.notes.trim() : null;
      if (normalizedNotes && normalizedNotes.length > 2_000) {
        throw new Error('Invalid update-host payload: notes must be at most 2000 characters');
      }
      notes = normalizedNotes;
    }

    let tags: string[] | undefined;
    if (payload.tags !== undefined) {
      if (!Array.isArray(payload.tags)) {
        throw new Error('Invalid update-host payload: tags must be an array of strings');
      }
      if (payload.tags.length > 32) {
        throw new Error('Invalid update-host payload: tags must contain at most 32 entries');
      }
      tags = payload.tags.map((tag) => {
        if (typeof tag !== 'string') {
          throw new Error('Invalid update-host payload: tags must be an array of strings');
        }
        const normalizedTag = tag.trim();
        if (!normalizedTag || normalizedTag.length > 64) {
          throw new Error(
            'Invalid update-host payload: each tag must be between 1 and 64 characters'
          );
        }
        return normalizedTag;
      });
    }

    return {
      currentName,
      name,
      mac,
      ip,
      status,
      notes,
      tags,
    };
  }
}

// Export singleton instance
export const agentService = new AgentService();
