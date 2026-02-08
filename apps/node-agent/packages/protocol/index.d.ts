import { z } from 'zod';

export const PROTOCOL_VERSION: '1.0.0';
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[];

export type HostStatus = 'awake' | 'asleep';

export interface HostPayload {
  name: string;
  mac: string;
  ip: string;
  status: HostStatus;
  lastSeen: string | null;
  discovered: number;
  pingResponsive?: number | null;
}

export interface NodeMetadata {
  version: string;
  platform: string;
  protocolVersion: string;
  networkInfo: {
    subnet: string;
    gateway: string;
  };
}

export interface NodeRegistration {
  nodeId: string;
  name: string;
  location: string;
  authToken: string;
  publicUrl?: string;
  metadata: NodeMetadata;
}

export type NodeMessage =
  | { type: 'register'; data: NodeRegistration }
  | { type: 'heartbeat'; data: { nodeId: string; timestamp: Date } }
  | { type: 'host-discovered'; data: { nodeId: string } & HostPayload }
  | { type: 'host-updated'; data: { nodeId: string } & HostPayload }
  | { type: 'host-removed'; data: { nodeId: string; name: string } }
  | { type: 'scan-complete'; data: { nodeId: string; hostCount: number } }
  | {
      type: 'command-result';
      data: {
        nodeId: string;
        commandId: string;
        success: boolean;
        message?: string;
        error?: string;
        timestamp: Date;
      };
    };

export type CommandResultPayload = Extract<NodeMessage, { type: 'command-result' }>['data'];

export interface RegisteredCommandData {
  nodeId: string;
  heartbeatInterval: number;
  protocolVersion?: string;
}

export type CncCommand =
  | { type: 'registered'; data: RegisteredCommandData }
  | { type: 'wake'; commandId: string; data: { hostName: string; mac: string } }
  | { type: 'scan'; commandId: string; data: { immediate: boolean } }
  | {
      type: 'update-host';
      commandId: string;
      data: {
        currentName?: string;
        name: string;
        mac?: string;
        ip?: string;
        status?: HostStatus;
      };
    }
  | { type: 'delete-host'; commandId: string; data: { name: string } }
  | { type: 'ping'; data: { timestamp: Date } }
  | { type: 'error'; message: string };

export const inboundCncCommandSchema: z.ZodType<CncCommand>;
export const outboundNodeMessageSchema: z.ZodType<NodeMessage>;
