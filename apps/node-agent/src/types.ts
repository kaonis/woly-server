/**
 * Type definitions for WoLy backend
 */

// Canonical Host type comes from the shared protocol package.
import type { Host } from '@kaonis/woly-protocol';
export type { Host };

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

export type {
  CncCommand,
  HostPayload,
  HostStatus,
  NodeMessage,
  NodeMetadata,
  NodeRegistration,
  RegisteredCommandData,
} from '@kaonis/woly-protocol';
