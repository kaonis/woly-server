/**
 * Node lifecycle management service
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { ZodError } from 'zod';
import {
  inboundCncCommandSchema,
  outboundNodeMessageSchema,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@kaonis/woly-protocol';
import type {
  CncCommand,
  Host,
  CommandResultPayload,
  NodeMessage,
  NodeRegistration,
} from '@kaonis/woly-protocol';
import { NodeModel } from '../models/Node';
import { HostAggregator } from './hostAggregator';
import config from '../config';
import logger from '../utils/logger';
import { type WsUpgradeAuthContext, matchesStaticToken } from '../websocket/upgradeAuth';
import { mintWsSessionToken, verifyWsSessionToken } from '../websocket/sessionTokens';

interface NodeConnection {
  nodeId: string;
  ws: WebSocket;
  registeredAt: Date;
  location: string;
}

type DispatchCommand = Extract<CncCommand, { commandId: string }>;

export class NodeManager extends EventEmitter {
  private connections: Map<string, NodeConnection> = new Map();
  private heartbeatCheckInterval?: NodeJS.Timeout;
  private hostAggregator: HostAggregator;
  private pendingUpgradeAuth: WeakMap<WebSocket, WsUpgradeAuthContext> = new WeakMap();
  private protocolValidationFailureCounts: Map<string, number> = new Map();
  private protocolValidationFailureTotal = 0;

  constructor(hostAggregator: HostAggregator) {
    super();
    this.hostAggregator = hostAggregator;
    this.startHeartbeatCheck();
  }

  /**
   * Handle new WebSocket connection from a node
   */
  async handleConnection(ws: WebSocket, authContext: unknown): Promise<void> {
    // At this point the upgrade handler already validated the token. We still defensively
    // validate shape here and keep the auth context available for registration-time checks.
    const parsed = this.parseUpgradeAuth(authContext);
    if (!parsed) {
      logger.warn('Invalid auth context for node connection');
      ws.close(4001, 'Invalid authentication token');
      return;
    }
    this.pendingUpgradeAuth.set(ws, parsed);

    // Wait for registration message
    ws.on('message', async (data: WebSocket.Data) => {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(data.toString());
      } catch (error) {
        this.logProtocolValidationError({
          direction: 'inbound',
          messageType: 'malformed-json',
          payload: data.toString(),
          error,
        });
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        return;
      }

      const parsedMessage = outboundNodeMessageSchema.safeParse(parsedPayload);
      if (!parsedMessage.success) {
        this.logProtocolValidationError({
          direction: 'inbound',
          messageType: this.extractMessageType(parsedPayload),
          payload: parsedPayload,
          error: parsedMessage.error,
        });
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid protocol payload' }));
        return;
      }

      try {
        await this.handleMessage(ws, parsedMessage.data);
      } catch (error) {
        logger.error('Error handling node message', { error });
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', async () => {
      this.pendingUpgradeAuth.delete(ws);
      const connection = this.getConnectionBySocket(ws);
      
      if (connection) {
        logger.info('Node disconnected', { nodeId: connection.nodeId });
        this.connections.delete(connection.nodeId);
        
        // Mark node's hosts as unreachable
        try {
          await this.hostAggregator.markNodeHostsUnreachable(connection.nodeId);
        } catch (error) {
          logger.error('Failed to mark node hosts as unreachable', {
            nodeId: connection.nodeId,
            error,
          });
        }
      }
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { error });
    });
  }

  /**
   * Handle messages from nodes
   */
  private async handleMessage(ws: WebSocket, message: NodeMessage): Promise<void> {
    const existingConnection = this.getConnectionBySocket(ws);

    if (message.type === 'register') {
      if (existingConnection) {
        logger.warn('Rejected re-registration attempt on an already registered connection', {
          boundNodeId: existingConnection.nodeId,
          payloadNodeId: message.data.nodeId,
        });
        ws.close(4409, 'Already registered');
        return;
      }
      await this.handleRegistration(ws, message.data);
      return;
    }

    const connection = existingConnection;
    if (!connection) {
      logger.warn('Ignoring message before registration', { type: message.type });
      ws.close(4401, 'Registration required before sending messages');
      return;
    }

    const boundNodeId = connection.nodeId;

    switch (message.type) {
      case 'heartbeat':
        await this.handleHeartbeat(boundNodeId);
        break;

      case 'host-discovered':
        await this.handleHostDiscovered({
          ...message.data,
          nodeId: boundNodeId,
        });
        break;

      case 'host-updated':
        await this.handleHostUpdated({
          ...message.data,
          nodeId: boundNodeId,
        });
        break;

      case 'host-removed':
        await this.handleHostRemoved({
          ...message.data,
          nodeId: boundNodeId,
        });
        break;

      case 'scan-complete':
        await this.handleScanComplete({
          ...message.data,
          nodeId: boundNodeId,
        });
        break;

      case 'command-result':
        await this.handleCommandResult({
          ...message.data,
          nodeId: boundNodeId,
        });
        break;
    }
  }

  /**
   * Handle node registration
   */
  private async handleRegistration(
    ws: WebSocket, 
    registration: NodeRegistration
  ): Promise<void> {
    try {
      const existingConnection = this.getConnectionBySocket(ws);
      if (existingConnection) {
        ws.close(4409, 'Already registered');
        return;
      }

      const upgradeAuth = this.pendingUpgradeAuth.get(ws);
      if (!upgradeAuth) {
        ws.close(4401, 'Registration required before sending messages');
        return;
      }

      // If the upgrade was authenticated via a session token, lock registration to that node id.
      if (upgradeAuth.kind === 'session-token' && registration.nodeId !== upgradeAuth.nodeId) {
        logger.warn('Rejected registration for mismatched session token subject', {
          sessionNodeId: upgradeAuth.nodeId,
          payloadNodeId: registration.nodeId,
        });
        ws.close(4401, 'Registration nodeId does not match session token');
        return;
      }

      // If the upgrade used a static token and the registration payload includes one,
      // verify they match. Newer nodes omit authToken from the payload (already validated
      // during WS upgrade) so we only enforce when present for backwards compatibility.
      if (
        upgradeAuth.kind === 'static-token' &&
        registration.authToken &&
        registration.authToken !== upgradeAuth.token
      ) {
        logger.warn('Rejected registration for mismatched auth token', {
          nodeId: registration.nodeId,
        });
        ws.close(4001, 'Invalid authentication token');
        return;
      }

      const protocolVersion = registration.metadata.protocolVersion;
      if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
        logger.warn('Rejected node registration for unsupported protocol version', {
          nodeId: registration.nodeId,
          protocolVersion,
          supported: SUPPORTED_PROTOCOL_VERSIONS,
        });
        ws.close(4406, 'Unsupported protocol version');
        return;
      }

      // Register node in database
      const node = await NodeModel.register(registration);

      // Store WebSocket connection
      this.connections.set(node.id, {
        nodeId: node.id,
        ws,
        registeredAt: new Date(),
        location: node.location,
      });

      const minted = mintWsSessionToken(node.id, {
        issuer: config.wsSessionTokenIssuer,
        audience: config.wsSessionTokenAudience,
        ttlSeconds: config.wsSessionTokenTtlSeconds,
        secrets: config.wsSessionTokenSecrets,
      });

      // Send success response
      ws.send(JSON.stringify({
        type: 'registered',
        data: {
          nodeId: node.id,
          heartbeatInterval: config.nodeHeartbeatInterval,
          protocolVersion: PROTOCOL_VERSION,
          // Newer node agents can use this to reconnect with a short-lived token.
          // Older agents will ignore it.
          sessionToken: minted.token,
          sessionExpiresAt: new Date(minted.expiresAt * 1000).toISOString(),
        },
      }));

      logger.info('Node registered successfully', {
        nodeId: node.id,
        location: node.location,
      });
    } catch (error) {
      logger.error('Node registration failed', { error });
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Registration failed',
      }));
      ws.close(4000, 'Registration failed');
    }
  }

  getProtocolValidationStats(): {
    total: number;
    byKey: Record<string, number>;
  } {
    return {
      total: this.protocolValidationFailureTotal,
      byKey: Object.fromEntries(this.protocolValidationFailureCounts.entries()),
    };
  }

  private parseUpgradeAuth(value: unknown): WsUpgradeAuthContext | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    // Type guard for expected shape
    const hasKindAndToken = (v: object): v is { kind: unknown; token: unknown } =>
      'kind' in v && 'token' in v;

    if (!hasKindAndToken(value)) {
      return null;
    }

    const { kind, token } = value;

    if (kind === 'static-token' && typeof token === 'string' && token.length > 0) {
      // Re-validate just in case a caller bypassed the upgrade handler.
      if (!matchesStaticToken(token, config.nodeAuthTokens)) {
        return null;
      }
      return { kind, token };
    }

    if (kind === 'session-token' && typeof token === 'string' && token.length > 0) {
      // Re-verify just in case a caller bypassed the upgrade handler.
      try {
        const claims = verifyWsSessionToken(token, {
          issuer: config.wsSessionTokenIssuer,
          audience: config.wsSessionTokenAudience,
          ttlSeconds: config.wsSessionTokenTtlSeconds,
          secrets: config.wsSessionTokenSecrets,
        });
        return { kind, token, nodeId: claims.nodeId, expiresAt: claims.expiresAt };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Handle heartbeat from node
   */
  private async handleHeartbeat(nodeId: string): Promise<void> {
    try {
      await NodeModel.updateHeartbeat(nodeId);
      logger.debug('Heartbeat received', { nodeId });
    } catch (error) {
      logger.error('Failed to update heartbeat', { nodeId, error });
    }
  }

  /**
   * Send command to a specific node
   * 
   * @param nodeId Node identifier
   * @param command Command to send (must include commandId)
   * @throws Error if node is not connected
   */
  sendCommand(nodeId: string, command: DispatchCommand): void {
    const connection = this.connections.get(nodeId);
    
    if (!connection) {
      throw new Error(`Node ${nodeId} is not connected`);
    }

    const parsedCommand = inboundCncCommandSchema.safeParse(command);
    if (!parsedCommand.success) {
      this.logProtocolValidationError({
        direction: 'outbound',
        messageType: command.type,
        payload: command,
        error: parsedCommand.error,
      });
      throw new Error(`Invalid outbound command payload: ${command.type}`);
    }

    // Send command to node
    connection.ws.send(JSON.stringify(command));
    logger.debug('Sent command to node', { nodeId, commandId: command.commandId, type: command.type });
  }

  /**
   * Get all connected nodes
   */
  getConnectedNodes(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if node is connected
   */
  isNodeConnected(nodeId: string): boolean {
    return this.connections.has(nodeId);
  }

  /**
   * Get node status (online/offline)
   * 
   * @param nodeId Node identifier
   * @returns 'online' if connected, 'offline' otherwise
   */
  async getNodeStatus(nodeId: string): Promise<'online' | 'offline'> {
    // Check if node has active WebSocket connection
    if (this.connections.has(nodeId)) {
      return 'online';
    }

    // Check database for node status
    try {
      const node = await NodeModel.findById(nodeId);
      return node ? node.status : 'offline';
    } catch (error) {
      logger.error('Failed to get node status', { nodeId, error });
      return 'offline';
    }
  }

  /**
   * Handle host-discovered event
   */
  private async handleHostDiscovered(data: Host & { nodeId: string }): Promise<void> {
    try {
      const connection = this.connections.get(data.nodeId);
      if (!connection) {
        logger.warn('Received host event from unknown node', { nodeId: data.nodeId });
        return;
      }

      const { nodeId, ...host } = data;
      await this.hostAggregator.onHostDiscovered({
        nodeId,
        host,
        location: connection.location,
      });
    } catch (error) {
      logger.error('Failed to handle host-discovered', { error });
    }
  }

  /**
   * Handle host-updated event
   */
  private async handleHostUpdated(data: Host & { nodeId: string }): Promise<void> {
    try {
      const connection = this.connections.get(data.nodeId);
      if (!connection) {
        logger.warn('Received host event from unknown node', { nodeId: data.nodeId });
        return;
      }

      const { nodeId, ...host } = data;
      await this.hostAggregator.onHostUpdated({
        nodeId,
        host,
        location: connection.location,
      });
    } catch (error) {
      logger.error('Failed to handle host-updated', { error });
    }
  }

  /**
   * Handle host-removed event
   */
  private async handleHostRemoved(data: { nodeId: string; name: string }): Promise<void> {
    try {
      await this.hostAggregator.onHostRemoved(data);
    } catch (error) {
      logger.error('Failed to handle host-removed', { error });
    }
  }

  /**
   * Handle scan-complete event
   */
  private async handleScanComplete(data: { nodeId: string; hostCount: number }): Promise<void> {
    logger.info('Node scan complete', {
      nodeId: data.nodeId,
      hostCount: data.hostCount,
    });
  }

  /**
   * Handle command-result event
   */
  private async handleCommandResult(data: CommandResultPayload): Promise<void> {
    logger.debug('Received command result from node', {
      nodeId: data.nodeId,
      commandId: data.commandId,
      success: data.success,
    });

    // Emit event for CommandRouter
    this.emit('command-result', data);
  }

  private getConnectionBySocket(ws: WebSocket): NodeConnection | undefined {
    return Array.from(this.connections.values()).find((connection) => connection.ws === ws);
  }

  private extractMessageType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
      return 'unknown';
    }

    const maybeType = (payload as { type?: unknown }).type;
    return typeof maybeType === 'string' ? maybeType : 'unknown';
  }

  private logProtocolValidationError(params: {
    direction: 'inbound' | 'outbound';
    messageType: string;
    payload: unknown;
    error: unknown;
  }): void {
    const key = `${params.direction}:${params.messageType}`;
    this.protocolValidationFailureTotal += 1;
    this.protocolValidationFailureCounts.set(key, (this.protocolValidationFailureCounts.get(key) || 0) + 1);

    const validationIssues =
      params.error instanceof ZodError
        ? params.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          }))
        : undefined;

    logger.warn('Protocol validation failed', {
      direction: params.direction,
      messageType: params.messageType,
      error: params.error instanceof Error ? params.error.message : String(params.error),
      validationIssues,
      payload: this.sanitizeLogPayload(params.payload),
    });
  }

  private sanitizeLogPayload(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > 4) {
      return '[truncated-depth]';
    }

    if (typeof value === 'string') {
      return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => this.sanitizeLogPayload(item, depth + 1));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
        result[key] = /(token|authorization|secret|password)/i.test(key)
          ? '[REDACTED]'
          : this.sanitizeLogPayload(nested, depth + 1);
      }

      return result;
    }

    return String(value);
  }

  /**
   * Periodically check for stale nodes
   */
  private startHeartbeatCheck(): void {
    this.heartbeatCheckInterval = setInterval(async () => {
      try {
        const markedOffline = await NodeModel.markStaleNodesOffline(config.nodeTimeout);
        
        if (markedOffline > 0) {
          logger.warn('Marked stale nodes offline', { count: markedOffline });
          
          // Mark hosts as unreachable for offline nodes
          const offlineNodes = await NodeModel.getOfflineNodes();
          for (const node of offlineNodes) {
            if (!this.connections.has(node.id)) {
              try {
                await this.hostAggregator.markNodeHostsUnreachable(node.id);
              } catch (error) {
                logger.error('Failed to mark offline node hosts as unreachable', {
                  nodeId: node.id,
                  error,
                });
              }
            }
          }
        }
      } catch (error) {
        logger.error('Error in heartbeat check', { error });
      }
    }, config.nodeHeartbeatInterval);
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
    }

    // Close all connections
    for (const connection of this.connections.values()) {
      connection.ws.close(1000, 'Server shutdown');
    }

    this.connections.clear();
    logger.info('NodeManager shut down');
  }
}

export default NodeManager;
