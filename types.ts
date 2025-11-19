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
