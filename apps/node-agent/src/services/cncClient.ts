import WebSocket from 'ws';
import { EventEmitter } from 'events';
import os from 'os';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import { agentConfig } from '../config/agent';
import type {
  CncCommand,
  NodeMessage,
  NodeRegistration,
  RegisteredCommandData,
} from '@kaonis/woly-protocol';
import {
  inboundCncCommandSchema,
  outboundNodeMessageSchema,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@kaonis/woly-protocol';
import { logger } from '../utils/logger';
import { NODE_AGENT_VERSION } from '../utils/nodeAgentVersion';
import { runtimeTelemetry } from './runtimeTelemetry';

const FALLBACK_NETWORK_INFO = {
  subnet: '0.0.0.0/0',
  gateway: '0.0.0.0',
};

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
  private sessionToken: { token: string; expiresAtMs: number | null } | null = null;
  private shouldReconnect = true;

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
    // Reset shouldReconnect flag on explicit connect attempts
    this.shouldReconnect = true;

    try {
      const token = await this.resolveConnectionToken();
      const wsUrl = this.buildWebSocketUrl(token);
      logger.info('Connecting to C&C backend', { url: agentConfig.cncUrl });

      this.ws = new WebSocket(wsUrl, ['bearer', token], {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
      const validation = outboundNodeMessageSchema.safeParse(message);
      if (!validation.success) {
        this.logProtocolValidationError({
          direction: 'outbound',
          correlationId: this.extractCorrelationId(message),
          messageType: message.type,
          rawData: message,
          error: validation.error,
        });
        return;
      }

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
    const networkInfo = this.resolveNetworkInfo();

    const registration: NodeRegistration = {
      nodeId: agentConfig.nodeId,
      name: agentConfig.nodeId,
      location: agentConfig.location,
      // authToken intentionally omitted — already validated during WS upgrade.
      publicUrl: agentConfig.publicUrl || undefined,
      metadata: {
        version: NODE_AGENT_VERSION,
        platform: os.platform(),
        protocolVersion: PROTOCOL_VERSION,
        networkInfo,
      },
    };

    this.send({ type: 'register', data: registration });
    logger.info('Sent registration to C&C', { nodeId: agentConfig.nodeId });
  }

  private resolveNetworkInfo(): { subnet: string; gateway: string } {
    const interfaces = os.networkInterfaces();

    for (const interfaceEntries of Object.values(interfaces)) {
      for (const iface of interfaceEntries ?? []) {
        const family = String(iface.family).toUpperCase();
        const isIpv4 = family === 'IPV4' || family === '4';

        if (!isIpv4 || iface.internal) {
          continue;
        }

        const subnet = iface.cidr && iface.cidr.trim().length > 0 ? iface.cidr : `${iface.address}/24`;
        const gateway = this.deriveGatewayFromAddress(iface.address);
        return { subnet, gateway };
      }
    }

    return FALLBACK_NETWORK_INFO;
  }

  private deriveGatewayFromAddress(address: string): string {
    const octets = address.split('.');
    if (octets.length !== 4) {
      return FALLBACK_NETWORK_INFO.gateway;
    }

    const parsed = octets.map((octet) => Number.parseInt(octet, 10));
    if (parsed.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
      return FALLBACK_NETWORK_INFO.gateway;
    }

    return `${parsed[0]}.${parsed[1]}.${parsed[2]}.1`;
  }

  /**
   * Handle incoming messages from C&C
   */
  private handleMessage(data: WebSocket.Data): void {
    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(data.toString());
    } catch (error) {
      this.logProtocolValidationError({
        direction: 'inbound',
        correlationId: randomUUID(),
        messageType: 'malformed-json',
        rawData: data.toString(),
        error,
      });
      return;
    }

    try {
      const parsedCommand = inboundCncCommandSchema.safeParse(parsedPayload);
      if (!parsedCommand.success) {
        this.logProtocolValidationError({
          direction: 'inbound',
          correlationId: this.extractCorrelationId(parsedPayload),
          messageType: this.extractMessageType(parsedPayload),
          rawData: parsedPayload,
          error: parsedCommand.error,
        });
        return;
      }

      const message = parsedCommand.data as CncCommand;
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
        case 'error':
          this.handleProtocolError(message.message);
          break;
      }
    } catch (error) {
      this.logProtocolValidationError({
        direction: 'inbound',
        correlationId: this.extractCorrelationId(parsedPayload),
        messageType: this.extractMessageType(parsedPayload),
        rawData: parsedPayload,
        error,
      });
    }
  }

  /**
   * Handle registration confirmation
   */
  private handleRegistered(data: RegisteredCommandData): void {
    if (!data.protocolVersion) {
      logger.warn('Registration missing protocolVersion; assuming compatibility fallback', {
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      });
    }

    if (data.protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(data.protocolVersion)) {
      runtimeTelemetry.recordProtocolUnsupported();
      logger.error('Protocol version mismatch during registration', {
        receivedProtocolVersion: data.protocolVersion,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      });
      this.emit('protocol-unsupported', {
        receivedProtocolVersion: data.protocolVersion,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      });

      // Disable reconnection for protocol mismatch to prevent infinite loop
      this.shouldReconnect = false;
      this.ws?.close(4406, 'unsupported protocol version');
      return;
    }

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

  private handleProtocolError(message: string): void {
    runtimeTelemetry.recordProtocolError();
    logger.warn('Received protocol error from C&C', { message });
    this.emit('protocol-error', { message });
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
    const reasonText = reason.toString();
    logger.warn('C&C connection closed', { code, reason: reasonText });

    this.isConnecting = false;
    this.isRegistered = false;
    this.ws = null;

    if (this.isExpiredAuthFailure(code, reasonText)) {
      runtimeTelemetry.recordAuthExpired();
      logger.warn('C&C rejected authentication: token expired');
      this.invalidateSessionToken();
      this.emit('auth-expired');
    } else if (this.isRevokedAuthFailure(code, reasonText)) {
      runtimeTelemetry.recordAuthRevoked();
      logger.error('C&C rejected authentication: token revoked or invalid');
      this.invalidateSessionToken();
      this.emit('auth-revoked');
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.emit('disconnected');

    // Only schedule reconnection if shouldReconnect flag is true
    // (e.g., not set to false due to protocol version mismatch)
    if (this.shouldReconnect) {
      this.scheduleReconnect();
    } else {
      logger.info('Reconnection disabled (e.g., protocol version mismatch)');
      this.emit('reconnect-disabled');
    }
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
      runtimeTelemetry.recordReconnectFailed();
      logger.error('Max reconnection attempts reached, giving up');
      this.emit('reconnect-failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = agentConfig.reconnectInterval;
    runtimeTelemetry.recordReconnectScheduled();

    logger.info('Scheduling reconnection', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private buildWebSocketUrl(token: string): string {
    const baseUrl = `${agentConfig.cncUrl}/ws/node`;
    if (!agentConfig.wsAllowQueryTokenFallback) {
      return baseUrl;
    }

    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }

  private async resolveConnectionToken(): Promise<string> {
    if (!agentConfig.sessionTokenUrl) {
      return agentConfig.authToken;
    }

    const refreshBufferMs = agentConfig.sessionTokenRefreshBufferSeconds * 1000;
    const nowMs = Date.now();
    if (this.sessionToken) {
      if (
        this.sessionToken.expiresAtMs === null ||
        nowMs < this.sessionToken.expiresAtMs - refreshBufferMs
      ) {
        return this.sessionToken.token;
      }

      logger.info('Session token nearing expiry, requesting refresh');
    }

    return this.fetchSessionToken();
  }

  private async fetchSessionToken(): Promise<string> {
    try {
      const response = await axios.post(
        agentConfig.sessionTokenUrl,
        {
          nodeId: agentConfig.nodeId,
          location: agentConfig.location,
        },
        {
          timeout: agentConfig.sessionTokenRequestTimeoutMs,
          headers: {
            Authorization: `Bearer ${agentConfig.authToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { token, expiresAtMs } = this.parseSessionTokenResponse(response.data);
      this.sessionToken = {
        token,
        expiresAtMs,
      };
      return token;
    } catch (error) {
      this.handleSessionTokenError(error);
      throw error;
    }
  }

  private parseSessionTokenResponse(data: unknown): { token: string; expiresAtMs: number | null } {
    if (!data || typeof data !== 'object') {
      throw new Error('Session token response is invalid');
    }

    const parsed = data as {
      token?: unknown;
      expiresAt?: unknown;
      expiresInSeconds?: unknown;
    };
    if (typeof parsed.token !== 'string' || parsed.token.length === 0) {
      throw new Error('Session token response missing token');
    }

    let expiresAtMs: number | null = null;
    if (typeof parsed.expiresAt === 'number') {
      expiresAtMs = parsed.expiresAt > 1e12 ? parsed.expiresAt : parsed.expiresAt * 1000;
    } else if (typeof parsed.expiresInSeconds === 'number') {
      expiresAtMs = Date.now() + parsed.expiresInSeconds * 1000;
    }

    return { token: parsed.token, expiresAtMs };
  }

  private handleSessionTokenError(error: unknown): void {
    const status = this.extractHttpStatus(error);

    if (status === 401) {
      runtimeTelemetry.recordAuthExpired();
      logger.warn('Session token request rejected: bootstrap token expired');
      this.invalidateSessionToken();
      this.emit('auth-expired');
      return;
    }

    if (status === 403) {
      runtimeTelemetry.recordAuthRevoked();
      logger.error('Session token request rejected: bootstrap token revoked');
      this.invalidateSessionToken();
      this.emit('auth-revoked');
      return;
    }

    runtimeTelemetry.recordAuthUnavailable();
    logger.warn('Session token service unavailable', { error });
    this.emit('auth-unavailable');
  }

  private extractHttpStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const maybeResponse = (error as { response?: { status?: unknown } }).response;
    if (!maybeResponse || typeof maybeResponse.status !== 'number') {
      return null;
    }

    return maybeResponse.status;
  }

  private isExpiredAuthFailure(code: number, reason: string): boolean {
    return code === 4001 || code === 4401 || /expired/i.test(reason);
  }

  private isRevokedAuthFailure(code: number, reason: string): boolean {
    return code === 4003 || code === 4403 || /revoked|invalid auth|invalid token/i.test(reason);
  }

  private invalidateSessionToken(): void {
    this.sessionToken = null;
  }

  private extractMessageType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return 'unknown';
    }

    const maybeType = (payload as { type?: unknown }).type;
    return typeof maybeType === 'string' ? maybeType : 'unknown';
  }

  private extractCorrelationId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return randomUUID();
    }

    const topLevelCommandId = (payload as { commandId?: unknown }).commandId;
    if (typeof topLevelCommandId === 'string' && topLevelCommandId.length > 0) {
      return topLevelCommandId;
    }

    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      const nestedCommandId = (data as { commandId?: unknown }).commandId;
      if (typeof nestedCommandId === 'string' && nestedCommandId.length > 0) {
        return nestedCommandId;
      }
    }

    return randomUUID();
  }

  private logProtocolValidationError(params: {
    direction: 'inbound' | 'outbound';
    correlationId: string;
    messageType: string;
    rawData: unknown;
    error: unknown;
  }): void {
    const { direction, correlationId, messageType, rawData, error } = params;
    runtimeTelemetry.recordProtocolValidationFailure(direction);
    const validationIssues =
      error instanceof ZodError
        ? error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          }))
        : undefined;

    logger.error('Protocol validation failed', {
      direction,
      correlationId,
      messageType,
      error: error instanceof Error ? error.message : String(error),
      validationIssues,
      rawData: this.sanitizeProtocolLogData(rawData),
    });
  }

  private sanitizeProtocolLogData(value: unknown, depth = 0): unknown {
    const maxDepth = 5;
    const maxArrayItems = 50;
    const maxObjectKeys = 50;
    const maxStringLength = 2000;

    if (value === null || value === undefined) {
      return value;
    }

    if (depth > maxDepth) {
      return '[truncated-depth]';
    }

    if (typeof value === 'string') {
      return value.length > maxStringLength
        ? `${value.slice(0, maxStringLength)}...[truncated]`
        : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, maxArrayItems)
        .map((item) => this.sanitizeProtocolLogData(item, depth + 1));
    }

    if (typeof value === 'object') {
      const redacted: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).slice(0, maxObjectKeys);
      for (const [key, nestedValue] of entries) {
        if (/(token|authorization|password|secret)/i.test(key)) {
          redacted[key] = '[REDACTED]';
          continue;
        }

        redacted[key] = this.sanitizeProtocolLogData(nestedValue, depth + 1);
      }

      return redacted;
    }

    return String(value);
  }
}

// Export singleton instance
export const cncClient = new CncClient();
