import WebSocket from 'ws';
import { EventEmitter } from 'events';
import os from 'os';
import { agentConfig } from '../config/agent';
import { NodeMessage, CncCommand, NodeRegistration } from '../types';
import { logger } from '../utils/logger';

/**
 * C&C Client Service
 * Manages WebSocket connection to Command & Control backend
 */
export class CncClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private isRegistered = false;

  constructor() {
    super();
  }

  /**
   * Connect to C&C backend
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      logger.debug('Already connecting or connected to C&C');
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = `${agentConfig.cncUrl}/ws/node?token=${agentConfig.authToken}`;
      logger.info('Connecting to C&C backend', { url: agentConfig.cncUrl });

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data: WebSocket.Data) => this.handleMessage(data));
      this.ws.on('error', (error: Error) => this.handleError(error));
      this.ws.on('close', (code: number, reason: Buffer) => this.handleClose(code, reason));
    } catch (error) {
      logger.error('Failed to connect to C&C', { error });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from C&C backend
   */
  public disconnect(): void {
    logger.info('Disconnecting from C&C backend');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isRegistered = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Send message to C&C backend
   */
  public send(message: NodeMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message: not connected to C&C', { messageType: message.type });
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
      logger.debug('Sent message to C&C', { type: message.type });
    } catch (error) {
      logger.error('Failed to send message to C&C', { error, messageType: message.type });
    }
  }

  /**
   * Check if connected to C&C
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isRegistered;
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    logger.info('Connected to C&C backend');
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Send registration message
    this.register();
  }

  /**
   * Register node with C&C backend
   */
  private register(): void {
    const registration: NodeRegistration = {
      nodeId: agentConfig.nodeId,
      name: agentConfig.nodeId,
      location: agentConfig.location,
      authToken: agentConfig.authToken,
      publicUrl: agentConfig.publicUrl || undefined,
      metadata: {
        version: '1.0.0', // TODO: Get from package.json
        platform: os.platform(),
        networkInfo: {
          subnet: '0.0.0.0/0', // TODO: Get actual subnet
          gateway: '0.0.0.0', // TODO: Get actual gateway
        },
      },
    };

    this.send({ type: 'register', data: registration });
    logger.info('Sent registration to C&C', { nodeId: agentConfig.nodeId });
  }

  /**
   * Handle incoming messages from C&C
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as CncCommand;
      logger.debug('Received message from C&C', { type: message.type });

      switch (message.type) {
        case 'registered':
          this.handleRegistered(message.data);
          break;
        case 'wake':
          this.emit('command:wake', message);
          break;
        case 'scan':
          this.emit('command:scan', message);
          break;
        case 'update-host':
          this.emit('command:update-host', message);
          break;
        case 'delete-host':
          this.emit('command:delete-host', message);
          break;
        case 'ping':
          this.handlePing(message.data);
          break;
        default:
          logger.warn('Unknown message type from C&C', { message });
      }
    } catch (error) {
      logger.error('Failed to parse message from C&C', { error, data: data.toString() });
    }
  }

  /**
   * Handle registration confirmation
   */
  private handleRegistered(data: { nodeId: string; heartbeatInterval: number }): void {
    logger.info('Registration confirmed by C&C', data);
    this.isRegistered = true;

    // Start heartbeat
    this.startHeartbeat(data.heartbeatInterval);

    // Emit connected event
    this.emit('connected');
  }

  /**
   * Handle ping from C&C
   */
  private handlePing(data: { timestamp: Date }): void {
    logger.debug('Received ping from C&C', data);
    // Ping doesn't require a response, heartbeat serves that purpose
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(interval: number): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'heartbeat',
        data: {
          nodeId: agentConfig.nodeId,
          timestamp: new Date(),
        },
      });
    }, interval);

    logger.info('Started heartbeat', { interval });
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    logger.error('C&C WebSocket error', { error: error.message });
    this.emit('error', error);
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(code: number, reason: Buffer): void {
    logger.warn('C&C connection closed', { code, reason: reason.toString() });

    this.isConnecting = false;
    this.isRegistered = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.emit('disconnected');

    // Schedule reconnection
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    // Check if we've exceeded max attempts
    if (
      agentConfig.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= agentConfig.maxReconnectAttempts
    ) {
      logger.error('Max reconnection attempts reached, giving up');
      this.emit('reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = agentConfig.reconnectInterval;

    logger.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// Export singleton instance
export const cncClient = new CncClient();
