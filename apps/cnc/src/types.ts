/**
 * Core type definitions for WoLy C&C Backend
 */

import type { CommandState, Host, NodeMetadata as ProtocolNodeMetadata } from '@kaonis/woly-protocol';

// Node Types
export interface Node {
  id: string;
  name: string;
  location: string;
  publicUrl?: string;
  status: 'online' | 'offline';
  lastHeartbeat: Date;
  capabilities: string[];
  metadata: NodeMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type NodeMetadata = ProtocolNodeMetadata;

// Host Types — canonical Host comes from protocol
export type { Host } from '@kaonis/woly-protocol';

export interface AggregatedHost extends Host {
  nodeId: string;
  location: string;
  fullyQualifiedName: string;
  createdAt: Date;
  updatedAt: Date;
}

export type {
  CncCommand,
  CommandResultPayload,
  CommandState,
  ErrorResponse,
  HostPayload,
  HostStatus,
  NodeMessage,
  NodeRegistration,
  RegisteredCommandData,
} from '@kaonis/woly-protocol';

export interface CommandResult {
  commandId: string;
  success: boolean;
  error?: string;
  timestamp: Date;
}

// API Response Types
export interface NodesResponse {
  nodes: Node[];
}

export interface HostsResponse {
  hosts: AggregatedHost[];
  stats: {
    total: number;
    awake: number;
    asleep: number;
    byLocation: Record<string, { total: number; awake: number }>;
  };
}

export interface WakeupResponse {
  success: boolean;
  message: string;
  nodeId: string;
  location: string;
}

export interface CommandRecord {
  id: string;
  nodeId: string;
  type: string;
  payload: unknown;
  idempotencyKey: string | null;
  state: CommandState;
  error: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
}

// Configuration Types
export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  dbType: string;
  databaseUrl: string;
  nodeAuthTokens: string[];
  operatorAuthTokens: string[];
  adminAuthTokens: string[];
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtTtlSeconds: number;
  wsRequireTls: boolean;
  wsAllowQueryTokenAuth: boolean;
  wsSessionTokenSecrets: string[];
  wsSessionTokenIssuer: string;
  wsSessionTokenAudience: string;
  wsSessionTokenTtlSeconds: number;
  wsMessageRateLimitPerSecond: number;
  nodeHeartbeatInterval: number;
  nodeTimeout: number;
  commandTimeout: number;
  commandRetentionDays: number;
  commandMaxRetries: number;
  commandRetryBaseDelayMs: number;
  logLevel: string;
}
