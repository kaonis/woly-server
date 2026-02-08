/**
 * Core type definitions for WoLy C&C Backend
 */

import type { NodeMetadata as ProtocolNodeMetadata } from '@kaonis/woly-protocol';

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

// Host Types
export interface Host {
  name: string;
  mac: string;
  ip: string;
  status: 'awake' | 'asleep';
  lastSeen?: string | null;
  discovered?: number;  // 0 or 1, from node agent
  pingResponsive?: number | null;  // 0, 1, or null, from node agent
}

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

export type CommandState = 'queued' | 'sent' | 'acknowledged' | 'failed' | 'timed_out';

export interface CommandRecord {
  id: string;
  nodeId: string;
  type: string;
  payload: unknown;
  idempotencyKey: string | null;
  state: CommandState;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
}

// Configuration Types
export interface ServerConfig {
  port: number;
  nodeEnv: string;
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
  nodeHeartbeatInterval: number;
  nodeTimeout: number;
  commandTimeout: number;
  logLevel: string;
}
