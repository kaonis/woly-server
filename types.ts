/**
 * Type definitions for WoLy backend
 */

export interface Host {
  name: string;
  mac: string;
  ip: string;
  status: 'awake' | 'asleep';
  lastSeen: string | null;
  discovered: number;
  pingResponsive?: number;
}

export interface DiscoveredHost {
  ip: string;
  mac: string;
  hostname: string | null;
}

export interface MacVendorCacheEntry {
  vendor: string;
  timestamp: number;
}

export interface HostsResponse {
  hosts: Host[];
  scanInProgress: boolean;
  lastScanTime: string | null;
}

export interface ScanResponse {
  message: string;
  hostsCount: number;
  hosts: Host[];
}

export interface WakeUpResponse {
  success: boolean;
  name: string;
  mac?: string;
  message?: string;
  error?: string;
}

export interface MacVendorResponse {
  mac: string;
  vendor: string;
  source: string;
}

export interface ErrorResponse {
  error: string;
  mac?: string;
}

/**
 * C&C Protocol Types
 * Types for communication between node agent and C&C backend
 */

// Node metadata sent during registration
export interface NodeMetadata {
  version: string;
  platform: string;
  networkInfo: {
    subnet: string;
    gateway: string;
  };
}

// Node registration data
export interface NodeRegistration {
  nodeId: string;
  name: string;
  location: string;
  authToken: string;
  publicUrl?: string;
  metadata: NodeMetadata;
}

// Messages sent from Node Agent → C&C Backend
export type NodeMessage =
  | { type: 'register'; data: NodeRegistration }
  | { type: 'heartbeat'; data: { nodeId: string; timestamp: Date } }
  | { type: 'host-discovered'; data: { nodeId: string } & Host }
  | { type: 'host-updated'; data: { nodeId: string } & Host }
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

// Commands sent from C&C Backend → Node Agent
export type CncCommand =
  | { type: 'registered'; data: { nodeId: string; heartbeatInterval: number } }
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
        status?: Host['status'];
      };
    }
  | { type: 'delete-host'; commandId: string; data: { name: string } }
  | { type: 'ping'; data: { timestamp: Date } };
