/**
 * Core type definitions for WoLy C&C Backend
 */

import type {
  CncCapabilitiesResponse as ProtocolCncCapabilitiesResponse,
  CncCapabilityDescriptor as ProtocolCncCapabilityDescriptor,
  CommandState,
  HostWakeSchedule as ProtocolHostWakeSchedule,
  Host,
  HostPingResult as ProtocolHostPingResult,
  HostPortScanResult as ProtocolHostPortScanResult,
  HostPortScanResponse as ProtocolHostPortScanResponse,
  NodeMetadata as ProtocolNodeMetadata,
  ScheduleFrequency as ProtocolScheduleFrequency,
  WakeVerificationResult as ProtocolWakeVerificationResult,
} from '@kaonis/woly-protocol';

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
  state?: CommandState;
  message?: string;
  error?: string;
  hostPing?: ProtocolHostPingResult;
  hostPortScan?: ProtocolHostPortScanResult;
  wakeVerification?: ProtocolWakeVerificationResult;
  timestamp: Date;
  correlationId?: string;
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

export type CapabilityDescriptor = ProtocolCncCapabilityDescriptor;
export type CncCapabilitiesResponse = ProtocolCncCapabilitiesResponse;
export type HostPingResult = ProtocolHostPingResult;
export type HostPortScanResponse = ProtocolHostPortScanResponse;
export type ScheduleFrequency = ProtocolScheduleFrequency;
export type HostWakeSchedule = ProtocolHostWakeSchedule;
export type WakeVerificationResult = ProtocolWakeVerificationResult;

export interface HostStatusHistoryEntry {
  hostFqn: string;
  oldStatus: 'awake' | 'asleep';
  newStatus: 'awake' | 'asleep';
  changedAt: string;
}

export interface HostStatusHistoryResponse {
  hostFqn: string;
  from: string;
  to: string;
  entries: HostStatusHistoryEntry[];
}

export interface HostUptimeSummary {
  hostFqn: string;
  period: string;
  from: string;
  to: string;
  uptimePercentage: number;
  awakeMs: number;
  asleepMs: number;
  transitions: number;
  currentStatus: 'awake' | 'asleep';
}

export interface HostPingResponse {
  target: string;
  checkedAt: string;
  latencyMs: number;
  success: boolean;
  status: 'awake' | 'asleep' | 'unknown';
  source: 'node-agent';
  correlationId?: string;
}

export interface WakeupResponse {
  success: boolean;
  message: string;
  nodeId: string;
  location: string;
  commandId?: string;
  state?: CommandState;
  correlationId?: string;
  wakeVerification?: {
    status: 'pending';
    startedAt: string;
  };
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
  trustProxy: boolean | number | string;
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
  wsMaxConnectionsPerIp: number;
  nodeHeartbeatInterval: number;
  nodeTimeout: number;
  commandTimeout: number;
  offlineCommandTtlMs: number;
  commandRetentionDays: number;
  hostStatusHistoryRetentionDays: number;
  commandMaxRetries: number;
  commandRetryBaseDelayMs: number;
  scheduleWorkerEnabled: boolean;
  schedulePollIntervalMs: number;
  scheduleBatchSize: number;
  logLevel: string;
}
