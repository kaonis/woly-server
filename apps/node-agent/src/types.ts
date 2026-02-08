/**
 * Type definitions for WoLy backend
 */

// Canonical Host type comes from the shared protocol package.
export type { Host } from '@kaonis/woly-protocol';

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
  hosts: import('@kaonis/woly-protocol').Host[];
  scanInProgress: boolean;
  lastScanTime: string | null;
}

export interface ScanResponse {
  message: string;
  hostsCount: number;
  hosts: import('@kaonis/woly-protocol').Host[];
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

export type {
  CncCommand,
  HostPayload,
  HostStatus,
  NodeMessage,
  NodeMetadata,
  NodeRegistration,
  RegisteredCommandData,
} from '@kaonis/woly-protocol';
